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
        model: "deepseek/deepseek-r1-0528:free",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://chatgpt-proxy.onrender.com", // Customize
          "X-Title": "Render Proxy",
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    res.json({ reply: response.data.choices[0].message.content });
  } catch (err) {
    console.error("OPENROUTER ERROR:", err?.response?.data || err?.message);
    res.status(500).send("OpenRouter request failed");
  }
});

const PORT = process.env.PORT || 3000;
console.log("Starting server...");
app.listen(PORT, () => console.log("Server running on port " + PORT));

