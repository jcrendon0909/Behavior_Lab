// backend/gov.js
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

export function createGovRouter() {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET;

  function db(req) {
    if (!req.db) throw new Error("DB no conectada");
    return req.db;
  }

  function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
  }

  function auth(roles = []) {
    return (req, res, next) => {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Token requerido" });
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (roles.length && !roles.includes(payload.role)) {
          return res.status(403).json({ error: "Sin permisos" });
        }
        req.user = payload;
        next();
      } catch (e) {
        return res.status(401).json({ error: "Token inválido o expirado" });
      }
    };
  }

  async function audit(req, action, payload = {}) {
    try {
      await db(req).collection("audit_logs").insertOne({
        ts: new Date(),
        type: "gov_" + action,
        userId: req.user?.userId || null,
        orgId: req.user?.orgId || null,
        ip: req.ip,
        ...payload
      });
    } catch (e) {}
  }

  // ============================================
  // AUTH
  // ============================================
  router.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email y password requeridos" });

    const user = await db(req).collection("users").findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = signToken({
      userId: user._id.toString(),
      orgId: user.orgId.toString(),
      role: user.role,
      email: user.email
    });

    await audit(req, "login", { email: user.email });
    res.json({ token, user: { email: user.email, role: user.role, orgId: user.orgId.toString(), name: user.name || null } });
  });

  router.get("/auth/me", auth(), async (req, res) => {
    res.json({ user: req.user });
  });

  // ============================================
  // ORGANIZACIONES Y EMPRESAS
  // ============================================
  router.post("/orgs", auth(["superadmin"]), async (req, res) => {
    const { name, sector, plan = "basic" } = req.body;
    const doc = { name, sector: sector || null, plan, active: true, createdAt: new Date(), createdBy: req.user.userId };
    const result = await db(req).collection("organizations").insertOne(doc);
    await audit(req, "org_create", { orgId: result.insertedId.toString(), name });
    res.json({ _id: result.insertedId, ...doc });
  });

  router.get("/orgs", auth(["superadmin"]), async (req, res) => {
    const orgs = await db(req).collection("organizations").find({}).toArray();
    res.json(orgs);
  });

  router.post("/orgs/:orgId/companies", auth(["superadmin", "admin"]), async (req, res) => {
    const { name, riskProfile } = req.body;
    if (req.user.role !== "superadmin" && req.user.orgId !== req.params.orgId) return res.status(403).json({ error: "Sin permisos" });
    const doc = { orgId: new ObjectId(req.params.orgId), name, riskProfile: riskProfile || "operacional", active: true, createdAt: new Date() };
    const result = await db(req).collection("companies").insertOne(doc);
    await audit(req, "company_create", { orgId: req.params.orgId, name });
    res.json({ _id: result.insertedId, ...doc });
  });

  router.get("/orgs/:orgId/companies", auth(), async (req, res) => {
    if (req.user.role !== "superadmin" && req.user.orgId !== req.params.orgId) return res.status(403).json({ error: "Sin permisos" });
    const companies = await db(req).collection("companies").find({ orgId: new ObjectId(req.params.orgId) }).toArray();
    res.json(companies);
  });

  // ============================================
  // GESTIÓN DE USUARIOS (NUEVO)
  // ============================================
  router.post("/users", auth(["superadmin", "admin"]), async (req, res) => {
    const { name, email, password, role, orgId } = req.body;
    
    if (!email || !password || !role || !orgId) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    if (req.user.role !== "superadmin" && req.user.orgId !== orgId) {
      return res.status(403).json({ error: "Solo puedes crear usuarios para tu propia organización" });
    }

    const existing = await db(req).collection("users").findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: "El correo ya está registrado" });

    const hash = await bcrypt.hash(password, 12);
    const doc = {
      name, email: email.toLowerCase(), hash, role,
      orgId: new ObjectId(orgId), active: true, createdAt: new Date()
    };

    const result = await db(req).collection("users").insertOne(doc);
    await audit(req, "user_create", { newUserId: result.insertedId.toString(), email, role });
    res.json({ ok: true, _id: result.insertedId });
  });

  router.get("/users", auth(["superadmin", "admin"]), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    const users = await db(req).collection("users").find(filter, { projection: { hash: 0 } }).toArray();
    res.json(users);
  });

  // ============================================
  // INVENTARIO Y EVALUACIONES
  // ============================================
  router.post("/ai-inventory", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    const { companyId, model_name, category, vendor, data_sensitivity = [], risk_level = "medio", status = "evaluacion", description } = req.body;
    const company = await db(req).collection("companies").findOne({ _id: new ObjectId(companyId) });
    if (!company) return res.status(404).json({ error: "Company no encontrada" });
    if (req.user.role !== "superadmin" && company.orgId.toString() !== req.user.orgId) return res.status(403).json({ error: "Sin permisos" });

    const doc = {
      orgId: company.orgId, companyId: new ObjectId(companyId),
      model_name, category: category || "generativo", vendor: vendor || null,
      data_sensitivity, risk_level, status, description: description || null,
      evidence: [], createdAt: new Date(), updatedAt: new Date(), createdBy: req.user.userId
    };
    const result = await db(req).collection("ai_inventory").insertOne(doc);
    await audit(req, "ai_inventory_create", { inventoryId: result.insertedId.toString(), model_name });
    res.json({ _id: result.insertedId, ...doc });
  });

  router.get("/ai-inventory", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    if (req.query.companyId) filter.companyId = new ObjectId(req.query.companyId);
    const items = await db(req).collection("ai_inventory").find(filter).sort({ updatedAt: -1 }).toArray();
    res.json(items);
  });

  router.post("/evaluations", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    const { companyId, framework, answers, score, risk_level, recommendations } = req.body;
    const company = await db(req).collection("companies").findOne({ _id: new ObjectId(companyId) });
    if (!company) return res.status(404).json({ error: "Company no encontrada" });
    if (req.user.role !== "superadmin" && company.orgId.toString() !== req.user.orgId) return res.status(403).json({ error: "Sin permisos" });

    const doc = {
      orgId: company.orgId, companyId: new ObjectId(companyId),
      framework, answers, score: score ?? null, risk_level: risk_level || "medio", recommendations,
      createdAt: new Date(), createdBy: req.user.userId
    };
    const result = await db(req).collection("risk_evaluations").insertOne(doc);
    await audit(req, "evaluation_create", { evaluationId: result.insertedId.toString(), framework });
    res.json({ _id: result.insertedId, ...doc });
  });

  router.get("/evaluations", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin" ? {} : { orgId: new ObjectId(req.user.orgId) };
    const items = await db(req).collection("risk_evaluations").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(items);
  });

  return router;
}