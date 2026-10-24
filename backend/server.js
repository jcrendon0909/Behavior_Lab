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
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'], 
  allowedHeaders: ['Content-Type', 'Authorization'], 
})); 

app.set('trust proxy', 1); 
app.use(express.json({ limit: '100kb' }));

// ==========================================
// MODELOS
// ==========================================
const LeadSchema = new mongoose.Schema({ 
  tipo_lead: { type: String, default: 'gobernanza', index: true }, 
  nombre: String, email: String, empresa: String, telefono: String, 
  proceso: mongoose.Schema.Types.Mixed, resultado: mongoose.Schema.Types.Mixed, 
  fuente: String, userAgent: String, ip: String, meta: mongoose.Schema.Types.Mixed, 
  name: String, company: String, sector: String, shadow_ai: String, samd: String, risk_level: String, ts: Date, 
}, { timestamps: true, strict: false, collection: 'leads' }); 
const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

const UserSchema = new mongoose.Schema({ 
  name: String, email: { type: String, unique: true }, 
  password: String, hash: String, 
  role: { type: String, enum: ['superadmin', 'admin', 'auditor'], default: 'admin' }, 
  orgId: String, 
  modules: { type: [String], default: ['gobernanza'] } 
}, { timestamps: true, strict: false, collection: 'users' }); 
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const OrgSchema = new mongoose.Schema({ name: String, modules: [String] }, { strict: false, collection: 'orgs' }); 
const Org = mongoose.models.Org || mongoose.model('Org', OrgSchema);

const CompanySchema = new mongoose.Schema({ orgId: mongoose.Schema.Types.Mixed, name: String, riskProfile: String, active: Boolean }, { strict: false, collection: 'companies' }); 
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);

const InventorySchema = new mongoose.Schema({ 
  orgId: mongoose.Schema.Types.Mixed, companyId: String, model_name: String, category: String, vendor: String, 
  data_sensitivity: String, risk_level: String, status: String, description: String, evidence: mongoose.Schema.Types.Mixed 
}, { strict: false, collection: 'ai_inventory' }); 
const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema);

const EvaluationSchema = new mongoose.Schema({ 
  orgId: mongoose.Schema.Types.Mixed, companyId: String, framework: String, answers: mongoose.Schema.Types.Mixed, 
  score: Number, risk_level: String, recommendations: mongoose.Schema.Types.Mixed, createdBy: String 
}, { strict: false, collection: 'risk_evaluations' }); 
const Evaluation = mongoose.models.Evaluation || mongoose.model('Evaluation', EvaluationSchema);

const EvidenceSchema = new mongoose.Schema({ 
  companyId: String, questionId: String, fileName: String, r2Url: String, 
  validation: mongoose.Schema.Types.Mixed, ts: { type: Date, default: Date.now } 
}, { strict: false, collection: 'evidence' }); 
const Evidence = mongoose.models.Evidence || mongoose.model('Evidence', EvidenceSchema);

const RiskSchema = new mongoose.Schema({ orgId: mongoose.Schema.Types.Mixed, companyId: String, riskName: String, category: String, probability: Number, impact: Number, riskLevel: String, riskScore: Number, mitigationPlan: String }, { strict: false, collection: 'risks' }); 
const Risk = mongoose.models.Risk || mongoose.model('Risk', RiskSchema);

const DeliverableSchema = new mongoose.Schema({ orgId: mongoose.Schema.Types.Mixed, taskName: String, phase: String, assignedTo: String, status: String, dueDate: String }, { strict: false, collection: 'deliverables' }); 
const Deliverable = mongoose.models.Deliverable || mongoose.model('Deliverable', DeliverableSchema);

const ProcessEvalSchema = new mongoose.Schema({ orgId: mongoose.Schema.Types.Mixed, companyId: String, processName: String, volume: String, complexity: String, dataType: String, hoursSpent: Number, score: Number, agentType: String, recommendation: String }, { strict: false, collection: 'processevals' }); 
const ProcessEval = mongoose.models.ProcessEval || mongoose.model('ProcessEval', ProcessEvalSchema);

