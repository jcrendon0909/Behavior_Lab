/* =============================================================================
   BehaviorLab API — server.js  (ESM)
   Backend: Node.js + Express + MongoDB Atlas + Groq (openai/gpt-oss-120b)
   Deploy: Render  |  Frontend: Cloudflare Pages (behaviorlab.gokulab.mx)

   v1.1.3 — Acepta aliases comunes de la URI de Mongo (MONGODB_URI | MONGO_URI |
            MONGO_URL | DATABASE_URL) y añade diagnóstico de env vars.
            Si no hay URI, NO mata el proceso: /health responde 503 con el
            detalle de qué variables relacionadas sí están presentes.
   ============================================================================= */

import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

/* ═══════════════════════════════════════════════════════════════════════════
   1. CONFIGURACIÓN / VARIABLES DE ENTORNO
   ═══════════════════════════════════════════════════════════════════════════ */

const app  = express();
const PORT = process.env.PORT || 10000;

/**
 * Resolución tolerante de la URI de Mongo.
 * Prueba en orden los nombres más comunes. Devuelve también el nombre usado
 * para poder reportarlo en /health y en logs.
 */
function resolveMongoUri() {
  const candidates = ['MONGODB_URI', 'MONGO_URI', 'MONGO_URL', 'DATABASE_URL', 'MONGODB_URL'];
  for (const name of candidates) {
    const v = process.env[name];
    if (typeof v === 'string' && v.trim().startsWith('mongodb')) {
      return { uri: v.trim(), source: name };
    }
  }
  return { uri: null, source: null };
}

const { uri: MONGODB_URI, source: MONGODB_URI_SOURCE } = resolveMongoUri();

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

// Recolecta GROQ_API_KEY_1 ... GROQ_API_KEY_5 (ignora vacías)
const GROQ_KEYS = [1, 2, 3, 4, 5]
  .map((i) => process.env[`GROQ_API_KEY_${i}`])
  .filter((k) => typeof k === 'string' && k.trim().length > 0);

// Diagnóstico: lista (sin valores) las env vars que PARECEN relacionadas.
const ENV_DIAGNOSTIC = Object.keys(process.env)
  .filter((k) => /MONGO|DATABASE|DB_/i.test(k))
  .sort();

if (!MONGODB_URI) {
  console.error('[FATAL] No se encontró ninguna URI de MongoDB en las env vars.');
  console.error('[FATAL] Nombres probados: MONGODB_URI, MONGO_URI, MONGO_URL, DATABASE_URL, MONGODB_URL.');
  console.error('[FATAL] Variables relacionadas presentes en el entorno (solo nombres):');
  if (ENV_DIAGNOSTIC.length === 0) {
    console.error('        (ninguna — revisa Dashboard → Environment del servicio en Render)');
  } else {
    ENV_DIAGNOSTIC.forEach((k) => console.error(`        - ${k}`));
  }
  console.error('[FATAL] El servidor arrancará igual para que /health explique el estado,');
  console.error('[FATAL] pero los endpoints que toquen Mongo devolverán 503.');
}

if (GROQ_KEYS.length === 0) {
  console.warn('[WARN] No hay claves GROQ_API_KEY_* configuradas. Se usará solo el fallback heurístico.');
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. CORS — Producción
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_ORIGINS = [
  'https://behaviorlab.gokulab.mx',
  'https://www.behaviorlab.gokulab.mx',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...EXTRA_ORIGINS])];

const ALLOWED_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)*behaviorlab\.pages\.dev$/i,
  /^https:\/\/([a-z0-9-]+\.)*gokulab\.mx$/i,
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (ALLOWED_PATTERNS.some((re) => re.test(origin))) return callback(null, true);
    console.warn(`[CORS] Origen bloqueado: ${origin}`);
    return callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

/* ═══════════════════════════════════════════════════════════════════════════
   3. MODELO MONGOOSE
   ═══════════════════════════════════════════════════════════════════════════ */

