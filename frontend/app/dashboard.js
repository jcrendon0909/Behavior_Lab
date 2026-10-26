document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'https://behavior-lab.onrender.com'; 

  const token = localStorage.getItem('gov_token');
  if (!token) { window.location.href = 'index.html'; return; }

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  let currentUser = null;
  let currentOrgId = null;
  let companiesCache = []; 
  let orgsCache = [];
  let leadsCache = [];
  let currentLeadToConvert = null;
  let aigosQuestionsCache = [];
  let masterRisksCache = [];

  const isSameOrg = (id1, id2) => (!id1 || !id2) ? false : id1.toString() === id2.toString();

  // ==========================================
  // 1. NAVEGACIÓN Y EVENTOS BÁSICOS
  // ==========================================
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('gov_token'); 
    localStorage.removeItem('gov_user'); 
    window.location.href = 'index.html';
  });

  const tabs = ['tabDashboardBtn', 'tabInventoryBtn', 'tabMatrixBtn', 'tabRisksBtn', 'tabDeliverablesBtn', 'tabCompaniesBtn', 'tabProcessesBtn', 'tabLeadsBtn', 'tabUsersBtn', 'tabEvidenceBtn'];
  const sections = ['dashboardSection', 'inventorySection', 'matrixSection', 'risksSection', 'deliverablesSection', 'companiesSection', 'processesSection', 'leadsSection', 'usersSection', 'evidenceSection'];

  function resetTabs() {
    tabs.forEach(id => { 
      const el = document.getElementById(id); 
      if(el) el.className = 'text-slate-400 hover:text-slate-200 pb-2 transition whitespace-nowrap px-2'; 
    });
    sections.forEach(id => { 
      const el = document.getElementById(id); 
      if(el) { el.classList.add('hidden'); el.classList.remove('block'); } 
    });
  }

  function setTab(tabId, secId, loadFn) {
    resetTabs(); 
    const tab = document.getElementById(tabId); 
    if(tab) tab.className = 'text-teal-400 font-semibold pb-2 border-b-2 border-teal-400 transition whitespace-nowrap px-2'; 
    const sec = document.getElementById(secId); 
    if(sec) { sec.classList.remove('hidden'); sec.classList.add('block'); }
    if(loadFn) loadFn();
  }

  document.getElementById('tabDashboardBtn')?.addEventListener('click', () => setTab('tabDashboardBtn', 'dashboardSection', loadExecutiveDashboard));
  document.getElementById('tabInventoryBtn')?.addEventListener('click', () => setTab('tabInventoryBtn', 'inventorySection', loadInventory));
  document.getElementById('tabMatrixBtn')?.addEventListener('click', () => setTab('tabMatrixBtn', 'matrixSection', loadControls));
  document.getElementById('tabRisksBtn')?.addEventListener('click', () => setTab('tabRisksBtn', 'risksSection', loadRisks));
  document.getElementById('tabDeliverablesBtn')?.addEventListener('click', () => setTab('tabDeliverablesBtn', 'deliverablesSection', loadDeliverables));
  document.getElementById('tabCompaniesBtn')?.addEventListener('click', () => setTab('tabCompaniesBtn', 'companiesSection', loadCompanies));
  document.getElementById('tabProcessesBtn')?.addEventListener('click', () => setTab('tabProcessesBtn', 'processesSection', loadProcesses));
  document.getElementById('tabLeadsBtn')?.addEventListener('click', () => setTab('tabLeadsBtn', 'leadsSection', loadLeads));
  document.getElementById('tabUsersBtn')?.addEventListener('click', () => setTab('tabUsersBtn', 'usersSection', loadUsers));
  document.getElementById('tabEvidenceBtn')?.addEventListener('click', () => setTab('tabEvidenceBtn', 'evidenceSection', loadEvidence));

  // ==========================================
  // 2. MODALES Y SUS EVENTOS DE APERTURA
  // ==========================================
  const modalModel = document.getElementById('newModelModal');
  document.getElementById('openModalBtn')?.addEventListener('click', () => modalModel.classList.remove('hidden'));
  document.getElementById('closeModalBtn')?.addEventListener('click', () => modalModel.classList.add('hidden'));

  const modalOrg = document.getElementById('newOrgModal');
  document.getElementById('openOrgModalBtn')?.addEventListener('click', () => modalOrg.classList.remove('hidden'));
  document.getElementById('closeOrgModalBtn')?.addEventListener('click', () => modalOrg.classList.add('hidden'));

  const modalCompany = document.getElementById('newCompanyModal');
  document.getElementById('openCompanyModalBtn')?.addEventListener('click', () =>modalCompany.classList.remove('hidden'));
  document.getElementById('closeCompanyModalBtn')?.addEventListener('click', () => modalCompany.classList.add('hidden'));

  const modalUser = document.getElementById('newUserModal');
  document.getElementById('openUserModalBtn')?.addEventListener('click', async () => {
    const userOrgSelect = document.getElementById('userOrg');
    if (orgsCache.length === 0) { try { const res = await fetch(`${API_URL}/gov/orgs`, { headers }); if (res.ok) orgsCache = await res.json(); } catch(e){} }
    userOrgSelect.innerHTML = orgsCache.map(o => `<option value="${o._id}">${o.name || 'Org sin nombre'}</option>`).join('');
    modalUser.classList.remove('hidden');
  });
  document.getElementById('closeUserModalBtn')?.addEventListener('click', () => modalUser.classList.add('hidden'));

  const modalDeliverable = document.getElementById('newDeliverableModal');
  document.getElementById('openDeliverableModalBtn')?.addEventListener('click', () => { document.getElementById('commonTaskSelect').value = ""; modalDeliverable.classList.remove('hidden'); });
  document.getElementById('closeDeliverableModalBtn')?.addEventListener('click', () => modalDeliverable.classList.add('hidden'));

  const modalRisk = document.getElementById('newRiskModal');
  document.getElementById('openRiskModalBtn')?.addEventListener('click', () => {
    const selectCompany = document.getElementById('riskCompany');
    selectCompany.innerHTML = `<option value="">Global (Toda la org)</option>` + companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    document.getElementById('commonRiskSelect').value = "";
    modalRisk.classList.remove('hidden');
  });
  document.getElementById('closeRiskModalBtn')?.addEventListener('click', () => modalRisk.classList.add('hidden'));

  const modalProcess = document.getElementById('newProcessModal');
  document.getElementById('openProcessModalBtn')?.addEventListener('click', () =>{
    const selectProcComp = document.getElementById('procCompany');
    selectProcComp.innerHTML = `<option value="">Global (Toda la org)</option>` + companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    modalProcess.classList.remove('hidden');
  });
  document.getElementById('closeProcessModalBtn')?.addEventListener('click', () => modalProcess.classList.add('hidden'));

  const modalConvert = document.getElementById('convertLeadModal');
  document.getElementById('closeConvertModalBtn')?.addEventListener('click', () => modalConvert.classList.add('hidden'));

  // MODAL IMPORTAR RIESGOS
  const modalImportRisks = document.getElementById('importRisksModal');
  document.getElementById('openImportRisksModalBtn')?.addEventListener('click', async () => {
    const select = document.getElementById('importRiskCompany');
    select.innerHTML = companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    modalImportRisks.classList.remove('hidden');
    await loadMasterRisks();
  });
  document.getElementById('closeImportRisksModalBtn')?.addEventListener('click', () => modalImportRisks.classList.add('hidden'));
  document.getElementById('cancelImportRisksBtn')?.addEventListener('click', () => modalImportRisks.classList.add('hidden'));

  document.getElementById('submitImportRisksBtn')?.addEventListener('click', async () => {
    const companyId = document.getElementById('importRiskCompany').value;
    const checkedBoxes = document.querySelectorAll('.import-risk-checkbox:checked');
    const riskCodes = Array.from(checkedBoxes).map(cb => cb.value);
    if (!companyId) return alert("Selecciona una filial");
    if (riskCodes.length === 0) return alert("Selecciona al menos un riesgo");

    const btn = document.getElementById('submitImportRisksBtn');
    btn.textContent = "Importando..."; btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/gov/aigos/import-risks`, {
        method: 'POST', headers, body: JSON.stringify({ companyId, riskCodes })
      });
      const data = await res.json();
      if (res.ok) { alert(data.message); modalImportRisks.classList.add('hidden'); loadRisks(); } 
      else { alert("Error: " + data.error); }
    } catch (e) { alert("Error de red"); } finally { btn.textContent = "Importar Seleccionados"; btn.disabled = false; }
  });

  // BOTÓN CARGAR PLAN BASE
  document.getElementById('loadBasePlanBtn')?.addEventListener('click', async () => {
    if (!confirm("¿Estás seguro de cargar el Plan Base AIGOS? Se agregarán las tareas estándar a esta organización.")) return;
    const btn = document.getElementById('loadBasePlanBtn');
    const originalText = btn.textContent;
    btn.textContent = "Cargando..."; btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/gov/aigos/load-base-plan`, {
        method: 'POST', headers, body: JSON.stringify({ orgId: currentOrgId })
      });
      const data = await res.json();
      if (res.ok) { alert(data.message); loadDeliverables(); } 
      else { alert("Error: " + data.error); }
    } catch (e) { alert("Error de red"); } finally { btn.textContent = originalText; btn.disabled = false; }
  });

  // MODAL AIGOS ASSESSMENT
  const modalAigos = document.getElementById('aigosAssessmentModal');
  document.getElementById('openAigosAssessmentBtn')?.addEventListener('click', async () => {
    const diagCompany = document.getElementById('diagCompany');
    diagCompany.innerHTML = companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    modalAigos.classList.remove('hidden');
    await loadAigosQuestions();
  });
  document.getElementById('closeAigosAssessmentBtn')?.addEventListener('click', () => modalAigos.classList.add('hidden'));
  document.getElementById('cancelAigosBtn')?.addEventListener('click', () => modalAigos.classList.add('hidden'));

  const modalAigosResult = document.getElementById('aigosResultModal');
  document.getElementById('closeAigosResultBtn')?.addEventListener('click', () => modalAigosResult.classList.add('hidden'));

  // ==========================================
  // 3. AUTOCOMPLETAR Y SUGERENCIAS IA
  // ==========================================
  window.fillCommonRisk = function() {
    const val = document.getElementById('commonRiskSelect').value;
    if(!val) return;
    if(val === 'fuga') {
      document.getElementById('riskName').value = "Fuga de datos confidenciales en herramientas de IA Generativa";
      document.getElementById('riskCategory').value = "Privacidad";
      document.getElementById('riskProb').value = "4";
      document.getElementById('riskImpact').value = "5";
      document.getElementById('riskMitigation').value = "Implementar política de uso aceptable y bloquear herramientas no autorizadas.";
    } else if(val === 'alucinacion') {
      document.getElementById('riskName').value = "Alucinación o entrega de información incorrecta por parte del Agente";
      document.getElementById('riskCategory').value = "Operacional";
      document.getElementById('riskProb').value = "4";
      document.getElementById('riskImpact').value = "3";
      document.getElementById('riskMitigation').value = "Implementar supervisión humana (Human-in-the-loop) y validación de respuestas.";
    } else if(val === 'sesgo') {
      document.getElementById('riskName').value = "Sesgo algorítmico en la toma de decisiones";
      document.getElementById('riskCategory').value = "Sesgo";
      document.getElementById('riskProb').value = "3";
      document.getElementById('riskImpact').value = "5";
      document.getElementById('riskMitigation').value = "Realizar auditorías de equidad y usar datasets de entrenamiento balanceados.";
    } else if(val === 'trazabilidad') {
      document.getElementById('riskName').value = "Falta de trazabilidad en la toma de decisiones de la IA";
      document.getElementById('riskCategory').value = "Regulatorio";
      document.getElementById('riskProb').value = "3";
      document.getElementById('riskImpact').value = "4";
      document.getElementById('riskMitigation').value = "Implementar logs inmutables (Audit Logs) y retención de prompts.";
    } else if(val === 'shadow') {
      document.getElementById('riskName').value = "Uso de Shadow AI por parte de los empleados";
      document.getElementById('riskCategory').value = "Seguridad";
      document.getElementById('riskProb').value = "5";
      document.getElementById('riskImpact').value = "4";
      document.getElementById('riskMitigation').value = "Desplegar DLP (Data Loss Prevention) y capacitar al personal.";
    }
  }

  window.fillCommonTask = function() {
    const val = document.getElementById('commonTaskSelect').value;
    if(!val) return;
    if(val === 'politica') {
      document.getElementById('taskName').value = "Redactar y aprobar la Política Corporativa de IA";
      document.getElementById('taskPhase').value = "Fase 1: Diagnóstico";
      document.getElementById('taskAssignee').value = "Ambos";
    } else if(val === 'comite') {
      document.getElementById('taskName').value = "Designar Oficial de IA y formalizar Comité de Ética";
      document.getElementById('taskPhase').value = "Fase 1: Diagnóstico";
      document.getElementById('taskAssignee').value = "Cliente";
    } else if(val === 'inventario') {
      document.getElementById('taskName').value = "Registrar todos los modelos y herramientas de IA en el Inventario";
      document.getElementById('taskPhase').value = "Fase 2: Diseño";
      document.getElementById('taskAssignee').value = "Ambos";
    } else if(val === 'capacitacion') {
      document.getElementById('taskName').value = "Capacitar al personal en riesgos y uso responsable de IA";
      document.getElementById('taskPhase').value = "Fase 3: Implementación";
      document.getElementById('taskAssignee').value = "Equipo BehAvIorLab";
    } else if(val === 'mlops') {
      document.getElementById('taskName').value = "Implementar monitoreo de sesgos y alucinaciones (MLOps)";
      document.getElementById('taskPhase').value = "Fase 4: Auditoría";
      document.getElementById('taskAssignee').value = "Equipo BehAvIorLab";
    }
  }

  window.suggestRiskWithAI = async function() {
    const btn = document.getElementById('btnAI_Risk');
    const originalText = btn.textContent;
    btn.textContent = "🧠 Pensando..."; btn.disabled = true;
    const companyName = document.getElementById('riskCompany').options[document.getElementById('riskCompany').selectedIndex]?.text || "la organización";
    try {
      const res = await fetch(`${API_URL}/gov/suggest-risk`, { method: 'POST', headers, body: JSON.stringify({ companyName }) });
      const data = await res.json();
      if (res.ok) {
        document.getElementById('riskName').value = data.riskName || "";
        document.getElementById('riskCategory').value = data.category || "Operacional";
        document.getElementById('riskProb').value = data.probability || 3;
        document.getElementById('riskImpact').value = data.impact || 3;
        document.getElementById('riskMitigation').value = data.mitigationPlan || "";
      } else { alert("No se pudo generar el riesgo con IA."); }
    } catch (error) { alert("Error de conexión con la IA."); } finally { btn.textContent = originalText; btn.disabled = false; }
  }

  window.suggestTaskWithAI = async function() {
    const btn = document.getElementById('btnAI_Task');
    const originalText = btn.textContent;
    btn.textContent = "🧠 Pensando..."; btn.disabled = true;
    const companyName = document.getElementById('orgSelector')?.selectedOptions[0]?.text || "la organización";
    try {
      const res = await fetch(`${API_URL}/gov/suggest-task`, { method: 'POST', headers, body: JSON.stringify({ companyName }) });
      const data = await res.json();
      if (res.ok) {
        document.getElementById('taskName').value = data.taskName || "";
        document.getElementById('taskPhase').value = data.phase || "Fase 1: Diagnóstico";
        document.getElementById('taskAssignee').value = data.assignedTo || "Ambos";
      } else { alert("No se pudo generar la tarea con IA."); }
    } catch (error) { alert("Error de conexión con la IA."); } finally { btn.textContent = originalText; btn.disabled = false; }
  }

  // ==========================================
  // 4. INIT Y CARGA DE DATOS
  // ==========================================
  async function init() {
    currentUser = JSON.parse(localStorage.getItem('gov_user'));
    if (!currentUser) return window.location.href = 'index.html';
    document.getElementById('userEmail').textContent = currentUser.email;
    currentOrgId = currentUser.orgId;

    const userModules = currentUser.modules || ['gobernanza'];
    const isSuperAdmin = currentUser.role === 'superadmin';

    tabs.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    
    if (isSuperAdmin || userModules.includes('gobernanza')) { 
      ['tabDashboardBtn', 'tabInventoryBtn', 'tabMatrixBtn', 'tabRisksBtn', 'tabDeliverablesBtn', 'tabCompaniesBtn', 'tabProcessesBtn', 'tabLeadsBtn', 'tabEvidenceBtn'].forEach(id => { 
        const el = document.getElementById(id); if(el) el.style.display = 'block'; 
      }); 
    }
    if (isSuperAdmin) { const usersTab = document.getElementById('tabUsersBtn'); if(usersTab) usersTab.style.display = 'block'; }

    if (isSuperAdmin) {
      const container = document.getElementById('orgSelectorContainer');
      container.classList.remove('hidden'); container.classList.add('flex');
      try {
        const res = await fetch(`${API_URL}/gov/orgs`, { headers });
        if (res.ok) {
          orgsCache = await res.json();
          const selector = document.getElementById('orgSelector');
          selector.innerHTML = orgsCache.map(o => `<option value="${o._id}">${o.name || 'Org sin nombre'}</option>`).join('');
          if (orgsCache.length > 0) { currentOrgId = orgsCache[0]._id; }

          selector.addEventListener('change', async (e) => {
            currentOrgId = e.target.value; 
            await loadCompanies(); 
            loadInventory();
            if(!document.getElementById('dashboardSection').classList.contains('hidden')) loadExecutiveDashboard();
            if(!document.getElementById('risksSection').classList.contains('hidden')) loadRisks();
            if(!document.getElementById('deliverablesSection').classList.contains('hidden')) loadDeliverables();
            if(!document.getElementById('matrixSection').classList.contains('hidden')) loadControls();
            if(!document.getElementById('processesSection').classList.contains('hidden')) loadProcesses();
            if(!document.getElementById('evidenceSection').classList.contains('hidden')) loadEvidence();
          });
        }
      } catch (e) { console.error("Error cargando orgs:", e); }
    }
    
    if (isSuperAdmin || userModules.includes('gobernanza')) {
      await loadCompanies(); 
      setTab('tabDashboardBtn', 'dashboardSection', loadExecutiveDashboard);
      loadInventory(); 
    }
  }

  // ==========================================
  // 5. AIGOS: CARGA DE PREGUNTAS, CATÁLOGO Y EVALUACIÓN
  // ==========================================
  async function loadMasterRisks() {
    const container = document.getElementById('masterRisksList');
    if (masterRisksCache.length > 0) { renderMasterRisks(); return; }
    try {
      const res = await fetch(`${API_URL}/gov/aigos/master-risks`, { headers });
      if (!res.ok) throw new Error("Error");
      masterRisksCache = await res.json();
      renderMasterRisks();
    } catch (e) { container.innerHTML = `<p class="text-rose-500 text-center">Error al cargar catálogo maestro.</p>`; }
  }

  function renderMasterRisks() {
    const container = document.getElementById('masterRisksList');
    if (masterRisksCache.length === 0) { container.innerHTML = `<p class="text-amber-500 text-center">No hay riesgos en el catálogo. Corre el /seed.</p>`; return; }
    container.innerHTML = masterRisksCache.map(r => `
      <label class="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700 hover:bg-slate-800 transition cursor-pointer">
        <input type="checkbox" value="${r.code}" class="import-risk-checkbox w-5 h-5 accent-indigo-500 mt-0.5">
        <div>
          <span class="text-xs font-bold text-indigo-400 block mb-1">${r.code} | ${r.category}</span>
          <p class="text-sm text-slate-200 font-semibold">${r.name}</p>
          <p class="text-xs text-slate-400 mt-1">${r.description}</p>
        </div>
      </label>
    `).join('');
  }

  async function loadAigosQuestions() {
    const container = document.getElementById('aigosQuestionsContainer');
    if (aigosQuestionsCache.length > 0) return;
    try {
      const res = await fetch(`${API_URL}/gov/aigos/questions`, { headers });
      if (!res.ok) throw new Error("Error al cargar catálogo");
      aigosQuestionsCache = await res.json();
      if (aigosQuestionsCache.length === 0) { container.innerHTML = `<p class="text-amber-500 text-center py-10">El catálogo AIGOS está vacío. Corre /seed.</p>`; return; }

      const grouped = {};
      aigosQuestionsCache.forEach(q => { if (!grouped[q.domain]) grouped[q.domain] = []; grouped[q.domain].push(q); });

      let html = '';
      Object.keys(grouped).forEach(domain => {
        html += `<div class="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mb-4"><h3 class="font-bold text-teal-400 mb-3 border-b border-slate-700 pb-2">${domain}</h3><div class="space-y-4">`;
        grouped[domain].forEach(q => {
          html += `
            <div class="flex flex-col md:flex-row justify-between md:items-start gap-3 pb-3 border-b border-slate-800/50 last:border-0 last:pb-0">
              <div class="w-full md:w-3/4">
                <span class="text-xs font-bold text-slate-500 block mb-1">${q.code} | ${q.controlName}</span>
                <p class="text-sm text-slate-200">${q.question}</p>
                <p class="text-[10px] text-slate-400 mt-1 italic"><b>Evidencia:</b> ${q.evidenceRequested}</p>
              </div>
              <div class="flex items-center gap-3 w-full md:w-1/4 justify-end mt-2 md:mt-0">
                <div class="flex flex-col items-center"><label class="text-[10px] text-slate-400 mb-1" title="No Aplica">N/A</label><input type="checkbox" class="aigos-na-checkbox w-4 h-4 accent-rose-500" data-code="${q.code}"></div>
                <div class="flex flex-col items-center"><label class="text-[10px] text-slate-400 mb-1" title="Evidencia Verificada">Ev.</label><input type="checkbox" class="aigos-evidence-checkbox w-4 h-4 accent-teal-500" data-code="${q.code}"></div>
                <select class="aigos-level-select bg-slate-800 border border-slate-600 rounded-lg p-1.5 text-sm text-white w-16 text-center outline-none" data-code="${q.code}"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      });
      container.innerHTML = html;
    } catch (err) { container.innerHTML = `<p class="text-rose-500 text-center py-10">Error: ${err.message}</p>`; }
  }

  document.getElementById('aigosAssessmentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Calculando...'; btn.disabled = true;
    const companyId = document.getElementById('diagCompany').value;
    if (!companyId) { alert("Selecciona una filial"); btn.textContent = 'Calcular Madurez AIGOS'; btn.disabled = false; return; }

    const answers = [];
    document.querySelectorAll('.aigos-level-select').forEach(sel => {
      const code = sel.dataset.code;
      const question = aigosQuestionsCache.find(q => q.code === code);
      const level = parseInt(sel.value);
      const isNA = document.querySelector(`.aigos-na-checkbox[data-code="${code}"]`).checked;
      const hasEvidence = document.querySelector(`.aigos-evidence-checkbox[data-code="${code}"]`).checked;
      answers.push({ questionCode: code, domain: question.domain, level, hasEvidence, isNA, observation: "" });
    });

    try {
      const res = await fetch(`${API_URL}/gov/aigos/assessments`, { method: 'POST', headers, body: JSON.stringify({ companyId, answers }) });
      const data = await res.json();
      if (res.ok) {
        document.getElementById('aigosAssessmentModal').classList.add('hidden');
        document.getElementById('resAigosMaturity').textContent = `${data.maturity.overall}%`;
        document.getElementById('resAigosMaturityBand').textContent = data.maturity.band;
        document.getElementById('resAigosAigi').textContent = `${data.aigi.published}`;
        document.getElementById('resAigosAigiBand').textContent = data.aigi.band;

        let domainsHtml = '';
        Object.keys(data.maturity.domains).forEach(d => {
          domainsHtml += `<div class="flex justify-between items-center text-xs mb-2"><span class="text-slate-400 w-2/3 truncate">${d}</span><span class="text-slate-200 font-bold bg-slate-800 px-2 py-0.5 rounded">${data.maturity.domains[d].score}%</span></div>`;
        });
        document.getElementById('resAigosDomains').innerHTML = domainsHtml;

        if (data.aigi.appliedGate) { document.getElementById('resAigosGate').classList.remove('hidden'); document.getElementById('resAigosGateText').textContent = data.aigi.appliedGate; } 
        else { document.getElementById('resAigosGate').classList.add('hidden'); }

        document.getElementById('aigosResultModal').classList.remove('hidden');
        
        if(!document.getElementById('dashboardSection').classList.contains('hidden')) {
          document.getElementById('dashboardCompanySelector').value = companyId;
          loadExecutiveDashboard();
        }
      } else { alert("Error: " + data.error); }
    } catch (err) { alert("Error de red al calcular AIGOS"); } finally { btn.textContent = 'Calcular Madurez AIGOS'; btn.disabled = false; }
  });

  // ==========================================
  // 6. DASHBOARD EJECUTIVO Y CONTROLES
  // ==========================================
  async function loadExecutiveDashboard() {
    try {
      const dashCompanySelector = document.getElementById('dashboardCompanySelector');
      if (dashCompanySelector.options.length <= 1) {
        dashCompanySelector.innerHTML = companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
      }
      const selectedCompanyId = dashCompanySelector.value || (companiesCache.length > 0 ? companiesCache[0]._id : null);

      const [risksRes, tasksRes, aigosRes, evidenceRes] = await Promise.all([
        fetch(`${API_URL}/gov/risks?orgId=${currentOrgId}`, { headers }),
        fetch(`${API_URL}/gov/deliverables?orgId=${currentOrgId}`, { headers }),
        selectedCompanyId ? fetch(`${API_URL}/gov/aigos/companies/${selectedCompanyId}/latest`, { headers }) : Promise.resolve({ ok: false }),
        fetch(`${API_URL}/gov/evidence?orgId=${currentOrgId}`, { headers })
      ]);

      const risks = (await risksRes.json()).filter(r => isSameOrg(r.orgId, currentOrgId));
      const tasks = (await tasksRes.json()).filter(d => isSameOrg(d.orgId, currentOrgId));
      const evidence = await evidenceRes.json(); 
      
      if (aigosRes.ok) {
        const aigosData = await aigosRes.json();
        document.getElementById('kpiAIGI').textContent = aigosData.aigi.published;
        document.getElementById('kpiAIGIBand').textContent = aigosData.aigi.band;
        const gateDiv = document.getElementById('kpiAIGIGate');
        if (aigosData.aigi.appliedGate) { gateDiv.textContent = `⚠️ Limitado por: ${aigosData.aigi.appliedGate}`; gateDiv.classList.remove('hidden'); } else { gateDiv.classList.add('hidden'); }
        document.getElementById('statMaturity').textContent = `${aigosData.maturity.overall}%`;
      } else {
        document.getElementById('kpiAIGI').textContent = "--";
        document.getElementById('kpiAIGIBand').textContent = "Sin eval";
        document.getElementById('kpiAIGIGate').classList.add('hidden');
      }

      const criticalRisks = risks.filter(r => r.riskLevel === 'Crítico' || r.riskLevel === 'Alto').length;
      document.getElementById('kpiRisks').textContent = criticalRisks;
      document.getElementById('kpiRisks').className = criticalRisks > 0 ? 'text-5xl font-black text-rose-400' : 'text-5xl font-black text-teal-400';

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'Completado').length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      document.getElementById('kpiTasks').textContent = `${progress}%`;
      document.getElementById('kpiTasksBar').style.width = `${progress}%`;

      const recentRisksDiv = document.getElementById('dashRecentRisks');
      recentRisksDiv.innerHTML = risks.length === 0 ? `<p class="text-sm text-slate-500">No hay riesgos.</p>` : risks.slice(0, 3).map(r => {
        let c = r.riskLevel === 'Crítico' ? 'text-rose-400' : (r.riskLevel === 'Alto' ? 'text-orange-400' : 'text-amber-400');
        return `<div class="flex justify-between items-center py-2 border-b border-slate-700/50"><p class="text-sm text-slate-300 truncate w-3/4">${r.riskName}</p><span class="text-xs font-bold ${c}">${r.riskLevel}</span></div>`;
      }).join('');

      const recentEvidenceDiv = document.getElementById('dashRecentEvidence');
      recentEvidenceDiv.innerHTML = evidence.length === 0 ? `<p class="text-sm text-slate-500">No hay evidencias.</p>` : evidence.slice(0, 3).map(e => {
        return `<div class="flex justify-between items-center py-2 border-b border-slate-700/50"><p class="text-sm text-slate-300 truncate w-48">${e.fileName.split('/').pop()}</p><a href="${e.r2Url}" target="_blank" class="text-xs text-teal-400 hover:underline">Ver</a></div>`;
      }).join('');

    } catch (error) { console.error("Error cargando Dashboard Ejecutivo:", error); }
  }

  document.getElementById('dashboardCompanySelector')?.addEventListener('change', () => { loadExecutiveDashboard(); });

  async function loadControls() {
    const grid = document.getElementById('controlsGrid');
    grid.innerHTML = `<p class="text-slate-500 col-span-3 text-center py-4">Cargando catálogo de controles...</p>`;
    try {
      if (aigosQuestionsCache.length === 0) { const res = await fetch(`${API_URL}/gov/aigos/questions`, { headers }); aigosQuestionsCache = await res.json(); }
      const uniqueControls = {};
      aigosQuestionsCache.forEach(q => { if(!uniqueControls[q.controlCode]) { uniqueControls[q.controlCode] = { code: q.controlCode, name: q.controlName, domain: q.domain }; } });

      if (Object.keys(uniqueControls).length === 0) { grid.innerHTML = `<p class="text-amber-500 col-span-3 text-center py-4">No hay controles cargados. Corre el /seed.</p>`; return; }

      grid.innerHTML = Object.values(uniqueControls).map(c => `
        <div class="p-4 rounded-xl border border-slate-700 bg-slate-800/50">
          <div class="flex justify-between items-start mb-2"><span class="text-xs font-bold text-teal-400">${c.code}</span><span class="text-[10px] text-slate-500 uppercase">${c.domain}</span></div>
          <h3 class="text-sm font-bold text-slate-200 mb-2">${c.name}</h3>
          <p class="text-xs text-slate-400">Para ver los detalles, revisa las preguntas asociadas en el Assessment AIGOS.</p>
        </div>
      `).join('');
    } catch(e) { console.error(e); grid.innerHTML = `<p class="text-rose-500 text-center">Error al cargar controles.</p>`; }
  }

  // ==========================================
  // 7. CRUDS (Empresas, Inventario, Riesgos, Plan, etc.)
  // ==========================================
  async function loadCompanies() {
    try {
      const res = await fetch(`${API_URL}/gov/orgs/${currentOrgId}/companies`, { headers }); 
      if (!res.ok) throw new Error('Error');
      companiesCache = await res.json();
      
      const statEl = document.getElementById('statCompanies'); if(statEl) statEl.textContent = companiesCache.length;
      const tbody = document.getElementById('companiesTableBody');
      if (tbody) {
        if (companiesCache.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">No hay filiales.</td></tr>`; } 
        else { tbody.innerHTML = companiesCache.map(c => `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${c.name}</td><td class="py-3 px-4 text-slate-400 capitalize">${c.riskProfile.replace('_', ' ')}</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-teal-950 text-teal-400 border border-teal-800">Activa</span></td><td class="py-3 px-4 text-slate-500 font-mono text-xs">${c._id}</td></tr>`).join(''); }
      }
      
      const selectModel = document.getElementById('modelCompany');
      if(selectModel) selectModel.innerHTML = companiesCache.length === 0 ? `<option value="">Crea una filial primero</option>` : companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
      const selectDiag = document.getElementById('diagCompany');
      if(selectDiag) selectDiag.innerHTML = companiesCache.length === 0 ? `<option value="">Crea una filial primero</option>` : companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    } catch (error) { console.error("Error cargando empresas:", error); }
  }

  async function loadInventory() {
    try {
      const res = await fetch(`${API_URL}/gov/ai-inventory?orgId=${currentOrgId}`, { headers }); if (!res.ok) throw new Error('Error');
      let inventory = await res.json(); inventory = inventory.filter(item => isSameOrg(item.orgId, currentOrgId));
      
      document.getElementById('statTotalModels').textContent = inventory.length;
      document.getElementById('statHighRisk').textContent = inventory.filter(i => i.risk_level === 'alto' || i.criticalityLevel === 'Crítica').length;
      
      const tbody = document.getElementById('inventoryTableBody');
      if (inventory.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay modelos.</td></tr>`; return; }
      tbody.innerHTML = inventory.map(item => {
        let riskColor = 'bg-slate-700 text-slate-300'; let critLevel = item.criticalityLevel || item.risk_level || 'medio'; let critScore = item.criticalityScore ? `${item.criticalityScore}%` : '';
        if (critLevel === 'alto' || critLevel === 'Crítica') riskColor = 'bg-rose-950 text-rose-400 border border-rose-800'; if (critLevel === 'medio' || critLevel === 'Media') riskColor = 'bg-amber-950 text-amber-400 border border-amber-800'; if (critLevel === 'bajo' || critLevel === 'Baja') riskColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        const company = companiesCache.find(c => isSameOrg(c._id, item.companyId)); const companyName = company ? company.name : 'Desconocida';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${item.model_name}</td><td class="py-3 px-4 text-slate-400 capitalize">${item.category}</td><td class="py-3 px-4 text-slate-400">${companyName}</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${riskColor}">${critLevel} ${critScore}</span></td><td class="py-3 px-4 text-slate-400 capitalize">${item.status ? item.status.replace('_', ' ') : 'N/A'}</td></tr>`;
      }).join('');
    } catch (error) { console.error("Error cargando inventario:", error); }
  }

  async function loadDeliverables() {
    try {
      const res = await fetch(`${API_URL}/gov/deliverables?orgId=${currentOrgId}`, { headers });
      let deliverables = await res.json(); deliverables = deliverables.filter(d => isSameOrg(d.orgId, currentOrgId));
      const tbody = document.getElementById('deliverablesTableBody');
      if (deliverables.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay tareas en el plan de trabajo.</td></tr>`; return; }
      tbody.innerHTML = deliverables.map(d => {
        let badgeColor = 'bg-slate-700 text-slate-300'; if (d.status === 'Pendiente') badgeColor = 'bg-rose-950 text-rose-400 border border-rose-800'; if (d.status === 'En Progreso') badgeColor = 'bg-amber-950 text-amber-400 border border-amber-800'; if (d.status === 'Completado') badgeColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${d.taskName}</td><td class="py-3 px-4 text-slate-400">${d.phase}</td><td class="py-3 px-4 text-slate-400">${d.assignedTo}</td><td class="py-3 px-4"><select onchange="updateDeliverableStatus('${d._id}', this.value)" class="px-3 py-1 rounded-lg text-xs font-semibold uppercase ${badgeColor} outline-none cursor-pointer appearance-none text-center"><option value="Pendiente" ${d.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option><option value="En Progreso" ${d.status === 'En Progreso' ? 'selected' : ''}>En Progreso</option><option value="Completado" ${d.status === 'Completado' ? 'selected' : ''}>Completado</option></select></td><td class="py-3 px-4 text-center"><button onclick="deleteDeliverable('${d._id}')" class="text-rose-500 hover:text-rose-400 transition" title="Eliminar Tarea">🗑️</button></td></tr>`;
      }).join('');
    } catch (error) { console.error("Error plan:", error); }
  }

  window.updateDeliverableStatus = async function(id, newStatus) { try { await fetch(`${API_URL}/gov/deliverables/${id}`, { method: 'PUT', headers, body: JSON.stringify({ status: newStatus }) }); loadDeliverables(); } catch (error) { alert("Error actualizando estado"); } }
  window.deleteDeliverable = async function(id) { if(!confirm("¿Estás seguro de eliminar esta tarea del plan?")) return; try { const res = await fetch(`${API_URL}/gov/deliverables/${id}`, { method: 'DELETE', headers }); if (res.ok) loadDeliverables(); } catch (error) { alert("Error al eliminar tarea"); } }

  document.getElementById('newDeliverableForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { orgId: currentOrgId, taskName: document.getElementById('taskName').value, phase: document.getElementById('taskPhase').value, assignedTo: document.getElementById('taskAssignee').value, dueDate: document.getElementById('taskDate').value || null };
    try { const res = await fetch(`${API_URL}/gov/deliverables`, { method: 'POST', headers, body: JSON.stringify(payload) }); if (res.ok) { document.getElementById('newDeliverableModal').classList.add('hidden'); e.target.reset(); loadDeliverables(); } else { const err = await res.json().catch(()=>({})); alert('Error: ' + (err.error || res.status)); } } catch (err) { alert('Error de red'); } finally { btn.textContent = 'Guardar Tarea'; btn.disabled = false; }
  });

  async function loadRisks() {
    try {
      const res = await fetch(`${API_URL}/gov/risks?orgId=${currentOrgId}`, { headers });
      let risks = await res.json(); risks = risks.filter(r => isSameOrg(r.orgId, currentOrgId));
      const tbody = document.getElementById('risksTableBody');
      if (risks.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-500">No hay riesgos registrados.</td></tr>`; return; }
      tbody.innerHTML = risks.map(r => {
        let badgeColor = 'bg-slate-700 text-slate-300'; if (r.riskLevel === 'Crítico') badgeColor = 'bg-rose-950 text-rose-400 border border-rose-800'; if (r.riskLevel === 'Alto') badgeColor = 'bg-orange-950 text-orange-400 border border-orange-800'; if (r.riskLevel === 'Medio') badgeColor = 'bg-amber-950 text-amber-400 border border-amber-800'; if (r.riskLevel === 'Bajo') badgeColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${r.riskName}</td><td class="py-3 px-4 text-slate-400">${r.category}</td><td class="py-3 px-4 text-slate-400 text-center">${r.probability} / 5</td><td class="py-3 px-4 text-slate-400 text-center">${r.impact} / 5</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${badgeColor}">${r.riskLevel} (${r.riskScore})</span></td><td class="py-3 px-4 text-slate-400 text-xs max-w-xs truncate" title="${r.mitigationPlan}">${r.mitigationPlan}</td><td class="py-3 px-4 text-center"><button onclick="deleteRisk('${r._id}')" class="text-rose-500 hover:text-rose-400 transition" title="Eliminar Riesgo">🗑️</button></td></tr>`;
      }).join('');
    } catch (error) { console.error("Error cargando riesgos:", error); }
  }

  window.deleteRisk = async function(id) { if(!confirm("¿Estás seguro de eliminar este riesgo?")) return; try { const res = await fetch(`${API_URL}/gov/risks/${id}`, { method: 'DELETE', headers }); if (res.ok) loadRisks(); } catch (error) { alert("Error al eliminar riesgo"); } }

  document.getElementById('newRiskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { orgId: currentOrgId, companyId: document.getElementById('riskCompany').value, riskName: document.getElementById('riskName').value, category: document.getElementById('riskCategory').value, probability: parseInt(document.getElementById('riskProb').value), impact: parseInt(document.getElementById('riskImpact').value), mitigationPlan: document.getElementById('riskMitigation').value };
    try { const res = await fetch(`${API_URL}/gov/risks`, { method: 'POST', headers, body: JSON.stringify(payload) }); if (res.ok) { document.getElementById('newRiskModal').classList.add('hidden'); e.target.reset(); loadRisks(); } else { const err = await res.json().catch(()=>({})); alert('Error: ' + (err.error || res.status)); } } catch (err) { alert('Error de red'); } finally { btn.textContent = 'Guardar Riesgo'; btn.disabled = false; }
  });

  async function loadProcesses() {
    try {
      const res = await fetch(`${API_URL}/gov/process-evals?orgId=${currentOrgId}`, { headers });
      let processes = await res.json(); processes = processes.filter(p => isSameOrg(p.orgId, currentOrgId));
      const tbody = document.getElementById('processesTableBody');
      if (processes.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-500">No hay procesos evaluados.</td></tr>`;return; }
      tbody.innerHTML = processes.map(p => {
        let scoreColor = 'text-teal-400'; if (p.score < 50) scoreColor = 'text-rose-400'; else if (p.score < 75) scoreColor = 'text-amber-400';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition">
          <td class="py-3 px-4 font-semibold text-slate-200">${p.processName}<br><span class="text-xs font-normal text-teal-400">${p.agentType}</span></td>
          <td class="py-3 px-4 text-slate-400 capitalize">${p.volume}</td>
          <td class="py-3 px-4 text-slate-400 capitalize">${p.complexity}</td>
          <td class="py-3 px-4 text-slate-400 text-center">${p.hoursSpent} hrs</td>
          <td class="py-3 px-4 text-center font-bold ${scoreColor}">${p.score}%</td>
          <td class="py-3 px-4 text-center"><button onclick="deleteProcess('${p._id}')" class="text-rose-500 hover:text-rose-400 transition" title="Eliminar Proceso">🗑️</button></td>
        </tr>`;
      }).join('');
    } catch (error) { console.error("Error cargando procesos:", error); }
  }

  window.deleteProcess = async function(id) { if(!confirm("¿Estás seguro de eliminar esta evaluación de proceso?")) return; try { const res = await fetch(`${API_URL}/gov/process-evals/${id}`, { method: 'DELETE', headers }); if (res.ok) loadProcesses(); } catch (error) { alert("Error al eliminar proceso"); } }

  document.getElementById('newProcessForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Evaluando con IA...'; btn.disabled = true;
    const payload = { orgId: currentOrgId, companyId: document.getElementById('procCompany').value, processName: document.getElementById('procName').value, volume: document.getElementById('procVolume').value, complexity: document.getElementById('procComplexity').value, dataType: document.getElementById('procDataType').value, hoursSpent: parseInt(document.getElementById('procHours').value) };
    try { 
      const aiData = { score: Math.floor(Math.random() * 50) + 50, agentType: "Agente Predictivo", recommendation: "Automatizar con RPA" };
      payload.score = aiData.score; payload.agentType = aiData.agentType; payload.recommendation = aiData.recommendation;
      const res = await fetch(`${API_URL}/gov/process-evals`, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (res.ok) { document.getElementById('newProcessModal').classList.add('hidden'); e.target.reset(); loadProcesses(); } else { alert('Error al guardar la evaluación'); }
    } catch (err) { alert('Error: ' + err.message); } finally { btn.textContent = 'Evaluar con IA'; btn.disabled = false; }
  });

  // ==========================================
  // 8. LÓGICA DE LEADS
  // ==========================================
  async function loadLeads() {
    try {
      const res = await fetch(`${API_URL}/gov/leads`, { headers });
      if (!res.ok) throw new Error("Error cargando leads");
      leadsCache = await res.json();
      renderLeadsTable();
    } catch (error) { document.getElementById('leadsTableBody').innerHTML = `<tr><td colspan="7" class="py-4 text-center text-rose-500">Error al cargar prospectos.</td></tr>`; }
  }

  function renderLeadsTable() {
    const tbody = document.getElementById('leadsTableBody');
    const filterSource = document.getElementById('leadFilterSource').value;
    const filterStatus = document.getElementById('leadFilterStatus').value;
    let filtered = leadsCache;
    if (filterSource !== 'all') filtered = filtered.filter(l => l.fuente === filterSource);
    if (filterStatus !== 'all') filtered = filtered.filter(l => l.status === filterStatus || (l.status === undefined && filterStatus === 'nuevo'));
    if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-500">No hay prospectos que coincidan con los filtros.</td></tr>`; return; }
    tbody.innerHTML = filtered.map(l => {
      const date = new Date(l.createdAt || l.ts).toLocaleDateString('es-MX');
      let sourceBadge = l.fuente === 'risk-calculator' ? 'bg-blue-900/50 text-blue-300 border-blue-800' : 'bg-purple-900/50 text-purple-300 border-purple-800';
      let sourceLabel = l.fuente === 'risk-calculator' ? 'Riesgo' : 'Automatización';
      let resultText = l.tipo_lead === 'riesgo' ? `Riesgo: <b>${l.risk_level.toUpperCase()}</b>` : `Índice Auto: <b>${l.resultado?.automationIndex || 0}%</b>`;
      let statusBadge = 'bg-slate-700 text-slate-300'; let statusLabel = l.status || 'nuevo';
      if (statusLabel === 'nuevo') statusBadge = 'bg-amber-950 text-amber-400 border-amber-800';
      if (statusLabel === 'contactado') statusBadge = 'bg-blue-950 text-blue-400 border-blue-800';
      if (statusLabel === 'convertido') statusBadge = 'bg-teal-950 text-teal-400 border-teal-800';
      let actionBtn = statusLabel !== 'convertido' ? `<button onclick="openConvertModal('${l._id}')" class="bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold py-1 px-3 rounded-lg transition">Convertir</button>` : `<span class="text-xs text-teal-400">✓ Convertido</span>`;
      return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 text-slate-500">${date}</td><td class="py-3 px-4 text-slate-200"><div class="font-semibold">${l.nombre || l.name}</div><div class="text-xs text-slate-400">${l.email}</div></td><td class="py-3 px-4 text-slate-300">${l.empresa || l.company}</td><td class="py-3 px-4"><span class="px-2 py-1 rounded text-xs font-semibold border ${sourceBadge}">${sourceLabel}</span></td><td class="py-3 px-4 text-slate-300">${resultText}</td><td class="py-3 px-4"><span class="px-2 py-1 rounded text-xs font-semibold uppercase border ${statusBadge}">${statusLabel}</span></td><td class="py-3 px-4 text-center">${actionBtn}</td></tr>`;
    }).join('');
  }

  document.getElementById('leadFilterSource')?.addEventListener('change', renderLeadsTable);
  document.getElementById('leadFilterStatus')?.addEventListener('change', renderLeadsTable);

  const convertOrgSelect = document.getElementById('convertOrgId');
  const convertCompanySelect = document.getElementById('convertCompanySelect');
  const convertNewCompanyDiv = document.getElementById('convertNewCompanyDiv');
  const convertNewCompanyName = document.getElementById('convertNewCompanyName');

  async function loadCompaniesForConvert(orgId) {
    convertCompanySelect.innerHTML = '<option value="">Cargando...</option>';
    try {
      const res = await fetch(`${API_URL}/gov/orgs/${orgId}/companies`, { headers });
      if (!res.ok) throw new Error('Error');
      const companies = await res.json();
      let options = '<option value="">-- Seleccionar filial --</option>' + companies.map(c => `<option value="${c._id}">${c.name}</option>`).join('') + '<option value="NEW" class="text-teal-400 font-bold">+ Crear nueva filial</option>';
      convertCompanySelect.innerHTML = options;
    } catch (err) { convertCompanySelect.innerHTML = '<option value="">Error al cargar</option>'; }
  }

  convertOrgSelect?.addEventListener('change', (e) => { if (e.target.value) loadCompaniesForConvert(e.target.value); });
  convertCompanySelect?.addEventListener('change', (e) => {
    if (e.target.value === 'NEW') { convertNewCompanyDiv.classList.remove('hidden'); convertNewCompanyName.required = true; convertNewCompanyName.focus(); } 
    else { convertNewCompanyDiv.classList.add('hidden'); convertNewCompanyName.required = false; convertNewCompanyName.value = ''; }
  });

  window.openConvertModal = function(leadId) {
    const lead = leadsCache.find(l => l._id === leadId); if (!lead) return;
    currentLeadToConvert = leadId;
    convertOrgSelect.innerHTML = orgsCache.map(o => `<option value="${o._id}">${o.name || 'Org sin nombre'}</option>`).join('');
    convertNewCompanyName.value = lead.empresa || lead.company || '';
    convertCompanySelect.innerHTML = '<option value="">-- Seleccionar --</option>';
    convertNewCompanyDiv.classList.add('hidden'); convertNewCompanyName.required = false;
    if (orgsCache.length > 0) loadCompaniesForConvert(orgsCache[0]._id);
    document.getElementById('convertLeadModal').classList.remove('hidden');
  }

  document.getElementById('convertLeadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); const originalText = btn.textContent; btn.textContent = 'Convirtiendo...'; btn.disabled = true;
    const orgId = convertOrgSelect.value; const companyVal = convertCompanySelect.value; const payload = { orgId };
    if (companyVal === 'NEW') { payload.companyName = convertNewCompanyName.value.trim(); if (!payload.companyName) { alert('Escribe el nombre de la nueva filial.'); btn.textContent = originalText; btn.disabled = false; return; } } 
    else if (companyVal) { payload.companyId = companyVal; } 
    else { alert('Selecciona una filial existente o elige "Crear nueva".'); btn.textContent = originalText; btn.disabled = false; return; }

    try {
      const res = await fetch(`${API_URL}/gov/leads/${currentLeadToConvert}/convert`, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok) { document.getElementById('convertLeadModal').classList.add('hidden'); alert("✅ Lead convertido exitosamente."); loadLeads(); loadCompanies(); } 
      else { alert("Error: " + (data.error || "No se pudo convertir")); }
    } catch (err) { alert("Error de red al convertir."); } finally { btn.textContent = originalText; btn.disabled = false; }
  });

  // ==========================================
  // 9. CRUDS: USUARIOS, EVIDENCIA, ORGS, MODELOS
  // ==========================================
  document.getElementById('newOrgForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const name = document.getElementById('orgNameInput').value;
    try { const res = await fetch(`${API_URL}/gov/orgs`, { method: 'POST', headers, body: JSON.stringify({ name }) }); if (res.ok) { document.getElementById('newOrgModal').classList.add('hidden'); e.target.reset(); alert('Organización creada. Recargando...'); window.location.reload(); } else alert('Error al crear organización'); } catch (err) { alert('Error de red'); } finally { btn.textContent = 'Guardar Organización'; btn.disabled = false; }
  });

  async function loadUsers() {
    try {
      const res = await fetch(`${API_URL}/gov/users`, { headers }); const users = await res.json();
      const tbody = document.getElementById('usersTableBody');
      tbody.innerHTML = users.map(u => `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${u.name || 'Sin nombre'}</td><td class="py-3 px-4 text-slate-300">${u.email}</td><td class="py-3 px-4 text-teal-400 capitalize">${u.role}</td><td class="py-3 px-4 text-slate-400 text-xs">${(u.modules || ['gobernanza']).join(', ')}</td><td class="py-3 px-4 text-slate-500 font-mono text-xs">${u.orgId}</td></tr>`).join('');
    } catch (error) { console.error("Error users:", error); }
  }

  async function loadEvidence() {
    try {
      const res = await fetch(`${API_URL}/gov/evidence?orgId=${currentOrgId}`, { headers }); if (!res.ok) throw new Error('Error');
      let evidence = await res.json(); const tbody = document.getElementById('evidenceTableBody');
      if (evidence.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay evidencias subidas aún.</td></tr>`; return; }
      tbody.innerHTML = evidence.map(e => {
        const date = new Date(e.ts).toLocaleDateString('es-MX'); let statusColor = 'bg-teal-950 text-teal-400 border border-teal-800'; if (!e.validation.valido) statusColor = 'bg-rose-950 text-rose-400 border border-rose-800';
        const downloadBtn = `<a href="${e.r2Url}" target="_blank" class="text-teal-400 hover:text-teal-300 underline text-xs font-bold">Descargar PDF</a>`;
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 text-slate-500">${date}</td><td class="py-3 px-4 text-slate-300 font-mono text-xs">${e.fileName.split('/').pop()}</td><td class="py-3 px-4 text-slate-200 font-semibold uppercase">${e.questionId.replace('_', ' ')}</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${statusColor}">${e.validation.valido ? 'Válido' : 'Rechazado'}</span><div class="text-[10px] text-slate-500 mt-1 max-w-xs truncate" title="${e.validation.razon}">${e.validation.razon}</div></td><td class="py-3 px-4">${downloadBtn}</td></tr>`;
      }).join('');
    } catch (error) { document.getElementById('evidenceTableBody').innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-500">Error al cargar el expediente.</td></tr>`; }
  }

  document.getElementById('newModelForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { companyId: document.getElementById('modelCompany').value, model_name: document.getElementById('modelName').value, category: document.getElementById('modelCategory').value, risk_level: document.getElementById('modelRisk').value, vendor: 'Desconocido', status: 'en_uso' };
    try { const res = await fetch(`${API_URL}/gov/ai-inventory`, { method: 'POST', headers, body: JSON.stringify(payload) }); if (res.ok) { document.getElementById('newModelModal').classList.add('hidden'); e.target.reset(); loadInventory(); } else alert('Error'); } catch (err) { alert('Error'); } finally {btn.textContent = 'Guardar Modelo'; btn.disabled = false; }
  });

  document.getElementById('newCompanyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { name: document.getElementById('companyNameInput').value, riskProfile: document.getElementById('companyProfileInput').value };
    try { const res = await fetch(`${API_URL}/gov/orgs/${currentOrgId}/companies`, { method: 'POST', headers, body: JSON.stringify(payload) }); if (res.ok) { document.getElementById('newCompanyModal').classList.add('hidden'); e.target.reset(); loadCompanies(); } else alert('Error'); } catch (err) { alert('Error'); } finally { btn.textContent = 'Guardar Filial'; btn.disabled = false; }
  });

  document.getElementById('newUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Creando...'; btn.disabled = true;
    const modules = []; if(document.getElementById('userModuleGob')?.checked) modules.push('gobernanza'); if(document.getElementById('userModuleAuto')?.checked) modules.push('automatizacion'); if(modules.length === 0) modules.push('gobernanza');
    const payload = { name: document.getElementById('userName').value, email: document.getElementById('userEmailInput').value, password: document.getElementById('userPassword').value, role: document.getElementById('userRole').value, orgId: document.getElementById('userOrg').value, modules: modules };
    try { const res = await fetch(`${API_URL}/gov/users`, { method: 'POST', headers, body: JSON.stringify(payload) }); let data = {}; try { data = await res.json(); } catch (e) {} if (res.ok) { document.getElementById('newUserModal').classList.add('hidden'); e.target.reset(); loadUsers(); alert("Usuario creado exitosamente."); } else { alert('Error: ' + (data.error || 'Revisa la terminal')); } } catch (err) { alert('Error de red.'); } finally { btn.textContent = 'Crear Usuario'; btn.disabled = false; }
  });

  // INIT
  init();
});