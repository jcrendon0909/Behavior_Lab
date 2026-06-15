import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

console.log("🔑 GROQ API KEY:", process.env.GROQ_API_KEY ? "OK" : "NO DETECTADA");

app.post("/chat", async (req, res) => {
  try {
    console.log("📩 Request recibida:", req.body);

    const { message } = req.body;
    console.log("🚀 USANDO GROQ:", process.env.GROQ_API_KEY);
    console.log("🌐 URL:", "https://api.groq.com/openai/v1/chat/completions");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    console.log("🤖 Groq responde:", data);

    res.json({
      reply: data?.choices?.[0]?.message?.content || "Sin respuesta"
    });

  } catch (error) {
    console.error("❌ ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("🔥 Server running on http://localhost:3000");
});