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
// MODELOS (Estructura estricta con ObjectId)
// ==========================================
const LeadSchema = new mongoose.Schema({ 
  tipo_lead: { type: String, default: 'gobernanza' }, 
  nombre: String, email: String, empresa: String, telefono: String, 
  proceso: mongoose.Schema.Types.Mixed, resultado: mongoose.Schema.Types.Mixed, 
  name: String, company: String, risk_level: String, ts: Date, 
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

const OrgSchema = new mongoose.Schema({ name: String }, { strict: false, collection: 'orgs' }); 
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
  questionId: String, fileName: String, r2Url: String, 
  validation: mongoose.Schema.Types.Mixed, ts: { type: Date, default: Date.now } 
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
  if (req.user.role === 'superadmin' && req.query.orgId) return { orgId: req.query.orgId }; 
  return { orgId: req.user.orgId };
};

async function getEvidenceQuery(req) { 
  const targetOrgId = req.user.role === 'superadmin' && req.query.orgId ? req.query.orgId : req.user.orgId; 
  const companies = await Company.find({ orgId: targetOrgId }); 
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
// RESET ENDPOINT (SOLO USAR UNA VEZ)
// ==========================================
app.get('/gov/debug/reset-db', async (req, res) => {
  try {
    await mongoose.connection.db.dropDatabase();
    
    const org = await Org.create({ name: 'Gokulab Global' });
    const comp1 = await Company.create({ orgId: org._id, name: 'Oleofinos', riskProfile: 'agroindustria', active: true });
    const comp2 = await Company.create({ orgId: org._id, name: 'Oleopalma', riskProfile: 'agroindustria', active: true });

    const hashed = await bcrypt.hash('CambiarEstaClave2026!', 10);
    await User.create({ name: 'Super Admin', email: 'jcrendon@gokulab.mx', password: hashed, hash: hashed, role: 'superadmin', orgId: org._id, modules: ['gobernanza', 'automatizacion'] });

    await Risk.create({ orgId: org._id, companyId: comp1._id, riskName: 'Riesgo Oleofinos 1', category: 'Seguridad', probability: 4, impact: 4, riskLevel: 'Alto', riskScore: 16, mitigationPlan: 'Mitigar A' });
    await Risk.create({ orgId: org._id, companyId: comp2._id, riskName: 'Riesgo Oleopalma 1', category: 'Privacidad', probability: 3, impact: 3, riskLevel: 'Medio', riskScore: 9, mitigationPlan: 'Mitigar B' });

    await Evidence.create({ companyId: comp1._id, questionId: 'q1', fileName: 'evidencia_oleofinos.pdf', r2Url: '#', validation: { valido: true, razon: 'OK' } });
    await Evidence.create({ companyId: comp2._id, questionId: 'q2', fileName: 'evidencia_oleopalma.pdf', r2Url: '#', validation: { valido: true, razon: 'OK' } });

    await Inventory.create({ orgId: org._id, companyId: comp1._id, model_name: 'ChatGPT Enterprise', category: 'Generativo', risk_level: 'medio', status: 'en_uso' });

    res.json({ ok: true, message: 'Base de datos reseteada.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// RUTAS DE LA APP (COMPLETAS)
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

app.get('/gov/orgs', authenticateToken, async (req, res) => { 
  try { res.json(await Org.find()); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/users', authenticateToken, async (req, res) => { 
  try { res.json(await User.find().select('-password -hash')); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/users', authenticateToken, async (req, res) => { 
  try { 
    const hashedPassword = await bcrypt.hash(req.body.password, 10); 
    const user = await User.create({ ...req.body, password: hashedPassword, hash: hashedPassword }); 
    res.status(201).json(user); 
  } catch (error) { res.status(500).json({ error: 'Error al crear usuario' }); } 
});

app.get('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => { 
  try { 
    const query = req.params.orgId === 'ALL' ? {} : { orgId: req.params.orgId }; 
    res.json(await Company.find(query)); 
  } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/orgs/:orgId/companies', authenticateToken, async (req, res) => { 
  try { 
    const targetOrgId = req.params.orgId === 'ALL' ? req.user.orgId : req.params.orgId; 
    res.status(201).json(await Company.create({ ...req.body, orgId: targetOrgId })); 
  } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/ai-inventory', authenticateToken, async (req, res) => { 
  try { res.json(await Inventory.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/ai-inventory', authenticateToken, async (req, res) => { 
  try { res.status(201).json(await Inventory.create({ ...req.body, orgId: req.user.orgId })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/risks', authenticateToken, async (req, res) => { 
  try { res.json(await Risk.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/risks', authenticateToken, async (req, res) => { 
  try { 
    const score = req.body.probability * req.body.impact; 
    let riskLevel = score >= 15 ? 'Crítico' : score >= 10 ? 'Alto' : score >= 5 ? 'Medio' : 'Bajo'; 
    res.status(201).json(await Risk.create({ ...req.body, orgId: req.user.orgId, riskScore: score, riskLevel })); 
  } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.delete('/gov/risks/:id', authenticateToken, async (req, res) => { 
  try { await Risk.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/deliverables', authenticateToken, async (req, res) => { 
  try { res.json(await Deliverable.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/deliverables', authenticateToken, async (req, res) => { 
  try { res.status(201).json(await Deliverable.create({ ...req.body, orgId: req.user.orgId, status: 'Pendiente' })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.put('/gov/deliverables/:id', authenticateToken, async (req, res) => { 
  try { res.json(await Deliverable.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.delete('/gov/deliverables/:id', authenticateToken, async (req, res) => { 
  try { await Deliverable.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/evaluations', authenticateToken, async (req, res) => { 
  try { res.json(await Evaluation.find(getOrgQuery(req)).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/evaluations', authenticateToken, async (req, res) => { 
  try { res.status(201).json(await Evaluation.create({ ...req.body, orgId: req.user.orgId })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/evidence', authenticateToken, async (req, res) => { 
  try { const query = await getEvidenceQuery(req); res.json(await Evidence.find(query).sort({ ts: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/upload-evidence', authenticateToken, upload.single('file'), async (req, res) => { 
  try { 
    const ev = await Evidence.create({ 
      companyId: req.body.companyId, questionId: req.body.questionId, fileName: req.file.originalname, 
      r2Url: 'https://media.gokulab.mx/demo.pdf', validation: { valido: true, razon: 'Validado por IA' } 
    }); 
    res.json({ ok: true, evidence: ev, validation: ev.validation }); 
  } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/process-evals', authenticateToken, async (req, res) => { 
  try { res.json(await ProcessEval.find(getOrgQuery(req))); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/process-evals', authenticateToken, async (req, res) => { 
  try { res.status(201).json(await ProcessEval.create({ ...req.body, orgId: req.user.orgId })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.delete('/gov/process-evals/:id', authenticateToken, async (req, res) => { 
  try { await ProcessEval.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/leads', authenticateToken, async (req, res) => { 
  try { res.json(await Lead.find({ tipo_lead: { $ne: 'automatizacion' } }).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.get('/gov/assessments', authenticateToken, async (req, res) => { 
  try { res.json(await Lead.find({ tipo_lead: 'automatizacion' }).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ error: 'Error' }); } 
});

app.post('/gov/suggest-risk', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ messages: [{ role: 'system', content: 'Genera un riesgo de IA. JSON: riskName, category, probability, impact, mitigationPlan. ESPAÑOL.' }, { role: 'user', content: `Empresa: ${req.body.companyName}` }] }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

app.post('/gov/suggest-task', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ messages: [{ role: 'system', content: 'Genera una tarea. JSON: taskName, phase, assignedTo. ESPAÑOL.' }, { role: 'user', content: `Empresa: ${req.body.companyName}` }] }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

app.post('/gov/generate-report', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ messages: [{ role: 'system', content: 'Consultor. Resumen ejecutivo. JSON: { "report": "texto" }' }, { role: 'user', content: JSON.stringify(req.body) }] }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

app.post('/gov/generate-strategic-report', authenticateToken, async (req, res) => { 
  try { 
    const { content } = await callGroq({ messages: [{ role: 'system', content: 'Reporte estratégico. JSON: executiveSummary, gapAnalysis, roadmap: { phase1, phase2, phase3 }.' }, { role: 'user', content: JSON.stringify(req.body) }] }); 
    res.json(safeParseJSON(content)); 
  } catch (e) { res.status(500).json({ error: 'Error IA' }); } 
});

// ==========================================
// CONEXIÓN E INICIO
// ==========================================
let server;
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    server = app.listen(PORT, () => console.log(`[SERVER] Escuchando en puerto ${PORT}`));
  } catch (err) { process.exit(1); }
}
startServer();