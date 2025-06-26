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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://yourdomain.com", // Replace if needed
          "X-Title": "Roblox Quiz Generator"
        }
      }
    );

    const message = response.data.choices?.[0]?.message?.content;
    if (!message) throw new Error("No response message found");
    res.json({ reply: message });
  } catch (error) {
    console.error("OPENROUTER ERROR:", error?.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch response from OpenRouter." });
  }
});

const PORT = process.env.PORT || 3000;
console.log("Starting server...");
app.listen(PORT, () => console.log("Server running on port " + PORT));