// ==========================================
// UTILIDADES
// ==========================================
const clamp = (n, min, max) => Math.min(max, Math.max(min, n)); 
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); 
const toNumber = (v, fallback = 0) => { const n = typeof v === 'string' ? Number(v.replace(',', '')) : Number(v); return Number.isFinite(n) ? n : fallback; };

// FIX CRÍTICO: Buscar orgId como String o como ObjectId
const buildOrgQuery = (orgId) => {
  if (!orgId || orgId === 'ALL') return {};
  const queries = [{ orgId: orgId }];
  if (mongoose.Types.ObjectId.isValid(orgId)) {
    queries.push({ orgId: new mongoose.Types.ObjectId(orgId) });
  }
  return { $or: queries };
};

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
    req.user = user; next(); 
  }); 
};

const getOrgQuery = (req) => { 
  if (req.user.role === 'superadmin' && req.query.orgId === 'ALL') return {}; 
  if (req.user.role === 'superadmin' && req.query.orgId) return buildOrgQuery(req.query.orgId); 
  return buildOrgQuery(req.user.orgId); 
};

// FIX CRÍTICO: Si no hay empresas, devolver array vacío para no filtrar evidencias de otras orgs
async function getEvidenceQuery(req) { 
  if (req.user.role === 'superadmin' && req.query.orgId === 'ALL') return {}; 
  const targetOrgId = req.user.role === 'superadmin' && req.query.orgId ? req.query.orgId : req.user.orgId; 
  const orgQuery = buildOrgQuery(targetOrgId);
  const companies = await Company.find(orgQuery); 
  const companyIds = companies.map(c => c._id.toString()); 
  return { companyId: { $in: companyIds } }; 
}

// ==========================================
// GROQ CLIENT
// ==========================================
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
      if (!resp.ok) { 
        failures.push({ keyIndex, status: resp.status }); 
        if ([401, 403, 429, 500, 502, 503, 504].includes(resp.status)) continue; 
        throw new Error('Groq error'); 
      } 
      const data = await resp.json(); 
      const content = data?.choices?.[0]?.message?.content; 
      if (!content) continue; 
      keyCursor = (keyIndex + 1) % GROQ_KEYS.length; 
      return { content }; 
    } catch (err) { 
      clearTimeout(timer); 
      failures.push({ keyIndex, status: 'exception' }); 
    } 
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
// EMERGENCY RESET & LOGIN
// ==========================================
app.get('/gov/auth/emergency-reset', async (req, res) => { 
  try { 
    const hashedPassword = await bcrypt.hash('CambiarEstaClave2026!', 10); 
    const result = await User.updateOne({ email: 'jcrendon@gokulab.mx' }, { $set: { password: hashedPassword, hash: hashedPassword, role: 'superadmin', modules: ['gobernanza', 'automatizacion'] } }); 
    res.json({ ok: true, message: 'Superadmin reset. Login con CambiarEstaClave2026!', modified: result.modifiedCount }); 
  } catch (e) { res.status(500).json({ error: e.message }); } 
});

app.post('/gov/auth/login', async (req, res) => { 
  try { 
    const { email, password } = req.body; 
    console.log(`[LOGIN] Attempt for: ${email}`); 
    const user = await User.findOne({ email }); 
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' }); 
    const hashToCompare = user.hash || user.password; 
    if (!hashToCompare) return res.status(401).json({ error: 'Usuario sin contraseña asignada' }); 
    const validPassword = (password === hashToCompare) || await bcrypt.compare(password, hashToCompare).catch(e => { console.error('[LOGIN bcrypt error]', e.message); return false; }); 
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' }); 
    const token = jwt.sign({ _id: user._id, role: user.role, orgId: user.orgId, modules: user.modules }, JWT_SECRET, { expiresIn: '7d' }); 
    res.json({ token, user: { email: user.email, role: user.role, orgId: user.orgId, name: user.name, modules: user.modules } }); 
  } catch (error) { 
    console.error('[LOGIN ERROR]', error); 
    res.status(500).json({ error: error.message }); 
  } 
});