const LeadSchema = new mongoose.Schema(
  {
    tipo_lead: { type: String, enum: ['gobernanza', 'automatizacion'], default: 'gobernanza', index: true },
    nombre:    { type: String, trim: true },
    email:     { type: String, trim: true, lowercase: true, index: true },
    empresa:   { type: String, trim: true },
    telefono:  { type: String, trim: true },
    proceso:   { type: mongoose.Schema.Types.Mixed },
    resultado: { type: mongoose.Schema.Types.Mixed },
    fuente:    { type: String, default: 'web' },
    userAgent: { type: String },
    ip:        { type: String },
    meta:      { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, strict: false, collection: 'leads' }
);

const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

/* ═══════════════════════════════════════════════════════════════════════════
   4. UTILIDADES
   ═══════════════════════════════════════════════════════════════════════════ */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const isEmail = (v) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

const toNumber = (v, fallback = 0) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function rateLimiter({ windowMs = 10 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits) if (now > rec.reset) hits.delete(ip);
  }, windowMs).unref?.();

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const rec = hits.get(ip) || { count: 0, reset: now + windowMs };
    if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
    rec.count += 1;
    hits.set(ip, rec);
    if (rec.count > max) {
      res.set('Retry-After', String(Math.ceil((rec.reset - now) / 1000)));
      return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' });
    }
    next();
  };
}

/** Guard defensivo: si no hay URI de Mongo, responde 503 antes del handler. */
function requireDb(req, res, next) {
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    ok: false,
    error: 'Base de datos no disponible en este momento.',
    db: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. CLIENTE GROQ CON ROTACIÓN DE CLAVES
   ═══════════════════════════════════════════════════════════════════════════ */

let keyCursor = 0;

async function callGroq({ messages, temperature = 0.2, maxTokens = 900, timeoutMs = 20000 }) {
  if (GROQ_KEYS.length === 0) throw new Error('Sin claves GROQ configuradas');

  const failures = [];
  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const keyIndex = (keyCursor + attempt) % GROQ_KEYS.length;
    const apiKey = GROQ_KEYS[keyIndex];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(GROQ_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        failures.push({ keyIndex, status: resp.status, body: body.slice(0, 200) });
        if ([401, 403, 429, 500, 502, 503, 504].includes(resp.status)) continue;
        throw new Error(`Groq ${resp.status}: ${body.slice(0, 200)}`);
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) { failures.push({ keyIndex, status: 200, body: 'respuesta vacía' }); continue; }

      keyCursor = (keyIndex + 1) % GROQ_KEYS.length;
      return { content, usage: data.usage || null, keyIndex };
    } catch (err) {
      clearTimeout(timer);
      failures.push({ keyIndex, status: 'exception', body: String(err.message || err) });
    }
  }
  console.error('[GROQ] Todas las claves fallaron:', JSON.stringify(failures));
  throw new Error('GROQ_UNAVAILABLE');
}

function safeParseJSON(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {
    const s = t.indexOf('{'); const e = t.lastIndexOf('}');
    if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } }
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. LÓGICA DEL ASSESSMENT
   ═══════════════════════════════════════════════════════════════════════════ */

const COMPLEXITY_MAP = { baja: 1, baja_media: 2, media: 3, media_alta: 4, alta: 5, low: 1, medium: 3, high: 5 };

const VALID_DATA_TYPES = [
  'estructurado', 'semi-estructurado', 'no-estructurado', 'documentos', 'mixto',
  'structured', 'semi-structured', 'unstructured', 'documents', 'mixed',
];

