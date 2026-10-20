// const API_URL = 'http://localhost:3000'; 
const API_URL = 'https://behavior-lab.onrender.com'; 

const token = localStorage.getItem('gov_token');
if (!token) window.location.href = 'index.html';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

let currentUser = null;
let currentOrgId = null;
let companiesCache = []; 
let orgsCache = [];

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('gov_token');
  localStorage.removeItem('gov_user');
  window.location.href = 'index.html';
});

async function init() {
  currentUser = JSON.parse(localStorage.getItem('gov_user'));
  if (!currentUser) return window.location.href = 'index.html';
  
  document.getElementById('userEmail').textContent = currentUser.email;
  currentOrgId = currentUser.orgId;

  if (currentUser.role === 'superadmin') {
    const container = document.getElementById('orgSelectorContainer');
    container.classList.remove('hidden');
    container.classList.add('flex');
    
    const res = await fetch(`${API_URL}/gov/orgs`, { headers });
    orgsCache = await res.json();
    
    const selector = document.getElementById('orgSelector');
    selector.innerHTML = orgsCache.map(o => `<option value="${o._id}">${o.name}</option>`).join('');
    
    selector.addEventListener('change', (e) => {
      currentOrgId = e.target.value;
      loadDashboardData();
    });
  } else {
    document.getElementById('tabLeadsBtn').classList.add('hidden');
    document.getElementById('tabUsersBtn').classList.add('hidden');
  }

  loadDashboardData();
}

async function loadDashboardData() {
  await loadCompanies();
  await loadInventory();
}

// TABS
const tabInvBtn = document.getElementById('tabInventoryBtn');
const tabCompBtn = document.getElementById('tabCompaniesBtn');
const tabLeadsBtn = document.getElementById('tabLeadsBtn');
const tabUsersBtn = document.getElementById('tabUsersBtn');
const secInv = document.getElementById('inventorySection');
const secComp = document.getElementById('companiesSection');
const secLeads = document.getElementById('leadsSection');
const secUsers = document.getElementById('usersSection');

function resetTabs() {
  [tabInvBtn, tabCompBtn, tabLeadsBtn, tabUsersBtn].forEach(b => b.className = 'text-slate-500 hover:text-slate-300 pb-2 transition whitespace-nowrap');
  [secInv, secComp, secLeads, secUsers].forEach(s => { s.classList.add('hidden'); s.classList.remove('block'); });
}

tabInvBtn.addEventListener('click', () => { resetTabs(); tabInvBtn.className = 'text-teal-400 font-semibold border-b-2 border-teal-400 pb-2 transition whitespace-nowrap'; secInv.classList.remove('hidden'); secInv.classList.add('block'); });
tabCompBtn.addEventListener('click', () => { resetTabs(); tabCompBtn.className = 'text-teal-400 font-semibold border-b-2 border-teal-400 pb-2 transition whitespace-nowrap'; secComp.classList.remove('hidden'); secComp.classList.add('block'); });
tabLeadsBtn.addEventListener('click', () => { resetTabs(); tabLeadsBtn.className = 'text-teal-400 font-semibold border-b-2 border-teal-400 pb-2 transition whitespace-nowrap'; secLeads.classList.remove('hidden'); secLeads.classList.add('block'); loadLeads(); });
tabUsersBtn.addEventListener('click', () => { resetTabs(); tabUsersBtn.className = 'text-teal-400 font-semibold border-b-2 border-teal-400 pb-2 transition whitespace-nowrap'; secUsers.classList.remove('hidden'); secUsers.classList.add('block'); loadUsers(); });

