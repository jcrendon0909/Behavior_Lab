// backend/scripts/seed.js
// Script de inicialización. Correr UNA SOLA VEZ.
// Uso: node scripts/seed.js

import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

dotenv.config({ path: "../.env" });
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI no configurada. Revisa backend/.env");
  process.exit(1);
}

const SUPERADMIN_EMAIL = process.argv[2] || "jcrendon@gokulab.mx";
const SUPERADMIN_PASSWORD = process.argv[3] || "CambiarEstaClave2026!";

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log("✅ Conectado a MongoDB");

  // 1. Crear índice único en users.email
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  console.log("✅ Índice único en users.email");

  // 2. Crear la organización GōkuLab (platform owner)
  let gokuOrg = await db.collection("organizations").findOne({ name: "GōkuLab" });
  if (!gokuOrg) {
    const result = await db.collection("organizations").insertOne({
      name: "GōkuLab",
      sector: "consultoria_ia",
      plan: "internal",
      active: true,
      createdAt: new Date()
    });
    gokuOrg = { _id: result.insertedId, name: "GōkuLab" };
    console.log("✅ Organización GōkuLab creada:", gokuOrg._id.toString());
  } else {
    console.log("ℹ️  Organización GōkuLab ya existe");
  }

  // 3. Crear superadmin
  const existing = await db.collection("users").findOne({ email: SUPERADMIN_EMAIL });
  if (existing) {
    console.log(`ℹ️  Usuario ${SUPERADMIN_EMAIL} ya existe. No se hizo nada.`);
  } else {
    const hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);
    await db.collection("users").insertOne({
      email: SUPERADMIN_EMAIL,
      hash,
      name: "Juan Carlos Rendón",
      role: "superadmin",
      orgId: gokuOrg._id,
      active: true,
      createdAt: new Date()
    });
    console.log("✅ Superadmin creado:");
    console.log(`   Email:    ${SUPERADMIN_EMAIL}`);
    console.log(`   Password: ${SUPERADMIN_PASSWORD}`);
    console.log("   ⚠️  Cambia la contraseña tras el primer login.");
  }

  await client.close();
  console.log("\n🎉 Seed completado.");
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});