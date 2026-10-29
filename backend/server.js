import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import { calculateCriticality, calculateResidualRisk, calculateMaturity, calculateAIGI } from './aigos_engine.js';
import { CONTROLS_DATA, RISKS_DATA, QUESTIONS_DATA } from './aigos_data.js';

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_gokulab_2026';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
// MODELOS
// ==========================================
const LeadSchema = new mongoose.Schema({
  tipo_lead: { type: String, default: 'gobernanza' }, status: { type: String, default: 'nuevo' },
  nombre: String, email: String, empresa: String, telefono: String,
  sector: String, shadow_ai: String, samd: Boolean, risk_level: String,
  proceso: mongoose.Schema.Types.Mixed, resultado: mongoose.Schema.Types.Mixed,
  profile: mongoose.Schema.Types.Mixed,
  leadScore: Number, leadPriority: String, notifyFounder: Boolean,
  orgIdAsignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, companyIdAsignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  fuente: String, userAgent: String, ip: String, meta: mongoose.Schema.Types.Mixed,
  name: String, company: String, ts: Date,
}, { timestamps: true, strict: false, collection: 'leads' });
const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

const UserSchema = new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String, hash: String,
  role: { type: String, enum: ['superadmin', 'admin', 'auditor'], default: 'admin' },
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, modules: { type: [String], default: ['gobernanza'] }
}, { timestamps: true, strict: false, collection: 'users' });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const OrgSchema = new mongoose.Schema({ name: String, sector: String, plan: String, active: Boolean, modules: [String], estimated_models: { type: Number,default: 0 } }, { strict: false, collection: 'orgs' });
const Org = mongoose.models.Org || mongoose.model('Org', OrgSchema);

const CompanySchema = new mongoose.Schema({ orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, name: String, riskProfile: String, active: Boolean }, { strict: false, collection: 'companies' });
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);

const InventorySchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  model_name: String, category: String, risk_level: String, status: String,
  D: Number, A: Number, I: Number, R: Number, criticalityScore: Number, criticalityLevel: String,
}, { strict: false, collection: 'ai_inventory' });
const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema);

const RiskSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  riskName: String, category: String, probability: Number, impact: Number, riskLevel: String, riskScore: Number, mitigationPlan: String,
  inherentScore: Number, controls: [{ name: String, effectiveness: Number }], residualScore: Number, residualLevel: String,
  masterRiskCode: String
}, { strict: false, collection: 'risks' });
const Risk = mongoose.models.Risk || mongoose.model('Risk', RiskSchema);

const DeliverableSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, taskName: String, phase: String, assignedTo: String, status: String, dueDate: String
}, { strict: false, collection: 'deliverables' });
const Deliverable = mongoose.models.Deliverable || mongoose.model('Deliverable', DeliverableSchema);

const EvidenceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, questionId: String, fileName: String, r2Url: String,
  validation: mongoose.Schema.Types.Mixed, ts: { type: Date, default: Date.now }
}, { strict: false, collection: 'evidence' });
const Evidence = mongoose.models.Evidence || mongoose.model('Evidence', EvidenceSchema);

const EvaluationSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  framework: String, answers: mongoose.Schema.Types.Mixed, score: Number, risk_level: String, recommendations: mongoose.Schema.Types.Mixed
}, { strict: false, collection: 'risk_evaluations' });
const Evaluation = mongoose.models.Evaluation || mongoose.model('Evaluation', EvaluationSchema);

const ProcessEvalSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  processName: String, volume: String, complexity: String, dataType: String, hoursSpent: Number, score: Number, agentType: String, recommendation: String
}, { strict: false, collection: 'processevals' });
const ProcessEval = mongoose.models.ProcessEval || mongoose.model('ProcessEval', ProcessEvalSchema);

const MasterControlSchema = new mongoose.Schema({ code: { type: String, unique: true }, domain: String, name: String, objective: String, evidence: String, frequency: String, owner: String }, { strict: false, collection: 'master_controls' });
const MasterControl = mongoose.models.MasterControl || mongoose.model('MasterControl', MasterControlSchema);

const MasterRiskSchema = new mongoose.Schema({ code: { type: String, unique: true }, category: String, name: String, description: String, systemType: String, impact: String, suggestedControls: [String] }, { strict: false, collection: 'master_risks' });
const MasterRisk = mongoose.models.MasterRisk || mongoose.model('MasterRisk', MasterRiskSchema);

const AssessmentQuestionSchema = new mongoose.Schema({ code: { type: String, unique: true }, domain: String, question: String, controlCode: String, controlName: String, appliesTo: String, mainAudience: String, method: String, evidenceRequested: String }, { strict: false, collection: 'assessment_questions' });
const AssessmentQuestion = mongoose.models.AssessmentQuestion || mongoose.model('AssessmentQuestion', AssessmentQuestionSchema);

const AssessmentResultSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  modelVersion: { type: String, default: 'AIGOS-SCORE 1.0' },
  status: { type: String, enum: ['enviado', 'validado'], default: 'enviado' },
  version: { type: Number, default: 1 },
  answers: [{ questionCode: String, level: Number, hasEvidence: Boolean, isNA: Boolean, observation: String }],
  maturity: mongoose.Schema.Types.Mixed, aigi: mongoose.Schema.Types.Mixed, date: { type: Date, default: Date.now }
}, { strict: false, collection: 'assessment_results' });
const AssessmentResult = mongoose.models.AssessmentResult || mongoose.model('AssessmentResult', AssessmentResultSchema);

const AssessmentDraftSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org' }, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true },
  answers: [{ questionCode: String, level: Number, hasEvidence: Boolean, isNA: Boolean, observation: String }],
  updatedAt: { type: Date, default: Date.now }, createdBy: String
}, { strict: false, collection: 'assessment_drafts' });
const AssessmentDraft = mongoose.models.AssessmentDraft || mongoose.model('AssessmentDraft', AssessmentDraftSchema);

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
        body: JSON.stringify({ model: GROQ_MODEL, temperature, max_tokens: maxTokens, messages }),
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

