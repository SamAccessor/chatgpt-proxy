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
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-small-3.2-24b-instruct:free",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Local Mistral Chat",
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    console.log("Raw OpenRouter Response:", response.data);

    const reply = response?.data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error("No valid reply received.");
      return res.status(500).send("No valid reply from OpenRouter.");
    }

    res.json({ reply });
  } catch (err) {
    console.error("===== OPENROUTER ERROR START =====");
    console.error(err?.response?.data || err?.message || err);
    console.error("===== OPENROUTER ERROR END =====");
    res.status(500).send("OpenRouter request failed");
  }
});

const PORT = process.env.PORT || 3000;
console.log("Starting server...");
app.listen(PORT, () => console.log("Server running on port " + PORT));
