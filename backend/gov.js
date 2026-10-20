// backend/gov.js
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

export function createGovRouter() {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET;

  function db(req) { return req.db; }
  function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" }); }

  function auth(roles = []) {
    return (req, res, next) => {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Token requerido" });
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (roles.length && !roles.includes(payload.role)) return res.status(403).json({ error: "Sin permisos" });
        req.user = payload; next();
      } catch (e) { return res.status(401).json({ error: "Token inválido" }); }
    };
  }

  async function audit(req, action, payload = {}) {
    try { await db(req).collection("audit_logs").insertOne({ ts: new Date(), type: "gov_" + action, userId: req.user?.userId, orgId: req.user?.orgId, ...payload }); } catch (e) {}
  }

  router.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await db(req).collection("users").findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.hash))) return res.status(401).json({ error: "Credenciales inválidas" });
    const token = signToken({ userId: user._id.toString(), orgId: user.orgId.toString(), role: user.role, email: user.email });
    res.json({ token, user: { email: user.email, role: user.role, orgId: user.orgId.toString(), name: user.name || null } });
  });

  router.get("/auth/me", auth(), (req, res) => res.json({ user: req.user }));

  router.post("/orgs", auth(["superadmin"]), async (req, res) => {
    const doc = { name: req.body.name, sector: req.body.sector || null, plan: "basic", active: true, createdAt: new Date() };
    const result = await db(req).collection("organizations").insertOne(doc);
    res.json({ _id: result.insertedId, ...doc });
  });

  router.get("/orgs", auth(["superadmin"]), async (req, res) => res.json(await db(req).collection("organizations").find({}).toArray()));

  router.post("/orgs/:orgId/companies", auth(["superadmin", "admin"]), async (req, res) => {
    if (req.user.role !== "superadmin" && req.user.orgId !== req.params.orgId) return res.status(403).json({ error: "Sin permisos" });
    const doc = { orgId: new ObjectId(req.params.orgId), name: req.body.name, riskProfile: req.body.riskProfile || "operacional", active: true, createdAt: new Date() };
    const result = await db(req).collection("companies").insertOne(doc);
    res.json({ _id: result.insertedId, ...doc });
  });

  router.get("/orgs/:orgId/companies", auth(), async (req, res) => {
    if (req.user.role !== "superadmin" && req.user.orgId !== req.params.orgId) return res.status(403).json({ error: "Sin permisos" });
    res.json(await db(req).collection("companies").find({ orgId: new ObjectId(req.params.orgId) }).toArray());
  });

  router.post("/users", auth(["superadmin", "admin"]), async (req, res) => {
    try {
      const { name, email, password, role, orgId } = req.body;
      if (req.user.role !== "superadmin" && req.user.orgId !== orgId) return res.status(403).json({ error: "Sin permisos" });
      const existing = await db(req).collection("users").findOne({ email: email.toLowerCase() });
      if (existing) return res.status(400).json({ error: "El correo ya está registrado" });
      const hash = await bcrypt.hash(password, 12);
      const doc = { name, email: email.toLowerCase(), hash, role, orgId: new ObjectId(orgId), active: true, createdAt: new Date() };
      const result = await db(req).collection("users").insertOne(doc);
      res.json({ ok: true, _id: result.insertedId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get("/users", auth(["superadmin", "admin"]), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    res.json(await db(req).collection("users").find(filter, { projection: { hash: 0 } }).toArray());
  });

  router.post("/ai-inventory", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    try {
      const { companyId, model_name, category, vendor, data_sensitivity = [], risk_level = "medio", status = "evaluacion", description } = req.body;
      const company = await db(req).collection("companies").findOne({ _id: new ObjectId(companyId) });
      if (!company) return res.status(404).json({ error: "Company no encontrada" });
      if (req.user.role !== "superadmin" && company.orgId.toString() !== req.user.orgId) return res.status(403).json({ error: "Sin permisos" });
      const doc = { orgId: company.orgId, companyId: new ObjectId(companyId), model_name, category, vendor: vendor || null, data_sensitivity, risk_level, status, description, createdAt: new Date(), updatedAt: new Date(), createdBy: req.user.userId };
      const result = await db(req).collection("ai_inventory").insertOne(doc);
      res.json({ _id: result.insertedId, ...doc });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.get("/ai-inventory", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    res.json(await db(req).collection("ai_inventory").find(filter).sort({ updatedAt: -1 }).toArray());
  });

  router.post("/evaluations", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    try {
      const { companyId, framework, answers, score, risk_level, recommendations } = req.body;
      const company = await db(req).collection("companies").findOne({ _id: new ObjectId(companyId) });
      if (!company) return res.status(404).json({ error: "Company no encontrada" });
      if (req.user.role !== "superadmin" && company.orgId.toString() !== req.user.orgId) return res.status(403).json({ error: "Sin permisos" });
      const doc = { orgId: company.orgId, companyId: new ObjectId(companyId), framework, answers, score, risk_level, recommendations, createdAt: new Date(), createdBy: req.user.userId };
      const result = await db(req).collection("risk_evaluations").insertOne(doc);
      res.json({ _id: result.insertedId, ...doc });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.get("/evaluations", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    res.json(await db(req).collection("risk_evaluations").find(filter).sort({ createdAt: -1 }).toArray());
  });

  router.get("/evidence", auth(), async (req, res) => {
    let filter = {};
    if (req.user.role !== "superadmin") {
      const companies = await db(req).collection("companies").find({ orgId: new ObjectId(req.user.orgId) }).toArray();
      filter = { companyId: { $in: companies.map(c => c._id.toString()) } };
    }
    res.json(await db(req).collection("evidence").find(filter).sort({ ts: -1 }).toArray());
  });

  router.get("/deliverables", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    res.json(await db(req).collection("deliverables").find(filter).sort({ createdAt: -1 }).toArray());
  });

  router.post("/deliverables", auth(["superadmin", "admin"]), async (req, res) => {
    try {
      const { orgId, taskName, phase, assignedTo, dueDate } = req.body;
      if (!orgId || !taskName) return res.status(400).json({ error: "Falta orgId o taskName" });
      if (req.user.role !== "superadmin" && req.user.orgId !== orgId) return res.status(403).json({ error: "Sin permisos" });
      const doc = { orgId: new ObjectId(orgId), taskName, phase: phase || "Fase 1: Diagnóstico", assignedTo: assignedTo || "Equipo BehAvIorLab", dueDate: dueDate || null, status: "Pendiente", createdAt: new Date() };
      const result = await db(req).collection("deliverables").insertOne(doc);
      res.json({ ok: true, _id: result.insertedId, ...doc });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.put("/deliverables/:id", auth(["superadmin", "admin"]), async (req, res) => {
    await db(req).collection("deliverables").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: req.body.status } });
    res.json({ ok: true });
  });

  router.delete("/deliverables/:id", auth(["superadmin", "admin"]), async (req, res) => {
    await db(req).collection("deliverables").deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  });

  router.get("/risks", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    res.json(await db(req).collection("risks").find(filter).sort({ createdAt: -1 }).toArray());
  });

  router.post("/risks", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    try {
      const { orgId, companyId, riskName, category, probability, impact, mitigationPlan } = req.body;
      if (!orgId || !riskName) return res.status(400).json({ error: "Falta orgId o riskName" });
      if (req.user.role !== "superadmin" && req.user.orgId !== orgId) return res.status(403).json({ error: "Sin permisos" });
      
      const riskScore = probability * impact;
      let riskLevel = "Bajo";
      if (riskScore >= 15) riskLevel = "Crítico";
      else if (riskScore >= 8) riskLevel = "Alto";
      else if (riskScore >= 4) riskLevel = "Medio";

      const doc = { 
        orgId: new ObjectId(orgId), 
        companyId: companyId ? new ObjectId(companyId) : null,
        riskName, 
        category: category || "Operacional", 
        probability, 
        impact, 
        riskScore,
        riskLevel,
        mitigationPlan: mitigationPlan || "Pendiente de definir",
        status: "Abierto",
        createdAt: new Date(),
        createdBy: req.user.userId
      };
      const result = await db(req).collection("risks").insertOne(doc);
      res.json({ ok: true, _id: result.insertedId, ...doc });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.delete("/risks/:id", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    await db(req).collection("risks").deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  });

  return router;
}