const publicRateLimit = new Map();
const PUBLIC_RATE_MAX = Math.max(1, parseInt(process.env.PUBLIC_RATE_MAX || '20', 10));
const PUBLIC_RATE_WINDOW_MS = Math.max(60000, parseInt(process.env.PUBLIC_RATE_WINDOW_MS || String(60 * 60 * 1000), 10));
function checkPublicRateLimit(ip) {
  const now = Date.now();
  const entry = publicRateLimit.get(ip);
  if (!entry || now - entry.first > PUBLIC_RATE_WINDOW_MS) { publicRateLimit.set(ip, { count: 1, first: now }); return { allowed: true, limit: PUBLIC_RATE_MAX, remaining: PUBLIC_RATE_MAX - 1, resetMs: PUBLIC_RATE_WINDOW_MS }; }
  if (entry.count >= PUBLIC_RATE_MAX) return { allowed: false, limit: PUBLIC_RATE_MAX, remaining: 0, resetMs: PUBLIC_RATE_WINDOW_MS - (now - entry.first)};
  entry.count += 1;
  return { allowed: true, limit: PUBLIC_RATE_MAX, remaining: PUBLIC_RATE_MAX - entry.count, resetMs: PUBLIC_RATE_WINDOW_MS - (now - entry.first) };
}
function setRateLimitHeaders(res, rl) { res.set('X-RateLimit-Limit', String(rl.limit)); res.set('X-RateLimit-Remaining', String(rl.remaining)); res.set('X-RateLimit-Reset', String(Math.ceil(rl.resetMs / 1000))); }
function formatRetryMessage(resetMs) { return resetMs < 60000 ? `${Math.ceil(resetMs / 1000)} segundos` : `${Math.ceil(resetMs / 60000)} minuto(s)`; }
setInterval(() => { const now = Date.now(); for (const [ip, entry] of publicRateLimit.entries()) { if (now - entry.first > PUBLIC_RATE_WINDOW_MS) publicRateLimit.delete(ip); } }, 5 * 60 * 1000);
function getClientIP(req) { return (req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown'); }

function computeRiskLevel({ sector, shadow_ai, samd }) {
  let score = 0; const badges = [];
  if (sector === 'salud') { score += 3; badges.push({ label: 'Sector Salud (SaMD)', level: 'alto' }); }
  else if (sector === 'alimentos') { score += 2; badges.push({ label: 'Sector Alimentos', level: 'medio' }); }
  else if (sector === 'servicios') { score += 1; badges.push({ label: 'Sector Servicios', level: 'bajo' }); }
  if (shadow_ai === 'alto') { score += 3; badges.push({ label: 'Shadow AI sin control', level: 'alto' }); }
  else if (shadow_ai === 'medio') { score += 2; badges.push({ label: 'Shadow AI con guías informales', level: 'medio' }); }
  else if (shadow_ai === 'bajo') { score += 1; badges.push({ label: 'Shadow AI regulado', level: 'bajo' }); }
  if (samd === true) { score += 3; badges.push({ label: 'Software como Dispositivo Médico', level: 'alto' }); }
  let level = 'bajo';
  if (score >= 8) level = 'crítico'; else if (score >= 5) level = 'alto'; else if (score >= 3) level = 'medio';
  const summaryByLevel = { 'crítico': 'Exposición CRÍTICA.', 'alto': 'Exposición ALTA.', 'medio': 'Exposición MEDIA.', 'bajo': 'Exposición BAJA.' };
  return { score, level, badges, summary: summaryByLevel[level] };
}

// ==========================================
// READINESS SNAPSHOT — Scoring multi-dimensional
// ==========================================
function computeReadinessScores(input) {
  const politica_pts = input.tiene_politica ? 20 : 0;
  const inventario_pts = input.tiene_inventario === 'si' ? 20 : input.tiene_inventario === 'parcial' ? 10 : 0;
  const responsable_pts = input.tiene_responsable ? 20 : 0;
  const uso_ia_pts = input.uso_ia === 'regulado' ? 20 : input.uso_ia === 'guiado' ? 12 : input.uso_ia === 'libre' ? 5 : 0;
  const presion_pts = input.cliente_pidio_evidencia ? 20 : input.urgencia === '3_meses' ? 10 : input.urgencia === '6_meses' ? 5 : 0;

  const readiness = Math.min(100, politica_pts + inventario_pts + responsable_pts + uso_ia_pts + presion_pts);
  const readinessLevel = readiness < 25 ? 'vulnerable' : readiness < 50 ? 'inicial' : readiness < 75 ? 'basico' : 'gestionado';

  let risk = (100 - readiness) * 0.7;
  const sectorBonus = { 'salud': 25, 'alimentos': 15, 'manufactura': 12, 'logistica': 8, 'servicios': 5 }[input.sector] || 0;
  risk += sectorBonus;
  if (input.cliente_pidio_evidencia && !input.tiene_politica) risk += 20;
  const governanceRisk = Math.min(100, Math.round(risk));
  const governanceRiskLevel = governanceRisk >= 75 ? 'critico' : governanceRisk >= 50 ? 'alto' : governanceRisk >= 25 ? 'medio' : 'bajo';

  const manual_pts = { '0-25': 20, '25-50': 40, '50-75': 65, '75-100': 90 }[input.porcentaje_manual] || 0;
  const areasCount = Array.isArray(input.areas_con_ia) ? input.areas_con_ia.length : 0;
  const areasBonus = Math.min(10, areasCount * 2);
  const automationPotential = Math.min(100, manual_pts + areasBonus);
  const automationPotentialLevel = automationPotential >= 75 ? 'alta' : automationPotential >= 50 ? 'media' : automationPotential >= 25 ? 'baja' : 'minima';

  const readinessGap = (100 - readiness) / 100;
  const urgencyMult = { '3_meses': 1.0, '6_meses': 0.7, '12_meses': 0.4, 'sin_urgencia': 0.2 }[input.urgencia] || 0.2;
  const sizeMult = { '1000+': 1.0, '500-1000': 0.85, '200-500': 0.7, '50-200': 0.5 }[input.empleados] || 0.5;
  const triggerMult = input.cliente_pidio_evidencia ? 1.0 : 0.6;
  const opportunity = Math.min(100, Math.round(readinessGap * urgencyMult * sizeMult * triggerMult * 100));
  const opportunityLevel = opportunity >= 60 ? 'hot' : opportunity >= 35 ? 'warm' : 'cold';

  const priorities = [];
  if (!input.tiene_politica) priorities.push('Formalizar una política de uso aceptable de IA');
  if (input.tiene_inventario === 'no') priorities.push('Hacer inventario de sistemas de IA (incluyendo shadow AI)');
  else if (input.tiene_inventario === 'parcial') priorities.push('Completar el inventario de IA (incluye sistemas olvidados)');
  if (!input.tiene_responsable) priorities.push('Designar un responsable de gobernanza de IA');
  if (input.uso_ia === 'libre' || input.uso_ia === 'guiado') priorities.push('Regular el uso de IA en la organización');
  if (automationPotential >= 50) priorities.push(`Automatizar procesos (${automationPotential}% de potencial identificado)`);

  let recommendedProduct, recommendationReason;
  if (readiness < 25) {
    recommendedProduct = 'assessment_express';
    recommendationReason = 'Tu empresa usa IA pero no tiene fundamentos de gobernanza. El primer paso es un Assessment AIGOS™ Exprés para entender el panorama completo y priorizar acciones.';
  } else if (readiness < 50) {
    recommendedProduct = 'assessment_express';
    recommendationReason = 'Tienes bases pero faltan piezas clave de gobernanza. Un Assessment AIGOS™ Exprés te dará el diagnóstico completo con evidencia para tu cliente enterprise.';
  } else if (readiness < 75) {
    recommendedProduct = 'immersion_program';
    recommendationReason = 'Tu gobernanza está en construcción. El siguiente paso es formalizar el modelo (política, comité, roles) para hacerlo sostenible y demostrable.';
  } else {
    recommendedProduct = automationPotential >= 50 ? 'deploy_agent' : 'keep_monitoring';
    recommendationReason = automationPotential >= 50
      ? 'Tu gobernanza está sólida. Es momento de convertirla en ventaja: automatizar procesos con agentes gobernados.'
      : 'Tu gobernanza está sólida. Mantén el monitoreo continuo y evalúa automatización cuando estés listo.';
  }

  return {
    readiness, readinessLevel, governanceRisk, governanceRiskLevel,
    automationPotential, automationPotentialLevel, opportunity, opportunityLevel,
    priorities, recommendedProduct, recommendationReason,
    breakdown: { politica_pts, inventario_pts, responsable_pts, uso_ia_pts, presion_pts, manual_pts, areasBonus, sectorBonus }
  };
}

async function notifyHotLead(lead) {
  const priority = lead.leadPriority || 'warm';
  const icon = priority === 'hot' ? '🔥' : priority === 'warm' ? '🟡' : '🔵';
  const payload = {
    icon, priority,
    leadScore: lead.leadScore,
    empresa: lead.empresa,
    nombre: lead.nombre,
    cargo: lead.profile?.cargo,
    sector: lead.sector,
    empleados: lead.profile?.empleados,
    readiness: lead.resultado?.readiness_score,
    governanceRisk: lead.resultado?.governance_risk,
    automationPotential: lead.resultado?.automation_potential,
    clientePidioEvidencia: lead.profile?.cliente_pidio_evidencia,
    urgencia: lead.profile?.urgencia,
    priorities: lead.resultado?.priorities?.slice(0, 3),
    recommendedProduct: lead.resultado?.recommended_product
  };
  console.log('[HOT-LEAD] ' + JSON.stringify(payload));
  const webhookUrl = process.env.FOUNDER_WEBHOOK_URL;
  if (webhookUrl && webhookUrl.startsWith('http')) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${icon} Nuevo lead ${priority.toUpperCase()} — ${lead.empresa}\n` +
                `Score: ${lead.leadScore}/100 | Readiness: ${lead.resultado?.readiness_score} | Riesgo: ${lead.resultado?.governance_risk}\n` +
                `Contacto: ${lead.nombre} (${lead.profile?.cargo}) — ${lead.email}\n` +
                `Trigger: ${lead.profile?.cliente_pidio_evidencia ? 'Cliente pidió evidencia' : 'Sin trigger'} | Urgencia: ${lead.profile?.urgencia}\n` +
                `Producto recomendado: ${lead.resultado?.recommended_product}`
        })
      });
    } catch (err) { console.error('[notifyHotLead] Webhook falló:', err.message); }
  }
}

// ==========================================
// FIX C: HELPERS PARA REEMPLAZO DE EVIDENCIA
// ==========================================
async function replaceRejectedEvidence(companyId, questionId) {
  const result = await Evidence.deleteMany({
    companyId: new mongoose.Types.ObjectId(companyId),
    questionId,
    'validation.valido': false
  });
  if (result.deletedCount > 0) console.log(`[replaceRejected] Eliminadas ${result.deletedCount} evidencias rechazadas de ${questionId}`);
  return result.deletedCount;
}

async function recomputeAigiFromAnswers(companyId, answers) {
  const domainWeights = { "Estrategia y liderazgo": 8, "Gobierno y organización": 12, "Inventario y clasificación": 12, "Gestión de riesgos": 12, "Datos y privacidad": 10, "Seguridad": 10, "Ciclo de vida y calidad de modelos": 10, "Terceros y proveedores": 8, "Cultura y capacitación": 8, "Monitoreo, incidentes y mejora": 10 };
  const maturityResult = calculateMaturity(answers, domainWeights);
  const evidenceCount = await Evidence.countDocuments({ companyId: new mongoose.Types.ObjectId(companyId), 'validation.valido': true });
  const questionsRequiringEvidence = answers.filter(a => !a.isNA && a.level >= 3).length;
  const E = questionsRequiringEvidence > 0 ? Math.min(100, Math.round((evidenceCount / questionsRequiringEvidence) * 100)) : 100;
  const G = 70, C = 65, V = 100;
  const gates = { hasPolicy: true, hasActiveCommittee: false, hasUnmitigatedCriticalRisk: false };
  const aigiResult = calculateAIGI(maturityResult.overall, G, E, C, V, gates);
  return { maturity: maturityResult, aigi: aigiResult };
}

// ==========================================
// AUTH Y ADMIN
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

app.get('/gov/orgs', authenticateToken, async (req, res) => { try { res.json(await Org.find()); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/orgs', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Solo superadmin' });
    const org = await Org.create({ name: req.body.name, sector: req.body.sector || 'general', plan: req.body.plan || 'basic', active: true, modules: ['gobernanza', 'automatizacion'], estimated_models: req.body.estimated_models || 0 });
    res.status(201).json(org);
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.get('/gov/users', authenticateToken, async (req, res) => { try { res.json(await User.find().select('-password -hash')); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/users', authenticateToken, async (req, res) => {
  try { const hashedPassword = await bcrypt.hash(req.body.password, 10); res.status(201).json(await User.create({ ...req.body, password: hashedPassword, hash: hashedPassword })); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.get('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => {
  try { res.json(await Company.find(req.params.orgId === 'ALL' ? {} : { orgId: new mongoose.Types.ObjectId(req.params.orgId) })); } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.post('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => {
  try { const targetOrgId = req.params.orgId === 'ALL' ? req.user.orgId : req.params.orgId; res.status(201).json(await Company.create({ ...req.body, orgId: new mongoose.Types.ObjectId(targetOrgId) })); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.get('/gov/ai-inventory', authenticateToken, async (req, res) => { try { res.json(await Inventory.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/ai-inventory', authenticateToken, async (req, res) => {
  try {
    const company = await Company.findById(req.body.companyId);
    if (!company) return res.status(404).json({ error: 'Filial no encontrada' });
    const inventory = await Inventory.create({ ...req.body, orgId: company.orgId, companyId: new mongoose.Types.ObjectId(req.body.companyId) });
    res.status(201).json(inventory);
  } catch (error) { res.status(500).json({ error: 'Error: ' + error.message }); }
});

app.get('/gov/risks', authenticateToken, async (req, res) => { try { res.json(await Risk.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/risks', authenticateToken, async (req, res) => {
  try {
    const score = req.body.probability * req.body.impact;
    let riskLevel = score >= 16 ? 'Crítico' : score >= 11 ? 'Alto' : score >= 6 ? 'Medio' : 'Bajo';
    let targetOrgId = req.user.orgId, targetCompanyId = null;
    if (req.body.companyId) { const company = await Company.findById(req.body.companyId); if (company) { targetOrgId = company.orgId; targetCompanyId = company._id; } }
    res.status(201).json(await Risk.create({ ...req.body, orgId: targetOrgId, companyId: targetCompanyId, riskScore: score, riskLevel }));
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.delete('/gov/risks/:id', authenticateToken, async (req, res) => { try { await Risk.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.get('/gov/deliverables', authenticateToken, async (req, res) => { try { res.json(await Deliverable.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/deliverables', authenticateToken, async (req, res) => { try { res.status(201).json(await Deliverable.create({ ...req.body, orgId: req.user.orgId, status: 'Pendiente' })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.put('/gov/deliverables/:id', authenticateToken, async (req, res) => { try { res.json(await Deliverable.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.delete('/gov/deliverables/:id', authenticateToken, async (req, res) => { try { await Deliverable.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.get('/gov/evaluations', authenticateToken, async (req, res) => { try { res.json(await Evaluation.find(getOrgQuery(req)).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/evaluations', authenticateToken, async (req, res) => {
  try {
    let targetOrgId = req.user.orgId, targetCompanyId = null;
    if (req.body.companyId) { const company = await Company.findById(req.body.companyId); if (company) { targetOrgId = company.orgId; targetCompanyId = company._id; } }
    res.status(201).json(await Evaluation.create({ ...req.body, orgId: targetOrgId, companyId: targetCompanyId }));
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// ==========================================
// EVIDENCIA
// ==========================================
app.get('/gov/evidence', authenticateToken, async (req, res) => { try { const query = await getEvidenceQuery(req); res.json(await Evidence.find(query).sort({ ts: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.get('/gov/evidence/by-question/:companyId/:questionId', authenticateToken, async (req, res) => {
  try {
    const evidences = await Evidence.find({
      companyId: new mongoose.Types.ObjectId(req.params.companyId),
      questionId: req.params.questionId
    }).sort({ ts: -1 });
    res.json(evidences);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/gov/evidence/:id', authenticateToken, async (req, res) => {
  try {
    const evidence = await Evidence.findById(req.params.id);
    if (!evidence) return res.status(404).json({ error: 'Evidencia no encontrada' });
    const company = await Company.findById(evidence.companyId);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (req.user.role !== 'superadmin' && company.orgId.toString() !== req.user.orgId.toString()) return res.status(403).json({ error: 'Sin permisos' });
    await Evidence.findByIdAndDelete(req.params.id);
    if (evidence.validation?.valido) {
      const lastAssessment = await AssessmentResult.findOne({ companyId: evidence.companyId }).sort({ date: -1 });
      if (lastAssessment) {
        const updatedAnswers = lastAssessment.answers.map(a => a.questionCode === evidence.questionId ? { ...a.toObject(), hasEvidence: false } : a);
        const recomputed = await recomputeAigiFromAnswers(evidence.companyId.toString(), updatedAnswers);
        await AssessmentResult.findByIdAndUpdate(lastAssessment._id, { answers: updatedAnswers, maturity: recomputed.maturity, aigi: recomputed.aigi });
      }
    }
    res.json({ ok: true, message: 'Evidencia eliminada' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/gov/upload-evidence', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { companyId, questionId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    if (!companyId || !questionId) return res.status(400).json({ error: 'Faltan companyId o questionId' });
    const question = await AssessmentQuestion.findOne({ code: questionId });
    if (!question) return res.status(404).json({ error: 'Pregunta no encontrada' });

    let pdfText = '';
    try { const pdf = await getDocumentProxy(new Uint8Array(req.file.buffer)); const extracted = await extractText(pdf, { mergePages: true }); pdfText = extracted.text || ''; } catch (pdfErr) { console.error('[upload-evidence] Error extrayendo texto:', pdfErr.message); }

    let validation;
    if (!pdfText || pdfText.trim().length < 50) {
      validation = { valido: false, razon: 'No se pudo extraer texto (posible PDF escaneado). Revisión manual.' };
    } else {
      const systemPrompt = `Eres un auditor experto en gobernanza de IA (ISO 42001, NIST AI RMF).
Evalúa si el DOCUMENTO proporcionado constituye EVIDENCIA VERIFICABLE para la siguiente PREGUNTA:
PREGUNTA: ${question.question}
EVIDENCIA REQUERIDA: ${question.evidenceRequested}
DOMINIO: ${question.domain}
CONTROL: ${question.controlName}
Reglas:
- VÁLIDO: contiene info específica de la organización que respalda la pregunta.
- INVÁLIDO: es de otra empresa, genérico sin datos propios, borrador sin aprobar, o no responde.
JSON: { "valido": true|false, "razon": "explicación breve en español" }`;
      validation = { valido: false, razon: 'No se pudo validar.' };
      try {
        const { content } = await callGroq({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `DOCUMENTO:\n\n${pdfText.slice(0, 6000)}` }], temperature: 0.1, maxTokens: 300, timeoutMs: 25000 });
        const parsed = safeParseJSON(content);
        if (parsed && typeof parsed.valido === 'boolean') validation = { valido: parsed.valido, razon: String(parsed.razon || '').slice(0, 300) };
      } catch (groqErr) { console.error('[upload-evidence] Groq error:', groqErr.message); validation = { valido: false, razon: 'IA no disponible.' }; }
    }

    if (validation.valido) { await replaceRejectedEvidence(companyId, questionId); }
    else {
      const existingRejected = await Evidence.find({ companyId: new mongoose.Types.ObjectId(companyId), questionId, 'validation.valido': false }).sort({ ts: 1 });
      if (existingRejected.length >= 1) await Evidence.deleteMany({ _id: { $in: existingRejected.map(e => e._id) } });
    }

    const ev = await Evidence.create({ companyId: new mongoose.Types.ObjectId(companyId), questionId, fileName: req.file.originalname, r2Url: `https://media.gokulab.mx/demo-${Date.now()}.pdf`, validation });

    if (validation.valido) {
      const lastAssessment = await AssessmentResult.findOne({ companyId: new mongoose.Types.ObjectId(companyId) }).sort({ date: -1 });
      if (lastAssessment) {
        const updatedAnswers = lastAssessment.answers.map(a => a.questionCode === questionId ? { ...a.toObject(), hasEvidence: true } : a);
        const recomputed = await recomputeAigiFromAnswers(companyId, updatedAnswers);
        await AssessmentResult.findByIdAndUpdate(lastAssessment._id, { answers: updatedAnswers, maturity: recomputed.maturity, aigi: recomputed.aigi });
      }
    }
    res.json({ ok: true, evidence: ev, validation });
  } catch (error) { console.error('[upload-evidence] Error:', error); res.status(500).json({ error: error.message }); }
});

