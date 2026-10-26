import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_gokulab_2026';
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
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEYS = [1, 2, 3, 4, 5].map(i => process.env[`GROQ_API_KEY_${i}`]).filter(k => typeof k === 'string' && k.trim().length > 0);

const DEFAULT_ORIGINS = ['https://behaviorlab.gokulab.mx', 'https://www.behaviorlab.gokulab.mx', 'http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'];
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...EXTRA_ORIGINS])];
const ALLOWED_PATTERNS = [/^https:\/\/([a-z0-9-]+)\.behaviorlab\.pages\.dev$/i, /^https:\/\/([a-z0-9-]+)\.gokulab\.mx$/i];

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_PATTERNS.some(re => re.test(origin))) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
}));
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

// ==========================================
// MODELOS (Base de datos normalizada)
// ==========================================
const LeadSchema = new mongoose.Schema({
  tipo_lead: { type: String, default: 'gobernanza' },
  status: { type: String, default: 'nuevo' },
  nombre: String, email: String, empresa: String, telefono: String,
  sector: String, shadow_ai: String, samd: Boolean, risk_level: String,
  proceso: mongoose.Schema.Types.Mixed, resultado: mongoose.Schema.Types.Mixed,
  orgIdAsignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, 
  companyIdAsignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  fuente: String, userAgent: String, ip: String, meta: mongoose.Schema.Types.Mixed,
  name: String, company: String, ts: Date,
}, { timestamps: true, strict: false, collection: 'leads' });
const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

const UserSchema = new mongoose.Schema({
  name: String, email: { type: String, unique: true },
  password: String, hash: String,
  role: { type: String, enum: ['superadmin', 'admin', 'auditor'], default: 'admin' },
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' },
  modules: { type: [String], default: ['gobernanza'] }
}, { timestamps: true, strict: false, collection: 'users' });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const OrgSchema = new mongoose.Schema({ 
  name: String, 
  sector: String, 
  plan: String, 
  active: Boolean,
  modules: [String] 
}, { strict: false, collection: 'orgs' }); // COLECCIÓN CANÓNICA
const Org = mongoose.models.Org || mongoose.model('Org', OrgSchema);

const CompanySchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, 
  name: String, riskProfile: String, active: Boolean
}, { strict: false, collection: 'companies' });
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);

const InventorySchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, 
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, 
  model_name: String, category: String, risk_level: String, status: String
}, { strict: false, collection: 'ai_inventory' });
const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema);

const EvaluationSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, 
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, 
  framework: String, answers: mongoose.Schema.Types.Mixed, score: Number, risk_level: String, recommendations: mongoose.Schema.Types.Mixed
}, { strict: false, collection: 'risk_evaluations' });
const Evaluation = mongoose.models.Evaluation || mongoose.model('Evaluation', EvaluationSchema);

const EvidenceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, 
  questionId: String, fileName: String, r2Url: String, validation: mongoose.Schema.Types.Mixed, ts: { type: Date, default: Date.now }
}, { strict: false, collection: 'evidence' });
const Evidence = mongoose.models.Evidence || mongoose.model('Evidence', EvidenceSchema);

const RiskSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, 
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, 
  riskName: String, category: String, probability: Number, impact: Number, riskLevel: String, riskScore: Number, mitigationPlan: String
}, { strict: false, collection: 'risks' });
const Risk = mongoose.models.Risk || mongoose.model('Risk', RiskSchema);

const DeliverableSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, 
  taskName: String, phase: String, assignedTo: String, status: String, dueDate: String
}, { strict: false, collection: 'deliverables' });
const Deliverable = mongoose.models.Deliverable || mongoose.model('Deliverable', DeliverableSchema);

const ProcessEvalSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, 
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, 
  processName: String, volume: String, complexity: String, dataType: String, hoursSpent: Number, score: Number, agentType: String, recommendation: String
}, { strict: false, collection: 'processevals' });
const ProcessEval = mongoose.models.ProcessEval || mongoose.model('ProcessEval', ProcessEvalSchema);

// ==========================================
// UTILIDADES
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user; next();
  });
};

