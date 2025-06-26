const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/chat", async (req, res) => {
  const prompt = req.body.prompt;
  console.log("Received prompt:", prompt);

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    res.json({ reply: reply || "No reply generated." });
  } catch (err) {
    console.error("GEMINI ERROR:", err?.response?.data || err?.message);
    res.status(500).send("Gemini request failed");
  }
});

const PORT = process.env.PORT || 3000;
console.log("Starting server...");
app.listen(PORT, () => console.log("Server running on port " + PORT));