// CARGAR DATOS
async function loadCompanies() {
  try {
    const res = await fetch(`${API_URL}/gov/orgs/${currentOrgId}/companies`, { headers });
    if (!res.ok) throw new Error('Error');
    companiesCache = await res.json();
    
    document.getElementById('statCompanies').textContent = companiesCache.length;
    const tbody = document.getElementById('companiesTableBody');
    
    if (companiesCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">No hay filiales registradas.</td></tr>`;
    } else {
      tbody.innerHTML = companiesCache.map(c => `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition">
          <td class="py-3 px-4 font-semibold text-slate-200">${c.name}</td>
          <td class="py-3 px-4 text-slate-400 capitalize">${c.riskProfile.replace('_', ' ')}</td>
          <td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-teal-950 text-teal-400 border border-teal-800">Activa</span></td>
          <td class="py-3 px-4 text-slate-500 font-mono text-xs">${c._id}</td>
        </tr>
      `).join('');
    }
    
    const selectModel = document.getElementById('modelCompany');
    selectModel.innerHTML = companiesCache.length === 0 ? `<option value="">Crea una filial primero</option>` : companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');

    const selectDiag = document.getElementById('diagCompany');
    selectDiag.innerHTML = companiesCache.length === 0 ? `<option value="">Crea una filial primero</option>` : companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');

  } catch (error) {}
}

