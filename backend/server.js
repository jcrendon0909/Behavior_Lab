import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import fetch from "node-fetch";
import cors from "cors";
import { MongoClient } from "mongodb";

console.log("¿EXISTE .env?:", fs.existsSync(".env"));
dotenv.config();

const app = express();
app.use(express.json());

// Configurar CORS
app.use(cors({
  origin: [
    'https://behaviorlab.gokulab.mx',
    'https://api.gokulab.mx',
    'https://gokulab.mx',
    'https://behavior-lab.onrender.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// ---------- CONEXIÓN A MONGODB ----------
const MONGO_URI = process.env.MONGO_URI;
let db = null;

async function connectMongo() {
  if (!MONGO_URI) {
    console.warn("⚠️ MONGO_URI no configurada. La base de conocimiento no estará disponible.");
    return;
  }
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db();
    console.log("✅ Conectado a MongoDB");
    
    // Verificar colecciones
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    if (!collectionNames.includes('knowledge')) {
      console.warn("⚠️ Colección 'knowledge' no encontrada. Crea una e importa knowledge.json");
    }
    if (!collectionNames.includes('faq')) {
      console.warn("⚠️ Colección 'faq' no encontrada. Crea una e importa faq.json");
    }
  } catch (error) {
    console.error("❌ Error conectando a MongoDB:", error.message);
  }
}
connectMongo();

// ---------- API KEYS Y ROTACIÓN ----------
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

let currentKeyIndex = 0;
function getNextKey() {
  const key = GROQ_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
  return key;
}

// ---------- MEMORIA DE CONVERSACIÓN ----------
const conversationHistory = {};

function getConversationHistory(userId) {
  if (!conversationHistory[userId]) {
    conversationHistory[userId] = [];
  }
  return conversationHistory[userId];
}

function addToConversationHistory(userId, role, content) {
  const history = getConversationHistory(userId);
  history.push({ role, content });
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
}

// ---------- CONSULTA A MONGODB ----------
async function searchKnowledge(query) {
  if (!db) return null;
  try {
    // Buscar en FAQ (coincidencia exacta por palabras clave)
    const faqResult = await db.collection('faq').find({
      keywords: { $regex: query, $options: 'i' }
    }).limit(1).toArray();
    
    if (faqResult.length > 0) {
      return { type: 'faq', data: faqResult[0] };
    }

    // Buscar en Knowledge (por topic, title, content o keywords)
    const knowledgeResult = await db.collection('knowledge').find({
      $or: [
        { topic: { $regex: query, $options: 'i' } },
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
        { keywords: { $regex: query, $options: 'i' } }
      ]
    }).limit(1).toArray();

    if (knowledgeResult.length > 0) {
      return { type: 'knowledge', data: knowledgeResult[0] };
    }

    return null;
  } catch (error) {
    console.error("❌ Error en búsqueda MongoDB:", error);
    return null;
  }
}

// ---------- MODOS (prompt base) ----------
const MODES = {
  default: `
Eres el asistente virtual de BehaviorLab, una consultora de IA empresarial con sede en México.

**Reglas de respuesta:**
- Responde en **máximo 3 oraciones**.
- Sé directo, profesional y evita repetir información.
- Si tienes información específica de la base de conocimiento, úsala primero.
- Si no sabes algo, sugiere contactar al equipo.

**Contexto general:**
BehaviorLab diseña agentes de IA personalizados para seguros, finanzas, retail, logística y gobierno.
Ofrecemos automatización, inteligencia comercial, procesamiento de documentos, soporte a decisiones e integración API.
Nuestra metodología tiene 5 pasos: diagnóstico, diseño, entrenamiento, integración y despliegue.
Nos diferenciamos por ser agentes a medida, despliegue rápido, integración sin fricciones y ROI medible.
`,
  creatividad: `Eres un experto en creatividad empresarial aplicada a IA. Responde en máximo 3 oraciones.`,
  emociones: `Eres un consultor de IA con enfoque en experiencia de usuario. Responde en máximo 3 oraciones.`,
  storytelling: `Eres un experto en narrativa empresarial. Responde en máximo 3 oraciones.`
};

// ---------- FUNCIÓN PARA LLAMAR A GROQ ----------
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
        messages,
        max_tokens: 120,
        temperature: 0.3
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

// ---------- ENDPOINT PRINCIPAL ----------
app.post("/chat", async (req, res) => {
  try {
    const { message, mode = "default", userId = "defaultUser" } = req.body;

    if (!message) {
      return res.json({ reply: "❌ Falta 'message'" });
    }

    // 1. Buscar en MongoDB
    let knowledgeContext = "";
    if (db) {
      const result = await searchKnowledge(message);
      if (result) {
        if (result.type === 'faq') {
          knowledgeContext = `Pregunta frecuente: "${result.data.question}"\nRespuesta: ${result.data.answer}`;
        } else if (result.type === 'knowledge') {
          knowledgeContext = `Información: ${result.data.title}\n${result.data.content}`;
        }
        console.log(`📚 Usando conocimiento de MongoDB (${result.type})`);
      }
    }

    // 2. Obtener historial
    const history = getConversationHistory(userId);

    // 3. Construir mensajes
    const systemPrompt = MODES[mode] || MODES.default;
    let systemContent = systemPrompt;
    if (knowledgeContext) {
      systemContent += `\n\n**Información adicional de la base de conocimiento:**\n${knowledgeContext}\n\nUsa esta información para responder con precisión.`;
    }

    const messages = [
      { role: "system", content: systemContent },
      ...history,
      { role: "user", content: message }
    ];

    // 4. Llamar a Groq
    const reply = await callGroq(messages);

    // 5. Guardar historial
    addToConversationHistory(userId, "user", message);
    addToConversationHistory(userId, "assistant", reply);

    res.json({ reply });

  } catch (error) {
    console.error("❌ Error en /chat:", error.message);
    res.json({ reply: error.message || "❌ Error en el servidor" });
  }
});

// ---------- HEALTH CHECK ----------
app.get('/', (req, res) => {
  res.send('Behavior Lab API running 🚀');
});

// ---------- INICIAR SERVIDOR ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});