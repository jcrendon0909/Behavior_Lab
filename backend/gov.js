// backend/gov.js
// Módulo de gobernanza: multi-tenant, JWT, inventario de IA, evaluaciones.
// Se monta en server.js como app.use('/gov', ...)

import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

export function createGovRouter() {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET no configurado. Rutas /gov/* fallarán.");
  }

  // ---------- HELPERS ----------
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
    } catch (e) {
      console.error("⚠️ audit gov falló:", e.message);
    }
  }

  // ============================================
  // AUTH
  // ============================================

  // POST /gov/auth/login
  router.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email y password requeridos" });
    }

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

    res.json({
      token,
      user: {
        email: user.email,
        role: user.role,
        orgId: user.orgId.toString(),
        name: user.name || null
      }
    });
  });

  // GET /gov/auth/me
  router.get("/auth/me", auth(), async (req, res) => {
    res.json({ user: req.user });
  });

  // ============================================
  // ORGANIZACIONES (tenants)
  // ============================================

  // POST /gov/orgs (solo superadmin)
  router.post("/orgs", auth(["superadmin"]), async (req, res) => {
    const { name, sector, plan = "basic" } = req.body;
    if (!name) return res.status(400).json({ error: "name requerido" });

    const doc = {
      name,
      sector: sector || null,
      plan,
      active: true,
      createdAt: new Date(),
      createdBy: req.user.userId
    };
    const result = await db(req).collection("organizations").insertOne(doc);
    await audit(req, "org_create", { orgId: result.insertedId.toString(), name });

    res.json({ _id: result.insertedId, ...doc });
  });

  // GET /gov/orgs (solo superadmin)
  router.get("/orgs", auth(["superadmin"]), async (req, res) => {
    const orgs = await db(req).collection("organizations").find({}).toArray();
    res.json(orgs);
  });

  // GET /gov/orgs/:id
  router.get("/orgs/:id", auth(), async (req, res) => {
    if (req.user.role !== "superadmin" && req.user.orgId !== req.params.id) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    const org = await db(req).collection("organizations").findOne({
      _id: new ObjectId(req.params.id)
    });
    if (!org) return res.status(404).json({ error: "No encontrada" });
    res.json(org);
  });

  // ============================================
  // EMPRESAS (filiales de un grupo)
  // ============================================

  // POST /gov/orgs/:orgId/companies
  router.post("/orgs/:orgId/companies", auth(["superadmin", "admin"]), async (req, res) => {
    const { name, riskProfile } = req.body;
    if (!name) return res.status(400).json({ error: "name requerido" });

    if (req.user.role !== "superadmin" && req.user.orgId !== req.params.orgId) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const doc = {
      orgId: new ObjectId(req.params.orgId),
      name,
      riskProfile: riskProfile || "operacional",
      active: true,
      createdAt: new Date()
    };
    const result = await db(req).collection("companies").insertOne(doc);
    await audit(req, "company_create", {
      orgId: req.params.orgId,
      companyId: result.insertedId.toString(),
      name
    });

    res.json({ _id: result.insertedId, ...doc });
  });

  // GET /gov/orgs/:orgId/companies
  router.get("/orgs/:orgId/companies", auth(), async (req, res) => {
    if (req.user.role !== "superadmin" && req.user.orgId !== req.params.orgId) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    const companies = await db(req).collection("companies")
      .find({ orgId: new ObjectId(req.params.orgId) })
      .toArray();
    res.json(companies);
  });

  // ============================================
  // INVENTARIO DE IA
  // ============================================

  // POST /gov/ai-inventory
  router.post("/ai-inventory", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    const {
      companyId,
      model_name,
      category,
      vendor,
      data_sensitivity = [],
      risk_level = "medio",
      status = "evaluacion",
      description
    } = req.body;

    if (!model_name || !companyId) {
      return res.status(400).json({ error: "model_name y companyId requeridos" });
    }

    // Verificar que la company pertenece a la org del usuario
    const company = await db(req).collection("companies").findOne({
      _id: new ObjectId(companyId)
    });
    if (!company) return res.status(404).json({ error: "Company no encontrada" });
    if (req.user.role !== "superadmin" && company.orgId.toString() !== req.user.orgId) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const doc = {
      orgId: company.orgId,
      companyId: new ObjectId(companyId),
      model_name,
      category: category || "generativo",
      vendor: vendor || null,
      data_sensitivity,
      risk_level,
      status,
      description: description || null,
      evidence: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: req.user.userId
    };

    const result = await db(req).collection("ai_inventory").insertOne(doc);
    await audit(req, "ai_inventory_create", {
      inventoryId: result.insertedId.toString(),
      model_name,
      risk_level
    });

    res.json({ _id: result.insertedId, ...doc });
  });

  // GET /gov/ai-inventory (filtra por org del usuario)
  router.get("/ai-inventory", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin"
      ? {}
      : { orgId: new ObjectId(req.user.orgId) };

    if (req.query.companyId) filter.companyId = new ObjectId(req.query.companyId);
    if (req.query.risk_level) filter.risk_level = req.query.risk_level;
    if (req.query.status) filter.status = req.query.status;

    const items = await db(req).collection("ai_inventory")
      .find(filter)
      .sort({ updatedAt: -1 })
      .toArray();
    res.json(items);
  });

  // ============================================
  // EVALUACIONES DE RIESGO
  // ============================================

  // POST /gov/evaluations
  router.post("/evaluations", auth(["superadmin", "admin", "auditor"]), async (req, res) => {
    const {
      companyId,
      framework,       // "ISO42001", "NIST_RMF", "SaMD", "LFPDPPP"
      answers = {},
      score,
      risk_level,
      recommendations = []
    } = req.body;

    if (!companyId || !framework) {
      return res.status(400).json({ error: "companyId y framework requeridos" });
    }

    const company = await db(req).collection("companies").findOne({
      _id: new ObjectId(companyId)
    });
    if (!company) return res.status(404).json({ error: "Company no encontrada" });
    if (req.user.role !== "superadmin" && company.orgId.toString() !== req.user.orgId) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const doc = {
      orgId: company.orgId,
      companyId: new ObjectId(companyId),
      framework,
      answers,
      score: score ?? null,
      risk_level: risk_level || "medio",
      recommendations,
      createdAt: new Date(),
      createdBy: req.user.userId
    };

    const result = await db(req).collection("risk_evaluations").insertOne(doc);
    await audit(req, "evaluation_create", {
      evaluationId: result.insertedId.toString(),
      framework
    });

    res.json({ _id: result.insertedId, ...doc });
  });

  // GET /gov/evaluations
  router.get("/evaluations", auth(), async (req, res) => {
    const filter = req.user.role === "superadmin"
      ? {}
      : { orgId: new ObjectId(req.user.orgId) };

    if (req.query.companyId) filter.companyId = new ObjectId(req.query.companyId);
    if (req.query.framework) filter.framework = req.query.framework;

    const items = await db(req).collection("risk_evaluations")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    res.json(items);
  });

  // GET /gov/evaluations/:id
  router.get("/evaluations/:id", auth(), async (req, res) => {
    const doc = await db(req).collection("risk_evaluations").findOne({
      _id: new ObjectId(req.params.id)
    });
    if (!doc) return res.status(404).json({ error: "No encontrada" });
    if (req.user.role !== "superadmin" && doc.orgId.toString() !== req.user.orgId) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    res.json(doc);
  });

  return router;
}