async function loadInventory() {
  try {
    const res = await fetch(`${API_URL}/gov/ai-inventory`, { headers });
    if (res.status === 401) return window.location.href = 'index.html';
    
    let inventory = await res.json();
    inventory = inventory.filter(item => item.orgId === currentOrgId);

    document.getElementById('statTotalModels').textContent = inventory.length;
    document.getElementById('statHighRisk').textContent = inventory.filter(i => i.risk_level === 'alto').length;

    const tbody = document.getElementById('inventoryTableBody');
    if (inventory.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay modelos registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = inventory.map(item => {
      let riskColor = 'bg-slate-700 text-slate-300';
      if (item.risk_level === 'alto') riskColor = 'bg-rose-950 text-rose-400 border border-rose-800';
      if (item.risk_level === 'medio') riskColor = 'bg-amber-950 text-amber-400 border border-amber-800';
      if (item.risk_level === 'bajo') riskColor = 'bg-teal-950 text-teal-400 border border-teal-800';
      
      const company = companiesCache.find(c => c._id === item.companyId);
      const companyName = company ? company.name : 'Desconocida';

      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition">
          <td class="py-3 px-4 font-semibold text-slate-200">${item.model_name}</td>
          <td class="py-3 px-4 text-slate-400 capitalize">${item.category}</td>
          <td class="py-3 px-4 text-slate-400">${companyName}</td>
          <td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${riskColor}">${item.risk_level}</span></td>
          <td class="py-3 px-4 text-slate-400 capitalize">${item.status.replace('_', ' ')}</td>
        </tr>
      `;
    }).join('');
  } catch (error) {}
}

async function loadLeads() {
  try {
    const res = await fetch(`${API_URL}/leads`, { headers });
    const leads = await res.json();
    const tbody = document.getElementById('leadsTableBody');
    
    if (leads.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">Aún no hay prospectos.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = leads.map(l => {
      const date = new Date(l.ts).toLocaleDateString('es-MX');
      let badgeColor = 'bg-teal-950 text-teal-400 border border-teal-800';
      if (l.risk_level === 'alto') badgeColor = 'bg-rose-950 text-rose-400 border border-rose-800';
      
      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition">
          <td class="py-3 px-4 text-slate-500">${date}</td>
          <td class="py-3 px-4 font-semibold text-slate-200">${l.name}</td>
          <td class="py-3 px-4 text-teal-400">${l.email}</td>
          <td class="py-3 px-4 text-slate-300">${l.company}</td>
          <td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${badgeColor}">${l.risk_level}</span></td>
        </tr>
      `;
    }).join('');
  } catch (error) {}
}

async function loadUsers() {
  try {
    const res = await fetch(`${API_URL}/gov/users`, { headers });
    const users = await res.json();
    const tbody = document.getElementById('usersTableBody');
    
    tbody.innerHTML = users.map(u => `
      <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition">
        <td class="py-3 px-4 font-semibold text-slate-200">${u.name || 'Sin nombre'}</td>
        <td class="py-3 px-4 text-slate-300">${u.email}</td>
        <td class="py-3 px-4 text-teal-400 capitalize">${u.role}</td>
        <td class="py-3 px-4 text-slate-500 font-mono text-xs">${u.orgId}</td>
      </tr>
    `).join('');
  } catch (error) { console.error("Error users:", error); }
}

// ==========================================
// SUBIR EVIDENCIA (APLICA PARA TODAS)
// ==========================================
async function subirEvidencia(event, qId) {
  const file = event.target.files[0];
  if (!file) return;

  const btn = document.getElementById(`btn_${qId}`);
  const status = document.getElementById(`status_${qId}`);
  const select = document.getElementById(qId);
  const companyId = document.getElementById('diagCompany').value;

  if (!companyId) {
    alert("Por favor selecciona una filial primero.");
    event.target.value = "";
    return;
  }

  btn.textContent = "⏳ Analizando...";
  btn.disabled = true;
  status.textContent = "";
  
  const formData = new FormData();
  formData.append("file", file);
  formData.append("companyId", companyId);
  formData.append("questionId", qId);

  try {
    const res = await fetch(`${API_URL}/gov/upload-evidence`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (res.ok && data.validation.valido) {
      btn.textContent = "✅ Validado";
      btn.classList.replace('bg-slate-700', 'bg-teal-900');
      btn.classList.replace('hover:bg-slate-600', 'hover:bg-teal-800');
      status.textContent = "Aprobado";
      status.className = "text-[10px] mt-1 text-teal-400 font-bold text-right w-36 truncate";
      select.value = "5"; 
      select.dataset.hasEvidence = "true"; // Bandera de evidencia válida
    } else {
      btn.textContent = "❌ Rechazado";
      btn.classList.replace('bg-slate-700', 'bg-rose-900');
      status.textContent = data.validation?.razon || "No válido";
      status.className = "text-[10px] mt-1 text-rose-400 text-right w-36 truncate";
      select.value = "0";
      select.dataset.hasEvidence = "false";
    }
  } catch (err) {
    console.error(err);
    btn.textContent = "📎 Subir Evidencia";
    status.textContent = "Error de red";
    status.className = "text-[10px] mt-1 text-rose-400 text-right w-36 truncate";
    select.dataset.hasEvidence = "false";
  } finally {
    btn.disabled = false;
    event.target.value = ""; // Permite volver a subir si falla
  }
}

// MODALES
const modalModel = document.getElementById('newModelModal');
const formModel = document.getElementById('newModelForm');
document.getElementById('openModalBtn').addEventListener('click', () => modalModel.classList.remove('hidden'));
document.getElementById('closeModalBtn').addEventListener('click', () => modalModel.classList.add('hidden'));

formModel.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = formModel.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
  const payload = { companyId: document.getElementById('modelCompany').value, model_name: document.getElementById('modelName').value, category: document.getElementById('modelCategory').value, risk_level: document.getElementById('modelRisk').value, vendor: 'Desconocido', status: 'en_uso' };
  try {
    const res = await fetch(`${API_URL}/gov/ai-inventory`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (res.ok) { modalModel.classList.add('hidden'); formModel.reset(); loadInventory(); } else alert('Error al guardar');
  } catch (err) { alert('Error'); } finally { btn.textContent = 'Guardar Modelo'; btn.disabled = false; }
});

const modalCompany = document.getElementById('newCompanyModal');
const formCompany = document.getElementById('newCompanyForm');
document.getElementById('openCompanyModalBtn').addEventListener('click', () => modalCompany.classList.remove('hidden'));
document.getElementById('closeCompanyModalBtn').addEventListener('click', () => modalCompany.classList.add('hidden'));

formCompany.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = formCompany.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
  const payload = { name: document.getElementById('companyNameInput').value, riskProfile: document.getElementById('companyProfileInput').value };
  try {
    const res = await fetch(`${API_URL}/gov/orgs/${currentOrgId}/companies`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (res.ok) { modalCompany.classList.add('hidden'); formCompany.reset(); loadCompanies(); } else alert('Error al guardar');
  } catch (err) { alert('Error'); } finally { btn.textContent = 'Guardar Filial'; btn.disabled = false; }
});