const DATA_TYPE_HINT = {
  estructurado: 'datos en tablas, ERP/CRM, formularios',
  'semi-estructurado': 'CSV, JSON, correos con formato estable',
  'no-estructurado': 'texto libre, correos, audio, imágenes',
  documentos: 'PDFs, facturas, contratos escaneados',
  mixto: 'combinación de documentos y datos estructurados',
  structured: 'datos en tablas, ERP/CRM, formularios',
  'semi-structured': 'CSV, JSON, correos con formato estable',
  unstructured: 'texto libre, correos, audio, imágenes',
  documents: 'PDFs, facturas, contratos escaneados',
  mixed: 'combinación de documentos y datos estructurados',
};

function validateAssessmentPayload(body) {
  const errors = [];

  const processName = typeof body.processName === 'string' ? body.processName.trim() : '';
  if (processName.length < 2 || processName.length > 120) errors.push('processName debe tener entre 2 y 120 caracteres.');

  const volume = toNumber(body.volume, NaN);
  if (!Number.isFinite(volume) || volume < 0 || volume > 10_000_000) {
    errors.push('volume debe ser un número entre 0 y 10,000,000.');
  }

  let complexityNum;
  if (typeof body.complexity === 'number') {
    complexityNum = clamp(Math.round(body.complexity), 1, 5);
  } else {
    const k = String(body.complexity || '').toLowerCase().trim().replace(/\s+/g, '_');
    complexityNum = COMPLEXITY_MAP[k] ?? clamp(Math.round(toNumber(k, 3)), 1, 5);
  }

  const dataType = String(body.dataType || '').toLowerCase().trim();
  if (!VALID_DATA_TYPES.includes(dataType)) {
    errors.push(`dataType inválido. Valores aceptados: ${[...new Set(VALID_DATA_TYPES)].join(', ')}.`);
  }

  const hoursSpent = toNumber(body.hoursSpent, NaN);
  if (!Number.isFinite(hoursSpent) || hoursSpent < 0 || hoursSpent > 500) {
    errors.push('hoursSpent debe ser un número entre 0 y 500 (horas/semana).');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) errors.push('email inválido o ausente.');

  return {
    ok: errors.length === 0,
    errors,
    value: {
      processName,
      volume: Math.round(volume),
      complexity: complexityNum,
      dataType,
      hoursSpent: Number(hoursSpent.toFixed(2)),
      nombre: (body.nombre || '').toString().trim().slice(0, 120),
      email,
      empresa: (body.empresa || '').toString().trim().slice(0, 120),
      telefono: (body.telefono || '').toString().trim().slice(0, 40),
    },
  };
}

const COMPLEXITY_LABEL = { 1: 'baja', 2: 'baja-media', 3: 'media', 4: 'media-alta', 5: 'alta' };

function computeRoi({ hoursSpent, automationIndex }) {
  const WEEKS_PER_MONTH = 4.33;
  const baselineMonthly = Math.round(hoursSpent * WEEKS_PER_MONTH);
  const hoursSaved = Math.round((baselineMonthly * automationIndex) / 100);
  const hoursRemaining = Math.max(0, baselineMonthly - hoursSaved);
  return { baselineMonthly, hoursSaved, hoursRemaining, efficiencyPct: automationIndex };
}

