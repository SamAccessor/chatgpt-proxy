const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/chat", async (req, res) => {
  const { token, parameters } = req.body;
  if (!token || !parameters) {
    return res.status(400).send("Missing token or parameters");
  }

  const sections   = Math.min(parameters.AmountOfSections      || 1, 5);
  const questions  = Math.min(parameters.QuestionsPerSection   || 1, 25);
  const topic      = parameters.Topic                         || "General Knowledge";
  const types      = parameters.QuestionTypes                  || "0,1,2";
  const difficulty = parameters.Difficulty                     || "Medium";

  const prompt = `
Generate a Roblox quiz in compact JSON format. Structure: one top-level key called "Sections" (array).
Each section has a "Questions" array. Each question includes: "Label" (string), "QuestionType" (0 = multiple choice, 1 = type-only, 2 = true/false),
and "CorrectAnswer" (string, number, or boolean). If QuestionType is 0 or 2, also include "MultipleChoices": an array
(4 options for type 0, [true,false] for type 2). For QuestionType 1, the answer must be one word or number only, and the question must specify the format.
Max of 5 sections and 25 questions per section. All question labels and answers must be capitalized properly.
Every answer must be unique and clearly related to the topic. Avoid duplicates across all sections.
Output only valid JSON with no explanation.

Parameters:
AmountOfSections: ${sections}
QuestionsPerSection: ${questions}
Topic: ${topic}
QuestionTypes: ${types}
Difficulty: ${difficulty}
`;

  let retries = 0;
  const maxRetries = 3;

  while (true) {
    try {
      const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + token,
        { contents: [{ role: "user", parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );

      const aiReply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiReply) throw new Error("Empty reply");
      return res.json({ reply: aiReply });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 429 && retries < maxRetries) {
        retries++;
        await new Promise(r => setTimeout(r, 2000 * retries));
        continue;
      }
      if (code === 429)                      return res.json({ reply: "__RATE_LIMITED__" });
      if (code === 403 || code === 401)      return res.json({ reply: "__OUT_OF_CREDITS__" });
      console.error("GEMINI ERROR:", err.response?.data || err.message);
      return res.status(500).send("Gemini request failed");
    }
  }
});

const PORT = process.env.PORT || 3000;
console.log("Starting server...");
app.listen(PORT, () => console.log("Server running on port " + PORT));
