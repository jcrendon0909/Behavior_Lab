const API_URL = 'http://localhost:3000'; 
// const API_URL = 'https://behavior-lab.onrender.com'; // En producción

const token = localStorage.getItem('gov_token');

if (!token) {
  window.location.href = 'index.html';
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('gov_token');
  localStorage.removeItem('gov_user');
  window.location.href = 'index.html';
});

async function loadDashboard() {
  try {
    const user = JSON.parse(localStorage.getItem('gov_user'));
    if (user) document.getElementById('userEmail').textContent = user.email;

    const resInventory = await fetch(`${API_URL}/gov/ai-inventory`, { headers });
    if (resInventory.status === 401) return window.location.href = 'index.html';
    
    const inventory = await resInventory.json();
    renderInventory(inventory);

    if (user && user.orgId) {
      const resCompanies = await fetch(`${API_URL}/gov/orgs/${user.orgId}/companies`, { headers });
      if (resCompanies.ok) {
        const companies = await resCompanies.json();
        document.getElementById('statCompanies').textContent = companies.length;
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

function renderInventory(inventory) {
  const tbody = document.getElementById('inventoryTableBody');
  document.getElementById('statTotalModels').textContent = inventory.length;
  const highRisk = inventory.filter(item => item.risk_level === 'alto').length;
  document.getElementById('statHighRisk').textContent = highRisk;

  if (inventory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay modelos registrados aún.</td></tr>`;
    return;
  }

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

const modal = document.getElementById('newModelModal');
const form = document.getElementById('newModelForm');
const companySelect = document.getElementById('modelCompany');
const submitBtn = form.querySelector('button[type="submit"]');

document.getElementById('openModalBtn').addEventListener('click', () => modal.classList.remove('hidden'));
document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.add('hidden'));

async function loadCompaniesForModal() {
  try {
    const user = JSON.parse(localStorage.getItem('gov_user'));
    if (!user) return;
    
    const res = await fetch(`${API_URL}/gov/orgs/${user.orgId}/companies`, { headers });
    const companies = await res.json();
    
    if (companies.length === 0) {
      companySelect.innerHTML = `<option value="">No hay filiales registradas.</option>`;
    } else {
      companySelect.innerHTML = companies.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
  } catch (e) { 
    console.error(e); 
    companySelect.innerHTML = `<option value="">Error al cargar filiales</option>`;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Guardando...';
  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-50');

  const payload = {
    companyId: companySelect.value,
    model_name: document.getElementById('modelName').value,
    category: document.getElementById('modelCategory').value,
    risk_level: document.getElementById('modelRisk').value,
    vendor: 'Desconocido',
    status: 'en_uso'
  };

  try {
    const res = await fetch(`${API_URL}/gov/ai-inventory`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      modal.classList.add('hidden');
      form.reset();
      loadDashboard(); 
    } else {
      const err = await res.json();
      alert('Error al guardar: ' + (err.error || 'Revisa los datos'));
    }
  } catch (err) {
    alert('Error de conexión. Revisa que el backend esté encendido.');
  } finally {
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50');
  }
});

// ==========================================
// NUEVO: GENERADOR DE POLÍTICA DE IA
// ==========================================
document.getElementById('btnGeneratePolicy').addEventListener('click', () => {
  const user = JSON.parse(localStorage.getItem('gov_user'));
  const companyName = "GōkuLab Core"; // Podríamos hacerlo dinámico después
  const currentDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // Creamos una nueva ventana con el documento formateado
  const policyWindow = window.open('', '_blank');
  
  policyWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Política de IA - ${companyName}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body class="bg-gray-100 font-sans text-gray-800 p-8">
      
      <!-- Botón de imprimir (oculto al imprimir) -->
      <div class="max-w-4xl mx-auto mb-4 no-print flex justify-end">
        <button onclick="window.print()" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded shadow-lg transition">
          🖨️ Guardar como PDF / Imprimir
        </button>
      </div>

      <!-- Documento -->
      <div class="max-w-4xl mx-auto bg-white p-12 shadow-xl border-t-8 border-teal-600 rounded-sm">
        
        <div class="text-center mb-12 border-b pb-8">
          <h1 class="text-3xl font-black text-gray-900 uppercase tracking-tight">Política Corporativa de Uso Aceptable de Inteligencia Artificial</h1>
          <p class="text-gray-500 mt-2 font-semibold">${companyName}</p>
          <p class="text-gray-400 text-sm mt-1">Versión 1.0 | Fecha de emisión: ${currentDate}</p>
        </div>

        <div class="space-y-6 text-sm text-justify leading-relaxed text-gray-700">
          <section>
            <h2 class="text-lg font-bold text-gray-900 mb-2">1. Propósito y Alcance</h2>
            <p>La presente política establece los lineamientos obligatorios para el uso, desarrollo, adquisición y despliegue de sistemas de Inteligencia Artificial (IA) dentro de <strong>${companyName}</strong>. Es aplicable a todos los colaboradores, contratistas y proveedores. Su objetivo es garantizar que el uso de la IA se realice de manera ética, segura, transparente y en estricto cumplimiento con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y los estándares internacionales (ISO/IEC 42001, NIST AI RMF).</p>
          </section>

          <section>
            <h2 class="text-lg font-bold text-gray-900 mb-2">2. Principios Rectores</h2>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Supervisión Humana:</strong> Todo sistema de IA debe mantener un nivel de control humano significativo (Human-in-the-loop) en la toma de decisiones críticas.</li>
              <li><strong>Transparencia y Explicabilidad:</strong> Se debe informar a los usuarios cuando interactúan con un sistema de IA y documentar la lógica de sus resultados.</li>
              <li><strong>Privacidad por Diseño:</strong> Queda estrictamente prohibido ingresar datos personales de clientes, empleados o secretos comerciales (fórmulas, finanzas) en herramientas de IA Generativa públicas (Shadow AI).</li>
              <li><strong>No Discriminación:</strong> Se deben auditar los modelos para evitar sesgos algorítmicos que afecten la equidad.</li>
            </ul>
          </section>

          <section>
            <h2 class="text-lg font-bold text-gray-900 mb-2">3. Gestión de Riesgos y Clasificación</h2>
            <p>Todos los modelos de IA utilizados en la empresa deben ser registrados en el <strong>Inventario de IA de Behavior Lab</strong>. Los riesgos se clasificarán de la siguiente manera:</p>
            <ul class="list-disc pl-5 space-y-1 mt-2">
              <li><span class="font-bold text-red-600">Riesgo Alto:</span> Modelos que toman decisiones automatizadas sobre personas, procesan datos sensibles (salud, biometría) o interactúan de forma autónoma con clientes. (Requieren aprobación del Comité de IA).</li>
              <li><span class="font-bold text-amber-600">Riesgo Medio:</span> Herramientas que asisten en la redacción, análisis de datos no sensibles o atención al cliente con revisión humana.</li>
              <li><span class="font-bold text-teal-600">Riesgo Bajo:</span> Herramientas de productividad interna (ej. resumen de correos) que no involucran datos de terceros.</li>
            </ul>
          </section>

          <section>
            <h2 class="text-lg font-bold text-gray-900 mb-2">4. Uso Aceptable y Prohibiciones</h2>
            <p>Los colaboradores se comprometen a:</p>
            <ul class="list-disc pl-5 space-y-1 mt-2">
              <li>Utilizar únicamente herramientas de IA aprobadas y corporativas.</li>
              <li>Verificar los sesgos y "alucinaciones" en los textos generados antes de su publicación oficial.</li>
              <li>Reportar cualquier comportamiento anómalo del sistema al equipo de TI o al Oficial de IA.</li>
            </ul>
            <p class="mt-2 font-bold text-red-600">Queda terminantemente prohibido:</p>
            <ul class="list-disc pl-5 space-y-1 text-red-700">
              <li>Subir código fuente propietario, bases de datos de clientes o documentos confidenciales a herramientas de IA Generativa no corporativas.</li>
              <li>Utilizar IA para generar contenido discriminatorio, difamatorio o que viole derechos de autor.</li>
            </ul>
          </section>

          <section>
            <h2 class="text-lg font-bold text-gray-900 mb-2">5. Cumplimiento y Sanciones</h2>
            <p>El incumplimiento de esta política será sometido a revisión por el Comité de Ética y Cumplimiento de <strong>${companyName}</strong> y podrá derivar en sanciones administrativas o laborales de acuerdo con el reglamento interno y las leyes aplicables en México.</p>
          </section>

          <div class="mt-16 pt-8 border-t border-gray-300">
            <p class="text-center text-gray-500 mb-8 text-xs">Documento generado automáticamente a través de la plataforma Behavior Lab.</p>
            <div class="flex justify-between px-12">
              <div class="text-center">
                <div class="border-t border-gray-400 w-48 mt-8"></div>
                <p class="font-bold mt-2 text-gray-800">Dirección General</p>
              </div>
              <div class="text-center">
                <div class="border-t border-gray-400 w-48 mt-8"></div>
                <p class="font-bold mt-2 text-gray-800">Oficial de Cumplimiento de IA</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
  policyWindow.document.close();
});

// Iniciar todo
loadDashboard();
loadCompaniesForModal();