/* =============================================================================
   BehaviorLab API — server.js  (ESM)
   Backend: Node.js + Express + MongoDB Atlas + Groq (openai/gpt-oss-120b)
   ============================================================================= */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app  = express();
const PORT = process.env.PORT || 10000;

function resolveMongoUri() {
  const candidates = ['MONGODB_URI', 'MONGO_URI', 'MONGO_URL', 'DATABASE_URL', 'MONGODB_URL'];
  for (const name of candidates) {
    const v = process.env[name];
    if (typeof v === 'string' && v.trim().startsWith('mongodb')) return { uri: v.trim(), source: name };
  }
  return { uri: null, source: null };
}

const { uri: MONGODB_URI, source: MONGODB_URI_SOURCE } = resolveMongoUri();
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEYS = [1, 2, 3, 4, 5].map((i) => process.env[`GROQ_API_KEY_${i}`]).filter((k) => typeof k === 'string' && k.trim().length > 0);

const DEFAULT_ORIGINS = [
  'https://behaviorlab.gokulab.mx',
  'https://www.behaviorlab.gokulab.mx',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...EXTRA_ORIGINS])];
const ALLOWED_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)*behaviorlab\.pages\.dev$/i,
  /^https:\/\/([a-z0-9-]+\.)*gokulab\.mx$/i,
];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (ALLOWED_PATTERNS.some((re) => re.test(origin))) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
}));
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

/* ── MODELOS ── */
const LeadSchema = new mongoose.Schema({
  tipo_lead: { type: String, enum: ['gobernanza', 'automatizacion'], default: 'gobernanza', index: true },
  nombre: String, email: String, empresa: String, telefono: String,
  proceso: mongoose.Schema.Types.Mixed, resultado: mongoose.Schema.Types.Mixed,
  fuente: String, userAgent: String, ip: String, meta: mongoose.Schema.Types.Mixed,
}, { timestamps: true, strict: false, collection: 'leads' });
const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

// NUEVO: Modelo de Usuario con Módulos de Acceso
const UserSchema = new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String,
  role: { type: String, enum: ['superadmin', 'admin', 'auditor'], default: 'admin' },
  orgId: String,
  modules: { type: [String], default: ['gobernanza'] }
}, { timestamps: true });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const OrgSchema = new mongoose.Schema({ name: String });
const Org = mongoose.models.Org || mongoose.model('Org', OrgSchema);

/* ── UTILIDADES ── */
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const toNumber = (v, fallback = 0) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return Number.isFinite(n) ? n : fallback; };

function rateLimiter({ windowMs = 10 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [ip, rec] of hits) if (now > rec.reset) hits.delete(ip); }, windowMs).unref?.();
  return (req, res, next) => {
    const ip = req.ip || 'unknown'; const now = Date.now(); const rec = hits.get(ip) || { count: 0, reset: now + windowMs };
    if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; } rec.count += 1; hits.set(ip, rec);
    if (rec.count > max) { res.set('Retry-After', String(Math.ceil((rec.reset - now) / 1000))); return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes.' }); }
    next();
  };
}

const authenticateToken = (req, res, next) => {
  // En producción validas JWT, por ahora dejamos pasar para probar
  next();
};

