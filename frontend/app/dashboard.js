//const API_URL = 'http://localhost:3000'; // En producción será https://behavior-lab.onrender.com
const API_URL = 'https://behavior-lab.onrender.com';
const token = localStorage.getItem('gov_token');

// 1. Escudo de seguridad (Auth Guard)
if (!token) {
  window.location.href = 'index.html';
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

// 2. Botón de cerrar sesión
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('gov_token');
  localStorage.removeItem('gov_user');
  window.location.href = 'index.html';
});

// 3. Cargar datos
async function loadDashboard() {
  try {
    const user = JSON.parse(localStorage.getItem('gov_user'));
    if (user) {
      document.getElementById('userEmail').textContent = user.email;
    }

    // Fetch Inventario de IA
    const resInventory = await fetch(`${API_URL}/gov/ai-inventory`, { headers });
    if (resInventory.status === 401) return window.location.href = 'index.html';
    
    const inventory = await resInventory.json();
    renderInventory(inventory);

    // Fetch Filiales (Companies)
    if (user && user.orgId) {
      const resCompanies = await fetch(`${API_URL}/gov/orgs/${user.orgId}/companies`, { headers });
      if (resCompanies.ok) {
        const companies = await resCompanies.json();
        document.getElementById('statCompanies').textContent = companies.length;
      }
    }

  } catch (error) {
    console.error("Error:", error);
    alert("Error al cargar los datos. Revisa que el backend esté encendido.");
  }
}

// 4. Renderizar tabla
function renderInventory(inventory) {
  const tbody = document.getElementById('inventoryTableBody');
  
  // Actualizar tarjetas de estadísticas
  document.getElementById('statTotalModels').textContent = inventory.length;
  const highRisk = inventory.filter(item => item.risk_level === 'alto').length;
  document.getElementById('statHighRisk').textContent = highRisk;

  if (inventory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay modelos registrados aún.</td></tr>`;
    return;
  }

  // Construir filas
  tbody.innerHTML = inventory.map(item => {
    let riskColor = 'bg-slate-700 text-slate-300';
    if (item.risk_level === 'alto') riskColor = 'bg-rose-950 text-rose-400 border border-rose-800';
    if (item.risk_level === 'medio') riskColor = 'bg-amber-950 text-amber-400 border border-amber-800';
    if (item.risk_level === 'bajo') riskColor = 'bg-teal-950 text-teal-400 border border-teal-800';

    return `
      <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition">
        <td class="py-3 px-4 font-semibold text-slate-200">${item.model_name}</td>
        <td class="py-3 px-4 text-slate-400 capitalize">${item.category}</td>
        <td class="py-3 px-4 text-slate-400">${item.vendor || 'N/A'}</td>
        <td class="py-3 px-4">
          <span class="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${riskColor}">
            ${item.risk_level}
          </span>
        </td>
        <td class="py-3 px-4 text-slate-400 capitalize">${item.status.replace('_', ' ')}</td>
      </tr>
    `;
  }).join('');
}

// Iniciar
loadDashboard();