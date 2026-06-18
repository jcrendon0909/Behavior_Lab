import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import fetch from "node-fetch";
import cors from "cors";

console.log("¿EXISTE .env?:", fs.existsSync(".env"));
dotenv.config();

const app = express();
app.use(express.json());

// Configurar CORS para permitir solo tus dominios
app.use(cors({
  origin: [
    'https://behaviorlab.gokulab.mx',
    'https://api.gokulab.mx',
    'https://gokulab.mx',
    'https://behavior-lab.onrender.com',
    'http://localhost:3000'   // Para pruebas locales
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// 🔑 Cargar múltiples keys
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

// 🔄 Rotación de keys
let currentKeyIndex = 0;

function getNextKey() {
  const key = GROQ_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
  return key;
}

// 🧠 MODOS (Behavior Lab)
// 🧠 MODOS (BehaviorLab)
const MODES = {
  default: `
Eres el asistente virtual de BehaviorLab, una consultora de inteligencia artificial empresarial con sede en México.

**Quiénes somos**  
Diseñamos agentes de IA personalizados para empresas medianas y grandes. Nos especializamos en los sectores de seguros, servicios financieros, retail, logística y gobierno. Somos el socio integral desde el descubrimiento hasta la mejora continua.

**Qué hacemos**  
Ofrecemos cinco líneas de solución:
1. Automatización de atención al cliente: agentes conversacionales que entienden, clasifican y resuelven solicitudes 24/7.
2. Inteligencia comercial y soporte operativo: analizamos datos en tiempo real para optimizar decisiones.
3. Procesamiento de documentos: extraemos, clasificamos y validamos información de documentos estructurados y no estructurados.
4. Soporte a la toma de decisiones: proporcionamos recomendaciones basadas en datos para ejecutivos y equipos operativos.
5. Integración con sistemas existentes: conectamos vía API con CRM, ERP, core de negocio y repositorios internos.

**¿Qué problemas resolvemos?**  
Las organizaciones suelen enfrentar procesos fragmentados, dependencia de tareas manuales, respuestas inconsistentes entre canales, costos operativos crecientes y baja trazabilidad. Nuestros agentes transforman esta realidad hacia una operación estandarizada, rápida, escalable y con información en tiempo real para decidir mejor.

**Arquitectura de la solución**  
Nuestros agentes operan sobre una arquitectura por capas:
- Canales de entrada (web, app, WhatsApp, correo, call center).
- Agente de IA (comprensión, clasificación, respuesta y resolución).
- Orquestación (reglas, flujos, prioridades y escalamiento).
- Integración vía API con sistemas del cliente.
- Analítica, monitoreo y supervisión humana para mejora continua.

**Nuestra metodología de construcción**  
1. Diagnóstico y priorización del caso de uso.
2. Diseño y construcción del agente a la medida.
3. Entrenamiento con flujos y lógica real del negocio.
4. Integración y pruebas.
5. Despliegue, monitoreo y mejora continua.

**Lanzamiento y soporte**  
Realizamos lanzamientos controlados por fases, monitoreamos desempeño y calidad, ajustamos reglas, prompts e integraciones, y ofrecemos soporte continuo con asesoría estratégica para evolucionar hacia nuevos casos de uso.

**Nuestro diferencial**  
- Agentes a medida, no software genérico.
- Despliegue en tiempos razonables.
- Integración sin fricciones con tus sistemas.
- ROI medible y verificable (reducción de costos operativos entre 30% y 60%, mejora en calidad y velocidad).

Tu tono debe ser profesional, cercano y orientado a resultados. Habla en español claro y conciso. Si el usuario pregunta algo que no está cubierto en esta información, indícalo con honestidad y sugiere contactar al equipo de BehaviorLab para más detalles.
`,

  creatividad: `
Eres un experto en creatividad empresarial aplicada a la IA.
Generas ideas innovadoras para optimizar procesos, mejorar la experiencia del cliente y crear nuevas oportunidades de negocio mediante agentes inteligentes.
`,

  emociones: `
Eres un consultor de IA con enfoque en la experiencia del usuario y la adopción tecnológica.
Ayudas a entender cómo los agentes de IA pueden mejorar la satisfacción de clientes, empleados y stakeholders, y cómo gestionar el cambio cultural en la organización.
`,

  storytelling: `
Eres un experto en narrativa empresarial y casos de éxito.
Creas historias convincentes sobre transformación digital, automatización de procesos y el valor que BehaviorLab aporta a las organizaciones.
`
};

// 🤖 Función para llamar al modelo (con retry por keys)
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
        messages
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

// 🤖 MULTI-AGENTE
async function runMultiAgent(userMessage) {
  const creativo = await callGroq([
    { role: "system", content: "Eres creativo para niños" },
    { role: "user", content: userMessage }
  ]);

  const psicologo = await callGroq([
    { role: "system", content: "Eres psicólogo infantil" },
    { role: "user", content: userMessage }
  ]);

  const final = await callGroq([
    {
      role: "system",
      content: "Eres un coordinador que combina ideas en una actividad clara"
    },
    {
      role: "user",
      content: `
Usuario: ${userMessage}

Creativo: ${creativo}
Psicologo: ${psicologo}

Combina todo en una actividad práctica.
`
    }
  ]);

  return final;
}

// 🏠 Ruta base (health check)
app.get('/', (req, res) => {
  res.send('Behavior Lab API running 🚀');
});

// 🧪 GET para probar en navegador
app.get('/chat', (req, res) => {
  res.send('Este endpoint usa POST. Usa Postman o frontend.');
});

// 🚀 Endpoint principal
app.post("/chat", async (req, res) => {
  try {
    const { message, mode = "default", multiAgent = false } = req.body;

    if (!message) {
      return res.json({ reply: "❌ Falta 'message'" });
    }

    // 🧠 Multi-agente activado
    if (multiAgent) {
      const reply = await runMultiAgent(message);
      return res.json({ reply });
    }

    // 🧪 Modo Behavior Lab
    const systemPrompt = MODES[mode] || MODES.default;

    const reply = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ]);

    res.json({ reply });

  } catch (error) {
    console.error("❌ Error en /chat:", error.message);
    res.json({ reply: error.message || "❌ Error en el servidor" });
  }
});

// 🔥 Servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});