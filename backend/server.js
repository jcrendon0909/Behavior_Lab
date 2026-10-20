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
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));

// ---------- RATE LIMITING ----------
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  message: { reply: "Demasiadas peticiones. Intenta de nuevo en un minuto." }
});

// ---------- MONGODB ----------
const MONGO_URI = process.env.MONGO_URI;
let db = null;

async function connectMongo() {
  if (!MONGO_URI) return;
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

// ---------- AUDIT LOG ----------
async function audit(entry) {
  if (!db) return;
  try { await db.collection("audit_logs").insertOne({ ts: new Date(), ...entry }); } catch (err) {}
}

// ---------- PROMPT INJECTION ----------
const INJECTION_PATTERNS = [/ignora\s+(las\s+)?instrucciones/i, /system\s*prompt/i, /revela.*(api|key|token)/i];
function detectInjection(message) { return INJECTION_PATTERNS.some(p => p.test(message)); }

function escapeRegex(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------- GROQ KEYS ----------
const GROQ_KEYS = [process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3, process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5].filter(Boolean);
let currentKeyIndex = 0;
function getNextKey() { const key = GROQ_KEYS[currentKeyIndex]; currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length; return key; }

// ---------- HISTORIAL ----------
const memoryHistory = {};
async function getConversationHistory(userId) {
  if (db) {
    try {
      const doc = await Promise.race([
        db.collection("conversations").findOne({ userId }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 500))
      ]);
      if (doc?.messages?.length) return doc.messages.slice(-10);
    } catch (e) {}
  }
  return memoryHistory[userId] || [];
}

async function addToConversationHistory(userId, role, content) {
  if (!memoryHistory[userId]) memoryHistory[userId] = [];
  memoryHistory[userId].push({ role, content });
  if (memoryHistory[userId].length > 10) memoryHistory[userId] = memoryHistory[userId].slice(-10);
  if (db) {
    try {
      await db.collection("conversations").updateOne(
        { userId },
        { $push: { messages: { $each: [{ role, content, ts: new Date() }], $slice: -20 } }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {}
  }
}

// ---------- BÚSQUEDA ----------
async function searchKnowledge(query) {
  if (!db) return null;
  const safe = escapeRegex(query);
  try {
    const faq = await db.collection('faq').findOne({ keywords: { $regex: safe, $options: 'i' } });
    if (faq) return { type: 'faq', data: faq };
    const knowledge = await db.collection('knowledge').findOne({ $or: [{ topic: { $regex: safe, $options: 'i' } }, { title: { $regex: safe, $options: 'i' } }, { content: { $regex: safe, $options: 'i' } }] });
    if (knowledge) return { type: 'knowledge', data: knowledge };
    return null;
  } catch (error) { return null; }
}

// ---------- MODOS (PROMPT ACTUALIZADO) ----------
const MODES = {
  default: `
Eres el asistente experto de BehaviorLab, una consultora líder en Gobernanza de IA, Riesgos y Cumplimiento (GRC) y Ciberseguridad.
Tu conocimiento abarca:
1. Creación y despliegue de Agentes de IA empresariales.
2. Gobernanza de IA: ISO/IEC 42001, NIST AI RMF, y cumplimiento regulatorio local (LFPDPPP, COFEPRIS/SaMD).
3. Gestión de riesgos de IA (auditoría de sesgos, evaluaciones de impacto, privacidad por diseño).
4. Nuestra plataforma BehaviorLab: Inventario de IA, Diagnóstico de Madurez, Generación de Políticas y Monitoreo.

**Reglas de respuesta:**
- Responde en máximo 3 o 4 oraciones. Sé directo, profesional y ejecutivo.
- Si te preguntan sobre normativas, explica brevemente cómo ayudamos a cumplirlas.
- Si no sabes algo, sugiere contactar al equipo o agendar una demo.
`,
  creatividad: `Eres un experto en creatividad empresarial aplicada a IA. Responde en máximo 3 oraciones.`,
  emociones:   `Eres un consultor de IA con enfoque en experiencia de usuario. Responde en máximo 3 oraciones.`,
  storytelling:`Eres un experto en narrativa empresarial. Responde en máximo 3 oraciones.`
};

// ---------- GROQ ----------
async function callGroq(messages, max_tokens = 600) {
  let attempts = 0;
  while (attempts < GROQ_KEYS.length) {
    const apiKey = getNextKey();
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-oss-120b", messages, max_tokens, temperature: 0.3 })
      });
      if (!response.ok) { attempts++; continue; }
      const data = await response.json();
      if (!data.error) return data.choices?.[0]?.message?.content;
      attempts++;
    } catch (e) { attempts++; }
  }
  throw new Error("Todas las API keys fallaron o Groq rechazó la petición.");
}

// ---------- ENDPOINTS ----------
app.post("/chat", chatLimiter, async (req, res) => {
  const { message, mode = "default", userId = "defaultUser" } = req.body;
  if (!message) return res.json({ reply: "❌ Falta 'message'" });
  if (detectInjection(message)) return res.json({ reply: "No puedo procesar esa solicitud." });

  try {
    let knowledgeContext = "";
    if (db) {
      const result = await searchKnowledge(message);
      if (result) {
        if (result.type === 'faq') knowledgeContext = `Pregunta: "${result.data.question}"\nRespuesta: ${result.data.answer}`;
        else if (result.type === 'knowledge') knowledgeContext = `Información: ${result.data.title}\n${result.data.content}`;
      }
    }
    const history = await getConversationHistory(userId);
    const systemPrompt = MODES[mode] || MODES.default;
    let systemContent = systemPrompt;
    if (knowledgeContext) systemContent += `\n\n**Info extra:**\n${knowledgeContext}`;

    const messages = [{ role: "system", content: systemContent }, ...history, { role: "user", content: message }];
    const reply = await callGroq(messages, 150);
    await addToConversationHistory(userId, "user", message);
    await addToConversationHistory(userId, "assistant", reply);
    res.json({ reply });
  } catch (error) { res.json({ reply: "❌ Error en el servidor" }); }
});

app.post("/leads", async (req, res) => {
  const { name, email, company, sector, shadow_ai, samd, risk_level } = req.body;
  if (!email) return res.status(400).json({ error: "Email requerido" });
  try {
    if (!db) return res.status(500).json({ error: "DB no conectada" });
    await db.collection("leads").insertOne({ ts: new Date(), name, email, company, sector, shadow_ai, samd, risk_level });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/leads", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "DB no conectada" });
    const leads = await db.collection("leads").find({}).sort({ ts: -1 }).toArray();
    res.json(leads);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/gov/generate-report", async (req, res) => {
  try {
    const { companyName, score, riskLevel, answers } = req.body;
    const prompt = `Eres un consultor experto en gobernanza de IA (ISO 42001, NIST AI RMF). La empresa "${companyName}" ha completado un diagnóstico de madurez obteniendo un score del ${score}% (Nivel: ${riskLevel}). Respuestas: ${JSON.stringify(answers)}. Genera un "Resumen Ejecutivo" formal (máximo 3 párrafos) interpretando el nivel, identificando los 2 puntos más críticos y recomendando acciones inmediatas (Quick Wins) para 60 días. Tono consultivo y ejecutivo.`;
    const report = await callGroq([{ role: "user", content: prompt }], 800);
    res.json({ report });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.use('/gov', (req, res, next) => {
  if (!db) return res.status(503).json({ error: "DB no conectada aún" });
  req.db = db; next();
}, createGovRouter());

app.get('/health', (req, res) => res.json({ ok: true, mongo: !!db, keys_loaded: GROQ_KEYS.length, uptime_s: Math.floor(process.uptime()), ts: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));