// ================================================================
// ADVISOR.JS — AI Business Advisor (chat guía estructurado)
// Botón flotante izquierdo + flow de 4 opciones → enruta al test o CTA
// ================================================================

(function() {
  'use strict';

  // ---------- ÁRBOL DE DECISIÓN ----------
  const flow = {
    inicio: {
      message: 'Hola 👋 Soy tu AI Business Advisor. Te ayudo a encontrar el mejor punto de entrada para tu empresa. ¿Qué necesitas resolver hoy?',
      options: [
        { label: '🛡️ Gobernanza de IA', next: 'gov_inicio' },
        { label: '⚙️ Automatizar procesos', next: 'auto_inicio' },
        { label: '🤖 Agente de IA', next: 'agent_inicio' },
        { label: '🤔 No sé por dónde empezar', next: 'no_se' }
      ]
    },
    gov_inicio: {
      message: 'Perfecto. Gobernanza es el punto de partida correcto para la mayoría de empresas. ¿Ya usan IA en la empresa?',
      options: [
        { label: 'Sí, sin política formal', next: 'gov_sin_politica' },
        { label: 'Sí, con guías informales', next: 'gov_con_guias' },
        { label: 'Todavía no usamos IA', next: 'gov_no_usan' }
      ]
    },
    gov_sin_politica: {
      message: 'Ese es el dolor más común. El 68% de las empresas medianas en México usa IA sin política formal. El primer paso es un Assessment AIGOS™ Exprés: 80 preguntas, 2 semanas, con evidencia auditable.',
      options: [
        { label: '🛡️ Ver el Assessment →', action: 'scroll', target: '#readiness' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    gov_con_guias: {
      message: 'Buen inicio. El siguiente paso es formalizar la política, designar un responsable y formalizar el comité. Immersion Program lo hace en 4-6 semanas.',
      options: [
        { label: '🛡️ Ver Immersion Program →', action: 'scroll', target: '#rutas' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    gov_no_usan: {
      message: 'Mejor empezar por un diagnóstico gratuito antes de decidir. En 6 minutos sabrás dónde estás, qué riesgos tienes y por dónde empezar.',
      options: [
        { label: '🎯 Empezar las 5 preguntas →', action: 'scroll', target: '#five-q' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    auto_inicio: {
      message: 'Excelente. La automatización tiene el ROI más claro y rápido. ¿Cuál es el proceso que más les duele hoy?',
      options: [
        { label: '💰 Facturación / conciliación', next: 'auto_facturacion' },
        { label: '📞 Atención a clientes', next: 'auto_atencion' },
        { label: '📄 Procesamiento de documentos', next: 'auto_docs' },
        { label: '✏️ Otro proceso', next: 'auto_otro' }
      ]
    },
    auto_facturacion: {
      message: 'Facturación y conciliación son los casos más comunes. El ROI típico: 120-180 hrs/mes liberadas y 85% menos errores. Mide tu caso concreto con el ROI Scan.',
      options: [
        { label: '⚙️ Hacer el ROI Scan →', action: 'scroll', target: '#assessment' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    auto_atencion: {
      message: 'Atención a clientes es el segundo caso más común. Ahorro típico: 200+ hrs/mes, respuesta 24/7. Mide tu caso con el ROI Scan.',
      options: [
        { label: '⚙️ Hacer el ROI Scan →', action: 'scroll', target: '#assessment' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    auto_docs: {
      message: 'Procesamiento de documentos es donde la IA generativa tiene el mayor impacto. Ahorro típico: 150+ hrs/mes. Mide tu caso con el ROI Scan.',
      options: [
        { label: '⚙️ Hacer el ROI Scan →', action: 'scroll', target: '#assessment' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    auto_otro: {
      message: 'No hay problema. El ROI Scan cubre cualquier proceso. En 2 minutos tienes un ROI estimado y agente recomendado.',
      options: [
        { label: '⚙️ Hacer el ROI Scan →', action: 'scroll', target: '#assessment' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    agent_inicio: {
      message: 'Perfecto. ¿Qué tipo de agente necesitas?',
      options: [
        { label: '💬 Atención al cliente 24/7', next: 'agent_atencion' },
        { label: '📄 Procesar documentos masivamente', next: 'agent_docs' },
        { label: '🧠 Soporte a decisiones ejecutivas', next: 'agent_decision' }
      ]
    },
    agent_atencion: {
      message: 'El caso más común. Discovery + Deploy en 6-8 semanas. Con gobernanza incluida desde el día 1: inventario, política, monitoreo.',
      options: [
        { label: '🤖 Ver Agent Discovery →', action: 'scroll', target: '#contacto' },
        { label: '🎯 Hacer diagnóstico primero', action: 'scroll', target: '#readiness' }
      ]
    },
    agent_docs: {
      message: 'Procesamiento documental es donde la IA generativa brilla. Extracción, clasificación, validación. Deploy en 6-8 semanas.',
      options: [
        { label: '🤖 Ver Agent Discovery →', action: 'scroll', target: '#contacto' },
        { label: '🎯 Hacer diagnóstico primero', action: 'scroll', target: '#readiness' }
      ]
    },
    agent_decision: {
      message: 'Soporte a decisiones combina datos internos + IA generativa. Requiere gobernanza robusta desde el día 1. Empecemos por el diagnóstico.',
      options: [
        { label: '🎯 Hacer diagnóstico →', action: 'scroll', target: '#readiness' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    no_se: {
      message: 'Sin problema. Cuéntame un poco más. ¿Cuál de estos te suena familiar?',
      options: [
        { label: '😱 Mi gente usa ChatGPT sin control', next: 'ns_shadow' },
        { label: '📋 Mi cliente me pide evidencia de IA', next: 'ns_cliente' },
        { label: '🐌 Tengo procesos manuales caros', next: 'ns_manual' },
        { label: '🤷 Quiero empezar pero no sé cómo', next: 'ns_start' }
      ]
    },
    ns_shadow: {
      message: 'Shadow AI. El 68% de las empresas medianas mexicanas lo tiene. El primer paso es un inventario documentado. El diagnóstico de 5 preguntas te da una idea en 60 segundos.',
      options: [
        { label: '🎯 Empezar las 5 preguntas →', action: 'scroll', target: '#five-q' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    ns_cliente: {
      message: 'Ese trigger es urgente. Si no respondes con evidencia, pones en riesgo el contrato. El Assessment AIGOS™ Exprés te da el reporte auditable en 2 semanas.',
      options: [
        { label: '🛡️ Ver Assessment AIGOS™ →', action: 'scroll', target: '#readiness' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    ns_manual: {
      message: 'ROI más claro. El ROI Scan te dice exactamente cuánto puedes ahorrar en 2 minutos. Sin registro.',
      options: [
        { label: '⚙️ Hacer el ROI Scan →', action: 'scroll', target: '#assessment' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    },
    ns_start: {
      message: 'Empecemos con lo más simple: el diagnóstico de 5 preguntas. En 60 segundos sabrás exactamente dónde estás.',
      options: [
        { label: '🎯 Empezar las 5 preguntas →', action: 'scroll', target: '#five-q' },
        { label: '📞 Hablar con un experto', action: 'scroll', target: '#contacto' }
      ]
    }
  };

  // ---------- ESTADO ----------
  const state = {
    currentNode: 'inicio',
    isOpen: false
  };

  // ---------- HELPERS ----------
  function scrollToTarget(selector) {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => closePanel(), 600);
  }

  function renderNode(nodeKey) {
    const node = flow[nodeKey];
    if (!node) return;

    const messagesEl = document.getElementById('advisor-messages');
    if (!messagesEl) return;

    // Append message bubble
    const bubble = document.createElement('div');
    bubble.className = 'advisor-bubble';
    bubble.textContent = node.message;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Remove old options
    const oldOptions = document.getElementById('advisor-options');
    if (oldOptions) oldOptions.remove();

    // Append options
    const optionsEl = document.createElement('div');
    optionsEl.id = 'advisor-options';
    optionsEl.className = 'advisor-options';
    node.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'advisor-option-btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        if (opt.next) {
          // Append user's choice as a bubble
          const choiceBubble = document.createElement('div');
          choiceBubble.className = 'advisor-bubble advisor-bubble-user';
          choiceBubble.textContent = opt.label;
          messagesEl.appendChild(choiceBubble);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          // Wait a bit, then render next node
          setTimeout(() => renderNode(opt.next), 400);
        } else if (opt.action === 'scroll') {
          scrollToTarget(opt.target);
        }
      });
      optionsEl.appendChild(btn);
    });
    const bodyEl = document.getElementById('advisor-body');
    if (bodyEl) bodyEl.appendChild(optionsEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------- PANEL ----------
  function openPanel() {
    const panel = document.getElementById('advisor-panel');
    const trigger = document.getElementById('advisor-trigger');
    if (!panel) return;
    panel.classList.add('open');
    if (trigger) trigger.classList.add('hidden');
    state.isOpen = true;
    if (state.currentNode === 'inicio' && document.getElementById('advisor-messages').children.length === 0) {
      setTimeout(() => renderNode('inicio'), 200);
    }
  }

  function closePanel() {
    const panel = document.getElementById('advisor-panel');
    const trigger = document.getElementById('advisor-trigger');
    if (!panel) return;
    panel.classList.remove('open');
    if (trigger) trigger.classList.remove('hidden');
    state.isOpen = false;
  }

  // ---------- BUILD UI ----------
  function buildUI() {
    // Trigger button (bottom-left)
    const trigger = document.createElement('button');
    trigger.id = 'advisor-trigger';
    trigger.className = 'advisor-trigger';
    trigger.innerHTML = '<span class="advisor-trigger-icon">🤖</span><span class="advisor-trigger-text">Te ayudo a elegir</span>';
    trigger.addEventListener('click', openPanel);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'advisor-panel';
    panel.className = 'advisor-panel';
    panel.innerHTML = `
      <div class="advisor-header">
        <div class="advisor-avatar">🤖</div>
        <div class="advisor-header-info">
          <div class="advisor-name">AI Business Advisor</div>
          <div class="advisor-status"><span class="advisor-dot"></span>En línea · Respuesta inmediata</div>
        </div>
        <button class="advisor-close" aria-label="Cerrar">&times;</button>
      </div>
      <div class="advisor-body" id="advisor-body">
        <div class="advisor-messages" id="advisor-messages"></div>
      </div>
    `;

    document.body.appendChild(trigger);
    document.body.appendChild(panel);

    panel.querySelector('.advisor-close').addEventListener('click', closePanel);
  }

  // ---------- PUBLIC API ----------
  window.openAdvisor = function() {
    if (!state.isOpen) openPanel();
  };

  // ---------- INIT ----------
  function init() {
    buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();