app.get('/gov/process-evals', authenticateToken, async (req, res) => { try { res.json(await ProcessEval.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.post('/gov/process-evals', authenticateToken, async (req, res) => {
  try {
    let targetOrgId = req.user.orgId, targetCompanyId = null;
    if (req.body.companyId) { const company = await Company.findById(req.body.companyId); if (company) { targetOrgId = company.orgId; targetCompanyId = company._id; } }
    res.status(201).json(await ProcessEval.create({ ...req.body, orgId: targetOrgId, companyId: targetCompanyId }));
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.delete('/gov/process-evals/:id', authenticateToken, async (req, res) => { try { await ProcessEval.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } });

// LEADS
app.get('/gov/leads', authenticateToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.tipo_lead) filter.tipo_lead = req.query.tipo_lead;
    if (req.query.priority) filter.leadPriority = req.query.priority;
    res.json(await Lead.find(filter).sort({ createdAt: -1 }));
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.patch('/gov/leads/:id/status', authenticateToken, async (req, res) => {
  try { const { status } = req.body; const lead = await Lead.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true }); res.json({ ok: true, lead }); } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.post('/gov/leads/:id/convert', authenticateToken, async (req, res) => {
  try {
    const { orgId, companyId, companyName } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.status === 'convertido') return res.status(400).json({ error: 'Ya convertido' });
    const targetOrgId = new mongoose.Types.ObjectId(orgId);
    let company;
    if (companyId) { company = await Company.findById(companyId); }
    else if (companyName) { company = await Company.findOne({ orgId: targetOrgId, name: companyName }); if (!company) company = await Company.create({ orgId: targetOrgId, name: companyName, riskProfile: 'operacional', active: true }); }
    else return res.status(400).json({ error: 'Debes seleccionar o crear filial' });
    if (lead.tipo_lead === 'riesgo' && lead.resultado) { await Evaluation.create({ orgId: targetOrgId, companyId: company._id, framework: 'LFPDPPP / ISO 42001', answers: {}, score: lead.resultado.score, risk_level: lead.resultado.risk_level, recommendations: { summary: lead.resultado.summary } }); }
    else if (lead.tipo_lead === 'automatizacion' && lead.proceso && lead.resultado) { await ProcessEval.create({ orgId: targetOrgId, companyId: company._id, processName: lead.proceso.processName, volume: lead.proceso.volume, complexity: lead.proceso.complexityLabel || lead.proceso.complexity, dataType: lead.proceso.dataType, hoursSpent: lead.proceso.hoursSpent, score: lead.resultado.automationIndex, agentType: lead.resultado.agentType, recommendation: lead.resultado.agentDescription }); }
    lead.status = 'convertido'; lead.orgIdAsignado = targetOrgId; lead.companyIdAsignado = company._id; await lead.save();
    res.json({ ok: true, companyId: company._id, lead });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// IA GENERATIVA
app.post('/gov/suggest-risk', authenticateToken, async (req, res) => {
  try { const { content } = await callGroq({ messages: [{ role: 'system', content: 'Genera un riesgo de IA. JSON: riskName, category (Privacidad/Sesgo/Seguridad/Operacional/Regulatorio), probability (1-5), impact (1-5), mitigationPlan. ESPAÑOL.' }, { role: 'user', content: `Empresa: ${req.body.companyName}` }] }); res.json(safeParseJSON(content)); } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});
app.post('/gov/suggest-task', authenticateToken, async (req, res) => {
  try { const { content } = await callGroq({ messages: [{ role: 'system', content: 'Genera tarea de gobernanza IA. JSON: taskName, phase (Fase 1: Diagnóstico/Fase 2: Diseño/Fase 3: Implementación/Fase 4: Auditoría), assignedTo (Equipo BehAvIorLab/Cliente/Ambos). ESPAÑOL.' }, { role: 'user', content: `Empresa: ${req.body.companyName}` }] }); res.json(safeParseJSON(content)); } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});
app.post('/gov/generate-report', authenticateToken, async (req, res) => {
  try { const { content } = await callGroq({ messages: [{ role: 'system', content: 'Resumen ejecutivo. JSON: { "report": "texto" }. ESPAÑOL.' }, { role: 'user', content: JSON.stringify(req.body) }] }); res.json(safeParseJSON(content)); } catch (e) { res.status(500).json({ error: 'Error IA' }); }
});

// ==========================================
// AIGOS
// ==========================================
app.post('/gov/aigos/seed', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Solo superadmin' });
    await MasterControl.deleteMany({}); await MasterRisk.deleteMany({}); await AssessmentQuestion.deleteMany({});
    await MasterControl.insertMany(CONTROLS_DATA); await MasterRisk.insertMany(RISKS_DATA); await AssessmentQuestion.insertMany(QUESTIONS_DATA);
    res.json({ ok: true, message: "Catálogo AIGOS cargado", counts: { controls: CONTROLS_DATA.length, risks: RISKS_DATA.length, questions: QUESTIONS_DATA.length } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/gov/aigos/questions', authenticateToken, async (req, res) => { try { res.json(await AssessmentQuestion.find().sort({ code: 1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } });
app.get('/gov/aigos/master-risks', authenticateToken, async (req, res) => { try { res.json(await MasterRisk.find().sort({ code: 1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } });

app.post('/gov/aigos/import-risks', authenticateToken, async (req, res) => {
  try {
    const { companyId, riskCodes } = req.body;
    if (!companyId || !riskCodes?.length) return res.status(400).json({ error: 'Faltan datos' });
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    const masterRisks = await MasterRisk.find({ code: { $in: riskCodes } });
    const newRisks = [];
    for (const mr of masterRisks) {
      const exists = await Risk.findOne({ companyId: company._id, masterRiskCode: mr.code });
      if (!exists) newRisks.push({ orgId: company.orgId, companyId: company._id, riskName: mr.name, category: mr.category, probability: 3, impact: 4, riskLevel: 'Alto', riskScore: 12, mitigationPlan: `Catálogo: ${mr.description}`, masterRiskCode: mr.code });
    }
    if (newRisks.length > 0) await Risk.insertMany(newRisks);
    res.json({ ok: true, message: `Importados ${newRisks.length} riesgos.`, imported: newRisks.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/gov/aigos/load-base-plan', authenticateToken, async (req, res) => {
  try {
    const { orgId } = req.body;
    const basePlan = [
      { taskName: "Redactar y aprobar la Política Corporativa de IA", phase: "Fase 1: Diagnóstico", assignedTo: "Ambos", status: "Pendiente" },
      { taskName: "Designar Oficial de IA y formalizar Comité de Ética", phase: "Fase 1: Diagnóstico", assignedTo: "Cliente", status: "Pendiente" },
      { taskName: "Registrar todos los modelos y herramientas en el Inventario", phase: "Fase 2: Diseño", assignedTo: "Ambos", status: "Pendiente" },
      { taskName: "Capacitar al personal en riesgos y uso responsable de IA", phase: "Fase 3: Implementación", assignedTo: "Equipo BehAvIorLab", status: "Pendiente" },
      { taskName: "Implementar monitoreo de sesgos y alucinaciones (MLOps)", phase: "Fase 4: Auditoría", assignedTo: "Equipo BehAvIorLab", status: "Pendiente" }
    ];
    const existingCount = await Deliverable.countDocuments({ orgId: new mongoose.Types.ObjectId(orgId) });
    if (existingCount > 0) return res.status(400).json({ error: 'Ya cargado.' });
    await Deliverable.insertMany(basePlan.map(t => ({ ...t, orgId: new mongoose.Types.ObjectId(orgId) })));
    res.json({ ok: true, message: "Plan base cargado.", imported: basePlan.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// BORRADORES
app.get('/gov/aigos/drafts/:companyId', authenticateToken, async (req, res) => {
  try {
    const draft = await AssessmentDraft.findOne({ companyId: req.params.companyId });
    if (!draft) return res.status(404).json({ error: 'No hay borrador' });
    res.json(draft);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/gov/aigos/drafts/:companyId', authenticateToken, async (req, res) => {
  try {
    const { answers } = req.body;
    const company = await Company.findById(req.params.companyId);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    const draft = await AssessmentDraft.findOneAndUpdate({ companyId: req.params.companyId }, { $set: { answers, updatedAt: new Date(), orgId: company.orgId, createdBy: req.user.email } }, { upsert: true, new: true });
    res.json(draft);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/gov/aigos/drafts/:companyId', authenticateToken, async (req, res) => {
  try { await AssessmentDraft.deleteOne({ companyId: req.params.companyId }); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: error.message }); }
});

// HISTORIAL Y PENDIENTES
app.get('/gov/aigos/assessments/:companyId/history', authenticateToken, async (req, res) => {
  try { res.json(await AssessmentResult.find({ companyId: req.params.companyId }).sort({ date: -1 }).limit(20)); } catch (error) { res.status(500).json({error: error.message}); }
});

app.get('/gov/aigos/pending-evidence/:companyId', authenticateToken, async (req, res) => {
  try {
    const lastAssessment = await AssessmentResult.findOne({ companyId: req.params.companyId }).sort({ date: -1 });
    if (!lastAssessment) return res.json({ pending: [], total: 0 });
    const pending = [];
    for (const ans of lastAssessment.answers) {
      if (ans.isNA) continue;
      if (ans.level < 3) continue;
      const hasEvidence = await Evidence.findOne({ companyId: req.params.companyId, questionId: ans.questionCode, 'validation.valido': true });
      if (!hasEvidence) {
        const question = await AssessmentQuestion.findOne({ code: ans.questionCode });
        if (question) pending.push({ questionCode: ans.questionCode, level: ans.level, question: question.question, domain: question.domain, evidenceRequested: question.evidenceRequested });
      }
    }
    res.json({ pending, total: pending.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ASSESSMENTS
app.post('/gov/aigos/assessments', authenticateToken, async (req, res) => {
  try {
    const { companyId, answers } = req.body;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    const recomputed = await recomputeAigiFromAnswers(companyId, answers);
    const existingCount = await AssessmentResult.countDocuments({ companyId });
    const version = existingCount + 1;
    const result = await AssessmentResult.create({ orgId: company.orgId, companyId, answers, maturity: recomputed.maturity, aigi: recomputed.aigi, version, status: 'enviado' });
    await AssessmentDraft.deleteOne({ companyId });
    res.status(201).json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.patch('/gov/aigos/assessments/:id', authenticateToken, async (req, res) => {
  try {
    const { answers } = req.body;
    const original = await AssessmentResult.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'No encontrado' });
    const recomputed = await recomputeAigiFromAnswers(original.companyId, answers);
    const version = original.version + 1;
    const newAssessment = await AssessmentResult.create({ orgId: original.orgId, companyId: original.companyId, answers, maturity: recomputed.maturity, aigi: recomputed.aigi, version, status: 'enviado' });
    res.status(201).json(newAssessment);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/gov/aigos/companies/:companyId/latest', authenticateToken, async (req, res) => {
  try {
    const result = await AssessmentResult.findOne({ companyId: req.params.companyId }).sort({ date: -1 });
    if (!result) return res.status(404).json({ error: 'Sin evaluación' });
    res.json(result);
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.post('/gov/aigos/assessments/:id/evidence', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { questionCode } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Sin archivo' });
    const assessment = await AssessmentResult.findById(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment no encontrado' });
    const question = await AssessmentQuestion.findOne({ code: questionCode });
    if (!question) return res.status(404).json({ error: 'Pregunta no encontrada' });
    let pdfText = '';
    try { const pdf = await getDocumentProxy(new Uint8Array(req.file.buffer)); const ext = await extractText(pdf, { mergePages: true }); pdfText = ext.text || ''; } catch (e) { }
    if (!pdfText || pdfText.trim().length < 50) return res.status(400).json({ error: 'No se pudo extraer texto del PDF' });
    const systemPrompt = `Auditor de IA (ISO 42001). ¿El documento es evidencia verificable para la pregunta?\n\nPREGUNTA: ${question.question}\nEVIDENCIA: ${question.evidenceRequested}\n\nJSON: { "valido": true|false, "razon": "..." }`;
    let validation = { valido: false, razon: 'Error IA' };
    try {
      const { content } = await callGroq({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: pdfText.slice(0, 6000) }], temperature: 0.1, maxTokens: 300, timeoutMs: 25000 });
      const parsed = safeParseJSON(content);
      if (parsed && typeof parsed.valido === 'boolean') validation = { valido: parsed.valido, razon: String(parsed.razon || '').slice(0, 300) };
    } catch (e) { }
    if (validation.valido) { await replaceRejectedEvidence(assessment.companyId.toString(), questionCode); }
    else {
      const existingRejected = await Evidence.find({ companyId: assessment.companyId, questionId: questionCode, 'validation.valido': false }).sort({ ts: 1 });
      if (existingRejected.length >= 1) await Evidence.deleteMany({ _id: { $in: existingRejected.map(e => e._id) } });
    }
    const ev = await Evidence.create({ companyId: assessment.companyId, questionId: questionCode, fileName: req.file.originalname, r2Url: `https://media.gokulab.mx/demo-${Date.now()}.pdf`, validation });
    if (validation.valido) {
      const updatedAnswers = assessment.answers.map(a => a.questionCode === questionCode ? { ...a.toObject(), hasEvidence: true } : a);
      const recomputed = await recomputeAigiFromAnswers(assessment.companyId.toString(), updatedAnswers);
      await AssessmentResult.findByIdAndUpdate(assessment._id, { answers: updatedAnswers, maturity: recomputed.maturity, aigi: recomputed.aigi });
    }
    res.json({ ok: true, evidence: ev, validation });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🆕 CHAT ADVISOR (Groq)
// ==========================================
const CHAT_SYSTEM_PROMPT = `Eres el AI Business Advisor de BehaviorLab, la firma mexicana de AI Governance + Agentes de IA para la industria mediana mexicana (empresas de $200M-$2,000M MXN).

PERFIL DEL NEGOCIO:
- 3 pilares: AI Governance (AIGOS™), AI Automation (ROI Scan), AI Agents (Deploy)
- Ecosistema GōkuLab: gokulab.mx (formación técnica), test.gokulab.mx (tests gratuitos)
- Metodología AIGOS™ propia, alineada a ISO/IEC 42001 y NIST AI RMF, cumplimiento mexicano (LFPDPPP, COFEPRIS-SaMD)
- Diferencial: industria mediana, no Big 4. Diagnóstico en 2 semanas, no 6 meses. Cada producto se contrata por separado.

PRODUCTOS Y RANGOS DE PRECIO (en MXN, + IVA):
- Executive Briefing: desde $40,000. 1 sesión (2-3h), Consejo firma apetito de riesgo de IA.
- Assessment AIGOS™ Exprés: desde $95,000. 2 semanas. Inventario, mapa de riesgos, AIGI score, evidencia auditable.
- Immersion Program: desde $200,000. 4-6 semanas. Política + comité + RACI + capacitación por audiencia.
- Deploy de Agente Único: desde $300,000. 6-8 semanas. Agente en producción con integración a CRM/ERP.
- Full Transformation (completo 20-24 sem): desde $850,000. Solo se ofrece después de un primer producto.
- AI Sprint (GōkuLab): 4 sesiones prácticas de IA por rol.
- Corporate Academy (GōkuLab): programas continuos de formación.

CTAs DISPONIBLES:
- "Hacer diagnóstico de 5 preguntas" (60 seg, gratis) — sección #five-q
- "Diagnóstico completo de readiness" (6 min, gratis) — sección #readiness
- "Hablar con un experto" (30 min, sin costo) — contacto@gokulab.com

REGLAS ESTRICTAS:
- Español profesional, cálido, directo. Sin emojis excesivos (1 por mensaje máximo).
- Máximo 4 oraciones por respuesta. Si necesitas más, sugiere agendar llamada.
- NUNCA inventes clientes específicos, casos de éxito con nombre, certificaciones o métricas exactas.
- NUNCA prometas ahorros exactos ni resultados garantizados.
- Si te preguntan por precios, da el rango ("desde $X MXN") y sugiere contacto para cotización detallada.
- Si la pregunta es muy específica (años de experiencia, referencias exactas, contratos), sugiere hablar con el equipo.
- Si la pregunta NO es sobre BehaviorLab/IA empresarial, redirige amablemente al diagnóstico o a hablar con un experto.
- Termina con una pregunta o CTA cuando sea natural.`;

app.post('/api/public/chat', async (req, res) => {
  const t0 = Date.now();
  try {
    const ip = getClientIP(req); const rl = checkPublicRateLimit(ip);
    setRateLimitHeaders(res, rl);
    if (!rl.allowed) { res.set('Retry-After', String(Math.ceil(rl.resetMs / 1000))); return res.status(429).json({ ok: false, error: `Demasiadas solicitudes. Intenta en ${formatRetryMessage(rl.resetMs)}.` }); }

    const b = req.body || {};
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    if (!message || message.length < 1) return res.status(400).json({ ok: false, error: 'Mensaje vacío.' });
    if (message.length > 1000) return res.status(400).json({ ok: false, error: 'Mensaje demasiado largo (máx 1000 caracteres).' });

    const history = Array.isArray(b.history) ? b.history.slice(-6).filter(h => h && typeof h.role === 'string' && typeof h.content === 'string') : [];
    const messages = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message.slice(0, 1000) }
    ];

    let reply;
    try {
      const { content } = await callGroq({ messages, temperature: 0.6, maxTokens: 400, timeoutMs: 20000 });
      reply = String(content || '').trim();
    } catch (groqErr) {
      console.error('[chat] Groq falló:', groqErr.message);
      return res.json({ ok: true, reply: 'Estoy teniendo un problema técnico en este momento. Mientras lo resolvemos, te recomiendo hacer el diagnóstico de 5 preguntas — toma 60 segundos y te da claridad inmediata sobre tu empresa.', fallback: true, durationMs: Date.now() - t0 });
    }

    if (!reply || reply.length < 5) {
      return res.json({ ok: true, reply: 'No tengo una respuesta clara para eso. ¿Te ayudo con un diagnóstico rápido o prefieres agendar una llamada de 30 minutos?', fallback: true, durationMs: Date.now() - t0 });
    }

    return res.json({ ok: true, reply, durationMs: Date.now() - t0 });
  } catch (err) {
    console.error('[chat] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// ==========================================
// ENDPOINTS PÚBLICOS
// ==========================================

// READINESS SNAPSHOT
app.post('/api/public/readiness-snapshot', async (req, res) => {
  const t0 = Date.now();
  try {
    const ip = getClientIP(req); const rl = checkPublicRateLimit(ip);
    setRateLimitHeaders(res, rl);
    if (!rl.allowed) { res.set('Retry-After', String(Math.ceil(rl.resetMs / 1000))); return res.status(429).json({ ok: false, error: `Demasiadas solicitudes. Intenta en ${formatRetryMessage(rl.resetMs)}.` }); }
    const b = req.body || {};
    const errors = [];
    if (!b.nombre || b.nombre.trim().length < 2) errors.push('nombre');
    if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errors.push('email');
    if (!b.empresa || b.empresa.trim().length < 2) errors.push('empresa');
    if (!b.cargo || b.cargo.trim().length < 2) errors.push('cargo');
    if (!b.sector || !['manufactura', 'alimentos', 'logistica', 'servicios', 'salud'].includes(b.sector)) errors.push('sector');
    if (!b.empleados || !['50-200', '200-500', '500-1000', '1000+'].includes(b.empleados)) errors.push('empleados');
    if (!b.facturacion_estimada || !['200-500M', '500-1000M', '1000-2000M', '2000M+'].includes(b.facturacion_estimada)) errors.push('facturacion_estimada');
    if (!b.uso_ia || !['no_usa', 'libre', 'guiado', 'regulado'].includes(b.uso_ia)) errors.push('uso_ia');
    if (typeof b.tiene_politica !== 'boolean') errors.push('tiene_politica');
    if (!b.tiene_inventario || !['no', 'parcial', 'si'].includes(b.tiene_inventario)) errors.push('tiene_inventario');
    if (typeof b.tiene_responsable !== 'boolean') errors.push('tiene_responsable');
    if (typeof b.cliente_pidio_evidencia !== 'boolean') errors.push('cliente_pidio_evidencia');
    if (!Array.isArray(b.areas_con_ia)) errors.push('areas_con_ia');
    if (!b.urgencia || !['3_meses', '6_meses', '12_meses', 'sin_urgencia'].includes(b.urgencia)) errors.push('urgencia');
    if (!b.porcentaje_manual || !['0-25', '25-50', '50-75', '75-100'].includes(b.porcentaje_manual)) errors.push('porcentaje_manual');
    if (errors.length > 0) return res.status(400).json({ ok: false, error: 'Datos inválidos: ' + errors.join('; ') });

    const scores = computeReadinessScores(b);
    const profile = {
      cargo: b.cargo.trim().slice(0, 120), sector: b.sector, empleados: b.empleados,
      facturacion_estimada: b.facturacion_estimada, uso_ia: b.uso_ia,
      tiene_politica: b.tiene_politica, tiene_inventario: b.tiene_inventario, tiene_responsable: b.tiene_responsable,
      cliente_pidio_evidencia: b.cliente_pidio_evidencia,
      areas_con_ia: b.areas_con_ia.slice(0, 10).map(a => String(a).slice(0, 40)),
      urgencia: b.urgencia, porcentaje_manual: b.porcentaje_manual,
      proceso_doloroso: b.proceso_doloroso ? String(b.proceso_doloroso).slice(0, 200) : '',
    };
    const resultado = {
      readiness_score: scores.readiness, readiness_level: scores.readinessLevel,
      governance_risk: scores.governanceRisk, governance_risk_level: scores.governanceRiskLevel,
      automation_potential: scores.automationPotential, automation_potential_level: scores.automationPotentialLevel,
      opportunity_score: scores.opportunity, opportunity_level: scores.opportunityLevel,
      breakdown: scores.breakdown, priorities: scores.priorities,
      recommended_product: scores.recommendedProduct, recommendation_reason: scores.recommendationReason,
      source: 'readiness-snapshot'
    };
    const lead = await Lead.create({
      tipo_lead: 'readiness', status: 'nuevo',
      nombre: b.nombre.trim().slice(0, 120), email: b.email.toLowerCase().slice(0, 160),
      empresa: b.empresa.trim().slice(0, 160), telefono: b.telefono || '',
      sector: b.sector, profile, resultado,
      leadScore: scores.opportunity, leadPriority: scores.opportunityLevel,
      notifyFounder: scores.opportunity >= 60 || b.cliente_pidio_evidencia === true,
      fuente: b.source || 'landing_readiness', userAgent: req.headers['user-agent'], ip,
      meta: { durationMs: Date.now() - t0 },
      name: b.nombre.trim().slice(0, 120), company: b.empresa.trim().slice(0, 160), ts: new Date()
    });
    if (lead.notifyFounder) notifyHotLead(lead).catch(err => console.error('[notifyHotLead]', err.message));
    return res.json({ ok: true, leadId: lead._id.toString(), profile: resultado });
  } catch (err) {
    console.error('[readiness-snapshot] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

app.post('/api/public/risk-assessment', async (req, res) => {
  const t0 = Date.now();
  try {
    const ip = getClientIP(req); const rl = checkPublicRateLimit(ip);
    setRateLimitHeaders(res, rl);
    if (!rl.allowed) { res.set('Retry-After', String(Math.ceil(rl.resetMs / 1000))); return res.status(429).json({ ok: false, error: `Demasiadas solicitudes. Intenta en ${formatRetryMessage(rl.resetMs)}.` }); }
    const b = req.body || {};
    const errors = [];
    if (!b.nombre || b.nombre.trim().length < 2) errors.push('nombre');
    if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errors.push('email');
    if (!b.empresa || b.empresa.trim().length < 2) errors.push('empresa');
    if (!b.sector || !['servicios', 'alimentos', 'salud'].includes(b.sector)) errors.push('sector');
    if (!b.shadow_ai || !['bajo', 'medio', 'alto'].includes(b.shadow_ai)) errors.push('shadow_ai');
    if (errors.length > 0) return res.status(400).json({ ok: false, error: 'Datos inválidos: ' + errors.join('; ') });
    const calc = computeRiskLevel({ sector: b.sector, shadow_ai: b.shadow_ai, samd: b.samd === true });
    const lead = await Lead.create({ tipo_lead: 'riesgo', status: 'nuevo', nombre: b.nombre.trim().slice(0, 120), email: b.email.toLowerCase().slice(0, 160), empresa: b.empresa.trim().slice(0, 160), telefono: b.telefono || '', sector: b.sector, shadow_ai: b.shadow_ai, samd: b.samd === true, risk_level: calc.level, resultado: { score: calc.score, risk_level: calc.level, badges: calc.badges, summary: calc.summary }, fuente: 'risk-calculator', userAgent: req.headers['user-agent'], ip, meta: { durationMs: Date.now() - t0 }, name: b.nombre.trim().slice(0, 120), company: b.empresa.trim().slice(0, 160), ts: new Date() });
    return res.json({ ok: true, assessment: { risk_level: calc.level, score: calc.score, badges: calc.badges, summary: calc.summary }, leadId: lead._id.toString() });
  } catch (err) { return res.status(500).json({ ok: false, error: 'Error interno.' }); }
});

app.post('/api/public/automation-assessment', async (req, res) => {
  const t0 = Date.now();
  try {
    const ip = getClientIP(req); const rl = checkPublicRateLimit(ip);
    setRateLimitHeaders(res, rl);
    if (!rl.allowed) { res.set('Retry-After', String(Math.ceil(rl.resetMs / 1000))); return res.status(429).json({ ok: false, error: `Demasiadas solicitudes. Intenta en ${formatRetryMessage(rl.resetMs)}.` }); }
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
    const systemPrompt = `Consultor de automatización. JSON: { "automationIndex": number, "baselineHoursPerMonth": number, "roiHoursPerMonth": number, "agentType": string, "agentDescription": string, "roiExplanation": string, "paybackMonths": number, "implementationPhases": string[], "confidence": string }`;
    const userPrompt = `Proceso: ${b.processName}. Volumen: ${b.volume}. Complejidad: ${b.complexity}/5. Datos: ${b.dataType}. Horas: ${b.hoursSpent}.`;
    let parsed = null;
    try { const { content } = await callGroq({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature:0.3, maxTokens: 800, timeoutMs: 25000 }); parsed = safeParseJSON(content); }
    catch (groqErr) { if (groqErr.message === 'GROQ_UNAVAILABLE') return res.status(503).json({ ok: false, error: 'IA no disponible.' }); throw groqErr; }
    if (!parsed || typeof parsed.automationIndex !== 'number') return res.status(502).json({ ok: false, error: 'IA no devolvió assessment válido.' });
    const complexityLabels = { 1: 'muy baja', 2: 'baja', 3: 'media', 4: 'alta', 5: 'muy alta' };
    const baseline = Number(parsed.baselineHoursPerMonth) > 0 ? Math.round(Number(parsed.baselineHoursPerMonth)) : Math.max(Math.round(b.volume * 3 / 60), Math.round(b.hoursSpent) || 0);
    const resultado = { automationIndex: Math.max(0, Math.min(100, Math.round(Number(parsed.automationIndex)))), agentType: String(parsed.agentType || 'Agente').slice(0, 120), agentDescription: String(parsed.agentDescription || '').slice(0, 600), roiHoursPerMonth: Math.max(0, Math.round(Number(parsed.roiHoursPerMonth) || 0)), baselineHoursPerMonth: baseline, roiExplanation: String(parsed.roiExplanation || '').slice(0, 600), paybackMonths: Math.max(1, Math.min(24, Math.round(Number(parsed.paybackMonths) || 6))), implementationPhases: Array.isArray(parsed.implementationPhases) ? parsed.implementationPhases.slice(0, 6).map(p => String(p).slice(0, 120)) : ['Análisis'], confidence: ['baja', 'media', 'alta'].includes(parsed.confidence) ? parsed.confidence : 'media', source: 'groq' };
    const proceso = { processName: String(b.processName).slice(0, 200), volume: b.volume, complexity: b.complexity, complexityLabel: complexityLabels[b.complexity] || 'media', dataType: String(b.dataType).slice(0, 60), hoursSpent: b.hoursSpent, baselineHoursPerMonth: baseline };
    const lead = await Lead.create({ tipo_lead: 'automatizacion', status: 'nuevo', nombre: b.nombre.trim().slice(0, 120), email: b.email.toLowerCase().slice(0, 160), empresa: b.empresa.trim().slice(0, 160), telefono: b.telefono || '', proceso, resultado, fuente: 'automation-assessment', userAgent: req.headers['user-agent'], ip, meta: { durationMs: Date.now() - t0, model: GROQ_MODEL }, name: b.nombre.trim().slice(0, 120), company: b.empresa.trim().slice(0, 160), ts: new Date() });
    return res.json({ ok: true, assessment: { automationIndex: resultado.automationIndex, roiHoursPerMonth: resultado.roiHoursPerMonth, agentType: resultado.agentType, agentDescription: resultado.agentDescription, roiExplanation: resultado.roiExplanation }, leadId: lead._id.toString() });
  } catch (err) { return res.status(500).json({ ok: false, error: 'Error interno.' }); }
});

// Health check
app.get('/', (req, res) => res.json({ ok: true, service: 'behavior-lab-api', version: '1.1.0-chat' }));

let server;
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    server = app.listen(PORT, () => console.log(`[SERVER] Escuchando en puerto ${PORT}`));
  } catch (err) { console.error('Error conectando Mongo:', err); process.exit(1); }
}
startServer();