/* ── CLIENTE GROQ ── */
let keyCursor = 0;
async function callGroq({ messages, temperature = 0.2, maxTokens = 900, timeoutMs = 20000 }) {
  if (GROQ_KEYS.length === 0) throw new Error('Sin claves GROQ');
  const failures = [];
  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const keyIndex = (keyCursor + attempt) % GROQ_KEYS.length;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(GROQ_URL, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEYS[keyIndex]}` },
        body: JSON.stringify({ model: GROQ_MODEL, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }),
      });
      clearTimeout(timer);
      if (!resp.ok) { failures.push({ keyIndex, status: resp.status }); if ([401, 403, 429, 500, 502, 503, 504].includes(resp.status)) continue; throw new Error('Groq error'); }
      const data = await resp.json(); const content = data?.choices?.[0]?.message?.content;
      if (!content) continue;
      keyCursor = (keyIndex + 1) % GROQ_KEYS.length; return { content };
    } catch (err) { clearTimeout(timer); failures.push({ keyIndex, status: 'exception' }); }
  }
  console.error('[GROQ] Fallaron todas las claves:', failures);
  throw new Error('GROQ_UNAVAILABLE');
}

function safeParseJSON(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { const s = t.indexOf('{'); const e = t.lastIndexOf('}'); if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } } return null; }
}

/* ── LÓGICA ASSESSMENT ── */
const COMPLEXITY_MAP = { baja: 1, baja_media: 2, media: 3, media_alta: 4, alta: 5, low: 1, medium: 3, high: 5 };
const COMPLEXITY_LABEL = { 1: 'baja', 2: 'baja-media', 3: 'media', 4: 'media-alta', 5: 'alta' };
const VALID_DATA_TYPES = ['estructurado', 'semi-estructurado', 'no-estructurado', 'documentos', 'mixto', 'structured', 'semi-structured', 'unstructured', 'documents', 'mixed'];

function computeRoi({ hoursSpent, automationIndex }) {
  const baselineMonthly = Math.round(hoursSpent * 4.33);
  return { baselineMonthly, hoursSaved: Math.round((baselineMonthly * automationIndex) / 100) };
}

function normalizeAssessment(raw, v, usedFallback = false) {
  const idx = clamp(Math.round(toNumber(raw?.automationIndex, 50)), 0, 100);
  const finalRoi = computeRoi({ hoursSpent: v.hoursSpent, automationIndex: idx });
  return {
    automationIndex: idx,
    agentType: raw?.agentType || 'Agente Cognitivo',
    agentDescription: raw?.agentDescription || '',
    roiHoursPerMonth: finalRoi.hoursSaved,
    baselineHoursPerMonth: finalRoi.baselineMonthly,
    roiExplanation: raw?.roiExplanation || `Con un índice del ${idx}%, ahorrarías ~${finalRoi.hoursSaved} h/mes.`,
    paybackMonths: clamp(Math.round(toNumber(raw?.paybackMonths, 6)), 1, 24),
    implementationPhases: raw?.implementationPhases || ['Diagnóstico', 'Prototipo', 'Piloto', 'Producción'],
    confidence: raw?.confidence || 'media',
    source: usedFallback ? 'heuristic-fallback' : 'groq',
  };
}

function validateAssessmentPayload(body) {
  const errors = [];
  const processName = typeof body.processName === 'string' ? body.processName.trim() : '';
  if (processName.length < 2) errors.push('processName inválido');
  const volume = toNumber(body.volume, NaN); if (!Number.isFinite(volume)) errors.push('volume inválido');
  let complexityNum = clamp(Math.round(toNumber(body.complexity, 3)), 1, 5);
  const dataType = String(body.dataType || '').toLowerCase().trim(); if (!VALID_DATA_TYPES.includes(dataType)) errors.push('dataType inválido');
  const hoursSpent = toNumber(body.hoursSpent, NaN); if (!Number.isFinite(hoursSpent)) errors.push('hoursSpent inválido');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''; if (!isEmail(email)) errors.push('email inválido');
  
  return {
    ok: errors.length === 0, errors,
    value: {
      processName, volume: Math.round(volume), complexity: complexityNum, dataType, hoursSpent: Number(hoursSpent.toFixed(2)),
      nombre: body.nombre || '', email, empresa: body.empresa || '', telefono: body.telefono || ''
    },
  };
}

/* ── ENDPOINTS ── */

// 1. Endpoint Público: Assessment
const assessmentLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
app.post('/api/public/automation-assessment', assessmentLimiter, async (req, res) => {
  const v = validateAssessmentPayload(req.body || {});
  if (!v.ok) return res.status(400).json({ ok: false, error: 'Payload inválido', details: v.errors });

  const data = v.value;
  let assessment;
  try {
    const { content } = await callGroq({
      messages: [
        { role: 'system', content: `Eres un Arquitecto de Automatización. Devuelve JSON con: automationIndex (0-100), agentType, agentDescription, roiHoursPerMonth, baselineHoursPerMonth, roiExplanation, paybackMonths, implementationPhases (array), confidence.` },
        { role: 'user', content: `Proceso: ${data.processName}, Volumen: ${data.volume}, Complejidad: ${COMPLEXITY_LABEL[data.complexity]}, Datos: ${data.dataType}, Horas: ${data.hoursSpent}/sem.` },
      ],
    });
    assessment = normalizeAssessment(safeParseJSON(content), data, false);
  } catch (err) {
    assessment = normalizeAssessment({ automationIndex: 60, agentType: 'RPA (Robotic Process Automation)' }, data, true);
  }

  let leadId = null;
  try {
    const lead = await Lead.create({
      tipo_lead: 'automatizacion', nombre: data.nombre, email: data.email, empresa: data.empresa, telefono: data.telefono,
      proceso: data, resultado: assessment, fuente: 'automation-assessment',
    });
    leadId = lead._id.toString();
  } catch (dbErr) { console.error('[MONGO] Error guardando lead:', dbErr.message); }

  return res.status(200).json({ ok: true, leadId, assessment });
});

// 2. Endpoint Portal: Listar Assessments (Protegido)
app.get('/gov/assessments', authenticateToken, async (req, res) => {
  try {
    const assessments = await Lead.find({ tipo_lead: 'automatizacion' }).sort({ createdAt: -1 });
    res.json(assessments);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar assessments' });
  }
});

// 3. Endpoint Portal: Usuarios
app.get('/gov/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar usuarios' });
  }
});

app.post('/gov/users', authenticateToken, async (req, res) => {
  try {
    const { name, email, password, role, orgId, modules } = req.body;
    const user = await User.create({ name, email, password, role, orgId, modules });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// 4. Endpoint Portal: Organizaciones (Para el selector del superadmin)
app.get('/gov/orgs', authenticateToken, async (req, res) => {
  try {
    const orgs = await Org.find();
    res.json(orgs);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar orgs' });
  }
});

// 5. Endpoint Portal: Leads generales (Gobernanza)
app.get('/leads', authenticateToken, async (req, res) => {
  try {
    const leads = await Lead.find({ tipo_lead: 'gobernanza' }).sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar leads' });
  }
});

/* ── HEALTHCHECK Y ARRANQUE ── */
app.get('/health', (_req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  res.status(dbState === 'connected' ? 200 : 503).json({ ok: dbState === 'connected', db: dbState, version: '1.3.0' });
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`[SERVER] Escuchando en :${PORT}`));

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).then(() => console.log('[MONGO] Conectado')).catch((err) => console.error('[MONGO] Fallo:', err.message));
}

process.on('SIGTERM', async () => {
  server.close(() => console.log('[SERVER] Cerrado'));
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});