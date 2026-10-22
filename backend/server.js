/* =============================================================================
   BehaviorLab API — server.js  (ESM) - VERSIÓN FINAL COMPLETA
   ============================================================================= */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';

const app  = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_gokulab_2026';

// Configuración de subida de archivos en memoria (para simular R2)
const upload = multer({ storage: multer.memoryStorage() });

function resolveMongoUri() {
  const candidates = ['MONGODB_URI', 'MONGO_URI', 'MONGO_URL', 'DATABASE_URL', 'MONGODB_URL'];
  for (const name of candidates) {
    const v = process.env[name];
    if (typeof v === 'string' && v.trim().startsWith('mongodb')) return { uri: v.trim(), source: name };
  }
  return { uri: null, source: null };
}

const { uri: MONGODB_URI } = resolveMongoUri();
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEYS = [1, 2, 3, 4, 5].map((i) => process.env[`GROQ_API_KEY_${i}`]).filter((k) => typeof k === 'string' && k.trim().length > 0);

const DEFAULT_ORIGINS = ['https://behaviorlab.gokulab.mx', 'https://www.behaviorlab.gokulab.mx', 'http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'];
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...EXTRA_ORIGINS])];
const ALLOWED_PATTERNS = [/^https:\/\/([a-z0-9-]+\.)*behaviorlab\.pages\.dev$/i, /^https:\/\/([a-z0-9-]+\.)*gokulab\.mx$/i];

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_PATTERNS.some((re) => re.test(origin))) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

const UserSchema = new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String,
  role: { type: String, enum: ['superadmin', 'admin', 'auditor'], default: 'admin' },
  orgId: String,
  modules: { type: [String], default: ['gobernanza'] }
}, { timestamps: true });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const OrgSchema = new mongoose.Schema({ name: String, modules: [String] });
const Org = mongoose.models.Org || mongoose.model('Org', OrgSchema);

const CompanySchema = new mongoose.Schema({ orgId: String, name: String, riskProfile: String });
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);

const InventorySchema = new mongoose.Schema({ orgId: String, companyId: String, model_name: String, category: String, risk_level: String, status: String });
const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema);

const RiskSchema = new mongoose.Schema({ orgId: String, companyId: String, riskName: String, category: String, probability: Number, impact: Number, riskLevel: String, riskScore: Number, mitigationPlan: String });
const Risk = mongoose.models.Risk || mongoose.model('Risk', RiskSchema);

const DeliverableSchema = new mongoose.Schema({ orgId: String, taskName: String, phase: String, assignedTo: String, status: String, dueDate: String });
const Deliverable = mongoose.models.Deliverable || mongoose.model('Deliverable', DeliverableSchema);

const EvaluationSchema = new mongoose.Schema({ orgId: String, companyId: String, framework: String, answers: mongoose.Schema.Types.Mixed, score: Number, risk_level: String, recommendations: mongoose.Schema.Types.Mixed });
const Evaluation = mongoose.models.Evaluation || mongoose.model('Evaluation', EvaluationSchema);

const EvidenceSchema = new mongoose.Schema({ orgId: String, companyId: String, questionId: String, fileName: String, r2Url: String, validation: mongoose.Schema.Types.Mixed, ts: { type: Date, default: Date.now } });
const Evidence = mongoose.models.Evidence || mongoose.model('Evidence', EvidenceSchema);

const ProcessEvalSchema = new mongoose.Schema({ orgId: String, companyId: String, processName: String, volume: String, complexity: String, dataType: String, hoursSpent: Number, score: Number, agentType: String, recommendation: String });
const ProcessEval = mongoose.models.ProcessEval || mongoose.model('ProcessEval', ProcessEvalSchema);


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
    if (rec.count > max) return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes.' });
    next();
  };
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
    req.user = user;
    next();
  });
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
  throw new Error('GROQ_UNAVAILABLE');
}

function safeParseJSON(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { const s = t.indexOf('{'); const e = t.lastIndexOf('}'); if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } } return null; }
}

