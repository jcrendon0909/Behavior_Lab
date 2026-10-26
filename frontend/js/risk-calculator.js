// ================================================================
// RISK CALCULATOR — Calculadora de Riesgo de IA (landing pública)
// Se expone globalmente como window.calcularRiesgo porque el HTML
// usa onclick="calcularRiesgo(event)".
// NO toca main.js (que maneja animaciones/modales/hamburger).
// ================================================================
(function() {
  'use strict';

  function setResultBadges(badges) {
    const cont = document.getElementById('resultBadges');
    if (!cont) return;
    const colorMap = {
      alto:  'background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.4);',
      medio: 'background: rgba(245,158,11,0.15); color: #fcd34d; border: 1px solid rgba(245,158,11,0.4);',
      bajo:  'background: rgba(20,184,166,0.15); color: #5eead4; border: 1px solid rgba(20,184,166,0.4);',
    };
    cont.innerHTML = badges.map(b =>
      `<span style="${colorMap[b.level] || colorMap.bajo} padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600;">${b.label}</span>`
    ).join('');
  }

  async function calcularRiesgo(event) {
    if (event) event.preventDefault();

    const sector = document.getElementById('sector')?.value;
    const shadowEl = document.querySelector('input[name="shadow_ai"]:checked');
    const samdEl = document.querySelector('input[name="samd"]:checked');
    const nombre = document.getElementById('leadName')?.value?.trim();
    const empresa = document.getElementById('leadCompany')?.value?.trim();
    const email = document.getElementById('leadEmail')?.value?.trim();

    const btn = document.getElementById('btnCalcular');
    const resultBox = document.getElementById('resultBox');
    const resultSummary = document.getElementById('resultSummary');
    const errorTarget = document.getElementById('resultBox') || document.body;

    if (!sector || !shadowEl || !samdEl) {
      alert('Completa los 3 pasos del formulario.');
      return;
    }
    if (!nombre || !empresa || !email) {
      alert('Completa tu nombre, empresa y correo para ver el resultado.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('El correo no es válido.');
      return;
    }

    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Calculando…'; }

    try {
      const payload = {
        nombre,
        empresa,
        email,
        sector,
        shadow_ai: shadowEl.value,
        samd: samdEl.value === 'si',
      };

      const res = await fetch('https://behavior-lab.onrender.com/api/public/risk-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Error al procesar la evaluación');
      }

      const a = data.assessment;
      setResultBadges(a.badges);
      if (resultSummary) resultSummary.textContent = a.summary;

      // Actualizar el título con el nivel
      const h3 = resultBox?.querySelector('h3');
      if (h3) h3.textContent = `Tu Nivel de Exposición Preliminar: ${a.risk_level.toUpperCase()}`;

      resultBox.style.display = 'block';
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (err) {
      console.error('[calcularRiesgo]', err);
      alert('Hubo un problema: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || 'Ver mi Diagnóstico Preliminar'; }
    }
  }

  // Exponer globalmente para onclick="calcularRiesgo(event)"
  window.calcularRiesgo = calcularRiesgo;

  // Botón: también enganchar addEventListener por si el onclick inline falla
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnCalcular');
    if (btn && !btn.onclick) {
      btn.addEventListener('click', calcularRiesgo);
    }
  });
})();