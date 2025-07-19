const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`;

/**
 * Validates an API token by sending a quick prompt.
 * Returns an object { status, detail? } where status is one of:
 *   VALID, MISSING_TOKEN, INVALID_KEY, OUT_OF_CREDITS, RATE_LIMITED, TIMEOUT, NETWORK_ERROR, UNKNOWN_ERROR
 */
async function validateToken(token) {
  if (!token) {
    return { status: "MISSING_TOKEN" };
  }

  try {
    const resp = await axios.post(
      GEMINI_URL(token),
      { contents: [{ role: "user", parts: [{ text: "Reply with the word VALID if this key works." }] }] },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    const reply = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (reply.toLowerCase().includes("valid")) {
      return { status: "VALID" };
    } else {
      return { status: "UNKNOWN_ERROR", detail: reply };
    }
  } catch (err) {
    const code = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;

    if (err.code === "ECONNABORTED") {
      return { status: "TIMEOUT", detail: msg };
    }
    if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      return { status: "NETWORK_ERROR", detail: msg };
    }
    if (code === 401 || code === 403) {
      const lower = msg.toLowerCase();
      if (lower.includes("invalid") || lower.includes("unauthorized")) {
        return { status: "INVALID_KEY", detail: msg };
      }
      return { status: "OUT_OF_CREDITS", detail: msg };
    }
    if (code === 429) {
      return { status: "RATE_LIMITED", detail: msg };
    }
    return { status: "UNKNOWN_ERROR", detail: msg };
  }
}

/**
 * Sends a prompt to Gemini and returns the raw text reply.
 */
async function callGemini(token, prompt) {
  const response = await axios.post(
    GEMINI_URL(token),
    { contents: [{ role: "user", parts: [{ text: prompt }] }] },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 }
  );
  return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

app.post("/quiz", async (req, res) => {
  const { token, userprompt } = req.body;
  const validation = await validateToken(token);
  if (validation.status !== "VALID") {
    return res.json(validation);
  }
  if (!userprompt) {
    return res.status(400).json({ status: "MISSING_PARAMETERS" });
  }

  const prompt = `
System Prompt:You are ReviewerieLua, a Roblox‑compatible quiz generator. Output only a valid JSON string (not object), representing a Lua‑style table with one key: "Sections" (array of 1–5 sections). Each section includes:
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

  let retries = 0;
  const maxRetries = 3;

  while (true) {
    try {
      let aiReply = await callGemini(token, prompt);
      if (!aiReply) throw new Error("Empty reply");
      aiReply = aiReply.trim().replace(/^```json\s*|```$/g, "").trim();
      return res.json({ status: "VALID", reply: aiReply });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      const message = err.response?.data?.error?.message || "";
      if (code === 429 && retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 2000 * retries));
        continue;
      }
      if (code === 429) return res.json({ status: "RATE_LIMITED" });
      if ((code === 403 || code === 401) && message) {
        const lower = message.toLowerCase();
        if (lower.includes("invalid") || lower.includes("unauthorized")) {
          return res.json({ status: "INVALID_KEY" });
        }
        return res.json({ status: "OUT_OF_CREDITS" });
      }
      console.error("QUIZ GEMINI ERROR:", err.response?.data || err.message);
      return res.status(500).json({ status: "UNKNOWN_ERROR", detail: err.message });
    }
  }
});

app.post("/document", async (req, res) => {
  const { token, userprompt } = req.body;
  const validation = await validateToken(token);
  if (validation.status !== "VALID") {
    return res.json(validation);
  }
  if (!userprompt) {
    return res.status(400).json({ status: "MISSING_PARAMETERS" });
  }

  const prompt = `
System Prompt:You are Reviewerie, a specialized assistant for generating safe, structured learning notes in valid JSON format for Roblox use. You must follow these strict guidelines:

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

• The top-level JSON must have a "Sections" array (1 to 15 items max, amount depends on how detailed the request is).
• Each section object must include:
  – "Title": Short string (no symbols or sensitive words).
  – "DescriptionText": Simple paragraph (1–3 sentences). Use only safe, academic language.
  – "Example": Compact and wholesome example using numbers or steps. No names, jokes, slang, or sensitive content.

• Avoid all of the following:
  – Inappropriate or suggestive language.
  – Real or fictional names, usernames, chat-like text, or roleplay.
  – Any references to violence, harm, fear, pranks, rumors, dating, identity, religion, politics, money, or private information.

• Text must never trigger filtering in Roblox.
• Keep all content purely academic and strictly educational (math, science, logic, etc.).
• Use only standard classroom vocabulary. Avoid slang or complex grammar.
• Write clearly for students aged 10 to 16.
• Do not include duplicate sections. Build understanding from basic to advanced.

User Prompt: ${userprompt}
`.trim();

  let retries = 0;
  const maxRetries = 3;

  while (true) {
    try {
      let aiReply = await callGemini(token, prompt);
      if (!aiReply) throw new Error("Empty reply");
      aiReply = aiReply.trim().replace(/^```json\s*|```$/g, "").trim();
      return res.json({ status: "VALID", reply: aiReply });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      const message = err.response?.data?.error?.message || "";
      if (code === 429 && retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 2000 * retries));
        continue;
      }
      if (code === 429) return res.json({ status: "RATE_LIMITED" });
      if ((code === 403 || code === 401) && message) {
        const lower = message.toLowerCase();
        if (lower.includes("invalid") || lower.includes("unauthorized")) {
          return res.json({ status: "INVALID_KEY" });
        }
        return res.json({ status: "OUT_OF_CREDITS" });
      }
      console.error("DOCUMENT GEMINI ERROR:", err.response?.data || err.message);
      return res.status(500).json({ status: "UNKNOWN_ERROR", detail: err.message });
    }
  }
});

app.post("/validate", async (req, res) => {
  const { token } = req.body;
  const validation = await validateToken(token);
  const code = validation.status === "VALID" ? 200 : 400;
  return res.status(code).json(validation);
});

const PORT = process.env.PORT || 3000;
console.log("Starting server...");
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