const modalUser = document.getElementById('newUserModal');
const formUser = document.getElementById('newUserForm');

document.getElementById('openUserModalBtn').addEventListener('click', async () => {
  const userOrgSelect = document.getElementById('userOrg');
  if (orgsCache.length === 0) {
    const res = await fetch(`${API_URL}/gov/orgs`, { headers });
    orgsCache = await res.json();
  }
  userOrgSelect.innerHTML = orgsCache.map(o => `<option value="${o._id}">${o.name}</option>`).join('');
  modalUser.classList.remove('hidden');
});

document.getElementById('closeUserModalBtn').addEventListener('click', () => modalUser.classList.add('hidden'));

formUser.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = formUser.querySelector('button[type="submit"]'); btn.textContent = 'Creando...'; btn.disabled = true;
  const payload = { name: document.getElementById('userName').value, email: document.getElementById('userEmailInput').value, password: document.getElementById('userPassword').value, role: document.getElementById('userRole').value, orgId: document.getElementById('userOrg').value };
  try {
    const res = await fetch(`${API_URL}/gov/users`, { method: 'POST', headers, body: JSON.stringify(payload) });
    let data = {}; try { data = await res.json(); } catch (e) {}
    if (res.ok) { modalUser.classList.add('hidden'); formUser.reset(); loadUsers(); alert("Usuario creado exitosamente."); } 
    else { alert('Error del Servidor: ' + (data.error || 'Revisa la terminal')); }
  } catch (err) { alert('Error de red.'); } finally { btn.textContent = 'Crear Usuario'; btn.disabled = false; }
});

// DIAGNÓSTICO
const modalDiag = document.getElementById('diagnosticModal');
const formDiag = document.getElementById('diagnosticForm');
const diagFormCont = document.getElementById('diagnosticFormContainer');
const diagResultCont = document.getElementById('diagnosticResultContainer');

document.getElementById('openDiagnosticBtn').addEventListener('click', () => {
  diagFormCont.classList.remove('hidden'); diagResultCont.classList.add('hidden'); modalDiag.classList.remove('hidden'); modalDiag.classList.add('flex');
  const btnAI = document.getElementById('btnGenerateAIReport'); btnAI.classList.add('hidden'); btnAI.textContent = '🧠 Generando Reporte...';
  
  // Resetear todas las evidencias al abrir
  for(let i=1; i<=12; i++) {
    const qId = `q${i}`;
    document.getElementById(`status_${qId}`).textContent = "";
    const btnUpload = document.getElementById(`btn_${qId}`);
    if(btnUpload) {
      btnUpload.textContent = "📎 Subir Evidencia";
      btnUpload.className = "text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg border border-slate-500 transition w-36";
    }
    const sel = document.getElementById(qId);
    if(sel) sel.dataset.hasEvidence = "false";
  }
});
document.getElementById('closeDiagBtn').addEventListener('click', () => { modalDiag.classList.add('hidden'); modalDiag.classList.remove('flex'); });
document.getElementById('closeResultBtn').addEventListener('click', () => { modalDiag.classList.add('hidden'); modalDiag.classList.remove('flex'); });

