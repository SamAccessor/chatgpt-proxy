const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Quiz endpoint using Gemini 2.5 Flash
app.post("/quiz", async (req, res) => {
  const { token, userprompt } = req.body;
  if (!token || !userprompt) {
    return res.status(400).send("Missing token or parameters");
  }

  const prompt = `
System Prompt:You are ReviewerieLua, a Roblox-compatible quiz generator. Output only a valid JSON string (not object), representing a Lua-style table with one key: "Sections" (array of 1–5 sections). Each section includes a "Questions" array (exactly 3 questions). Each question must include: "Question" (string with math allowed, no special symbols or emojis), "TextToSpeechQuestion" (converted for spoken reading, e.g. "2^2" → "2 squared", "3/2" → "3 divided by 2"), "QuestionType" (0 = multiple choice, 1 = typed answer, 2 = true/false), and "CorrectAnswers" (array of lowercase strings; numbers/booleans in quotes).

If "QuestionType" is 0, add "Answers": exactly 4 lowercase string options, one must match a correct answer.
If "QuestionType" is 1, "CorrectAnswers" must contain 1–3 lowercase single words or numbers (no punctuation or spaces).
If "QuestionType" is 2, set "Answers" to ["true", "false"].

Avoid names, slang, politics, violence, money, or filtered terms per Roblox ToS. Use educational vocabulary appropriate for ages 10–16. Do not include explanations, markdown, formatting, or extra text. Return only a valid JSON string output that can be parsed by Roblox’s HttpService:JSONDecode.
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

     let aiReply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiReply) throw new Error("Empty reply");

      // Strip markdown code block if present
      aiReply = aiReply.trim().replace(/^```json\s*|```$/g, "").trim();

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
app.post("/validate", async (req, res) => {
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
