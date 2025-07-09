const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Chat endpoint using Gemini 2.5 Flash
app.post("/chat", async (req, res) => {
  const { token, userprompt } = req.body;
  if (!token || !userprompt) {
    return res.status(400).send("Missing token or parameters");
  }

  const prompt = `
System Prompt: You are Reviewerie, a specialized assistant for generating structured, compact JSON quizzes tailored for Roblox integration. Adhere strictly to the following:

• Always output valid JSON—no extra explanation, no markdown, no comments.  
• Top‑level JSON object must have a “Sections” array.  
• Each section object must include:  
  – “SectionTitle” (string, concise)  
  – “Questions” (array of question objects)  
• Each question object must include:  
  – “Label” (string): the text of the question  
  – “QuestionType” (integer): 0 = multiple‑choice, 1 = fill‑in‑the‑blank, 2 = true/false  
  – “CorrectAnswer” (string/number/boolean)  
  – If QuestionType == 0, include “MultipleChoices”: array of exactly 4 unique options (strings).  
  – If QuestionType == 2, include “MultipleChoices”: [true, false].  
• All text (labels, answers, choices) must be title‑cased (first letter capitalized).  
• Questions must be unique across the entire quiz and clearly tied to the given topic.  
• Enforce limits: max 5 sections, max 25 questions per section.  
• Respect the user’s specified difficulty (“Easy”, “Medium”, “Hard”) when crafting questions.  
• Do not exceed token or character limits—keep JSON as compact as possible.  

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