// ==========================================
// USERS & ORGS
// ==========================================
app.get('/gov/users', authenticateToken, async (req, res) => { 
  try { const users = await User.find().select('-password -hash'); res.json(users); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar usuarios' }); } 
});

app.post('/gov/users', authenticateToken, async (req, res) => { 
  try { 
    const { name, email, password, role, orgId, modules } = req.body; 
    const hashedPassword = await bcrypt.hash(password, 10); 
    const user = await User.create({ name, email, password: hashedPassword, hash: hashedPassword, role, orgId, modules }); 
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, orgId: user.orgId, modules: user.modules }); 
  } catch (error) { res.status(500).json({ error: 'Error al crear usuario' }); } 
});

app.get('/gov/orgs', authenticateToken, async (req, res) => { 
  try { const orgs = await Org.find(); res.json(orgs); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar orgs' }); } 
});

// ==========================================
// COMPANIES
// ==========================================
app.get('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => { 
  try { 
    const query = buildOrgQuery(req.params.orgId); 
    const companies = await Company.find(query); 
    res.json(companies); 
  } catch (error) { res.status(500).json({ error: 'Error al cargar filiales' }); } 
});

app.post('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => { 
  try { 
    const targetOrgId = req.params.orgId === 'ALL' ? req.user.orgId : req.params.orgId; 
    const company = await Company.create({ ...req.body, orgId: targetOrgId }); 
    res.status(201).json(company); 
  } catch (error) { res.status(500).json({ error: 'Error al crear filial' }); } 
});

