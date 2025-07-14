const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Chat endpoint using Gemini 2.5 Flash
app.post("/quiz", async (req, res) => {
  const { token, userprompt } = req.body;
  if (!token || !userprompt) {
    return res.status(400).send("Missing token or parameters");
  }

  const prompt = `
System Prompt:You are Reviewerie, a specialized assistant for generating structured, compact JSON quizzes designed for Roblox integration. Follow these rules strictly:

• Output valid JSON only. Do not include explanations, markdown, backticks, code blocks, or formatting outside of the JSON object.
• JSON must start with a top-level "Sections" array (1 to 5 items).
• Each section must include:
  – "SectionTitle": A short, clear title (string, no symbols, slang, or names).
  – "Questions": An array of question objects (up to 25 per section).

• Each question must include:
  – "Label": The question prompt (string).
  – "QuestionType": An integer (0 = multiple choice, 1 = fill in the blank, 2 = true/false).
  – "CorrectAnswer": An array of one or more accepted answers as strings only. Even numbers or boolean values must be written as strings (e.g., "10", "true", "false").
  – If QuestionType == 0, include "MultipleChoices": an array of exactly 4 safe, unique strings.
  – If QuestionType == 2, include "MultipleChoices": ["True", "False"].

• Text Requirements:
  – Capitalize the first letter of each word (title case).
  – Use only clear, educational vocabulary appropriate for ages 10–16.
  – Avoid any references to usernames, names, slang, roleplay, violence, identity, money, fear, politics, or mature topics.

• Ensure all content is fully compliant with Roblox’s Community Standards and Terms of Use.
• Do not include any words or phrases that may be blocked by TextService:FilterStringAsync.
• Each question must be unique and clearly related to the given topic.
• Respect the specified difficulty level: "Easy", "Medium", or "Hard".
• Keep output compact, within token and character limits, and always formatted as valid JSON with no surrounding formatting.

User Prompt: ${userprompt}
`;

  let retries = 0;
  const maxRetries = 3;

  while (true) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${token}`,
        { contents: [{ role: "user", parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );

      const aiReply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiReply) throw new Error("Empty reply");
      return res.json({ reply: aiReply });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      const message = err.response?.data?.error?.message || "";

      if (code === 429 && retries < maxRetries) {
        retries++;
        await new Promise(r => setTimeout(r, 2000 * retries));
        continue;
      }
      if (code === 429) return res.json({ reply: "__RATE_LIMITED__" });

      if (code === 403 || code === 401) {
        if (message.toLowerCase().includes("invalid") ||
            message.toLowerCase().includes("unauthorized") ||
            message.toLowerCase().includes("permission")) {
          return res.json({ reply: "__INVALID_KEY__" });
        }
        return res.json({ reply: "__OUT_OF_CREDITS__" });
      }

      console.error("GEMINI ERROR:", err.response?.data || err.message);
      return res.status(500).send("Gemini request failed");
    }
  }
});

app.post("/document", async (req, res) => {
  const { token, userprompt } = req.body;
  if (!token || !userprompt) {
    return res.status(400).send("Missing token or parameters");
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

• The top-level JSON must have a "Sections" array (1 to 5 items max).
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
`;

  let retries = 0;
  const maxRetries = 3;

  while (true) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${token}`,
        { contents: [{ role: "user", parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );

      const aiReply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiReply) throw new Error("Empty reply");
      return res.json({ reply: aiReply });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      const message = err.response?.data?.error?.message || "";

      if (code === 429 && retries < maxRetries) {
        retries++;
        await new Promise(r => setTimeout(r, 2000 * retries));
        continue;
      }
      if (code === 429) return res.json({ reply: "__RATE_LIMITED__" });

      if (code === 403 || code === 401) {
        if (message.toLowerCase().includes("invalid") ||
            message.toLowerCase().includes("unauthorized") ||
            message.toLowerCase().includes("permission")) {
          return res.json({ reply: "__INVALID_KEY__" });
        }
        return res.json({ reply: "__OUT_OF_CREDITS__" });
      }

      console.error("GEMINI ERROR:", err.response?.data || err.message);
      return res.status(500).send("Gemini request failed");
    }
  }
});

// Key validation endpoint
app.post("/validate-key", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ status: "MISSING_TOKEN" });

  try {
    const testPrompt = "Reply with the word VALID if this key works.";
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${token}`,
      { contents: [{ role: "user", parts: [{ text: testPrompt }] }] },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (reply.toLowerCase().includes("valid")) {
      return res.json({ status: "VALID" });
    } else {
      return res.json({ status: "UNKNOWN_ERROR", detail: reply });
    }
  } catch (err) {
    const code = err.response?.data?.error?.code;
    const msg = err.response?.data?.error?.message || "";

    if (code === 429) return res.json({ status: "OUT_OF_CREDITS" });
    if (code === 401 || code === 403) {
      if (msg.toLowerCase().includes("invalid") ||
          msg.toLowerCase().includes("unauthorized") ||
          msg.toLowerCase().includes("permission")) {
        return res.json({ status: "INVALID_KEY" });
      }
      return res.json({ status: "OUT_OF_CREDITS" });
    }

    console.error("KEY VALIDATION ERROR:", msg);
    return res.status(500).json({ status: "UNKNOWN_ERROR", error: msg });
  }
});

const PORT = process.env.PORT || 3000;
console.log("Starting server...");
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
