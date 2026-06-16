import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import fetch from "node-fetch";
import cors from "cors";

console.log("¿EXISTE .env?:", fs.existsSync(".env"));
dotenv.config();

const app = express();
app.use(express.json());

// Configurar CORS para permitir solo tus dominios
app.use(cors({
  origin: [
    'https://behaviorlab.gokulab.mx',
    'https://api.gokulab.mx',
    'https://gokulab.mx',
    'https://behavior-lab.onrender.com',
    'http://localhost:3000'   // Para pruebas locales
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

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
console.log(`🔑 Keys cargadas: ${GROQ_KEYS.length} de 5`);

// 🔄 Rotación de keys
let currentKeyIndex = 0;

function getNextKey() {
  const key = GROQ_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
  return key;
}

// 🧠 MODOS (Behavior Lab)
const MODES = {
  default: `
Eres un asistente experto en creatividad, comportamiento humano y aprendizaje para niños y jóvenes.
Hablas en español claro, motivador y práctico.
`,

  creatividad: `
Eres un experto en creatividad infantil.
Generas juegos, retos y actividades divertidas usando materiales simples como plastilina, papel o dibujo.
`,

  emociones: `
Eres un psicólogo infantil.
Ayudas a explicar emociones a niños y propones ejercicios simples de regulación emocional.
`,

  storytelling: `
Eres un experto en storytelling.
Creas historias, personajes y dinámicas narrativas interactivas para niños.
`
};

// 🤖 Función para llamar al modelo (con retry por keys)
async function callGroq(messages) {
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
        model: "llama-3.3-70b-versatile",
        messages
      })
    });

    if (!response.ok) {
      console.log("⚠️ HTTP Error:", response.status);
      attempts++;
      continue;
    }
    data = await response.json();

    if (!data.error) {
      console.log("✅ Respuesta OK");
      return data.choices?.[0]?.message?.content;
    }

    console.log("⚠️ Error con key:", data.error.message);
    attempts++;
  }

  throw new Error("❌ Todas las API keys fallaron");
}

// 🤖 MULTI-AGENTE
async function runMultiAgent(userMessage) {
  const creativo = await callGroq([
    { role: "system", content: "Eres creativo para niños" },
    { role: "user", content: userMessage }
  ]);

  const psicologo = await callGroq([
    { role: "system", content: "Eres psicólogo infantil" },
    { role: "user", content: userMessage }
  ]);

  const final = await callGroq([
    {
      role: "system",
      content: "Eres un coordinador que combina ideas en una actividad clara"
    },
    {
      role: "user",
      content: `
Usuario: ${userMessage}

Creativo: ${creativo}
Psicologo: ${psicologo}

Combina todo en una actividad práctica.
`
    }
  ]);

  return final;
}

// 🏠 Ruta base (health check)
app.get('/', (req, res) => {
  res.send('Behavior Lab API running 🚀');
});

// 🧪 GET para probar en navegador
app.get('/chat', (req, res) => {
  res.send('Este endpoint usa POST. Usa Postman o frontend.');
});

// 🚀 Endpoint principal
app.post("/chat", async (req, res) => {
  try {
    const { message, mode = "default", multiAgent = false } = req.body;

    if (!message) {
      return res.json({ reply: "❌ Falta 'message'" });
    }

    // 🧠 Multi-agente activado
    if (multiAgent) {
      const reply = await runMultiAgent(message);
      return res.json({ reply });
    }

    // 🧪 Modo Behavior Lab
    const systemPrompt = MODES[mode] || MODES.default;

    const reply = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ]);

    res.json({ reply });

  } catch (error) {
    console.error("❌ Error en /chat:", error.message);
    res.json({ reply: error.message || "❌ Error en el servidor" });
  }
});

// 🔥 Servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});