function heuristicAssessment(v) {
  const volumeScore     = clamp((Math.log10(v.volume + 1) / 6) * 100, 0, 100);
  const complexityScore = clamp(110 - v.complexity * 18, 0, 100);
  const dataScore       = /estructurado|structured/i.test(v.dataType) ? 90
                        : /semi/i.test(v.dataType) ? 75
                        : /mixto|mixed/i.test(v.dataType) ? 65
                        : 55;
  const manualScore     = clamp((v.hoursSpent / 40) * 100, 0, 100);

  const automationIndex = Math.round(
    clamp(volumeScore * 0.30 + complexityScore * 0.30 + dataScore * 0.25 + manualScore * 0.15, 15, 92)
  );

  const agentType =
    /documentos|documents|no-estructurado|unstructured/i.test(v.dataType)
      ? 'Extracción de Documentos + NLP'
      : v.complexity <= 2 && v.volume >= 300
      ? 'RPA (Robotic Process Automation)'
      : v.complexity >= 4
      ? 'Agente Cognitivo con Orquestación Multi-paso'
      : 'Agente Conversacional + NLP';

  const roi = computeRoi({ hoursSpent: v.hoursSpent, automationIndex });

  return {
    automationIndex,
    agentType,
    agentDescription:
      `Un agente de tipo "${agentType}" puede absorber las tareas repetitivas de "${v.processName}" ` +
      `con el nivel de complejidad (${COMPLEXITY_LABEL[v.complexity]}) y el tipo de dato declarado.`,
    roiHoursPerMonth: roi.hoursSaved,
    baselineHoursPerMonth: roi.baselineMonthly,
    roiExplanation:
      `Hoy dedicas ~${roi.baselineMonthly} h/mes a "${v.processName}". Con un índice de automatización ` +
      `del ${automationIndex}%, recuperarías ~${roi.hoursSaved} h/mes (~${Math.round(roi.hoursSaved / 8)} días laborables).`,
    paybackMonths: Math.max(1, Math.round(12 - automationIndex / 10)),
    implementationPhases: [
      'Diagnóstico y mapeo del proceso (1-2 semanas)',
      'Prototipo del agente sobre casos reales (2-3 semanas)',
      'Piloto controlado y ajuste (2-4 semanas)',
      'Producción y monitoreo continuo',
    ],
    confidence: 'media',
    source: 'heuristic-fallback',
  };
}

function normalizeAssessment(raw, v, usedFallback = false) {
  const idx = clamp(Math.round(toNumber(raw?.automationIndex, 50)), 0, 100);
  const finalRoi = computeRoi({ hoursSpent: v.hoursSpent, automationIndex: idx });
  return {
    automationIndex: idx,
    agentType: typeof raw?.agentType === 'string' && raw.agentType.trim().length > 2
      ? raw.agentType.trim().slice(0, 120) : 'Agente Cognitivo',
    agentDescription: typeof raw?.agentDescription === 'string'
      ? raw.agentDescription.trim().slice(0, 600) : '',
    roiHoursPerMonth: finalRoi.hoursSaved,
    baselineHoursPerMonth: finalRoi.baselineMonthly,
    roiExplanation: typeof raw?.roiExplanation === 'string' && raw.roiExplanation.trim().length > 10
      ? raw.roiExplanation.trim().slice(0, 600)
      : `Con un índice del ${idx}%, ahorrarías ~${finalRoi.hoursSaved} h/mes de las ${finalRoi.baselineMonthly} h/mes actuales.`,
    paybackMonths: clamp(Math.round(toNumber(raw?.paybackMonths, 6)), 1, 24),
    implementationPhases: Array.isArray(raw?.implementationPhases)
      ? raw.implementationPhases.slice(0, 5).map((p) => String(p).slice(0, 160))
      : ['Diagnóstico y mapeo del proceso', 'Prototipo del agente', 'Piloto controlado', 'Producción y monitoreo'],
    confidence: ['alta', 'media', 'baja'].includes(raw?.confidence) ? raw.confidence : 'media',
    source: usedFallback ? 'heuristic-fallback' : 'groq',
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. ENDPOINT: POST /api/public/automation-assessment
   ═══════════════════════════════════════════════════════════════════════════ */

const assessmentLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });

