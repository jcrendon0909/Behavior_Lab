// ================================================================
// READINESS.JS — Wizard de AI Readiness Snapshot (5 pasos)
// Conecta con: POST /api/public/readiness-snapshot
// ================================================================

(function() {
  'use strict';

  const API_URL = 'https://behavior-lab.onrender.com/api/public/readiness-snapshot';

  // Estado acumulado del wizard
  const state = {
    empresa: '',
    sector: '',
    empleados: '',
    facturacion_estimada: '',
    uso_ia: '',
    areas_con_ia: [],
    porcentaje_manual: '',
    tiene_politica: null,
    tiene_inventario: '',
    tiene_responsable: null,
    cliente_pidio_evidencia: null,
    urgencia: '',
    proceso_doloroso: '',
    nombre: '',
    cargo: '',
    email: '',
    telefono: ''
  };

  // -------- Helpers UI --------
  function showStep(n) {
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('rs-step-' + i);
      if (el) el.style.display = (i === n) ? 'block' : 'none';
      const err = document.getElementById('rs-error-' + i);
      if (err) err.style.display = 'none';
    }
    const bar = document.getElementById('rs-progress-bar');
    if (bar) bar.style.width = (n / 5 * 100) + '%';
    const result = document.getElementById('rs-result');
    if (result) result.style.display = 'none';
    const section = document.getElementById('readiness');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showError(step, msg) {
    const el = document.getElementById('rs-error-' + step);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function validateStep1() {
    state.empresa = document.getElementById('rs_empresa').value.trim();
    state.sector = document.getElementById('rs_sector').value;
    state.empleados = document.getElementById('rs_empleados').value;
    state.facturacion_estimada = document.getElementById('rs_facturacion').value;

    if (state.empresa.length < 2) { showError(1, 'Escribe el nombre de tu empresa'); return false; }
    if (!state.sector) { showError(1, 'Selecciona tu sector'); return false; }
    if (!state.empleados) { showError(1, 'Selecciona el número de empleados'); return false; }
    if (!state.facturacion_estimada) { showError(1, 'Selecciona el rango de facturación'); return false; }
    return true;
  }

  function validateStep2() {
    const uso = document.querySelector('input[name="rs_uso_ia"]:checked');
    if (!uso) { showError(2, 'Selecciona cómo usan la IA'); return false; }
    state.uso_ia = uso.value;

    const areas = Array.from(document.querySelectorAll('input[name="rs_areas"]:checked')).map(c => c.value);
    if (areas.length === 0) { showError(2, 'Selecciona al menos un área que usa IA'); return false; }
    state.areas_con_ia = areas;

    state.porcentaje_manual = document.getElementById('rs_porcentaje_manual').value;
    if (!state.porcentaje_manual) { showError(2, 'Selecciona el porcentaje de procesos manuales'); return false; }
    return true;
  }

  function validateStep3() {
    const politica = document.querySelector('input[name="rs_tiene_politica"]:checked');
    if (!politica) { showError(3, 'Indica si tienen política de IA'); return false; }
    state.tiene_politica = politica.value === 'true';

    const inventario = document.querySelector('input[name="rs_tiene_inventario"]:checked');
    if (!inventario) { showError(3, 'Indica si tienen inventario de IA'); return false; }
    state.tiene_inventario = inventario.value;

    const responsable = document.querySelector('input[name="rs_tiene_responsable"]:checked');
    if (!responsable) { showError(3, 'Indica si tienen responsable de gobernanza'); return false; }
    state.tiene_responsable = responsable.value === 'true';
    return true;
  }

  function validateStep4() {
    const cliente = document.querySelector('input[name="rs_cliente_pidio"]:checked');
    if (!cliente) { showError(4, 'Indica si algún cliente te pidió información'); return false; }
    state.cliente_pidio_evidencia = cliente.value === 'true';

    state.urgencia = document.getElementById('rs_urgencia').value;
    if (!state.urgencia) { showError(4, 'Selecciona tu urgencia'); return false; }

    state.proceso_doloroso = document.getElementById('rs_proceso_doloroso').value.trim();
    return true;
  }

  function validateStep5() {
    state.nombre = document.getElementById('rs_nombre').value.trim();
    state.cargo = document.getElementById('rs_cargo').value.trim();
    state.email = document.getElementById('rs_email').value.trim();
    state.telefono = document.getElementById('rs_telefono').value.trim();

    if (state.nombre.length < 2) { showError(5, 'Escribe tu nombre'); return false; }
    if (state.cargo.length < 2) { showError(5, 'Escribe tu cargo'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) { showError(5, 'Correo inválido'); return false; }
    return true;
  }

  // -------- Navegación --------
  window.rs_nextStep = function(next) {
    let ok = true;
    if (next === 2) ok = validateStep1();
    else if (next === 3) ok = validateStep2();
    else if (next === 4) ok = validateStep3();
    else if (next === 5) ok = validateStep4();
    if (ok) showStep(next);
  };

  window.rs_prevStep = function(prev) {
    showStep(prev);
  };

  // -------- Submit --------
  window.rs_submit = async function() {
    if (!validateStep5()) return;

    const btn = document.getElementById('rs_submitBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Calculando...';

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: state.nombre,
          email: state.email,
          empresa: state.empresa,
          telefono: state.telefono,
          cargo: state.cargo,
          sector: state.sector,
          empleados: state.empleados,
          facturacion_estimada: state.facturacion_estimada,
          uso_ia: state.uso_ia,
          areas_con_ia: state.areas_con_ia,
          porcentaje_manual: state.porcentaje_manual,
          tiene_politica: state.tiene_politica,
          tiene_inventario: state.tiene_inventario,
          tiene_responsable: state.tiene_responsable,
          cliente_pidio_evidencia: state.cliente_pidio_evidencia,
          urgencia: state.urgencia,
          proceso_doloroso: state.proceso_doloroso,
          source: 'landing_readiness'
        })
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        showError(5, data.error || 'Error al procesar el diagnóstico. Intenta de nuevo.');
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      renderResult(data.profile);
    } catch (err) {
      console.error('[readiness] Error:', err);
      showError(5, 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  // -------- Render resultado --------
  function renderResult(profile) {
    // Ocultar todos los steps y mostrar resultado
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('rs-step-' + i);
      if (el) el.style.display = 'none';
    }
    const bar = document.getElementById('rs-progress-bar');
    if (bar) bar.style.width = '100%';

    // Scores
    const grid = document.getElementById('rs-scores-grid');
    if (grid) {
      const scoreCard = (label, value, level, levelClass) => `
        <div class="rs-score-card">
          <p>${label}</p>
          <div class="rs-score-value ${levelClass}">${value}</div>
          <div class="rs-score-label">${level}</div>
        </div>
      `;
      grid.innerHTML = [
        scoreCard('Preparación IA', profile.readiness_score + '/100', profile.readiness_level, 'rs-score-' + profile.readiness_level),
        scoreCard('Riesgo de gobernanza', profile.governance_risk + '/100', profile.governance_risk_level, 'rs-score-' + profile.governance_risk_level),
        scoreCard('Potencial de automatización', profile.automation_potential + '/100', profile.automation_potential_level, 'rs-score-' + profile.automation_potential_level),
        scoreCard('Oportunidad', profile.opportunity_score + '/100', profile.opportunity_level, 'rs-score-' + profile.opportunity_level)
      ].join('');
    }

    // Prioridades (top 3)
    const prio = document.getElementById('rs-priorities');
    if (prio) {
      const top3 = (profile.priorities || []).slice(0, 3);
      prio.innerHTML = top3.map(p => `<li>${p}</li>`).join('');
    }

    // Producto recomendado
    const prod = document.getElementById('rs-recommended-product');
    const reason = document.getElementById('rs-recommendation-reason');
    if (prod) prod.textContent = formatProductName(profile.recommended_product);
    if (reason) reason.textContent = profile.recommendation_reason || '';

    // Mostrar resultado
    const result = document.getElementById('rs-result');
    if (result) {
      result.style.display = 'block';
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function formatProductName(key) {
    const map = {
      'assessment_express': 'Assessment AIGOS™ Exprés',
      'immersion_program': 'Immersion Program',
      'deploy_agent': 'Deploy de Agente Único',
      'keep_monitoring': 'Monitoreo Continuo'
    };
    return map[key] || key;
  }

  // -------- Init --------
  function init() {
    showStep(1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();