// ==========================================
// AI INVENTORY
// ==========================================
app.get('/gov/ai-inventory', authenticateToken, async (req, res) => { 
  try { const items = await Inventory.find(getOrgQuery(req)); res.json(items); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar inventario' }); } 
});

app.post('/gov/ai-inventory', authenticateToken, async (req, res) => { 
  try { const item = await Inventory.create({ ...req.body, orgId: req.user.orgId }); res.status(201).json(item); } 
  catch (error) { res.status(500).json({ error: 'Error al crear modelo' }); } 
});

// ==========================================
// RISKS
// ==========================================
app.get('/gov/risks', authenticateToken, async (req, res) => { 
  try { res.json(await Risk.find(getOrgQuery(req))); } 
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

// ==========================================
// DELIVERABLES
// ==========================================
app.get('/gov/deliverables', authenticateToken, async (req, res) => { 
  try { res.json(await Deliverable.find(getOrgQuery(req))); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar plan' }); } 
});

app.post('/gov/deliverables', authenticateToken, async (req, res) => { 
  try { const deliverable = await Deliverable.create({ ...req.body, orgId: req.user.orgId, status: 'Pendiente' }); res.status(201).json(deliverable); } 
  catch (error) { res.status(500).json({ error: 'Error al crear tarea' }); } 
});

app.put('/gov/deliverables/:id', authenticateToken, async (req, res) => { 
  try { res.json(await Deliverable.findByIdAndUpdate(req.params.id, req.body, { new: true })); } 
  catch (error) { res.status(500).json({ error: 'Error al actualizar tarea' }); } 
});

app.delete('/gov/deliverables/:id', authenticateToken, async (req, res) => { 
  try { await Deliverable.findByIdAndDelete(req.params.id); res.json({ ok: true }); } 
  catch (error) { res.status(500).json({ error: 'Error al eliminar tarea' }); } 
});

// ==========================================
// EVALUATIONS
// ==========================================
app.get('/gov/evaluations', authenticateToken, async (req, res) => { 
  try { res.json(await Evaluation.find(getOrgQuery(req)).sort({ createdAt: -1 })); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar evaluaciones' }); } 
});

app.post('/gov/evaluations', authenticateToken, async (req, res) => { 
  try { const evaluation = await Evaluation.create({ ...req.body, orgId: req.user.orgId }); res.status(201).json(evaluation); } 
  catch (error) { res.status(500).json({ error: 'Error al guardar evaluación' }); } 
});

// ==========================================
// EVIDENCE
// ==========================================
app.get('/gov/evidence', authenticateToken, async (req, res) => { 
  try { 
    const query = await getEvidenceQuery(req); 
    const evidence = await Evidence.find(query).sort({ ts: -1 }); 
    res.json(evidence); 
  } catch (error) { res.status(500).json({ error: 'Error al cargar evidencias' }); } 
});

app.post('/gov/upload-evidence', authenticateToken, upload.single('file'), async (req, res) => { 
  try { 
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' }); 
    const ev = await Evidence.create({ 
      companyId: req.body.companyId, 
      questionId: req.body.questionId, 
      fileName: req.file.originalname, 
      r2Url: 'https://media.gokulab.mx/demo.pdf', 
      validation: { valido: true, razon: 'Evidencia validada por IA (Simulación)' } 
    }); 
    res.json({ ok: true, evidence: ev, validation: ev.validation }); 
  } catch (error) { res.status(500).json({ error: 'Error al subir evidencia' }); } 
});

// ==========================================
// PROCESS EVALS
// ==========================================
app.get('/gov/process-evals', authenticateToken, async (req, res) => { 
  try { res.json(await ProcessEval.find(getOrgQuery(req))); } 
  catch (error) { res.status(500).json({ error: 'Error al cargar procesos' }); } 
});

app.post('/gov/process-evals', authenticateToken, async (req, res) => { 
  try { res.status(201).json(await ProcessEval.create({ ...req.body, orgId: req.user.orgId })); } 
  catch (error) { res.status(500).json({ error: 'Error al guardar proceso' }); } 
});

app.delete('/gov/process-evals/:id', authenticateToken, async (req, res) => { 
  try { await ProcessEval.findByIdAndDelete(req.params.id); res.json({ ok: true }); } 
  catch (error) { res.status(500).json({ error: 'Error al eliminar proceso' }); } 
});

// ==========================================
// LEADS & ASSESSMENTS
// ==========================================
app.get('/leads', authenticateToken, async (req, res) => { 
  try { 
    const leads = await Lead.find({ tipo_lead: { $ne: 'automatizacion' } }).sort({ createdAt: -1, ts: -1 }); 
    res.json(leads); 
  } catch (error) { res.status(500).json({ error: 'Error al cargar leads' }); } 
});

app.get('/gov/assessments', authenticateToken, async (req, res) => { 
  try { 
    const assessments = await Lead.find({ tipo_lead: 'automatizacion' }).sort({ createdAt: -1 }); 
    res.json(assessments); 
  } catch (error) { res.status(500).json({ error: 'Error al cargar assessments' }); } 
});

// ==========================================
// IA SUGGESTIONS
// ==========================================
app.post('/gov/suggest-risk', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ 
      messages: [
        { role: 'system', content: 'Genera un riesgo de IA. JSON: riskName, category, probability, impact, mitigationPlan. Todo en ESPAÑOL.' }, 
        { role: 'user', content: `Empresa: ${req.body.companyName}` }
      ] 
    }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

app.post('/gov/suggest-task', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ 
      messages: [
        { role: 'system', content: 'Genera una tarea de gobernanza. JSON: taskName, phase, assignedTo. Todo en ESPAÑOL.' }, 
        { role: 'user', content: `Empresa: ${req.body.companyName}` }
      ] 
    }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

app.post('/gov/generate-report', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ 
      messages: [
        { role: 'system', content: 'Eres un consultor. Genera un resumen ejecutivo en ESPAÑOL. Devuelve JSON: { "report": "tu texto" }' }, 
        { role: 'user', content: JSON.stringify(req.body) }
      ] 
    }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

app.post('/gov/generate-strategic-report', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ 
      messages: [
        { role: 'system', content: 'Genera reporte estratégico. JSON: executiveSummary, gapAnalysis, roadmap: { phase1, phase2, phase3 }. Todo en ESPAÑOL.' }, 
        { role: 'user', content: JSON.stringify(req.body) }
      ] 
    }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

// ==========================================
// ASSESSMENT PUBLICO (WIZARD)
// ==========================================
const COMPLEXITY_LABEL = { 1: 'Muy Baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Muy Alta' };

function validateAssessmentPayload(body) {
  const errors = [];
  if (!body.nombre) errors.push('nombre requerido');
  if (!isEmail(body.email)) errors.push('email inválido');
  if (!body.empresa) errors.push('empresa requerida');
  if (!body.processName) errors.push('processName requerido');
  if (!body.volume) errors.push('volume requerido');
  if (!body.complexity) errors.push('complexity requerido');
  if (!body.hoursSpent) errors.push('hoursSpent requerido');
  return { ok: errors.length === 0, errors, value: body };
}

function computeRoi(v) { 
  const baselineMonthly = Math.round(v.hoursSpent * 4.33); 
  return { baselineMonthly, hoursSaved: Math.round(baselineMonthly * v.automationIndex / 100) }; 
}

function heuristicAssessment(v) { 
  const volumeScore = clamp(Math.log10(v.volume + 1) / 6 * 100, 0, 100); 
  const complexityScore = clamp(110 - v.complexity * 18, 0, 100); 
  const dataScore = /estructurado|structured/i.test(v.dataType) ? 90 : /semi/i.test(v.dataType) ? 75 : /mixto|mixed/i.test(v.dataType) ? 65 : 55; 
  const manualScore = clamp(v.hoursSpent / 40 * 100, 0, 100); 
  const idx = Math.round(clamp(volumeScore * 0.30 + complexityScore * 0.30 + dataScore * 0.25 + manualScore * 0.15, 15, 92)); 
  const agentType = /documentos|documents|no-estructurado|unstructured/i.test(v.dataType) ? 'Extracción de Documentos + NLP' : v.complexity <= 2 && v.volume >= 300 ? 'RPA (Robotic Process Automation)' : v.complexity >= 4 ? 'Agente Cognitivo con Orquestación Multi-paso' : 'Agente Conversacional + NLP'; 
  const roi = computeRoi({ hoursSpent: v.hoursSpent, automationIndex: idx }); 
  return { 
    automationIndex: idx, 
    agentType, 
    agentDescription: `Un agente ${agentType} para ${v.processName}`, 
    roiHoursPerMonth: roi.hoursSaved, 
    baselineHoursPerMonth: roi.baselineMonthly, 
    roiExplanation: `Ahorro de ~${roi.hoursSaved} h/mes de ${roi.baselineMonthly} actuales.`, 
    paybackMonths: Math.max(1, Math.round(12 - idx / 10)), 
    implementationPhases: ['Diagnóstico', 'Prototipo', 'Piloto', 'Producción'], 
    confidence: 'media', 
    source: 'heuristic-fallback' 
  }; 
}

function normalizeAssessment(raw, v, usedFallback = false) { 
  const idx = clamp(Math.round(toNumber(raw?.automationIndex, 50)), 0, 100); 
  const roi = computeRoi({ hoursSpent: v.hoursSpent, automationIndex: idx }); 
  return { 
    automationIndex: idx, 
    agentType: raw?.agentType || 'Agente Cognitivo', 
    agentDescription: raw?.agentDescription || '', 
    roiHoursPerMonth: roi.hoursSaved, 
    baselineHoursPerMonth: roi.baselineMonthly, 
    roiExplanation: raw?.roiExplanation || `Ahorro ~${roi.hoursSaved} h/mes.`, 
    paybackMonths: clamp(Math.round(toNumber(raw?.paybackMonths, 6)), 1, 24), 
    implementationPhases: Array.isArray(raw?.implementationPhases) ? raw.implementationPhases : ['Diagnóstico', 'Prototipo', 'Piloto', 'Producción'], 
    confidence: raw?.confidence || 'media', 
    source: usedFallback ? 'heuristic-fallback' : 'groq' 
  }; 
}

const assessmentLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 10 }); 
app.post('/api/public/automation-assessment', assessmentLimiter, async (req, res) => { 
  const v = validateAssessmentPayload(req.body || {}); 
  if (!v.ok) return res.status(400).json({ ok: false, error: 'Payload invalido', details: v.errors }); 
  const data = v.value; 
  const baselineMonthly = Math.round(data.hoursSpent * 4.33); 
  let assessment; 
  let usedFallback = false; 
  try { 
    const { content } = await callGroq({ 
      messages: [ 
        { role: 'system', content: 'Eres un Arquitecto de Automatización de BehaviorLab. Devuelve JSON válido. TODOS los textos (agentType, agentDescription, roiExplanation, implementationPhases) DEBEN ESTAR EN ESPAÑOL. Estructura: { "automationIndex": 0-100, "agentType": "texto", "agentDescription": "texto", "roiHoursPerMonth": num, "baselineHoursPerMonth": num, "roiExplanation": "texto", "paybackMonths": 1-24, "implementationPhases": ["fase"], "confidence": "alta | media | baja" }' }, 
        { role: 'user', content: `Proceso: ${data.processName}, Volumen: ${data.volume}, Complejidad: ${COMPLEXITY_LABEL[data.complexity]} Datos: ${data.dataType}, Horas: ${data.hoursSpent}/sem. Baseline mensual: ${baselineMonthly}` }
      ], 
      temperature: 0.1 
    }); 
    const parsed = safeParseJSON(content); 
    if (!parsed) throw new Error('JSON inválido del modelo'); 
    assessment = normalizeAssessment(parsed, data, false); 
  } catch (err) { 
    console.warn(`[ASSESSMENT] Groq fallo (${err.message}). Fallback heuristic.`); 
    usedFallback = true; 
    assessment = normalizeAssessment(heuristicAssessment(data), data, true); 
  } 
  let leadId = null; 
  try { 
    const lead = await Lead.create({ 
      tipo_lead: 'automatizacion', 
      nombre: data.nombre, email: data.email, empresa: data.empresa, telefono: data.telefono, 
      proceso: { processName: data.processName, volume: data.volume, complexity: data.complexity, complexityLabel: COMPLEXITY_LABEL[data.complexity], dataType: data.dataType, hoursSpent: data.hoursSpent, baselineHoursPerMonth: baselineMonthly }, 
      resultado: assessment, 
      fuente: 'automation-assessment', 
      name: data.nombre, company: data.empresa, ts: new Date(), 
    }); 
    leadId = lead._id.toString(); 
  } catch (dbErr) { console.error('[MONGO] Error guardando lead:', dbErr.message); } 
  return res.status(200).json({ ok: true, leadId, assessment }); 
});

// ==========================================
// DEBUG & HEALTH
// ==========================================
app.get('/gov/debug/db', async (req, res) => { 
  try { res.json({ orgs: await Org.find(), companies: await Company.find(), users: await User.find().select('-password -hash') }); } 
  catch (e) { res.status(500).json({ error: e.message }); } 
});

app.get('/gov/debug/collections', async (req, res) => { 
  try { 
    const collections = await mongoose.connection.db.listCollections().toArray(); 
    const result = {}; 
    for (const coll of collections) { 
      const count = await mongoose.connection.db.collection(coll.name).countDocuments(); 
      result[coll.name] = { count }; 
    } 
    res.json({ totalCollections: collections.length, collections: result, dbName: mongoose.connection.name }); 
  } catch (e) { res.status(500).json({ error: e.message }); } 
});

// ==========================================
// CONEXIÓN E INICIO
// ==========================================
let server;
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('[MONGO] Conectado a', mongoose.connection.name);
    
    const email = 'jcrendon@gokulab.mx';
    const pwd = 'CambiarEstaClave2026!'; 
    const hashed = await bcrypt.hash(pwd, 10); 
    let user = await User.findOne({ email }); 
    if (user) { 
      user.password = hashed; user.hash = hashed; user.role = 'superadmin'; user.modules = ['gobernanza', 'automatizacion']; 
      await user.save(); 
    } else { 
      await User.create({ name: 'Juan Carlos Rendón', email, password: hashed, hash: hashed, role: 'superadmin', orgId: '6ad2a21d120d09e1b4aa2137', modules: ['gobernanza', 'automatizacion'] }); 
    } 

    server = app.listen(PORT, () => console.log(`[SERVER] Escuchando en puerto ${PORT}`));
  } catch (err) {
    console.error('[MONGO] Fallo de conexión:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => { 
  if (server) server.close(() => console.log('[SERVER] Cerrado')); 
  await mongoose.connection.close().catch(() => {}); 
  process.exit(0); 
});

startServer();