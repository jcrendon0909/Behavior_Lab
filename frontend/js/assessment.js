// ================================================================
// ASSESSMENT JS — Lógica del Wizard de Automatización
// ================================================================

let wa_data = {};

function wa_nextStep() {
  const processName = document.getElementById('wa_processName').value;
  const volume = document.getElementById('wa_volume').value;
  const hoursSpent = document.getElementById('wa_hoursSpent').value;

  if (!processName || !volume || !hoursSpent) {
    alert("Por favor, completa todos los campos del proceso.");
    return;
  }

  wa_data.processName = processName;
  wa_data.volume = parseInt(volume);
  wa_data.complexity = parseInt(document.getElementById('wa_complexity').value);
  wa_data.dataType = document.getElementById('wa_dataType').value;
  wa_data.hoursSpent = parseInt(hoursSpent);

  document.getElementById('wizard-step-1').style.display = 'none';
  document.getElementById('wizard-step-2').style.display = 'block';
}

function wa_prevStep() {
  document.getElementById('wizard-step-2').style.display = 'none';
  document.getElementById('wizard-step-1').style.display = 'block';
}

async function wa_submit() {
  const nombre = document.getElementById('wa_nombre').value;
  const empresa = document.getElementById('wa_empresa').value;
  const email = document.getElementById('wa_email').value;
  const telefono = document.getElementById('wa_telefono').value;

  if (!nombre || !empresa || !email) {
    alert("Por favor, completa los campos de contacto requeridos.");
    return;
  }

  const btn = document.getElementById('wa_submitBtn');
  const errorDiv = document.getElementById('wizard-error');
  
  btn.disabled = true;
  btn.textContent = 'Calculando con IA...';
  errorDiv.style.display = 'none';

  const payload = {
    ...wa_data,
    nombre,
    empresa,
    email,
    telefono
  };

  try {
    const res = await fetch('https://behavior-lab.onrender.com/api/public/automation-assessment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Error al procesar la evaluación');
    }

    const result = data.assessment;
    document.getElementById('wizard-step-2').style.display = 'none';
    document.getElementById('wizard-result').style.display = 'block';

    document.getElementById('res_index').textContent = `${result.automationIndex}%`;
    document.getElementById('res_roi').textContent = `~${result.roiHoursPerMonth} hrs/mes`;
    document.getElementById('res_agent').textContent = result.agentType;
    document.getElementById('res_desc').textContent = result.agentDescription;
    document.getElementById('res_explanation').textContent = result.roiExplanation;

  } catch (err) {
    console.error(err);
    errorDiv.textContent = "Hubo un problema: " + err.message;
    errorDiv.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Calcular mi ROI con IA →';
  }
}
  // ============================================================
// HANDOFF desde el chat: pre-llenar campos
// ============================================================
window.addEventListener('bl:prefill', (e) => {
  if (e.detail.target !== 'assessment') return;
  const data = e.detail.data || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  if (data.processName) setVal('wa_processName', data.processName);
  if (data.volume) setVal('wa_volume', data.volume);
  // Limpiar sessionStorage
  try { sessionStorage.removeItem('bl_wizard_prefill'); } catch (err) {}
});