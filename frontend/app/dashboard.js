const API_URL = 'http://localhost:3000'; 
// const API_URL = 'https://behavior-lab.onrender.com'; 

const token = localStorage.getItem('gov_token');
if (!token) window.location.href = 'index.html';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

let currentUser = null;
let currentOrgId = null;
let companiesCache = []; 

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
    const orgs = await res.json();
    
    const selector = document.getElementById('orgSelector');
    selector.innerHTML = orgs.map(o => `<option value="${o._id}">${o.name}</option>`).join('');
    
    selector.addEventListener('change', (e) => {
      currentOrgId = e.target.value;
      loadDashboardData();
    });
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
const secInv = document.getElementById('inventorySection');
const secComp = document.getElementById('companiesSection');
const secLeads = document.getElementById('leadsSection');

function resetTabs() {
  tabInvBtn.className = 'text-slate-500 hover:text-slate-300 pb-2 transition';
  tabCompBtn.className = 'text-slate-500 hover:text-slate-300 pb-2 transition';
  tabLeadsBtn.className = 'text-slate-500 hover:text-slate-300 pb-2 transition';
  secInv.classList.add('hidden'); secInv.classList.remove('block');
  secComp.classList.add('hidden'); secComp.classList.remove('block');
  secLeads.classList.add('hidden'); secLeads.classList.remove('block');
}

tabInvBtn.addEventListener('click', () => {
  resetTabs();
  tabInvBtn.className = 'text-teal-400 font-semibold border-b-2 border-teal-400 pb-2 transition';
  secInv.classList.remove('hidden'); secInv.classList.add('block');
});

tabCompBtn.addEventListener('click', () => {
  resetTabs();
  tabCompBtn.className = 'text-teal-400 font-semibold border-b-2 border-teal-400 pb-2 transition';
  secComp.classList.remove('hidden'); secComp.classList.add('block');
});

tabLeadsBtn.addEventListener('click', () => {
  resetTabs();
  tabLeadsBtn.className = 'text-teal-400 font-semibold border-b-2 border-teal-400 pb-2 transition';
  secLeads.classList.remove('hidden'); secLeads.classList.add('block');
  loadLeads();
});

// CARGAR FILIALES
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
    
    const select = document.getElementById('modelCompany');
    select.innerHTML = companiesCache.length === 0 
      ? `<option value="">Crea una filial primero</option>`
      : companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
  } catch (error) {}
}

// CARGAR INVENTARIO
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

// CARGAR PROSPECTOS
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

// MODALES
const modalModel = document.getElementById('newModelModal');
const formModel = document.getElementById('newModelForm');
document.getElementById('openModalBtn').addEventListener('click', () => modalModel.classList.remove('hidden'));
document.getElementById('closeModalBtn').addEventListener('click', () => modalModel.classList.add('hidden'));

formModel.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = formModel.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
  const payload = {
    companyId: document.getElementById('modelCompany').value,
    model_name: document.getElementById('modelName').value,
    category: document.getElementById('modelCategory').value,
    risk_level: document.getElementById('modelRisk').value,
    vendor: 'Desconocido', status: 'en_uso'
  };
  try {
    const res = await fetch(`${API_URL}/gov/ai-inventory`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (res.ok) { modalModel.classList.add('hidden'); formModel.reset(); loadInventory(); }
    else alert('Error al guardar');
  } catch (err) { alert('Error'); }
  finally { btn.textContent = 'Guardar Modelo'; btn.disabled = false; }
});

const modalCompany = document.getElementById('newCompanyModal');
const formCompany = document.getElementById('newCompanyForm');
document.getElementById('openCompanyModalBtn').addEventListener('click', () => modalCompany.classList.remove('hidden'));
document.getElementById('closeCompanyModalBtn').addEventListener('click', () => modalCompany.classList.add('hidden'));

formCompany.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = formCompany.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
  const payload = {
    name: document.getElementById('companyNameInput').value,
    riskProfile: document.getElementById('companyProfileInput').value
  };
  try {
    const res = await fetch(`${API_URL}/gov/orgs/${currentOrgId}/companies`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (res.ok) { modalCompany.classList.add('hidden'); formCompany.reset(); loadCompanies(); }
    else alert('Error al guardar');
  } catch (err) { alert('Error'); }
  finally { btn.textContent = 'Guardar Filial'; btn.disabled = false; }
});

// GENERADOR DE POLÍTICA
document.getElementById('btnGeneratePolicy').addEventListener('click', () => {
  const orgName = document.getElementById('orgSelector')?.selectedOptions[0]?.text || "Organización";
  const currentDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const policyWindow = window.open('', '_blank');
  policyWindow.document.write(`
    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Política de IA - ${orgName}</title><script src="https://cdn.tailwindcss.com"></script><style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }</style></head><body class="bg-gray-100 font-sans text-gray-800 p-8"><div class="max-w-4xl mx-auto mb-4 no-print flex justify-end"><button onclick="window.print()" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded shadow-lg transition">🖨️ Guardar como PDF / Imprimir</button></div><div class="max-w-4xl mx-auto bg-white p-12 shadow-xl border-t-8 border-teal-600 rounded-sm"><div class="text-center mb-12 border-b pb-8"><h1 class="text-3xl font-black text-gray-900 uppercase tracking-tight">Política Corporativa de Uso Aceptable de Inteligencia Artificial</h1><p class="text-gray-500 mt-2 font-semibold">${orgName}</p><p class="text-gray-400 text-sm mt-1">Versión 1.0 | Fecha de emisión: ${currentDate}</p></div><div class="space-y-6 text-sm text-justify leading-relaxed text-gray-700"><section><h2 class="text-lg font-bold text-gray-900 mb-2">1. Propósito y Alcance</h2><p>La presente política establece los lineamientos obligatorios para el uso, desarrollo, adquisición y despliegue de sistemas de Inteligencia Artificial (IA) dentro de <strong>${orgName}</strong>. Es aplicable a todos los colaboradores, contratistas y proveedores...</p></section><section><h2 class="text-lg font-bold text-gray-900 mb-2">2. Principios Rectores</h2><ul class="list-disc pl-5 space-y-1"><li><strong>Supervisión Humana:</strong> Todo sistema de IA debe mantener un nivel de control humano significativo en la toma de decisiones críticas.</li><li><strong>Privacidad por Diseño:</strong> Queda estrictamente prohibido ingresar datos personales o secretos comerciales en herramientas de IA Generativa públicas.</li></ul></section><div class="mt-16 pt-8 border-t border-gray-300"><div class="flex justify-between px-12"><div class="text-center"><div class="border-t border-gray-400 w-48 mt-8"></div><p class="font-bold mt-2 text-gray-800">Dirección General</p></div><div class="text-center"><div class="border-t border-gray-400 w-48 mt-8"></div><p class="font-bold mt-2 text-gray-800">Oficial de Cumplimiento de IA</p></div></div></div></div></div></body></html>
  `);
  policyWindow.document.close();
});

init();