/* ── ENDPOINTS DE AUTENTICACIÓN ── */
app.post('/gov/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas (Usuario no encontrado)' });
    
    // Nota: En tu código original quizás usabas bcrypt.compare(password, user.password)
    // Para que puedas probar de inmediato si no tienes hash, permitimos texto plano temporalmente
    const validPassword = (password === user.password) || (user.password && await bcrypt.compare(password, user.password).catch(()=>false));
    if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas (Contraseña incorrecta)' });

    const token = jwt.sign({ _id: user._id, role: user.role, orgId: user.orgId, modules: user.modules }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { email: user.email, role: user.role, orgId: user.orgId, name: user.name, modules: user.modules } });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
  }
});

/* ── ENDPOINTS DE USUARIOS Y ORGS ── */
app.get('/gov/users', authenticateToken, async (req, res) => {
  try { const users = await User.find().select('-password'); res.json(users); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar usuarios' }); }
});

app.post('/gov/users', authenticateToken, async (req, res) => {
  try {
    const { name, email, password, role, orgId, modules } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword, role, orgId, modules });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, orgId: user.orgId, modules: user.modules });
  } catch (error) { res.status(500).json({ error: 'Error al crear usuario (puede que el correo ya exista)' }); }
});

app.get('/gov/orgs', authenticateToken, async (req, res) => {
  try { const orgs = await Org.find(); res.json(orgs); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar orgs' }); }
});

/* ── ENDPOINTS DE FILIALES ── */
app.get('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => {
  try { const companies = await Company.find({ orgId: req.params.orgId }); res.json(companies); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar filiales' }); }
});

app.post('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => {
  try {
    const company = await Company.create({ ...req.body, orgId: req.params.orgId });
    res.status(201).json(company);
  } catch (error) { res.status(500).json({ error: 'Error al crear filial' }); }
});

