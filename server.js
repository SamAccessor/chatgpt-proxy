const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_NAME = "gemini-1.5-flash-latest";
const CACHE_TTL_MS = 60_000;

const tokenCache = new Map(); // token -> { status, ts }

/**
 * Build the full Gemini URL for a given key.
 */
function geminiUrl(key) {
  return `${GEMINI_BASE_URL}/${MODEL_NAME}:generateContent?key=${key}`;
}

/**
 * Map HTTP status codes and messages to our internal status tags.
 */
function mapHttpCodeToStatus(httpCode, msg = "") {
  if (httpCode === 400) return "BAD_REQUEST";
  if (httpCode === 401) return "INVALID_KEY";
  if (httpCode === 403) {
    if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("exhausted")) {
      return "OUT_OF_CREDITS";
    }
    if (msg.toLowerCase().includes("permission")) {
      return "PERMISSION_DENIED";
    }
    return "INVALID_KEY";
  }
  if (httpCode === 404) return "NOT_FOUND";
  if (httpCode === 408) return "REQUEST_TIMEOUT";
  if (httpCode === 429) return "RATE_LIMITED";
  if (httpCode >= 500 && httpCode < 600) return "SERVICE_UNAVAILABLE";
  return "UNKNOWN_ERROR";
}

/**
 * Perform a single validation request to Gemini.
 */
async function doSingleValidation(token) {
  const resp = await axios.post(
    geminiUrl(token),
    { contents: [{ role: "user", parts: [{ text: "Reply with the word VALID if this key works." }] }] },
    { headers: { "Content-Type": "application/json" }, timeout: 10000 }
  );

  if (resp.data.error) {
    // Google sometimes returns { error: {...} } with 200
    throw { response: { status: resp.status, data: resp.data } };
  }

  const reply = resp.data
    ?.candidates?.[0]
    ?.content?.parts?.[0]?.text
    ?.trim()
    .toLowerCase() || "";

  if (reply.includes("valid")) {
    return { status: "VALID" };
  }

  return { status: "UNKNOWN_ERROR", detail: reply };
}

/**
 * Validate token, with in-memory caching for TTL.
 */
async function validateToken(token) {
  if (!token) {
    return { status: "MISSING_TOKEN" };
  }

  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return { status: cached.status };
  }

  try {
    const result = await doSingleValidation(token);
    tokenCache.set(token, { status: result.status, ts: now });
    return result;
  } catch (err) {
    const code = err.response?.status || 500;
    const msg = err.response?.data?.error?.message || err.message;
    const status = mapHttpCodeToStatus(code, msg);
    tokenCache.set(token, { status, ts: now });
    return { status, detail: msg };
  }
}

/**
 * Simple retry wrapper for retryable errors.
 */