app.post('/api/public/automation-assessment', assessmentLimiter, async (req, res) => {
  const started = Date.now();
  const v = validateAssessmentPayload(req.body || {});
  if (!v.ok) return res.status(400).json({ ok: false, error: 'Payload inválido', details: v.errors });

  const data = v.value;
  const baselineMonthly = Math.round(data.hoursSpent * 4.33);

  const systemPrompt = `Eres un Arquitecto de Automatización de Procesos de BehaviorLab.
Analizas procesos y devuelves SIEMPRE un JSON válido, sin markdown.
Sé conservador y realista.
Estructura EXACTA:
{
  "automationIndex": <entero 0-100>,
  "agentType": "<RPA | NLP | Extracción de Documentos | Agente Conversacional | Orquestación Multi-paso>",
  "agentDescription": "<2-3 frases>",
  "roiHoursPerMonth": <entero>,
  "baselineHoursPerMonth": <entero>,
  "roiExplanation": "<2-3 frases>",
  "paybackMonths": <entero 1-24>,
  "implementationPhases": ["<f1>","<f2>","<f3>","<f4>"],
  "confidence": "alta" | "media" | "baja"
}`;

  const userPrompt = `Evalúa este proceso:

- Proceso: ${data.processName}
- Volumen: ${data.volume.toLocaleString('es-MX')} transacciones/mes
- Complejidad: ${COMPLEXITY_LABEL[data.complexity]} (${data.complexity}/5)
- Tipo de dato: ${data.dataType} (${DATA_TYPE_HINT[data.dataType] || 'n/d'})
- Horas hombre: ${data.hoursSpent} h/semana  ≈ ${baselineMonthly} h/mes

Cálculos OBLIGATORIOS:
- baselineHoursPerMonth = ${baselineMonthly}
- roiHoursPerMonth = round(${baselineMonthly} * automationIndex / 100)
Devuelve únicamente el JSON.`;

  let assessment;
  let usedFallback = false;

  try {
    const { content } = await callGroq({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
      maxTokens: 900,
    });
    const parsed = safeParseJSON(content);
    if (!parsed) throw new Error('JSON inválido del modelo');
    assessment = normalizeAssessment(parsed, data, false);
  } catch (err) {
    console.warn(`[ASSESSMENT] Groq no disponible (${err.message}). Usando fallback.`);
    usedFallback = true;
    assessment = normalizeAssessment(heuristicAssessment(data), data, true);
  }

  let leadId = null;
  let dbSaved = false;
  try {
    const lead = await Lead.create({
      tipo_lead: 'automatizacion',
      nombre: data.nombre,
      email: data.email,
      empresa: data.empresa,
      telefono: data.telefono,
      proceso: {
        processName: data.processName,
        volume: data.volume,
        complexity: data.complexity,
        complexityLabel: COMPLEXITY_LABEL[data.complexity],
        dataType: data.dataType,
        hoursSpent: data.hoursSpent,
        baselineHoursPerMonth: baselineMonthly,
      },
      resultado: assessment,
      fuente: 'automation-assessment',
      userAgent: (req.headers['user-agent'] || '').slice(0, 300),
      ip: req.ip,
      meta: { durationMs: Date.now() - started, model: usedFallback ? null : GROQ_MODEL },
    });
    leadId = lead._id.toString();
    dbSaved = true;
  } catch (dbErr) {
    console.error('[MONGO] Error guardando lead:', dbErr.message);
  }

  return res.status(200).json({
    ok: true,
    leadId,
    dbSaved,
    assessment: {
      automationIndex: assessment.automationIndex,
      agentType: assessment.agentType,
      agentDescription: assessment.agentDescription,
      roiHoursPerMonth: assessment.roiHoursPerMonth,
      baselineHoursPerMonth: assessment.baselineHoursPerMonth,
      roiExplanation: assessment.roiExplanation,
      paybackMonths: assessment.paybackMonths,
      implementationPhases: assessment.implementationPhases,
      confidence: assessment.confidence,
      source: assessment.source,
    },
    meta: { durationMs: Date.now() - started, model: usedFallback ? null : GROQ_MODEL },
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   8. ENDPOINT: POST /leads
   ═══════════════════════════════════════════════════════════════════════════ */

const leadsLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

app.post('/leads', leadsLimiter, requireDb, async (req, res) => {
  try {
    const body = req.body || {};
    const tipo = body.tipo_lead === 'automatizacion' ? 'automatizacion' : 'gobernanza';

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const nombre = (body.nombre || '').toString().trim().slice(0, 120);
    const empresa = (body.empresa || '').toString().trim().slice(0, 120);

    const errors = [];
    if (!nombre) errors.push('nombre es requerido');
    if (!isEmail(email)) errors.push('email inválido o ausente');
    if (!empresa) errors.push('empresa es requerida');
    if (errors.length) return res.status(400).json({ ok: false, error: 'Datos inválidos', details: errors });

    let proceso, resultado;
    if (tipo === 'automatizacion') {
      const v = validateAssessmentPayload({ ...body, nombre, email, empresa });
      if (!v.ok) return res.status(400).json({ ok: false, error: 'Datos de proceso inválidos', details: v.errors });
      proceso = {
        processName: v.value.processName,
        volume: v.value.volume,
        complexity: v.value.complexity,
        complexityLabel: COMPLEXITY_LABEL[v.value.complexity],
        dataType: v.value.dataType,
        hoursSpent: v.value.hoursSpent,
      };
      resultado = body.resultado && typeof body.resultado === 'object' ? body.resultado : undefined;
    } else {
      proceso = body.respuestas ?? body.proceso ?? undefined;
      resultado = {
        score: body.score ?? body.resultado?.score,
        nivel: body.nivel ?? body.resultado?.nivel,
      };
      if (resultado.score === undefined && resultado.nivel === undefined) resultado = undefined;
    }

    const lead = await Lead.create({
      tipo_lead: tipo,
      nombre, email, empresa,
      telefono: (body.telefono || '').toString().trim().slice(0, 40),
      proceso,
      resultado,
      fuente: tipo === 'automatizacion' ? 'automation-assessment' : 'risk-calculator',
      userAgent: (req.headers['user-agent'] || '').slice(0, 300),
      ip: req.ip,
    });

    return res.status(201).json({ ok: true, leadId: lead._id.toString(), tipo_lead: tipo });
  } catch (err) {
    console.error('[POST /leads]', err);
    return res.status(500).json({ ok: false, error: 'Error interno al guardar el lead' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   9. HEALTHCHECK Y ERRORES
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/', (_req, res) => res.json({ ok: true, service: 'BehaviorLab API', version: '1.1.3' }));

app.get('/health', (_req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  const healthy = dbState === 'connected' && !!MONGODB_URI;
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    db: dbState,
    mongoUri: MONGODB_URI ? `found (${MONGODB_URI_SOURCE})` : 'missing',
    envDiagnostic: MONGODB_URI ? undefined : ENV_DIAGNOSTIC,
    groqKeys: GROQ_KEYS.length,
    uptime: Math.round(process.uptime()),
    version: '1.1.3',
  });
});

app.use((_req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada' }));

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  if (err.message && err.message.includes('CORS')) return res.status(403).json({ ok: false, error: 'Origen no permitido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'Payload demasiado grande' });
  return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

/* ═══════════════════════════════════════════════════════════════════════════
   10. ARRANQUE — SIEMPRE levanta el puerto primero
   ═══════════════════════════════════════════════════════════════════════════ */

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] BehaviorLab API escuchando en 0.0.0.0:${PORT}`);
  console.log(`[SERVER] Groq keys cargadas: ${GROQ_KEYS.length} | modelo: ${GROQ_MODEL}`);
  console.log(`[SERVER] Mongo URI: ${MONGODB_URI ? `OK (desde ${MONGODB_URI_SOURCE})` : 'NO ENCONTRADA'}`);
});

// Solo intentamos conectar si tenemos URI. Si no, /health lo reporta y el
// proceso sigue vivo (Render marca Live, /health da 503 hasta que se arregle).
if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10, retryWrites: true })
    .then(() => console.log('[MONGO] Conectado a Atlas'))
    .catch((err) => console.error('[MONGO] Fallo de conexión inicial:', err.message));
}

process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM recibido, cerrando...');
  server.close(() => console.log('[SERVER] Servidor HTTP cerrado'));
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});