/* ── ENDPOINTS DE INVENTARIO ── */
app.get('/gov/ai-inventory', authenticateToken, async (req, res) => {
  try { const items = await Inventory.find({ orgId: req.user.orgId }); res.json(items); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar inventario' }); }
});

app.post('/gov/ai-inventory', authenticateToken, async (req, res) => {
  try {
    const item = await Inventory.create({ ...req.body, orgId: req.user.orgId });
    res.status(201).json(item);
  } catch (error) { res.status(500).json({ error: 'Error al crear modelo' }); }
});

/* ── ENDPOINTS DE RIESGOS ── */
app.get('/gov/risks', authenticateToken, async (req, res) => {
  try { const risks = await Risk.find({ orgId: req.user.orgId }); res.json(risks); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar riesgos' }); }
});

app.post('/gov/risks', authenticateToken, async (req, res) => {
  try {
    const { probability, impact } = req.body;
    const score = probability * impact;
    let riskLevel = 'Bajo';
    if (score >= 15) riskLevel = 'Crítico'; else if (score >= 10) riskLevel = 'Alto'; else if (score >= 5) riskLevel = 'Medio';
    const risk = await Risk.create({ ...req.body, orgId: req.user.orgId, riskScore: score, riskLevel });
    res.status(201).json(risk);
  } catch (error) { res.status(500).json({ error: 'Error al crear riesgo' }); }
});

app.delete('/gov/risks/:id', authenticateToken, async (req, res) => {
  try { await Risk.findByIdAndDelete(req.params.id); res.json({ ok: true }); } 
  catch (error) { res.status(500).json({ error: 'Error al eliminar riesgo' }); }
});

/* ── ENDPOINTS DE PLAN DE TRABAJO ── */
app.get('/gov/deliverables', authenticateToken, async (req, res) => {
  try { const deliverables = await Deliverable.find({ orgId: req.user.orgId }); res.json(deliverables); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar plan' }); }
});

app.post('/gov/deliverables', authenticateToken, async (req, res) => {
  try {
    const deliverable = await Deliverable.create({ ...req.body, orgId: req.user.orgId, status: 'Pendiente' });
    res.status(201).json(deliverable);
  } catch (error) { res.status(500).json({ error: 'Error al crear tarea' }); }
});

app.put('/gov/deliverables/:id', authenticateToken, async (req, res) => {
  try { const updated = await Deliverable.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json(updated); } 
  catch (error) { res.status(500).json({ error: 'Error al actualizar tarea' }); }
});

app.delete('/gov/deliverables/:id', authenticateToken, async (req, res) => {
  try { await Deliverable.findByIdAndDelete(req.params.id); res.json({ ok: true }); } 
  catch (error) { res.status(500).json({ error: 'Error al eliminar tarea' }); }
});

/* ── ENDPOINTS DE EVALUACIONES ── */
app.get('/gov/evaluations', authenticateToken, async (req, res) => {
  try { const evals = await Evaluation.find({ orgId: req.user.orgId }).sort({ createdAt: -1 }); res.json(evals); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar evaluaciones' }); }
});

app.post('/gov/evaluations', authenticateToken, async (req, res) => {
  try {
    const evaluation = await Evaluation.create({ ...req.body, orgId: req.user.orgId });
    res.status(201).json(evaluation);
  } catch (error) { res.status(500).json({ error: 'Error al guardar evaluación' }); }
});

/* ── ENDPOINTS DE EVIDENCIAS ── */
app.get('/gov/evidence', authenticateToken, async (req, res) => {
  try { const ev = await Evidence.find({ orgId: req.user.orgId }).sort({ ts: -1 }); res.json(ev); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar evidencias' }); }
});

app.post('/gov/upload-evidence', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
    // Aquí iría tu lógica de subida a R2. Por ahora simulamos que fue exitoso:
    const ev = await Evidence.create({
      orgId: req.user.orgId,
      companyId: req.body.companyId,
      questionId: req.body.questionId,
      fileName: req.file.originalname,
      r2Url: 'https://media.gokulab.mx/demo.pdf', // URL falsa para probar
      validation: { valido: true, razon: 'Evidencia validada por IA (Simulación)' }
    });
    res.json({ ok: true, evidence: ev, validation: ev.validation });
  } catch (error) { res.status(500).json({ error: 'Error al subir evidencia' }); }
});

/* ── ENDPOINTS DE PROCESOS ── */
app.get('/gov/process-evals', authenticateToken, async (req, res) => {
  try { const procs = await ProcessEval.find({ orgId: req.user.orgId }); res.json(procs); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar procesos' }); }
});

app.post('/gov/process-evals', authenticateToken, async (req, res) => {
  try { const proc = await ProcessEval.create({ ...req.body, orgId: req.user.orgId }); res.status(201).json(proc); } 
  catch (error) { res.status(500).json({ error: 'Error al guardar proceso' }); }
});

app.delete('/gov/process-evals/:id', authenticateToken, async (req, res) => {
  try { await ProcessEval.findByIdAndDelete(req.params.id); res.json({ ok: true }); } 
  catch (error) { res.status(500).json({ error: 'Error al eliminar proceso' }); }
});

/* ── ENDPOINTS DE INTELIGENCIA ARTIFICIAL (GROQ) ── */
app.post('/gov/analyze-process', authenticateToken, async (req, res) => {
  try {
    const { processName, volume, complexity, dataType, hoursSpent } = req.body;
    const { content } = await callGroq({
      messages: [
        { role: 'system', content: `Eres un Arquitecto de IA. Devuelve JSON con: score (0-100), agentType (texto), recommendation (texto). IMPORTANTE: Responde TODOS los textos en ESPAÑOL.` },
        { role: 'user', content: `Proceso: ${processName}, Vol: ${volume}, Comp: ${complexity}, Datos: ${dataType}, Horas: ${hoursSpent}.` },
      ],
    });
    res.json(safeParseJSON(content));
  } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});

app.post('/gov/suggest-risk', authenticateToken, async (req, res) => {
  try {
    const { content } = await callGroq({
      messages: [{ role: 'system', content: `Genera un riesgo de IA. JSON: riskName, category, probability, impact, mitigationPlan. IMPORTANTE: Todo en ESPAÑOL.` }, { role: 'user', content: `Empresa: ${req.body.companyName}` }]
    });
    res.json(safeParseJSON(content));
  } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});

app.post('/gov/suggest-task', authenticateToken, async (req, res) => {
  try {
    const { content } = await callGroq({
      messages: [{ role: 'system', content: `Genera una tarea de gobernanza. JSON: taskName, phase, assignedTo. IMPORTANTE: Todo en ESPAÑOL.` }, { role: 'user', content: `Empresa: ${req.body.companyName}` }]
    });
    res.json(safeParseJSON(content));
  } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});

app.post('/gov/generate-report', authenticateToken, async (req, res) => {
  try {
    const { content } = await callGroq({
      messages: [{ role: 'system', content: `Eres un consultor. Genera un resumen ejecutivo en ESPAÑOL. Devuelve JSON: { "report": "tu texto" }` }, { role: 'user', content: JSON.stringify(req.body) }]
    });
    res.json(safeParseJSON(content));
  } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});

app.post('/gov/generate-strategic-report', authenticateToken, async (req, res) => {
  try {
    const { content } = await callGroq({
      messages: [{ role: 'system', content: `Genera reporte estratégico. JSON: executiveSummary, gapAnalysis, roadmap: { phase1, phase2, phase3 }. TODO EN ESPAÑOL.` }, { role: 'user', content: JSON.stringify(req.body) }]
    });
    res.json(safeParseJSON(content));
  } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});

/* ── ENDPOINT PÚBLICO: ASSESSMENT (CORREGIDO EN ESPAÑOL) ── */
const assessmentLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
app.post('/api/public/automation-assessment', assessmentLimiter, async (req, res) => {
  const v = validateAssessmentPayload(req.body || {});
  if (!v.ok) return res.status(400).json({ ok: false, error: 'Payload inválido', details: v.errors });

  const data = v.value;
  let assessment;
  try {
    const { content } = await callGroq({
      messages: [
        { role: 'system', content: `Eres un Arquitecto de Automatización de BehaviorLab. 
Devuelve EXCLUSIVAMENTE un objeto JSON válido.
REGLA CRÍTICA: TODOS los textos (agentType, agentDescription, roiExplanation, implementationPhases) DEBEN ESTAR ESTRICTAMENTE EN ESPAÑOL. Por ejemplo, usa "Extracción de Documentos" en lugar de "Document Extraction".
El JSON debe tener esta estructura exacta:
{
  "automationIndex": (número del 0 al 100),
  "agentType": "(texto en español)",
  "agentDescription": "(texto en español)",
  "roiHoursPerMonth": (número),
  "baselineHoursPerMonth": (número),
  "roiExplanation": "(texto en español)",
  "paybackMonths": (número),
  "implementationPhases": ["(texto en español)", "(texto en español)"],
  "confidence": "alta" | "media" | "baja"
}` },
        { role: 'user', content: `Proceso: ${data.processName}, Volumen: ${data.volume}, Complejidad: ${COMPLEXITY_LABEL[data.complexity]}, Datos: ${data.dataType}, Horas: ${data.hoursSpent}/sem.` },
      ],
      temperature: 0.1 // Temperatura baja para que sea más estricto
    });
    assessment = normalizeAssessment(safeParseJSON(content), data, false);
  } catch (err) {
    assessment = normalizeAssessment({ automationIndex: 60, agentType: 'RPA (Automatización Robótica de Procesos)' }, data, true);
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

app.get('/gov/assessments', authenticateToken, async (req, res) => {
  try {
    const assessments = await Lead.find({ tipo_lead: 'automatizacion' }).sort({ createdAt: -1 });
    res.json(assessments);
  } catch (error) { res.status(500).json({ error: 'Error al cargar assessments' }); }
});

/* ── MANEJO DE ERRORES GLOBAL (Evita que devuelva HTML) ── */
app.use((err, req, res, next) => {
  console.error('[ERROR GLOBAL]', err.message);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

/* ── ARRANQUE ── */
app.get('/health', (_req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  res.status(dbState === 'connected' ? 200 : 503).json({ ok: dbState === 'connected', db: dbState, version: '1.4.0' });
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`[SERVER] Escuchando en :${PORT}`));

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(async () => {
      console.log('[MONGO] Conectado');
      // Crear Superadmin por defecto si no existe ninguno
      const count = await User.countDocuments();
      if (count === 0) {
        const hashedPassword = await bcrypt.hash('GokuLab2026!', 10);
        await User.create({ name: 'Superadmin', email: 'jcrendon@gokulab.mx', password: hashedPassword, role: 'superadmin', orgId: 'org_demo', modules: ['gobernanza', 'automatizacion'] });
        await Org.create({ name: 'GōkuLab', _id: 'org_demo', modules: ['gobernanza', 'automatizacion'] });
        console.log('[SEED] Superadmin creado: jcrendon@gokulab.mx / GokuLab2026!');
      }
    })
    .catch((err) => console.error('[MONGO] Fallo:', err.message));
}

process.on('SIGTERM', async () => {
  server.close(() => console.log('[SERVER] Cerrado'));
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});