async function withRetries(fn, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const httpCode = err.response?.status;
      const retryable =
        httpCode === 429 ||
        err.code === "ECONNABORTED" ||
        err.code === "ENOTFOUND" ||
        err.code === "ECONNREFUSED";

      if (retryable && attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Send a prompt to Gemini, throwing on error fields.
 */
async function callGemini(token, prompt) {
  const resp = await axios.post(
    geminiUrl(token),
    { contents: [{ role: "user", parts: [{ text: prompt }] }] },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 }
  );

  if (resp.data.error) {
    throw { response: { status: resp.status, data: resp.data } };
  }

  return resp.data
    .candidates?.[0]
    ?.content?.parts?.[0]?.text || "";
}

/**
 * /quiz endpoint
 */
app.post("/quiz", async (req, res) => {
  const { token, userprompt } = req.body;
  const validation = await validateToken(token);
  if (validation.status !== "VALID") {
    return res.status(validation.status === "MISSING_TOKEN" ? 400 : 403).json(validation);
  }
  if (!userprompt) {
    return res.status(400).json({ status: "MISSING_PARAMETERS" });
  }

  const systemPrompt = `
You are ReviewerieLua, a Roblox‑compatible quiz generator. Output only a valid JSON string (not object), representing a Lua‑style table with one key: "Sections" (array of 1–5 sections). Each section includes:
- "SectionTitle": a 2‑word title string.
- "Questions": array of exactly 3 questions.

Each question must include:
- "Question": string with math allowed (no special symbols or emojis).
- "TextToSpeechQuestion": string converted for spoken reading (e.g. "2^2" → "2 squared", "3/2" → "3 divided by 2").
- "QuestionType": integer (0 = multiple choice, 1 = typed answer, 2 = true/false).
- "CorrectAnswers": array of lowercase strings; for QuestionType 1 math questions, include both numeric and word forms (e.g. "8", "eight").

If QuestionType = 0, add:
- "Answers": exactly 4 lowercase string options, one matching a correct answer.

If QuestionType = 1:
- "CorrectAnswers" must contain 1–3 lowercase single words or numbers (no punctuation or spaces).

If QuestionType = 2:
- Set "Answers" to ["true", "false"].

Avoid names, slang, politics, violence, money, or filtered terms per Roblox ToS. Use educational vocabulary appropriate for ages 10–16. Do not include explanations, markdown, formatting, or extra text. Return only a valid JSON string that can be parsed by Roblox’s HttpService:JSONDecode.

User Prompt: ${userprompt}
`.trim();

  try {
    let aiReply = await withRetries(() => callGemini(token, systemPrompt));
    aiReply = aiReply.trim().replace(/^```json\s*|```$/g, "").trim();
    return res.json({ status: "VALID", reply: aiReply });
  } catch (err) {
    const httpCode = err.response?.status || 500;
    const msg = err.response?.data?.error?.message || err.message;
    const status = mapHttpCodeToStatus(httpCode, msg);
    console.error("QUIZ ERROR:", status, msg);
    return res.status(httpCode).json({ status, detail: msg });
  }
});

/**
 * /document endpoint
 */
app.post("/document", async (req, res) => {
  const { token, userprompt } = req.body;
  const validation = await validateToken(token);
  if (validation.status !== "VALID") {
    return res.status(validation.status === "MISSING_TOKEN" ? 400 : 403).json(validation);
  }
  if (!userprompt) {
    return res.status(400).json({ status: "MISSING_PARAMETERS" });
  }

  const systemPrompt = `
You are Reviewerie, a specialized assistant for generating safe, structured learning notes in valid JSON format for Roblox use. You must follow these strict guidelines:

• Output only valid JSON — no explanations, no comments, no formatting extras.
• Use this exact structure:

{
  "Sections": [
    {
      "Title": "Section Title",
      "DescriptionText": "Short, safe, educational explanation of the concept.",
      "Example": "Clear, clean example showing how the concept works."
    }
  ]
}

• The top-level JSON must have a "Sections" array (1 to 15 items max).
• Each section object must include:
  – "Title": Short string (no symbols or sensitive words).
  – "DescriptionText": Simple paragraph (1–3 sentences). Use only safe, academic language.
  – "Example": Compact and wholesome example using numbers or steps. No names, jokes, slang, or sensitive content.

• Avoid violence, pranks, rumors, dating, identity, religion, politics, money, or private information.
• Keep all content purely academic and strictly educational (math, science, logic, etc.).
• Write clearly for students aged 10 to 16.

User Prompt: ${userprompt}
`.trim();

  try {
    let aiReply = await withRetries(() => callGemini(token, systemPrompt));
    aiReply = aiReply.trim().replace(/^```json\s*|```$/g, "").trim();
    return res.json({ status: "VALID", reply: aiReply });
  } catch (err) {
    const httpCode = err.response?.status || 500;
    const msg = err.response?.data?.error?.message || err.message;
    const status = mapHttpCodeToStatus(httpCode, msg);
    console.error("DOCUMENT ERROR:", status, msg);
    return res.status(httpCode).json({ status, detail: msg });
  }
});

/**
 * /validate endpoint
 */
app.post("/validate", async (req, res) => {
  const { token } = req.body;
  const validation = await validateToken(token);
  const httpCode = validation.status === "VALID" ? 200 : 400;
  return res.status(httpCode).json(validation);
});

const PORT = process.env.PORT || 3000;
console.log(`Server running on port ${PORT}`);
app.listen(PORT);
