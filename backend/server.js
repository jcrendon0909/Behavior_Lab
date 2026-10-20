import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import fetch from "node-fetch";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { MongoClient } from "mongodb";
import { createGovRouter } from "./gov.js";

console.log("¿EXISTE .env?:", fs.existsSync(".env"));
dotenv.config();

const app = express();
app.use(express.json({ limit: "100kb" }));

// ---------- CORS ----------
app.use(cors({
  origin: [
    'https://behaviorlab.gokulab.mx',
    'https://api.gokulab.mx',
    'https://gokulab.mx',
    'https://behavior-lab.onrender.com',
    'http://localhost:3000',
    'http://localhost:5500',     // <-- Agrega esta
    'http://127.0.0.1:5500'      // <-- Y esta
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// ---------- RATE LIMITING ----------
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minuto
  max: 20,                // 20 requests por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { reply: "Demasiadas peticiones. Intenta de nuevo en un minuto." }
});

// ---------- MONGODB ----------
const MONGO_URI = process.env.MONGO_URI;
let db = null;

async function connectMongo() {
  if (!MONGO_URI) {
    console.warn("⚠️ MONGO_URI no configurada.");
    return;
  }
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db();
    console.log("✅ Conectado a MongoDB");
  } catch (error) {
    console.error("❌ Error MongoDB:", error.message);
  }
}
connectMongo();

// ---------- AUDIT LOG (nunca rompe el chat) ----------
async function audit(entry) {
  if (!db) return;
  try {
    await db.collection("audit_logs").insertOne({
      ts: new Date(),
      ...entry
    });
  } catch (err) {
    console.error("⚠️ audit_log falló:", err.message);
  }
}

// ---------- PROMPT INJECTION ----------
const INJECTION_PATTERNS = [
  /ignora\s+(las\s+)?instrucciones/i,
  /olvida\s+(las\s+)?instrucciones/i,
  /system\s*prompt/i,
  /revela.*(api|key|token|contraseña|password)/i,
  /dame.*(api|key|token|contraseña)/i,
  /jailbreak/i
];

function detectInjection(message) {
  return INJECTION_PATTERNS.some(p => p.test(message));
}

// ---------- REGEX ESCAPE (fix ReDoS) ----------
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- GROQ KEYS ----------
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

// ---------- HISTORIAL (memoria + Mongo) ----------
const memoryHistory = {};

async function getConversationHistory(userId) {
  if (db) {
    try {
      const doc = await Promise.race([
        db.collection("conversations").findOne({ userId }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 500))
      ]);
      if (doc?.messages?.length) return doc.messages.slice(-10);
    } catch (e) {
      // fallback silencioso a memoria
    }
  }
  return memoryHistory[userId] || [];
}

async function addToConversationHistory(userId, role, content) {
  if (!memoryHistory[userId]) memoryHistory[userId] = [];
  memoryHistory[userId].push({ role, content });
  if (memoryHistory[userId].length > 10) {
    memoryHistory[userId] = memoryHistory[userId].slice(-10);
  }

  if (db) {
    try {
      await db.collection("conversations").updateOne(
        { userId },
        {
          $push: {
            messages: {
              $each: [{ role, content, ts: new Date() }],
              $slice: -20
            }
          },
          $set: { updatedAt: new Date() }
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("⚠️ No se pudo persistir historial:", err.message);
    }
  }
}

// ---------- BÚSQUEDA EN MONGO ----------
async function searchKnowledge(query) {
  if (!db) return null;
  const safe = escapeRegex(query);
  try {
    const faq = await db.collection('faq').findOne({
      keywords: { $regex: safe, $options: 'i' }
    });
    if (faq) return { type: 'faq', data: faq };

    const knowledge = await db.collection('knowledge').findOne({
      $or: [
        { topic:    { $regex: safe, $options: 'i' } },
        { title:    { $regex: safe, $options: 'i' } },
        { content:  { $regex: safe, $options: 'i' } },
        { keywords: { $regex: safe, $options: 'i' } }
      ]
    });
    if (knowledge) return { type: 'knowledge', data: knowledge };

    return null;
  } catch (error) {
    console.error("❌ Error búsqueda Mongo:", error.message);
    return null;
  }
}

// ---------- MODOS ----------
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
  emociones:   `Eres un consultor de IA con enfoque en experiencia de usuario. Responde en máximo 3 oraciones.`,
  storytelling:`Eres un experto en narrativa empresarial. Responde en máximo 3 oraciones.`
};

// ---------- GROQ ----------
async function callGroq(messages) {
  let attempts = 0;

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
        model: "openai/gpt-oss-120b",
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
    const data = await response.json();

    if (!data.error) {
      console.log("✅ Respuesta OK");
      return data.choices?.[0]?.message?.content;
    }

    console.log("⚠️ Error con key:", data.error.message);
    attempts++;
  }

  throw new Error("❌ Todas las API keys fallaron");
}