const getOrgQuery = (req) => {
  if (req.user.role === 'superadmin' && req.query.orgId) return { orgId: new mongoose.Types.ObjectId(req.query.orgId) };
  return { orgId: new mongoose.Types.ObjectId(req.user.orgId) };
};

async function getEvidenceQuery(req) {
  const targetOrgId = req.user.role === 'superadmin' && req.query.orgId ? req.query.orgId : req.user.orgId;
  const companies = await Company.find({ orgId: new mongoose.Types.ObjectId(targetOrgId) });
  return { companyId: { $in: companies.map(c => c._id) } };
}

let keyCursor = 0;
async function callGroq({ messages, temperature = 0.2, maxTokens = 900, timeoutMs = 20000 }) {
  if (GROQ_KEYS.length === 0) throw new Error('Sin claves GROQ');
  const failures = [];
  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const keyIndex = (keyCursor + attempt) % GROQ_KEYS.length;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(GROQ_URL, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEYS[keyIndex]}` },
        body: JSON.stringify({ model: GROQ_MODEL, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }),
      });
      clearTimeout(timer);
      if (!resp.ok) { failures.push({ keyIndex, status: resp.status }); continue; }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) continue;
      keyCursor = (keyIndex + 1) % GROQ_KEYS.length;
      return { content };
    } catch (err) { clearTimeout(timer); failures.push({ keyIndex, status: 'exception' }); }
  }
  throw new Error('GROQ_UNAVAILABLE');
}

function safeParseJSON(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {
    const s = t.indexOf('{'); const e = t.lastIndexOf('}');
    if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } }
    return null;
  }
}

// ==========================================
// RATE LIMIT
// ==========================================
const publicRateLimit = new Map();
const PUBLIC_RATE_MAX = Math.max(1, parseInt(process.env.PUBLIC_RATE_MAX || '20', 10));
const PUBLIC_RATE_WINDOW_MS = Math.max(60000, parseInt(process.env.PUBLIC_RATE_WINDOW_MS || String(60 * 60 * 1000), 10));

function checkPublicRateLimit(ip) {
  const now = Date.now();
  const entry = publicRateLimit.get(ip);
  if (!entry || now - entry.first > PUBLIC_RATE_WINDOW_MS) {
    publicRateLimit.set(ip, { count: 1, first: now });
    return { allowed: true, limit: PUBLIC_RATE_MAX, remaining: PUBLIC_RATE_MAX - 1, resetMs: PUBLIC_RATE_WINDOW_MS };
  }
  if (entry.count >= PUBLIC_RATE_MAX) {
    return { allowed: false, limit: PUBLIC_RATE_MAX, remaining: 0, resetMs: PUBLIC_RATE_WINDOW_MS - (now - entry.first) };
  }
  entry.count += 1;
  return { allowed: true, limit: PUBLIC_RATE_MAX, remaining: PUBLIC_RATE_MAX - entry.count, resetMs: PUBLIC_RATE_WINDOW_MS - (now - entry.first) };
}

function setRateLimitHeaders(res, rl) {
  res.set('X-RateLimit-Limit', String(rl.limit));
  res.set('X-RateLimit-Remaining', String(rl.remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(rl.resetMs / 1000)));
}

function formatRetryMessage(resetMs) {
  if (resetMs < 60000) return `${Math.ceil(resetMs / 1000)} segundos`;
  return `${Math.ceil(resetMs / 60000)} minuto(s)`;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of publicRateLimit.entries()) {
    if (now - entry.first > PUBLIC_RATE_WINDOW_MS) publicRateLimit.delete(ip);
  }
}, 5 * 60 * 1000);

function getClientIP(req) {
  return (req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown');
}

// ==========================================
// RIESGO DETERMINÍSTICO
// ==========================================
function computeRiskLevel({ sector, shadow_ai, samd }) {
  let score = 0;
  const badges = [];
  if (sector === 'salud') { score += 3; badges.push({ label: 'Sector Salud (SaMD)', level: 'alto' }); }
  else if (sector === 'alimentos') { score += 2; badges.push({ label: 'Sector Alimentos', level: 'medio' }); }
  else if (sector === 'servicios') { score += 1; badges.push({ label: 'Sector Servicios', level: 'bajo' }); }

  if (shadow_ai === 'alto') { score += 3; badges.push({ label: 'Shadow AI sin control', level: 'alto' }); }
  else if (shadow_ai === 'medio') { score += 2; badges.push({ label: 'Shadow AI con guías informales', level: 'medio' }); }
  else if (shadow_ai === 'bajo') { score += 1; badges.push({ label: 'Shadow AI regulado', level: 'bajo' }); }

  if (samd === true) { score += 3; badges.push({ label: 'Software como Dispositivo Médico', level: 'alto' }); }

  let level = 'bajo';
  if (score >= 8) level = 'crítico';
  else if (score >= 5) level = 'alto';
  else if (score >= 3) level = 'medio';

  const summaryByLevel = {
    'crítico': 'Tu exposición regulatoria es CRÍTICA. Requieres un programa formal de gobernanza de IA con urgencia: políticas, comité, inventario y auditorías. El riesgo de sanción y de incidentes operativos es alto.',
    'alto': 'Tu exposición es ALTA. Hay controles aislados pero no un sistema de gobernanza formal. Prioriza una política de uso aceptable, un inventario de modelos y un oficial de IA en los próximos 60 días.',
    'medio': 'Tu exposición es MEDIA. Tienes algunos controles informales. Formaliza políticas, crea un comité y establece un proceso de evaluación de riesgos antes de escalar tus iniciativas de IA.',
    'bajo': 'Tu exposición es BAJA. Vas por buen camino. Consolida lo existente con auditorías periódicas y monitoreo continuo (MLOps) para mantenerlo así.',
  };
  return { score, level, badges, summary: summaryByLevel[level] };
}

// ==========================================
// RUTAS
// ==========================================
app.post('/gov/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    const hashToCompare = user.hash || user.password;
    const validPassword = (password === hashToCompare) || await bcrypt.compare(password, hashToCompare);
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ _id: user._id, role: user.role, orgId: user.orgId, modules: user.modules }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { email: user.email, role: user.role, orgId: user.orgId, name: user.name, modules: user.modules } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ADMIN: ORGANIZACIONES Y USUARIOS
app.get('/gov/orgs', authenticateToken, async (req, res) => { try { res.json(await Org.find()); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/orgs', authenticateToken, async (req, res) => { 
  try { 
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Solo superadmin' });
    const org = await Org.create({ 
      name: req.body.name, 
      sector: req.body.sector || 'general',
      plan: req.body.plan || 'basic',
      active: true,
      modules: ['gobernanza', 'automatizacion'] 
    });
    res.status(201).json(org); 
  } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/users', authenticateToken, async (req, res) => { try { res.json(await User.find().select('-password -hash')); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/users', authenticateToken, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    res.status(201).json(await User.create({ ...req.body, password: hashedPassword, hash: hashedPassword }));
  } catch (error) { res.status(500).json({ error: 'Error al crear usuario' }); }
});

app.get('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => {
  try { 
    const query = req.params.orgId === 'ALL' ? {} : { orgId: new mongoose.Types.ObjectId(req.params.orgId) };
    res.json(await Company.find(query)); 
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.post('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => {
  try {
    const targetOrgId = req.params.orgId === 'ALL' ? req.user.orgId : req.params.orgId;
    res.status(201).json(await Company.create({ ...req.body, orgId: new mongoose.Types.ObjectId(targetOrgId) }));
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.get('/gov/ai-inventory', authenticateToken, async (req, res) => { try { res.json(await Inventory.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/ai-inventory', authenticateToken, async (req, res) => { try { res.status(201).json(await Inventory.create({ ...req.body, orgId: req.user.orgId, companyId: new mongoose.Types.ObjectId(req.body.companyId) })); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.get('/gov/risks', authenticateToken, async (req, res) => { try { res.json(await Risk.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/risks', authenticateToken, async (req, res) => {
  try {
    const score = req.body.probability * req.body.impact;
    let riskLevel = score >= 15 ? 'Crítico' : score >= 10 ? 'Alto' : score >= 5 ? 'Medio' : 'Bajo';
    res.status(201).json(await Risk.create({ ...req.body, orgId: req.user.orgId, companyId: req.body.companyId ? new mongoose.Types.ObjectId(req.body.companyId) : null, riskScore: score, riskLevel }));
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.delete('/gov/risks/:id', authenticateToken, async (req, res) => { try { await Risk.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.get('/gov/deliverables', authenticateToken, async (req, res) => { try { res.json(await Deliverable.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/deliverables', authenticateToken, async (req, res) => { try { res.status(201).json(await Deliverable.create({ ...req.body, orgId: req.user.orgId, status: 'Pendiente' })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.put('/gov/deliverables/:id', authenticateToken, async (req, res) => { try { res.json(await Deliverable.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.delete('/gov/deliverables/:id', authenticateToken, async (req, res) => { try { await Deliverable.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.get('/gov/evaluations', authenticateToken, async (req, res) => { try { res.json(await Evaluation.find(getOrgQuery(req)).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/evaluations', authenticateToken, async (req, res) => { try { res.status(201).json(await Evaluation.create({ ...req.body, orgId: req.user.orgId, companyId: new mongoose.Types.ObjectId(req.body.companyId) })); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.get('/gov/evidence', authenticateToken, async (req, res) => { try { const query = await getEvidenceQuery(req); res.json(await Evidence.find(query).sort({ ts: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/upload-evidence', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const ev = await Evidence.create({ companyId: new mongoose.Types.ObjectId(req.body.companyId), questionId: req.body.questionId, fileName: req.file.originalname, r2Url: 'https://media.gokulab.mx/demo.pdf', validation: { valido: true, razon: 'Validado por IA' } });
    res.json({ ok: true, evidence: ev, validation: ev.validation });
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.get('/gov/process-evals', authenticateToken, async (req, res) => { try { res.json(await ProcessEval.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/process-evals', authenticateToken, async (req, res) => { try { res.status(201).json(await ProcessEval.create({ ...req.body, orgId: req.user.orgId, companyId: req.body.companyId ? new mongoose.Types.ObjectId(req.body.companyId) : null })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.delete('/gov/process-evals/:id', authenticateToken, async (req, res) => { try { await ProcessEval.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } });

// ==========================================
// FASE 1.5: GESTIÓN DE LEADS (UNIFICADO)
// ==========================================
app.get('/gov/leads', authenticateToken, async (req, res) => {
  try {
    res.json(await Lead.find().sort({ createdAt: -1 }));
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.patch('/gov/leads/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const lead = await Lead.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    res.json({ ok: true, lead });
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.post('/gov/leads/:id/convert', authenticateToken, async (req, res) => {
  try {
    const { orgId, companyName } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.status === 'convertido') return res.status(400).json({ error: 'El lead ya fue convertido' });

    const targetOrgId = new mongoose.Types.ObjectId(orgId);

    let company = await Company.findOne({ orgId: targetOrgId, name: companyName });
    if (!company) {
      company = await Company.create({ orgId: targetOrgId, name: companyName, riskProfile: 'operacional', active: true });
    }

    if (lead.tipo_lead === 'riesgo' && lead.resultado) {
      await Evaluation.create({
        orgId: targetOrgId, companyId: company._id,
        framework: 'LFPDPPP / ISO 42001',
        answers: {},
        score: lead.resultado.score,
        risk_level: lead.resultado.risk_level,
        recommendations: { summary: lead.resultado.summary },
        createdAt: new Date()
      });
    } else if (lead.tipo_lead === 'automatizacion' && lead.proceso && lead.resultado) {
      await ProcessEval.create({
        orgId: targetOrgId, companyId: company._id,
        processName: lead.proceso.processName,
        volume: lead.proceso.volume,
        complexity: lead.proceso.complexityLabel || lead.proceso.complexity,
        dataType: lead.proceso.dataType,
        hoursSpent: lead.proceso.hoursSpent,
        score: lead.resultado.automationIndex,
        agentType: lead.resultado.agentType,
        recommendation: lead.resultado.agentDescription,
        createdAt: new Date()
      });
    }

    lead.status = 'convertido';
    lead.orgIdAsignado = targetOrgId;
    lead.companyIdAsignado = company._id;
    await lead.save();

    res.json({ ok: true, companyId: company._id, lead });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// ENDPOINTS PÚBLICOS
// ==========================================
app.post('/api/public/risk-assessment', async (req, res) => {
  const t0 = Date.now();
  try {
    const ip = getClientIP(req);
    const rl = checkPublicRateLimit(ip);
    setRateLimitHeaders(res, rl);
    if (!rl.allowed) {
      res.set('Retry-After', String(Math.ceil(rl.resetMs / 1000)));
      return res.status(429).json({ ok: false, error: `Demasiadas solicitudes desde tu IP. Intenta de nuevo en ${formatRetryMessage(rl.resetMs)}.` });
    }

    const b = req.body || {};
    const errors = [];
    if (!b.nombre || b.nombre.trim().length < 2) errors.push('nombre');
    if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errors.push('email válido');
    if (!b.empresa || b.empresa.trim().length < 2) errors.push('empresa');
    if (!b.sector || !['servicios', 'alimentos', 'salud'].includes(b.sector)) errors.push('sector');
    if (!b.shadow_ai || !['bajo', 'medio', 'alto'].includes(b.shadow_ai)) errors.push('shadow_ai');

    if (errors.length > 0) return res.status(400).json({ ok: false, error: 'Datos inválidos: ' + errors.join('; ') });

    const calc = computeRiskLevel({ sector: b.sector, shadow_ai: b.shadow_ai, samd: b.samd === true });

    const lead = await Lead.create({
      tipo_lead: 'riesgo', status: 'nuevo',
      nombre: b.nombre.trim().slice(0, 120), email: b.email.toLowerCase().slice(0, 160), empresa: b.empresa.trim().slice(0, 160), telefono: b.telefono || '',
      sector: b.sector, shadow_ai: b.shadow_ai, samd: b.samd === true, risk_level: calc.level,
      resultado: { score: calc.score, risk_level: calc.level, badges: calc.badges, summary: calc.summary },
      fuente: 'risk-calculator', userAgent: req.headers['user-agent'], ip, meta: { durationMs: Date.now() - t0 },
      name: b.nombre.trim().slice(0, 120), company: b.empresa.trim().slice(0, 160), ts: new Date()
    });

    return res.json({ ok: true, assessment: { risk_level: calc.level, score: calc.score, badges: calc.badges, summary: calc.summary }, leadId: lead._id.toString() });
  } catch (err) {
    console.error('[risk-assessment] error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno al procesar la evaluación.' });
  }
});

app.post('/api/public/automation-assessment', async (req, res) => {
  const t0 = Date.now();
  try {
    const ip = getClientIP(req);
    const rl = checkPublicRateLimit(ip);
    setRateLimitHeaders(res, rl);
    if (!rl.allowed) {
      res.set('Retry-After', String(Math.ceil(rl.resetMs / 1000)));
      return res.status(429).json({ ok: false, error: `Demasiadas solicitudes desde tu IP. Intenta de nuevo en ${formatRetryMessage(rl.resetMs)}.` });
    }

    const b = req.body || {};
    const errors = [];
    if (!b.processName || b.processName.trim().length < 2) errors.push('processName');
    if (typeof b.volume !== 'number' || b.volume < 0) errors.push('volume');
    if (typeof b.complexity !== 'number' || b.complexity < 1 || b.complexity > 5) errors.push('complexity');
    if (!b.dataType) errors.push('dataType');
    if (typeof b.hoursSpent !== 'number' || b.hoursSpent < 0) errors.push('hoursSpent');
    if (!b.nombre || b.nombre.trim().length < 2) errors.push('nombre');
    if (!b.empresa || b.empresa.trim().length < 2) errors.push('empresa');
    if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errors.push('email');

    if (errors.length > 0) return res.status(400).json({ ok: false, error: 'Datos inválidos: ' + errors.join('; ') });

    const systemPrompt = `Eres un consultor senior de automatización con IA. Responde ÚNICAMENTE con JSON válido. Esquema: { "automationIndex": number, "baselineHoursPerMonth": number, "roiHoursPerMonth": number, "agentType": string, "agentDescription": string, "roiExplanation": string, "paybackMonths": number, "implementationPhases": string[], "confidence": string }`;
    const userPrompt = `Proceso: ${b.processName}. Volumen: ${b.volume}. Complejidad: ${b.complexity}/5. Datos: ${b.dataType}. Horas: ${b.hoursSpent}.`;

    let parsed = null;
    try {
      const { content } = await callGroq({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3, maxTokens: 800, timeoutMs: 25000 });
      parsed = safeParseJSON(content);
    } catch (groqErr) {
      if (groqErr.message === 'GROQ_UNAVAILABLE') return res.status(503).json({ ok: false, error: 'Servicio de IA temporalmente no disponible.' });
      throw groqErr;
    }

    if (!parsed || typeof parsed.automationIndex !== 'number') return res.status(502).json({ ok: false, error: 'La IA no devolvió un assessment válido.' });

    const complexityLabels = { 1: 'muy baja', 2: 'baja', 3: 'media', 4: 'alta', 5: 'muy alta' };
    const baseline = Number(parsed.baselineHoursPerMonth) > 0 ? Math.round(Number(parsed.baselineHoursPerMonth)) : Math.max(Math.round(b.volume * 3 / 60), Math.round(b.hoursSpent) || 0);

    const resultado = {
      automationIndex: Math.max(0, Math.min(100, Math.round(Number(parsed.automationIndex)))),
      agentType: String(parsed.agentType || 'Agente de Automatización').slice(0, 120),
      agentDescription: String(parsed.agentDescription || '').slice(0, 600),
      roiHoursPerMonth: Math.max(0, Math.round(Number(parsed.roiHoursPerMonth) || 0)),
      baselineHoursPerMonth: baseline,
      roiExplanation: String(parsed.roiExplanation || '').slice(0, 600),
      paybackMonths: Math.max(1, Math.min(24, Math.round(Number(parsed.paybackMonths) || 6))),
      implementationPhases: Array.isArray(parsed.implementationPhases) ? parsed.implementationPhases.slice(0, 6).map(p => String(p).slice(0, 120)) : ['Análisis'],
      confidence: ['baja', 'media', 'alta'].includes(parsed.confidence) ? parsed.confidence : 'media',
      source: 'groq'
    };

    const proceso = {
      processName: String(b.processName).slice(0, 200), volume: b.volume, complexity: b.complexity, complexityLabel: complexityLabels[b.complexity] || 'media', dataType: String(b.dataType).slice(0, 60), hoursSpent: b.hoursSpent, baselineHoursPerMonth: baseline
    };

    const lead = await Lead.create({
      tipo_lead: 'automatizacion', status: 'nuevo', nombre: b.nombre.trim().slice(0, 120), email: b.email.toLowerCase().slice(0, 160), empresa: b.empresa.trim().slice(0, 160), telefono: b.telefono || '',
      proceso, resultado, fuente: 'automation-assessment', userAgent: req.headers['user-agent'], ip, meta: { durationMs: Date.now() - t0, model: GROQ_MODEL },
      name: b.nombre.trim().slice(0, 120), company: b.empresa.trim().slice(0, 160), ts: new Date()
    });

    return res.json({ ok: true, assessment: { automationIndex: resultado.automationIndex, roiHoursPerMonth: resultado.roiHoursPerMonth, agentType: resultado.agentType, agentDescription: resultado.agentDescription, roiExplanation: resultado.roiExplanation }, leadId: lead._id.toString() });
  } catch (err) {
    console.error('[automation-assessment] error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno al procesar la evaluación.' });
  }
});

// ==========================================
// CONEXIÓN
// ==========================================
let server;
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    server = app.listen(PORT, () => console.log(`[SERVER] Escuchando en puerto ${PORT}`));
  } catch (err) { process.exit(1); }
}
startServer();