import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import fetch from "node-fetch";
import cors from "cors";

console.log("¿EXISTE .env?:", fs.existsSync(".env"));
dotenv.config();

const app = express();
app.use(express.json());

// Configurar CORS
app.use(cors({
  origin: [
    'https://behaviorlab.gokulab.mx',
    'https://api.gokulab.mx',
    'https://gokulab.mx',
    'https://behavior-lab.onrender.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// ---------- API KEYS Y ROTACIÓN ----------
const GROQ_KEYS = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5
].filter(Boolean);

if (GROQ_KEYS.length === 0) {
  console.error("❌ No hay API keys cargadas");
}
console.log(`🔑 Keys cargadas: ${GROQ_KEYS.length} de 5`);

let currentKeyIndex = 0;
function getNextKey() {
  const key = GROQ_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
  return key;
}

// ---------- MEMORIA DE CONVERSACIÓN ----------
const conversationHistory = {}; // { userId: [ { role, content }, ... ] }

function getConversationHistory(userId) {
  if (!conversationHistory[userId]) {
    conversationHistory[userId] = [];
  }
  return conversationHistory[userId];
}

function addToConversationHistory(userId, role, content) {
  const history = getConversationHistory(userId);
  history.push({ role, content });
  // Limitar a 10 mensajes (5 turnos) para no exceder contexto
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
}

// ---------- MODOS (prompt estructurado) ----------
const MODES = {
  default: `
Eres el asistente virtual de BehaviorLab, una consultora de IA empresarial con sede en México.

**Reglas de respuesta:**
- Responde en **máximo 3 oraciones**.
- Sé directo, profesional y evita repetir información.
- Si no sabes algo, sugiere contactar al equipo de BehaviorLab.

**Información clave sobre BehaviorLab (organizada por temas):**

1. ¿QUIÉNES SOMOS?
   - Somos una consultora de IA con sede en México.
   - Diseñamos agentes de IA personalizados para empresas medianas y grandes.
   - Sectores: seguros, servicios financieros, retail, logística y gobierno.

2. ¿QUÉ SERVICIOS OFRECEMOS?
   - Automatización de atención al cliente (chatbots y asistentes 24/7).
   - Inteligencia comercial y soporte operativo (análisis de datos en tiempo real).
   - Procesamiento de documentos (extracción y clasificación automática).
   - Soporte a la toma de decisiones (recomendaciones basadas en datos).
   - Integración con sistemas existentes vía API (CRM, ERP, core).

3. ¿CUÁL ES NUESTRA METODOLOGÍA?
   - Paso 1: Diagnóstico y priorización del caso de uso.
   - Paso 2: Diseño y construcción del agente a la medida.
   - Paso 3: Entrenamiento con datos y lógica de negocio reales.
   - Paso 4: Integración y pruebas con tus sistemas.
   - Paso 5: Despliegue, monitoreo y mejora continua.

4. ¿QUÉ NOS DIFERENCIA?
   - Agentes a medida (no software genérico).
   - Despliegue rápido (en semanas).
   - Integración sin fricciones.
   - ROI medible y verificable (reducción de costos operativos 30-60%).

5. ¿QUÉ HACEMOS EN TÉRMINOS DE GOBERNABILIDAD Y CIBERSEGURIDAD?
   - Protegemos cada etapa del ciclo de vida del agente.
   - Aseguramos autenticación, cifrado y control de acceso.
   - Monitoreamos y auditamos el desempeño del agente.
   - Cumplimos con estándares de seguridad y privacidad.

**Instrucción final:** Usa la información anterior para responder preguntas. Si el usuario pregunta algo que no está cubierto, indícalo con honestidad y sugiere contactar al equipo.
`,

  creatividad: `
Eres un experto en creatividad empresarial aplicada a IA.
Responde en máximo 3 oraciones, con ideas innovadoras y prácticas.
`,

  emociones: `
Eres un consultor de IA con enfoque en experiencia de usuario y adopción tecnológica.
Responde en máximo 3 oraciones, con empatía y claridad.
`,

  storytelling: `
Eres un experto en narrativa empresarial y casos de éxito.
Responde en máximo 3 oraciones, contando historias breves y convincentes.
`
};

// ---------- FUNCIÓN PARA LLAMAR A GROQ ----------
async function callGroq(messages) {
  let attempts = 0;
  let data = null;

  while (attempts < GROQ_KEYS.length) {
    const apiKey = getNextKey();
    console.log(`🔄 Intento ${attempts + 1}`);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 120,        // Limita la respuesta a ~120 palabras
        temperature: 0.3        // Respuestas más directas y predecibles
      })
    });

    if (!response.ok) {
      console.log("⚠️ HTTP Error:", response.status);
      attempts++;
      continue;
    }
    data = await response.json();

    if (!data.error) {
      console.log("✅ Respuesta OK");
      return data.choices?.[0]?.message?.content;
    }

    console.log("⚠️ Error con key:", data.error.message);
    attempts++;
  }

  throw new Error("❌ Todas las API keys fallaron");
}

// ---------- ENDPOINTS ----------
app.get('/', (req, res) => {
  res.send('Behavior Lab API running 🚀');
});

app.get('/chat', (req, res) => {
  res.send('Este endpoint usa POST. Usa Postman o frontend.');
});

// 🚀 Endpoint principal con memoria de conversación
app.post("/chat", async (req, res) => {
  try {
    const { message, mode = "default", multiAgent = false, userId = "defaultUser" } = req.body;

    if (!message) {
      return res.json({ reply: "❌ Falta 'message'" });
    }

    // Si multiAgent está activado (no se usa en este flujo, pero lo dejamos)
    if (multiAgent) {
      // Podrías implementar runMultiAgent si lo necesitas
      const reply = "Función multi-agente no implementada en esta versión.";
      return res.json({ reply });
    }

    // Obtener historial del usuario
    const history = getConversationHistory(userId);

    // Construir mensajes: system prompt + historial + nuevo mensaje
    const systemPrompt = MODES[mode] || MODES.default;
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ];

    // Llamar a Groq con el historial
    const reply = await callGroq(messages);

    // Guardar el nuevo mensaje y la respuesta en el historial
    addToConversationHistory(userId, "user", message);
    addToConversationHistory(userId, "assistant", reply);

    res.json({ reply });

  } catch (error) {
    console.error("❌ Error en /chat:", error.message);
    res.json({ reply: error.message || "❌ Error en el servidor" });
  }
});

// ---------- INICIAR SERVIDOR ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});