formDiag.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = formDiag.querySelector('button[type="submit"]'); btn.textContent = 'Calculando...'; btn.disabled = true;
  const companySelect = document.getElementById('diagCompany'); const companyId = companySelect.value; const companyName = companySelect.options[companySelect.selectedIndex].text;
  
  const qSelects = document.querySelectorAll('.diag-q');
  let totalScore = 0; const answers = {}; let phase1 = [], phase2 = [], phase3 = [];
  const recs = [ {p1:"Política IA.",p2:"Capacitar.",p3:"Auditar."}, {p1:"Oficial IA.",p2:"Comité.",p3:"Revisión."}, {p1:"Presupuesto.",p2:"Plan anual.",p3:"ROI."}, {p1:"Checklist AIA.",p2:"Automatizar.",p3:"Auditoría."}, {p1:"Modelos críticos.",p2:"Equidad.",p3:"Monitoreo."}, {p1:"Kill Switch.",p2:"Simulacros.",p3:"BCP."}, {p1:"Linaje.",p2:"Catálogo.",p3:"DPIA."}, {p1:"Métricas.",p2:"MLOps.",p3:"Reentrenar."}, {p1:"Backup prompts.",p2:"Git.",p3:"Trazabilidad."}, {p1:"Aviso IA.",p2:"Explicar.",p3:"XAI."}, {p1:"Caja negra.",p2:"Reportes.",p3:"Razones."}, {p1:"Buzón quejas.",p2:"Human-in-loop.",p3:"Métricas."} ];

  qSelects.forEach((sel, index) => {
    let val = parseInt(sel.value);
    const hasEvidence = sel.dataset.hasEvidence === "true"; // Leer bandera de cada pregunta
    
    if (val >= 4 && !hasEvidence) val = 2; 
    
    totalScore += val; answers[`q${index+1}`] = { score: val, evidence: hasEvidence };
    const rec = recs[index];
    if (val <= 2) { phase1.push(rec.p1); phase2.push(rec.p2); phase3.push(rec.p3); }
    else if (val === 3) { phase2.push(rec.p2); phase3.push(rec.p3); }
    else if (val >= 4) { phase3.push(rec.p3); }
  });

  const percentage = Math.round((totalScore / 60) * 100);
  let riskLevel = 'alto', label = 'Crítico', color = 'text-rose-400';
  if (percentage > 30 && percentage <= 60) { riskLevel = 'medio'; label = 'En Desarrollo'; color = 'text-amber-400'; }
  else if (percentage > 60 && percentage <= 85) { riskLevel = 'bajo'; label = 'Maduro'; color = 'text-blue-400'; }
  else if (percentage > 85) { riskLevel = 'bajo'; label = 'Excelente'; color = 'text-teal-400'; }

  const payload = { companyId, framework: "ISO42001", answers, score: percentage, risk_level: riskLevel, recommendations: { phase1, phase2, phase3 } };

  try {
    const res = await fetch(`${API_URL}/gov/evaluations`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (res.ok) {
      document.getElementById('statMaturity').textContent = `${percentage}%`; document.getElementById('statMaturity').className = `text-4xl font-bold ${color}`;
      document.getElementById('finalScore').textContent = `${percentage}%`; document.getElementById('finalScore').className = `text-5xl font-black mb-1 ${color}`;
      document.getElementById('finalRiskLabel').textContent = label;
      document.getElementById('roadmapPhase1').textContent = phase1.join(" ") || "Nada pendiente.";
      document.getElementById('roadmapPhase2').textContent = phase2.join(" ") || "Nada pendiente.";
      document.getElementById('roadmapPhase3').textContent = phase3.join(" ") || "Nada pendiente.";

      const btnAI = document.getElementById('btnGenerateAIReport');
      btnAI.classList.remove('hidden'); btnAI.textContent = '🧠 Generando Reporte...'; btnAI.disabled = true;

      const aiRes = await fetch(`${API_URL}/gov/generate-report`, { method: 'POST', headers, body: JSON.stringify({ companyName, score: percentage, riskLevel, answers }) });
      if (aiRes.ok) {
        const aiData = await aiRes.json(); document.getElementById('aiReportText').innerText = aiData.report;
        btnAI.textContent = '📄 Ver Reporte en PDF'; btnAI.disabled = false; btnAI.classList.replace('bg-slate-600', 'bg-blue-600');
        btnAI.onclick = () => {
          const w = window.open('', '_blank');
          w.document.write(`<!DOCTYPE html><html><head><title>Reporte - ${companyName}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="p-12"><div class="max-w-3xl mx-auto"><h1 class="text-3xl font-black border-b-4 border-blue-600 pb-4 mb-4">Reporte Ejecutivo de Gobernanza de IA</h1><p class="text-xl"><b>Empresa:</b> ${companyName}</p><p class="mb-6"><b>Score:</b> ${percentage}% (${label})</p><div class="prose"><h3 class="font-bold text-lg">Análisis IA:</h3><p class="whitespace-pre-wrap">${aiData.report}</p></div></div></body></html>`);
          w.document.close();
        };
      } else { btnAI.textContent = '❌ Error de IA'; btnAI.disabled = false; }

      diagFormCont.classList.add('hidden'); diagResultCont.classList.remove('hidden');
    }
  } catch (err) { alert('Error de conexión'); } finally { btn.textContent = 'Calcular Madurez'; btn.disabled = false; }
});

