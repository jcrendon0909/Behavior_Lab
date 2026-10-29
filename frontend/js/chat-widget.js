// ================================================================
// CHAT WIDGET — BEHAVIORLAB v2.2
// Hybrid: menú guiado + flujos + intent router + Groq backend
// Backend: POST /api/public/chat (Render + Groq 5 keys)
// ================================================================

(function() {
  'use strict';

  const API_URL = 'https://behavior-lab.onrender.com/api/public/chat';
  const PRIMARY = '#2563EB';
  const SECONDARY = '#7C3AED';
  const GLOW_COLOR = 'rgba(37, 99, 235, 0.5)';

  let userId = localStorage.getItem('behaviorlab_userId');
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('behaviorlab_userId', userId);
  }

  // Historial de conversación (solo para contexto de Groq)
  let conversationHistory = [];

  const state = {
    mode: 'menu',
    flow: null,
    step: 0,
    collected: {},
    isOpen: false,
    hasGreeted: false,
    freeModeCount: 0
  };

  // ============================================================
  // FLUJOS GUIADOS
  // ============================================================
  const FLOWS = {
    gov: {
      label: '🛡️ Gobernanza de IA',
      steps: [
        { id: 'empleados', message: 'Perfecto. Gobernanza es el punto de partida correcto para la mayoría de empresas. ¿Cuántos empleados tiene tu empresa?',
          options: [{ label: '50 a 200', value: '50-200' }, { label: '200 a 500', value: '200-500' }, { label: '500 a 1,000', value: '500-1000' }, { label: 'Más de 1,000', value: '1000+' }] },
        { id: 'uso_ia', message: '¿Cómo usan hoy la IA en la empresa?',
          options: [{ label: 'No la usamos todavía', value: 'no_usa' }, { label: 'Sí, libremente (sin política)', value: 'libre' }, { label: 'Sí, con guías informales', value: 'guiado' }, { label: 'Sí, con política formal', value: 'regulado' }] },
        { id: 'cliente_pidio', message: 'Última pregunta. ¿Algún cliente enterprise ya les pidió información sobre su uso de IA en una auditoría?',
          options: [{ label: 'Sí, ya pasó', value: true }, { label: 'Todavía no, pero podría pasar', value: false }] }
      ],
      onComplete: (collected) => {
        handoffToWizard('readiness', { empleados: collected.empleados, uso_ia: collected.uso_ia, cliente_pidio_evidencia: collected.cliente_pidio }, 'Te pre-llené el diagnóstico AIGOS™. Solo confirma 3 datos y sigue →');
      }
    },
    auto: {
      label: '⚙️ Automatización',
      steps: [
        { id: 'proceso', message: 'La automatización tiene el ROI más claro y rápido. ¿Cuál es el proceso que más les duele hoy?',
          options: [{ label: '💰 Facturación / conciliación', value: 'Facturación y conciliación de pagos' }, { label: '📞 Atención a clientes', value: 'Atención a clientes' }, { label: '📄 Procesamiento de documentos', value: 'Procesamiento de documentos' }, { label: '✏️ Otro proceso', value: 'Otro' }] },
        { id: 'volumen', message: '¿Cuántas transacciones o tickets al mes manejan en ese proceso?',
          options: [{ label: 'Menos de 200', value: 100 }, { label: '200 a 500', value: 350 }, { label: '500 a 1,000', value: 750 }, { label: 'Más de 1,000', value: 1500 }] }
      ],
      onComplete: (collected) => {
        handoffToWizard('assessment', { processName: collected.proceso, volume: collected.volumen }, 'Te pre-llené el ROI Scan. Solo confirma y obtén tu estimación →');
      }
    },
    agent: {
      label: '🤖 Agente de IA',
      steps: [
        { id: 'tipo', message: 'Perfecto. ¿Qué tipo de agente necesitas?',
          options: [{ label: '💬 Atención al cliente 24/7', value: 'atencion' }, { label: '📄 Procesar documentos masivamente', value: 'docs' }, { label: '🧠 Soporte a decisiones ejecutivas', value: 'decision' }, { label: '🛠️ Otro / no estoy seguro', value: 'otro' }] },
        { id: 'empresa', message: 'Última pregunta. ¿Cuál es el nombre de tu empresa? (o escribe "omitir" para no decirlo)', options: null, allowFreeInput: true }
      ],
      onComplete: (collected) => {
        addInlineCTA({
          icon: '🤖',
          title: 'Listo para Agent Discovery',
          message: `Un consultor de BehaviorLab puede diseñar el agente de ${collected.tipo === 'atencion' ? 'atención al cliente' : collected.tipo === 'docs' ? 'procesamiento documental' : collected.tipo === 'decision' ? 'soporte a decisiones' : 'tu operación'} en 6-8 semanas.`,
          ctaText: '📞 Agendar llamada de 30 min',
          ctaAction: () => scrollTo('#contacto')
        });
      }
    },
    nose: {
      label: '🤔 No sé por dónde empezar',
      steps: [
        { id: 'dolor', message: 'Sin problema. Cuéntame, ¿cuál de estos te suena más familiar?',
          options: [
            { label: '😱 Mi gente usa ChatGPT sin control', value: 'gov' },
            { label: '📋 Mi cliente me pide evidencia de IA', value: 'gov' },
            { label: '🐌 Tengo procesos manuales caros', value: 'auto' },
            { label: '🤷 Quiero empezar pero no sé cómo', value: 'discover' }
          ] }
      ],
      onComplete: (collected) => {
        if (collected.dolor === 'discover') handoffToWizard('five-q', {}, 'Te llevé al diagnóstico de 5 preguntas. Toma 60 segundos →');
        else startFlow(collected.dolor);
      }
    }
  };

  // ============================================================
  // INTENT ROUTER (responde sin backend)
  // ============================================================
  const INTENTS = [
    { keywords: ['precio', 'cuesta', 'cuánto', 'cuanto', 'tarifa', 'inversión', 'inversion', 'costo'],
      response: 'Nuestros productos van desde $40,000 MXN (Executive Briefing) hasta $850,000 MXN (Transformación completa). Cada uno se contrata por separado — no hay programa obligatorio. El diagnóstico es gratuito y te dice por dónde empezar.',
      ctaText: '🎯 Hacer diagnóstico gratuito', ctaAction: () => scrollTo('#five-q') },
    { keywords: ['servicio', 'servicios', 'producto', 'productos', 'ofrecen', 'proveen', 'qué hacen', 'que hacen', 'qué venden', 'que venden'],
      response: 'Tenemos 3 pilares: 🛡️ AI Governance (Assessment AIGOS™ + políticas + comité), ⚙️ AI Automation (ROI Scan + rediseño de procesos) y 🤖 AI Agents (agentes en producción sobre tus sistemas). Cada uno se contrata por separado, con gobernanza incluida desde el día 1.',
      ctaText: '📖 Ver las 3 rutas', ctaAction: () => scrollTo('#rutas') },
    { keywords: ['capacitacion', 'capacitación', 'academy', 'curso', 'entrenamiento', 'formación', 'formacion'],
      response: 'La formación ejecutiva corre bajo el ecosistema GōkuLab: AI Sprint (4 sesiones prácticas por rol) y Corporate Academy (programas continuos). BehaviorLab aporta la gobernanza, GōkuLab la formación.',
      ctaText: '🎓 Conocer el ecosistema', ctaAction: () => scrollTo('#ecosystem') },
    { keywords: ['cliente', 'clientes', 'caso', 'casos', 'referencia', 'referencias', 'testimonio', 'testimonios', 'éxito', 'exito'],
      response: 'Trabajamos con empresas medianas mexicanas en agroindustria, manufactura, alimentos, logística y servicios. Por confidencialidad no compartimos nombres en el sitio — durante la llamada te compartimos 2-3 casos relevantes a tu sector.',
      ctaText: '📞 Agendar llamada', ctaAction: () => scrollTo('#contacto') },
    { keywords: ['shadow', 'chatgpt sin control', 'mi gente usa', 'ia sin control'],
      response: 'Ese es el dolor más común. El 68% de las empresas medianas en México usa IA sin política formal. El primer paso es un inventario documentado + política. El Assessment AIGOS™ lo hace en 2 semanas.',
      ctaText: '🛡️ Ver Assessment AIGOS™', ctaAction: () => scrollTo('#readiness') },
    { keywords: ['aigos', 'iso 42001', 'nist', 'compliance', 'gobernanza', 'governance'],
      response: 'AIGOS™ es nuestra metodología de gobernanza de IA alineada a ISO/IEC 42001 y NIST AI RMF. 80 preguntas en 10 dominios, inventario de IA (incluye shadow AI), mapa de riesgos, política corporativa y comité formal. 2-6 semanas.',
      ctaText: '🛡️ Ver la ruta AI Governance', ctaAction: () => scrollTo('#rutas') },
    { keywords: ['agente', 'agentes', 'automatizar', 'automatizacion', 'automatización', 'proceso', 'manual', 'deploy'],
      response: 'Los agentes de IA ejecutan tareas reales sobre tus sistemas (CRM, ERP, core). Diseñamos, desplegamos y monitoreamos en 6-8 semanas, con gobernanza incluida desde el día 1. El ROI Scan gratis te dice cuánto puedes ahorrar en 2 minutos.',
      ctaText: '⚙️ Hacer el ROI Scan', ctaAction: () => scrollTo('#assessment') },
    { keywords: ['cliente enterprise', 'ford', 'bimbo', 'auditoría', 'auditoria', 'evidencia', 'proveedor', 'supply chain'],
      response: 'Ese trigger es urgente. Si tu cliente enterprise ya incluyó un cuestionario de AI governance en su auditoría, tienes 2 opciones: responder con evidencia (Assessment AIGOS™ Exprés, 2 semanas) o arriesgar el contrato. El Assessment te da el reporte auditable que necesitas.',
      ctaText: '📞 Hablar con experto', ctaAction: () => scrollTo('#contacto') },
    { keywords: ['test', 'evaluación', 'evaluacion', 'gokulab', 'ecosistema'],
      response: 'Tenemos 3 diagnósticos gratuitos en BehaviorLab: 5 preguntas (60s, overview), readiness (6 min, detalle completo) y automatización (2 min, ROI). Y en test.gokulab.mx hay más tests del ecosistema GōkuLab.',
      ctaText: '🎯 Empezar las 5 preguntas', ctaAction: () => scrollTo('#five-q') },
    { keywords: ['quién', 'quien', 'ustedes', 'behaviorlab', 'somos'],
      response: 'BehAvIorLab es la firma mexicana de AI Governance + Agentes de IA para la industria mediana. 3 pilares: gobernanza (AIGOS™), automatización (ROI Scan), agentes (Deploy). Somos el brazo enterprise del ecosistema GōkuLab.',
      ctaText: '📖 Conocer más', ctaAction: () => scrollTo('#que-es') },
    { keywords: ['contacto', 'llamar', 'hablar', 'reunión', 'reunion', 'agendar', 'cita'],
      response: 'Perfecto. Agenda una llamada de 30 minutos con un consultor senior. Sin costo, sin compromiso. Solo para entender tu caso y decirte por dónde empezar.',
      ctaText: '📞 Ir a contacto', ctaAction: () => scrollTo('#contacto') },
    { keywords: ['nosotros', 'equipo', 'quiénes', 'quienes son', 'fundador', 'juan carlos'],
      response: 'BehAvIorLab combina matemáticos, actuarios, economistas y politólogos. Nuestro enfoque: rigor metodológico con velocidad de boutique. Senior + IA. Fundador involucrado en cada proyecto.',
      ctaText: '📖 Conocer al equipo', ctaAction: () => scrollTo('#que-es') },
    { keywords: ['gracias', 'adiós', 'adios', 'hasta luego', 'ok', 'perfecto', 'chao'],
      response: '¡Gracias a ti! Si necesitas algo más, aquí estoy. Y recuerda: el diagnóstico de 5 preguntas toma 60 segundos y te da claridad inmediata.',
      ctaText: '🎯 Hacer diagnóstico', ctaAction: () => scrollTo('#five-q') }
  ];

  // ============================================================
  // CREAR CONTENEDOR
  // ============================================================
  const container = document.createElement('div');
  container.id = 'behavior-chat-widget';
  container.style.cssText = `position: fixed; bottom: 28px; right: 28px; z-index: 9999; font-family: 'Inter', -apple-system, sans-serif;`;
  document.body.appendChild(container);

  container.innerHTML = `
    <button id="chat-toggle" style="background: ${PRIMARY}; color: #0A1128; border: none; border-radius: 50%; width: 72px; height: 72px; font-size: 32px; cursor: pointer; box-shadow: 0 0 40px ${GLOW_COLOR}; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); display: flex; align-items: center; justify-content: center; position: relative;">
      <span style="position: relative; z-index: 2;">💬</span>
      <span style="position: absolute; inset: -6px; border-radius: 50%; border: 2px solid ${PRIMARY}; animation: pulse-ring 2s ease-out infinite; opacity: 0;"></span>
    </button>
    <div id="chat-window" style="display: none; position: absolute; bottom: 88px; right: 0; width: 460px; max-height: 680px; background: #0A1128; border-radius: 28px; box-shadow: 0 30px 100px rgba(0, 0, 0, 0.8), 0 0 60px ${GLOW_COLOR}; overflow: hidden; flex-direction: column; border: 1px solid ${PRIMARY}44; opacity: 0; transform: scale(0.92) translateY(20px); transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);">
      <div style="background: linear-gradient(135deg, #0A1128, #1A2333); padding: 18px 20px; border-bottom: 1px solid ${PRIMARY}44; display: flex; align-items: center; gap: 14px; flex-shrink: 0; position: relative; overflow: hidden;">
        <div style="position: absolute; top: -60%; right: -10%; width: 250px; height: 250px; background: radial-gradient(circle, ${PRIMARY}22, transparent 70%); pointer-events: none;"></div>
        <div style="width: 44px; height: 44px; background: ${PRIMARY}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 0 30px ${GLOW_COLOR}; flex-shrink: 0;">🧠</div>
        <div style="flex: 1; min-width: 0;">
          <div style="color: white; font-weight: 700; font-size: 1.05rem; letter-spacing: -0.3px;">BehaviorLab Advisor</div>
          <div style="color: ${PRIMARY}; font-size: 0.75rem; display: flex; align-items: center; gap: 6px;"><span style="display:inline-block;width:7px;height:7px;background:#22c55e;border-radius:50%;box-shadow:0 0 10px #22c55e;"></span>En línea · Te guío al diagnóstico</div>
        </div>
        <button id="chat-menu-btn" title="Volver al menú" style="background: rgba(255,255,255,0.06); border: none; color: rgba(255,255,255,0.6); width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; transition: all 0.2s; display: none;">🏠</button>
        <button id="chat-close" style="background: rgba(255,255,255,0.04); border: none; color: rgba(255,255,255,0.4); width: 36px; height: 36px; border-radius: 50%; font-size: 18px; cursor: pointer; transition: all 0.2s;">✕</button>
      </div>
      <div id="chat-messages" style="flex: 1; padding: 20px 20px 12px; overflow-y: auto; min-height: 280px; max-height: 420px; display: flex; flex-direction: column; gap: 10px; background: rgba(0,0,0,0.2);"></div>
      <div id="typing-indicator" style="display: none; padding: 8px 20px 12px; color: rgba(255,255,255,0.4); font-size: 0.82rem; align-items: center; gap: 12px;">
        <div style="display:flex;gap:6px;">
          <span style="display:inline-block;width:7px;height:7px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite;"></span>
          <span style="display:inline-block;width:7px;height:7px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite 0.2s;"></span>
          <span style="display:inline-block;width:7px;height:7px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite 0.4s;"></span>
        </div>
        <span style="color: rgba(255,255,255,0.3);">Escribiendo...</span>
      </div>
      <div style="display: flex; border-top: 1px solid ${PRIMARY}44; padding: 10px 16px 16px; gap: 10px; background: rgba(0,0,0,0.3); flex-shrink: 0;">
        <input id="chat-input" type="text" placeholder="Escribe tu mensaje o pregunta..." style="flex: 1; background: rgba(255,255,255,0.04); border: 1px solid ${PRIMARY}44; border-radius: 40px; padding: 12px 20px; color: white; font-size: 0.92rem; outline: none; transition: all 0.25s; font-family: inherit;">
        <button id="chat-send" style="background: ${PRIMARY}; color: #0A1128; border: none; border-radius: 50%; width: 48px; height: 48px; cursor: pointer; font-size: 18px; font-weight: 700; transition: all 0.2s; box-shadow: 0 4px 30px ${GLOW_COLOR}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">➤</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(1.3); opacity: 0; } }
    @keyframes blink { 0%,100%{opacity:0.2;}50%{opacity:1;} }
    @keyframes messageIn { 0%{opacity:0;transform:translateY(12px) scale(0.95);} 100%{opacity:1;transform:translateY(0) scale(1);} }
    #chat-window.open { display: flex !important; opacity: 1 !important; transform: scale(1) translateY(0) !important; }
    .chat-message { padding: 12px 16px; border-radius: 18px; max-width: 88%; word-wrap: break-word; line-height: 1.55; font-size: 0.92rem; animation: messageIn 0.3s ease; }
    .chat-message.bot { align-self: flex-start; background: rgba(255,255,255,0.06); border: 1px solid ${PRIMARY}44; color: #E2E8F0; border-bottom-left-radius: 6px; }
    .chat-message.user { align-self: flex-end; background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY}); color: white; border-bottom-right-radius: 6px; box-shadow: 0 4px 24px ${GLOW_COLOR}; }
    .chat-options { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; animation: messageIn 0.3s ease; }
    .chat-option-btn { padding: 11px 16px; background: rgba(255,255,255,0.04); border: 1px solid ${PRIMARY}55; border-radius: 12px; color: #E2E8F0; font-size: 0.88rem; font-weight: 500; cursor: pointer; text-align: left; transition: all 0.2s; font-family: inherit; }
    .chat-option-btn:hover { background: ${PRIMARY}22; border-color: ${PRIMARY}; color: white; transform: translateX(3px); }
    .chat-cta-inline { padding: 14px 16px; background: linear-gradient(135deg, ${PRIMARY}22, ${SECONDARY}22); border: 1px solid ${PRIMARY}66; border-radius: 14px; margin-top: 6px; animation: messageIn 0.3s ease; }
    .chat-cta-inline-title { color: white; font-weight: 700; font-size: 0.95rem; margin-bottom: 6px; }
    .chat-cta-inline-msg { color: rgba(255,255,255,0.7); font-size: 0.85rem; line-height: 1.5; margin-bottom: 10px; }
    .chat-cta-inline-btn { background: ${PRIMARY}; color: #0A1128; border: none; border-radius: 10px; padding: 10px 18px; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; font-family: inherit; }
    .chat-cta-inline-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 24px ${GLOW_COLOR}; }
    #chat-input:focus { border-color: ${PRIMARY}; box-shadow: 0 0 0 4px ${PRIMARY}22; }
    #chat-send:hover { transform: scale(1.08); box-shadow: 0 6px 40px ${GLOW_COLOR}; }
    #chat-send:active { transform: scale(0.92); }
    #chat-toggle:hover { transform: scale(1.05); }
    #chat-close:hover, #chat-menu-btn:hover { background: rgba(255,255,255,0.1); color: white; }
    #chat-messages::-webkit-scrollbar { width: 5px; }
    #chat-messages::-webkit-scrollbar-track { background: transparent; }
    #chat-messages::-webkit-scrollbar-thumb { background: ${PRIMARY}44; border-radius: 10px; }
    #bl-toast { position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%) translateY(20px); background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY}); color: white; padding: 14px 24px; border-radius: 100px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 0.92rem; box-shadow: 0 20px 60px ${GLOW_COLOR}; z-index: 10000; opacity: 0; pointer-events: none; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); max-width: 90vw; text-align: center; }
    #bl-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
  `;
  document.head.appendChild(style);

  const toggleBtn = document.getElementById('chat-toggle');
  const closeBtn = document.getElementById('chat-close');
  const menuBtn = document.getElementById('chat-menu-btn');
  const chatWindow = document.getElementById('chat-window');
  const messagesContainer = document.getElementById('chat-messages');
  const inputField = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const typingIndicator = document.getElementById('typing-indicator');

  function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `chat-message ${sender}`;
    div.textContent = text;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return div;
  }

  function addOptions(options, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-options';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'chat-option-btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => { wrap.remove(); addMessage(opt.label, 'user'); onSelect(opt); });
      wrap.appendChild(btn);
    });
    messagesContainer.appendChild(wrap);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function addInlineCTA({ icon, title, message, ctaText, ctaAction }) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-cta-inline';
    wrap.innerHTML = `<div class="chat-cta-inline-title">${icon} ${title}</div><div class="chat-cta-inline-msg">${message}</div><button class="chat-cta-inline-btn">${ctaText}</button>`;
    wrap.querySelector('.chat-cta-inline-btn').addEventListener('click', () => { closeChat(); ctaAction(); });
    messagesContainer.appendChild(wrap);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showTyping() { typingIndicator.style.display = 'flex'; messagesContainer.scrollTop = messagesContainer.scrollHeight; }
  function hideTyping() { typingIndicator.style.display = 'none'; }
  function scrollTo(selector) { const el = document.querySelector(selector); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function showToast(msg) {
    let toast = document.getElementById('bl-toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'bl-toast'; document.body.appendChild(toast); }
    toast.textContent = msg; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5000);
  }

  function handoffToWizard(target, prefill, toastMsg) {
    closeChat();
    setTimeout(() => {
      const section = target === 'readiness' ? '#readiness' : target === 'assessment' ? '#assessment' : '#five-q';
      scrollTo(section);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('bl:prefill', { detail: { target, data: prefill } }));
        if (toastMsg) showToast(toastMsg);
      }, 900);
    }, 300);
  }

  function renderMenu() {
    state.mode = 'menu'; state.flow = null; state.step = 0; state.collected = {};
    menuBtn.style.display = 'none';
    if (!state.hasGreeted) {
      addMessage('👋 Hola, soy tu AI Business Advisor de BehaviorLab. En 2-3 preguntas te ayudo a encontrar el mejor punto de entrada para tu empresa.', 'bot');
      state.hasGreeted = true;
    } else { addMessage('¿En qué más te ayudo?', 'bot'); }
    addOptions([
      { label: '🛡️ Gobernanza de IA', value: 'gov' },
      { label: '⚙️ Automatizar procesos', value: 'auto' },
      { label: '🤖 Agente de IA', value: 'agent' },
      { label: '🤔 No sé por dónde empezar', value: 'nose' },
      { label: '💬 Escribir mi pregunta', value: 'free' }
    ], (opt) => {
      if (opt.value === 'free') enterFreeMode();
      else startFlow(opt.value);
    });
  }

  function startFlow(flowKey) {
    state.mode = 'guided'; state.flow = flowKey; state.step = 0; state.collected = {};
    menuBtn.style.display = 'flex';
    const flow = FLOWS[flowKey];
    if (!flow) { renderMenu(); return; }
    renderStep();
  }

  function renderStep() {
    const flow = FLOWS[state.flow];
    const step = flow.steps[state.step];
    if (!step) { flow.onComplete(state.collected); return; }
    addMessage(step.message, 'bot');
    if (step.allowFreeInput) {
      inputField.focus();
      inputField.placeholder = 'Escribe tu respuesta...';
    } else if (step.options) {
      addOptions(step.options, (opt) => { state.collected[step.id] = opt.value; state.step++; setTimeout(() => renderStep(), 400); });
    }
  }

  function enterFreeMode() {
    state.mode = 'free';
    menuBtn.style.display = 'flex';
    addMessage('Perfecto. Cuéntame qué necesitas o escribe tu pregunta. También puedes usar el botón 🏠 para regresar al menú.', 'bot');
    inputField.placeholder = 'Escribe tu pregunta...';
    setTimeout(() => inputField.focus(), 300);
  }

  function detectIntent(message) {
    const lower = message.toLowerCase();
    for (const intent of INTENTS) {
      if (intent.keywords.some(k => lower.includes(k))) return intent;
    }
    return null;
  }

  async function sendToBackend(message) {
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: conversationHistory.slice(-6) })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Error backend');
      return { reply: data.reply || '', fallback: !!data.fallback };
    } catch (error) {
      console.error('[chat] Error backend:', error.message);
      return { reply: 'Estoy teniendo un problema técnico en este momento. Mientras lo resolvemos, te recomiendo hacer el diagnóstico de 5 preguntas — toma 60 segundos y te da claridad inmediata sobre tu empresa.', fallback: true };
    }
  }

  async function handleFreeMessage(message) {
    addMessage(message, 'user');
    inputField.value = '';
    inputField.disabled = true; sendBtn.disabled = true;

    const intent = detectIntent(message);
    if (intent) {
      setTimeout(() => {
        addMessage(intent.response, 'bot');
        if (intent.ctaText && intent.ctaAction) {
          addInlineCTA({ icon: '🎯', title: 'Siguiente paso', message: 'Te recomiendo esto:', ctaText: intent.ctaText, ctaAction: intent.ctaAction });
        }
        inputField.disabled = false; sendBtn.disabled = false; inputField.focus();
      }, 400);
      return;
    }

    showTyping();
    const { reply, fallback } = await sendToBackend(message);
    hideTyping();
    addMessage(reply, 'bot');
    conversationHistory.push({ role: 'user', content: message });
    conversationHistory.push({ role: 'assistant', content: reply });
    if (conversationHistory.length > 12) conversationHistory = conversationHistory.slice(-12);

    state.freeModeCount++;
    if (state.freeModeCount % 3 === 0) {
      addInlineCTA({ icon: '🎯', title: '¿Quieres el diagnóstico?', message: 'En 60 segundos te digo exactamente dónde está tu empresa.', ctaText: '🎯 Empezar las 5 preguntas', ctaAction: () => scrollTo('#five-q') });
    }

    inputField.disabled = false; sendBtn.disabled = false; inputField.focus();
  }

  function handleGuidedFreeInput(msg, step) {
    addMessage(msg, 'user');
    inputField.value = '';
    state.collected[step.id] = msg;
    inputField.placeholder = 'Escribe tu mensaje o pregunta...';
    state.step++;
    setTimeout(() => renderStep(), 400);
  }

  function dispatchMessage() {
    const msg = inputField.value.trim();
    if (!msg) return;
    if (state.mode === 'free') { handleFreeMessage(msg); return; }
    if (state.mode === 'guided') {
      const flow = FLOWS[state.flow];
      const step = flow.steps[state.step];
      if (step && step.allowFreeInput) handleGuidedFreeInput(msg, step);
      return;
    }
    enterFreeMode();
    setTimeout(() => handleFreeMessage(msg), 200);
  }

  function openChat() {
    state.isOpen = true;
    chatWindow.classList.add('open');
    if (messagesContainer.children.length === 0) setTimeout(() => renderMenu(), 300);
    setTimeout(() => inputField.focus(), 400);
  }

  function closeChat() {
    state.isOpen = false;
    chatWindow.classList.remove('open');
  }

  toggleBtn.addEventListener('click', () => state.isOpen ? closeChat() : openChat());
  closeBtn.addEventListener('click', closeChat);
  menuBtn.addEventListener('click', () => { messagesContainer.innerHTML = ''; conversationHistory = []; renderMenu(); });
  sendBtn.addEventListener('click', dispatchMessage);
  inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') dispatchMessage(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.isOpen) closeChat(); });

  window.addEventListener('bl:openChatWith', (e) => {
    if (!state.isOpen) openChat();
    if (e.detail?.flow) setTimeout(() => startFlow(e.detail.flow), 400);
  });

})();