import express from "express";
import dotenv from "dotenv";
import fs from "fs";

console.log("¿EXISTE .env?:", fs.existsSync(".env"));
dotenv.config();

const app = express();
app.use(express.json());

// 🔑 Cargar múltiples keys
const GROQ_KEYS = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5
].filter(Boolean);

if (GROQ_KEYS.length === 0) {
  console.error("❌ No hay API keys cargadas");
}

console.log("🔑 Keys cargadas:", GROQ_KEYS.map(() => "OK"));

// 🔄 Rotación
let currentKeyIndex = 0;

function getNextKey() {
  const key = GROQ_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
  return key;
}

// 🚀 Endpoint de chat
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    let attempts = 0;
    let data = null;

    while (attempts < GROQ_KEYS.length) {
      const apiKey = getNextKey();

      console.log(`🔄 Intento ${attempts + 1}`);

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "user", content: userMessage }
          ]
        })
      });

      data = await response.json();

      if (!data.error) {
        break; // ✅ éxito
      }

      console.log("⚠️ Error con key:", data.error.message);
      attempts++;
    }

    if (!data || data.error) {
      return res.json({ reply: "❌ Todas las API keys fallaron" });
    }

    console.log("🧠 RESPUESTA RAW:");
    console.log(JSON.stringify(data, null, 2));

    const reply = data.choices?.[0]?.message?.content || "⚠️ Sin respuesta del modelo";

    res.json({ reply });

  } catch (error) {
    console.error("❌ Error en /chat:", error);
    res.json({ reply: "❌ Error en el servidor" });
  }
});

// 🔥 Levantar servidor
app.listen(3000, () => {
  console.log("🚀 Servidor en http://localhost:3000");
});