// GENERADOR DE POLÍTICA
document.getElementById('btnGeneratePolicy').addEventListener('click', () => {
  const orgName = document.getElementById('orgSelector')?.selectedOptions[0]?.text || "Organización";
  const currentDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const policyWindow = window.open('', '_blank');
  policyWindow.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Política de IA - ${orgName}</title><script src="https://cdn.tailwindcss.com"></script><style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }</style></head><body class="bg-gray-100 font-sans text-gray-800 p-8"><div class="max-w-4xl mx-auto mb-4 no-print flex justify-end"><button onclick="window.print()" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded shadow-lg transition">🖨️ Guardar como PDF / Imprimir</button></div><div class="max-w-4xl mx-auto bg-white p-12 shadow-xl border-t-8 border-teal-600 rounded-sm"><div class="text-center mb-12 border-b pb-8"><h1 class="text-3xl font-black text-gray-900 uppercase tracking-tight">Política Corporativa de Uso Aceptable de Inteligencia Artificial</h1><p class="text-gray-500 mt-2 font-semibold">${orgName}</p><p class="text-gray-400 text-sm mt-1">Versión 1.0 | Fecha de emisión: ${currentDate}</p></div><div class="space-y-6 text-sm text-justify leading-relaxed text-gray-700"><section><h2 class="text-lg font-bold text-gray-900 mb-2">1. Propósito y Alcance</h2><p>La presente política establece los lineamientos obligatorios para el uso, desarrollo, adquisición y despliegue de sistemas de Inteligencia Artificial (IA) dentro de <strong>${orgName}</strong>. Es aplicable a todos los colaboradores, contratistas y proveedores...</p></section><section><h2 class="text-lg font-bold text-gray-900 mb-2">2. Principios Rectores</h2><ul class="list-disc pl-5 space-y-1"><li><strong>Supervisión Humana:</strong> Todo sistema de IA debe mantener un nivel de control humano significativo en la toma de decisiones críticas.</li><li><strong>Privacidad por Diseño:</strong> Queda estrictamente prohibido ingresar datos personales o secretos comerciales en herramientas de IA Generativa públicas.</li></ul></section><div class="mt-16 pt-8 border-t border-gray-300"><div class="flex justify-between px-12"><div class="text-center"><div class="border-t border-gray-400 w-48 mt-8"></div><p class="font-bold mt-2 text-gray-800">Dirección General</p></div><div class="text-center"><div class="border-t border-gray-400 w-48 mt-8"></div><p class="font-bold mt-2 text-gray-800">Oficial de Cumplimiento de IA</p></div></div></div></div></div></body></html>`);
  policyWindow.document.close();
});

init();