// ---------- ENDPOINT /chat ----------
app.post("/chat", chatLimiter, async (req, res) => {
  const start = Date.now();
  const { message, mode = "default", userId = "defaultUser" } = req.body;

  if (!message) {
    return res.json({ reply: "❌ Falta 'message'" });
  }

  // Bloqueo de prompt injection
  if (detectInjection(message)) {
    await audit({
      type: "injection_attempt",
      userId,
      input_preview: String(message).slice(0, 200)
    });
    return res.json({ reply: "No puedo procesar esa solicitud." });
  }

  try {
    // 1. Buscar en Mongo
    let knowledgeContext = "";
    let knowledgeHit = null;
    if (db) {
      const result = await searchKnowledge(message);
      if (result) {
        knowledgeHit = result.type;
        if (result.type === 'faq') {
          knowledgeContext = `Pregunta frecuente: "${result.data.question}"\nRespuesta: ${result.data.answer}`;
        } else if (result.type === 'knowledge') {
          knowledgeContext = `Información: ${result.data.title}\n${result.data.content}`;
        }
        console.log(`📚 Usando conocimiento (${result.type})`);
      }
    }

    // 2. Historial
    const history = await getConversationHistory(userId);

    // 3. Construir mensajes
    const systemPrompt = MODES[mode] || MODES.default;
    let systemContent = systemPrompt;
    if (knowledgeContext) {
      systemContent += `\n\n**Información adicional:**\n${knowledgeContext}\n\nUsa esta información para responder con precisión.`;
    }

    const messages = [
      { role: "system", content: systemContent },
      ...history,
      { role: "user", content: message }
    ];

    // 4. Llamar a Groq
    const reply = await callGroq(messages);

    // 5. Persistir historial
    await addToConversationHistory(userId, "user", message);
    await addToConversationHistory(userId, "assistant", reply);

    // 6. Audit log
    await audit({
      type: "chat",
      userId,
      mode,
      input_length: String(message).length,
      knowledge_hit: knowledgeHit,
      key_used: (currentKeyIndex - 1 + GROQ_KEYS.length) % GROQ_KEYS.length,
      latency_ms: Date.now() - start
    });

    res.json({ reply });

  } catch (error) {
    console.error("❌ Error en /chat:", error.message);
    await audit({
      type: "chat_error",
      userId,
      error: error.message,
      latency_ms: Date.now() - start
    });
    res.json({ reply: error.message || "❌ Error en el servidor" });
  }
});

// ---------- HEALTH ----------
app.get('/', (req, res) => {
  res.send('Behavior Lab API running 🚀');
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    mongo: !!db,
    keys_loaded: GROQ_KEYS.length,
    uptime_s: Math.floor(process.uptime()),
    ts: new Date().toISOString()
  });
});

// ---------- GOVERNANCE ----------
app.use('/gov',
  (req, res, next) => {
    if (!db) return res.status(503).json({ error: "DB no conectada aún" });
    req.db = db;
    next();
  },
  createGovRouter()
);

// ---------- INICIAR ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});