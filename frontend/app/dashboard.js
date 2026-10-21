document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'https://behavior-lab.onrender.com'; 
  // const API_URL = 'http://localhost:3000'; 

  const token = localStorage.getItem('gov_token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  let currentUser = null;
  let currentOrgId = null;
  let companiesCache = []; 
  let orgsCache = [];

  // 1. EVENTOS BÁSICOS
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('gov_token'); localStorage.removeItem('gov_user'); window.location.href = 'index.html';
  });

  const tabs = ['tabDashboardBtn', 'tabInventoryBtn', 'tabMatrixBtn', 'tabRisksBtn', 'tabDeliverablesBtn', 'tabCompaniesBtn', 'tabLeadsBtn', 'tabUsersBtn', 'tabEvidenceBtn'];
  const sections = ['dashboardSection', 'inventorySection', 'matrixSection', 'risksSection', 'deliverablesSection', 'companiesSection', 'leadsSection', 'usersSection', 'evidenceSection'];

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

  const tabDash = document.getElementById('tabDashboardBtn'); if(tabDash) tabDash.addEventListener('click', () => setTab('tabDashboardBtn', 'dashboardSection', loadExecutiveDashboard));
  const tabInv = document.getElementById('tabInventoryBtn'); if(tabInv) tabInv.addEventListener('click', () => setTab('tabInventoryBtn', 'inventorySection'));
  const tabMat = document.getElementById('tabMatrixBtn'); if(tabMat) tabMat.addEventListener('click', () => setTab('tabMatrixBtn', 'matrixSection', loadMatrix));
  const tabRis = document.getElementById('tabRisksBtn'); if(tabRis) tabRis.addEventListener('click', () => setTab('tabRisksBtn', 'risksSection', loadRisks));
  const tabDel = document.getElementById('tabDeliverablesBtn'); if(tabDel) tabDel.addEventListener('click', () => setTab('tabDeliverablesBtn', 'deliverablesSection', loadDeliverables));
  const tabCom = document.getElementById('tabCompaniesBtn'); if(tabCom) tabCom.addEventListener('click', () => setTab('tabCompaniesBtn', 'companiesSection'));
  const tabLea = document.getElementById('tabLeadsBtn'); if(tabLea) tabLea.addEventListener('click', () => setTab('tabLeadsBtn', 'leadsSection', loadLeads));
  const tabUse = document.getElementById('tabUsersBtn'); if(tabUse) tabUse.addEventListener('click', () => setTab('tabUsersBtn', 'usersSection', loadUsers));
  const tabEvi = document.getElementById('tabEvidenceBtn'); if(tabEvi) tabEvi.addEventListener('click', () => setTab('tabEvidenceBtn', 'evidenceSection', loadEvidence));

  // MODALES
  const modalModel = document.getElementById('newModelModal');
  const openModalBtn = document.getElementById('openModalBtn'); if(openModalBtn) openModalBtn.addEventListener('click', () => modalModel.classList.remove('hidden'));
  const closeModalBtn = document.getElementById('closeModalBtn'); if(closeModalBtn) closeModalBtn.addEventListener('click', () => modalModel.classList.add('hidden'));

  const modalCompany = document.getElementById('newCompanyModal');
  const openCompanyModalBtn = document.getElementById('openCompanyModalBtn'); if(openCompanyModalBtn) openCompanyModalBtn.addEventListener('click', () => modalCompany.classList.remove('hidden'));
  const closeCompanyModalBtn = document.getElementById('closeCompanyModalBtn'); if(closeCompanyModalBtn) closeCompanyModalBtn.addEventListener('click', () => modalCompany.classList.add('hidden'));

  const modalUser = document.getElementById('newUserModal');
  const openUserModalBtn = document.getElementById('openUserModalBtn'); if(openUserModalBtn) openUserModalBtn.addEventListener('click', async () => {
    const userOrgSelect = document.getElementById('userOrg');
    if (orgsCache.length === 0) { try { const res = await fetch(`${API_URL}/gov/orgs`, { headers }); if (res.ok) orgsCache = await res.json(); } catch(e) {} }
    userOrgSelect.innerHTML = orgsCache.map(o => `<option value="${o._id}">${o.name}</option>`).join('');
    modalUser.classList.remove('hidden');
  });
  const closeUserModalBtn = document.getElementById('closeUserModalBtn'); if(closeUserModalBtn) closeUserModalBtn.addEventListener('click', () => modalUser.classList.add('hidden'));

  const modalDeliverable = document.getElementById('newDeliverableModal');
  const openDeliverableModalBtn = document.getElementById('openDeliverableModalBtn'); if(openDeliverableModalBtn) openDeliverableModalBtn.addEventListener('click', () => {
    document.getElementById('commonTaskSelect').value = "";
    modalDeliverable.classList.remove('hidden');
  });
  const closeDeliverableModalBtn = document.getElementById('closeDeliverableModalBtn'); if(closeDeliverableModalBtn) closeDeliverableModalBtn.addEventListener('click', () => modalDeliverable.classList.add('hidden'));

  const modalRisk = document.getElementById('newRiskModal');
  const openRiskModalBtn = document.getElementById('openRiskModalBtn'); if(openRiskModalBtn) openRiskModalBtn.addEventListener('click', () => {
    const selectCompany = document.getElementById('riskCompany');
    selectCompany.innerHTML = `<option value="">Global (Toda la org)</option>` + companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    document.getElementById('commonRiskSelect').value = "";
    modalRisk.classList.remove('hidden');
  });
  const closeRiskModalBtn = document.getElementById('closeRiskModalBtn'); if(closeRiskModalBtn) closeRiskModalBtn.addEventListener('click', () => modalRisk.classList.add('hidden'));

  const modalDiag = document.getElementById('diagnosticModal');
  const diagFormCont = document.getElementById('diagnosticFormContainer');
  const diagResultCont = document.getElementById('diagnosticResultContainer');
  const openDiagnosticBtn = document.getElementById('openDiagnosticBtn'); if(openDiagnosticBtn) openDiagnosticBtn.addEventListener('click', () => {
    diagFormCont.classList.remove('hidden'); diagResultCont.classList.add('hidden'); modalDiag.classList.remove('hidden'); modalDiag.classList.add('flex');
    const btnAI = document.getElementById('btnGenerateAIReport'); btnAI.classList.add('hidden'); btnAI.textContent = '🧠 Generando Reporte...';
    for(let i=1; i<=12; i++) {
      const qId = `q${i}`; const st = document.getElementById(`status_${qId}`); if(st) st.textContent = "";
      const btnUp = document.getElementById(`btn_${qId}`); if(btnUp) { btnUp.textContent = "📎 Subir Evidencia"; btnUp.className = "text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg border border-slate-500 transition w-36"; }
      const sel = document.getElementById(qId); if(sel) sel.dataset.hasEvidence = "false";
    }
  });
  const closeDiagBtn = document.getElementById('closeDiagBtn'); if(closeDiagBtn) closeDiagBtn.addEventListener('click', () => { modalDiag.classList.add('hidden'); modalDiag.classList.remove('flex'); });
  const closeResultBtn = document.getElementById('closeResultBtn'); if(closeResultBtn) closeResultBtn.addEventListener('click', () => { modalDiag.classList.add('hidden'); modalDiag.classList.remove('flex'); });

  // 2. FUNCIONES DE AUTOCOMPLETAR
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

  // 3. FUNCIONES DE SUGERENCIA CON IA
  window.suggestRiskWithAI = async function() {
    const btn = document.getElementById('btnAI_Risk');
    const originalText = btn.textContent;
    btn.textContent = "🧠 Pensando..."; btn.disabled = true;
    
    const companyName = document.getElementById('riskCompany').options[document.getElementById('riskCompany').selectedIndex]?.text || "la organización";
    
    try {
      const res = await fetch(`${API_URL}/gov/suggest-risk`, {
        method: 'POST', headers, body: JSON.stringify({ companyName })
      });
      const data = await res.json();
      
      if (res.ok) {
        document.getElementById('riskName').value = data.riskName || "";
        document.getElementById('riskCategory').value = data.category || "Operacional";
        document.getElementById('riskProb').value = data.probability || 3;
        document.getElementById('riskImpact').value = data.impact || 3;
        document.getElementById('riskMitigation').value = data.mitigationPlan || "";
      } else {
        alert("No se pudo generar el riesgo con IA.");
      }
    } catch (error) {
      alert("Error de conexión con la IA.");
    } finally {
      btn.textContent = originalText; btn.disabled = false;
    }
  }

  window.suggestTaskWithAI = async function() {
    const btn = document.getElementById('btnAI_Task');
    const originalText = btn.textContent;
    btn.textContent = "🧠 Pensando..."; btn.disabled = true;
    
    const companyName = document.getElementById('orgSelector')?.selectedOptions[0]?.text || "la organización";

    try {
      const res = await fetch(`${API_URL}/gov/suggest-task`, {
        method: 'POST', headers, body: JSON.stringify({ companyName })
      });
      const data = await res.json();
      
      if (res.ok) {
        document.getElementById('taskName').value = data.taskName || "";
        document.getElementById('taskPhase').value = data.phase || "Fase 1: Diagnóstico";
        document.getElementById('taskAssignee').value = data.assignedTo || "Ambos";
      } else {
        alert("No se pudo generar la tarea con IA.");
      }
    } catch (error) {
      alert("Error de conexión con la IA.");
    } finally {
      btn.textContent = originalText; btn.disabled = false;
    }
  }

  // 4. CARGA DE DATOS
  async function init() {
    currentUser = JSON.parse(localStorage.getItem('gov_user'));
    if (!currentUser) return window.location.href = 'index.html';
    document.getElementById('userEmail').textContent = currentUser.email;
    currentOrgId = currentUser.orgId;

    if (currentUser.role === 'superadmin') {
      const container = document.getElementById('orgSelectorContainer');
      container.classList.remove('hidden'); container.classList.add('flex');
      try {
        const res = await fetch(`${API_URL}/gov/orgs`, { headers });
        if (res.ok) {
          orgsCache = await res.json();
          const selector = document.getElementById('orgSelector');
          selector.innerHTML = orgsCache.map(o => `<option value="${o._id}">${o.name}</option>`).join('');
          selector.addEventListener('change', (e) => {
            currentOrgId = e.target.value; 
            loadDashboardData();
            if(!document.getElementById('dashboardSection').classList.contains('hidden')) loadExecutiveDashboard();
            if(!document.getElementById('matrixSection').classList.contains('hidden')) loadMatrix();
            if(!document.getElementById('risksSection').classList.contains('hidden')) loadRisks();
            if(!document.getElementById('deliverablesSection').classList.contains('hidden')) loadDeliverables();
            if(!document.getElementById('evidenceSection').classList.contains('hidden')) loadEvidence();
          });
        }
      } catch (e) { console.error("Error cargando orgs:", e); }
    } else {
      document.getElementById('tabLeadsBtn').classList.add('hidden');
      document.getElementById('tabUsersBtn').classList.add('hidden');
    }
    
    setTab('tabDashboardBtn', 'dashboardSection', loadExecutiveDashboard);
    loadDashboardData(); 
  }

  async function loadDashboardData() { await loadCompanies(); await loadInventory(); }

  async function loadExecutiveDashboard() {
    try {
      const [risksRes, tasksRes, evalsRes, evidenceRes] = await Promise.all([
        fetch(`${API_URL}/gov/risks`, { headers }),
        fetch(`${API_URL}/gov/deliverables`, { headers }),
        fetch(`${API_URL}/gov/evaluations`, { headers }),
        fetch(`${API_URL}/gov/evidence`, { headers })
      ]);

      const risks = (await risksRes.json()).filter(r => r.orgId === currentOrgId);
      const tasks = (await tasksRes.json()).filter(d => d.orgId === currentOrgId);
      const evaluations = (await evalsRes.json()).filter(e => e.orgId === currentOrgId);
      const evidence = await evidenceRes.json(); 

      const latestEval = evaluations[0]; 
      if (latestEval) {
        document.getElementById('kpiCompliance').textContent = `${latestEval.score}%`;
        document.getElementById('kpiCompliance').className = latestEval.score > 60 ? 'text-5xl font-black text-teal-400' : 'text-5xl font-black text-amber-400';
      } else {
        document.getElementById('kpiCompliance').textContent = `0%`;
        document.getElementById('kpiCompliance').className = 'text-5xl font-black text-slate-500';
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
      if (risks.length === 0) {
        recentRisksDiv.innerHTML = `<p class="text-sm text-slate-500">No hay riesgos registrados.</p>`;
      } else {
        recentRisksDiv.innerHTML = risks.slice(0, 3).map(r => {
          let badgeColor = r.riskLevel === 'Crítico' ? 'text-rose-400' : (r.riskLevel === 'Alto' ? 'text-orange-400' : 'text-amber-400');
          return `<div class="flex justify-between items-center py-2 border-b border-slate-700/50"><p class="text-sm text-slate-300 truncate w-3/4">${r.riskName}</p><span class="text-xs font-bold ${badgeColor}">${r.riskLevel}</span></div>`;
        }).join('');
      }

      const recentEvidenceDiv = document.getElementById('dashRecentEvidence');
      if (evidence.length === 0) {
        recentEvidenceDiv.innerHTML = `<p class="text-sm text-slate-500">No hay evidencias subidas.</p>`;
      } else {
        recentEvidenceDiv.innerHTML = evidence.slice(0, 3).map(e => {
          const date = new Date(e.ts).toLocaleDateString('es-MX');
          return `<div class="flex justify-between items-center py-2 border-b border-slate-700/50"><div><p class="text-sm text-slate-300 truncate w-48">${e.fileName.split('/').pop()}</p><p class="text-[10px] text-slate-500">${date} · ${e.questionId.replace('_',' ')}</p></div><a href="${e.r2Url}" target="_blank" class="text-xs text-teal-400 hover:underline">Ver</a></div>`;
        }).join('');
      }

    } catch (error) { console.error("Error cargando Dashboard Ejecutivo:", error); }
  }

  async function loadCompanies() {
    try {
      const res = await fetch(`${API_URL}/gov/orgs/${currentOrgId}/companies`, { headers }); if (!res.ok) throw new Error('Error');
      companiesCache = await res.json();
      document.getElementById('statCompanies').textContent = companiesCache.length;
      const tbody = document.getElementById('companiesTableBody');
      if (companiesCache.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">No hay filiales.</td></tr>`; } 
      else {
        tbody.innerHTML = companiesCache.map(c => `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${c.name}</td><td class="py-3 px-4 text-slate-400 capitalize">${c.riskProfile.replace('_', ' ')}</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-teal-950 text-teal-400 border border-teal-800">Activa</span></td><td class="py-3 px-4 text-slate-500 font-mono text-xs">${c._id}</td></tr>`).join('');
      }
      const selectModel = document.getElementById('modelCompany');
      selectModel.innerHTML = companiesCache.length === 0 ? `<option value="">Crea una filial primero</option>` : companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
      const selectDiag = document.getElementById('diagCompany');
      selectDiag.innerHTML = companiesCache.length === 0 ? `<option value="">Crea una filial primero</option>` : companiesCache.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    } catch (error) {}
  }

  async function loadInventory() {
    try {
      const res = await fetch(`${API_URL}/gov/ai-inventory`, { headers }); if (!res.ok) throw new Error('Error');
      let inventory = await res.json(); inventory = inventory.filter(item => item.orgId === currentOrgId);
      document.getElementById('statTotalModels').textContent = inventory.length;
      document.getElementById('statHighRisk').textContent = inventory.filter(i => i.risk_level === 'alto').length;
      const tbody = document.getElementById('inventoryTableBody');
      if (inventory.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay modelos.</td></tr>`; return; }
      tbody.innerHTML = inventory.map(item => {
        let riskColor = 'bg-slate-700 text-slate-300'; if (item.risk_level === 'alto') riskColor = 'bg-rose-950 text-rose-400 border border-rose-800'; if (item.risk_level === 'medio') riskColor = 'bg-amber-950 text-amber-400 border border-amber-800'; if (item.risk_level === 'bajo') riskColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        const company = companiesCache.find(c => c._id === item.companyId); const companyName = company ? company.name : 'Desconocida';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${item.model_name}</td><td class="py-3 px-4 text-slate-400 capitalize">${item.category}</td><td class="py-3 px-4 text-slate-400">${companyName}</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${riskColor}">${item.risk_level}</span></td><td class="py-3 px-4 text-slate-400 capitalize">${item.status.replace('_', ' ')}</td></tr>`;
      }).join('');
    } catch (error) {}
  }

  async function loadMatrix() {
    try {
      const res = await fetch(`${API_URL}/gov/evaluations`, { headers });
      const evaluations = await res.json();
      const matrixGrid = document.getElementById('matrixGrid');
      const frameworks = ["ISO 42001", "NIST AI RMF", "EU AI Act", "LFPDPPP"];
      matrixGrid.innerHTML = frameworks.map(fw => {
        const evalForFw = evaluations.find(e => e.framework === fw && e.orgId === currentOrgId);
        let score = "--"; let statusText = "No Evaluado"; let color = "text-slate-500"; let border = "border-slate-700"; let bg = "bg-slate-800/30";
        if (evalForFw) {
          score = `${evalForFw.score}%`;
          if (evalForFw.score > 85) { statusText = "Excelente"; color = "text-teal-400"; border = "border-teal-800"; bg = "bg-teal-950/20"; }
          else if (evalForFw.score > 60) { statusText = "Maduro"; color = "text-blue-400"; border = "border-blue-800"; bg = "bg-blue-950/20"; }
          else if (evalForFw.score > 30) { statusText = "En Desarrollo"; color = "text-amber-400"; border = "border-amber-800"; bg = "bg-amber-950/20"; }
          else { statusText = "Crítico"; color = "text-rose-400"; border = "border-rose-800"; bg = "bg-rose-950/20"; }
        }
        return `<div class="p-6 rounded-2xl border ${border} ${bg}"><h3 class="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">${fw}</h3><div class="flex justify-between items-end"><div><p class="text-4xl font-black ${color} mb-1">${score}</p><p class="text-xs font-semibold ${color}">${statusText}</p></div><button onclick="openDiagnosticFor('${fw}')" class="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg border border-slate-500 transition">Evaluar</button></div></div>`;
      }).join('');
    } catch (error) { console.error("Error cargando matriz:", error); }
  }

  window.openDiagnosticFor = function(fw) { document.getElementById('tabInventoryBtn').click(); document.getElementById('openDiagnosticBtn').click(); document.getElementById('diagFramework').value = fw; }

  async function loadDeliverables() {
    try {
      const res = await fetch(`${API_URL}/gov/deliverables`, { headers });
      let deliverables = await res.json(); deliverables = deliverables.filter(d => d.orgId === currentOrgId);
      const tbody = document.getElementById('deliverablesTableBody');
      if (deliverables.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay tareas en el plan de trabajo.</td></tr>`; return; }
      tbody.innerHTML = deliverables.map(d => {
        let badgeColor = 'bg-slate-700 text-slate-300';
        if (d.status === 'Pendiente') badgeColor = 'bg-rose-950 text-rose-400 border border-rose-800';
        if (d.status === 'En Progreso') badgeColor = 'bg-amber-950 text-amber-400 border border-amber-800';
        if (d.status === 'Completado') badgeColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${d.taskName}</td><td class="py-3 px-4 text-slate-400">${d.phase}</td><td class="py-3 px-4 text-slate-400">${d.assignedTo}</td><td class="py-3 px-4"><select onchange="updateDeliverableStatus('${d._id}', this.value)" class="px-3 py-1 rounded-lg text-xs font-semibold uppercase ${badgeColor} outline-none cursor-pointer appearance-none text-center"><option value="Pendiente" ${d.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option><option value="En Progreso" ${d.status === 'En Progreso' ? 'selected' : ''}>En Progreso</option><option value="Completado" ${d.status === 'Completado' ? 'selected' : ''}>Completado</option></select></td><td class="py-3 px-4 text-center"><button onclick="deleteDeliverable('${d._id}')" class="text-rose-500 hover:text-rose-400 transition" title="Eliminar Tarea">🗑️</button></td></tr>`;
      }).join('');
    } catch (error) { console.error("Error plan:", error); }
  }

  window.updateDeliverableStatus = async function(id, newStatus) {
    try { await fetch(`${API_URL}/gov/deliverables/${id}`, { method: 'PUT', headers, body: JSON.stringify({ status: newStatus }) }); loadDeliverables(); } catch (error) { alert("Error actualizando estado"); }
  }

  window.deleteDeliverable = async function(id) {
    if(!confirm("¿Estás seguro de eliminar esta tarea del plan?")) return;
    try {
      const res = await fetch(`${API_URL}/gov/deliverables/${id}`, { method: 'DELETE', headers });
      if (res.ok) loadDeliverables();
    } catch (error) { alert("Error al eliminar tarea"); }
  }

  const newDeliverableForm = document.getElementById('newDeliverableForm'); if(newDeliverableForm) newDeliverableForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { orgId: currentOrgId, taskName: document.getElementById('taskName').value, phase: document.getElementById('taskPhase').value, assignedTo: document.getElementById('taskAssignee').value, dueDate: document.getElementById('taskDate').value || null };
    try { 
      const res = await fetch(`${API_URL}/gov/deliverables`, { method: 'POST', headers, body: JSON.stringify(payload) }); 
      if (res.ok) { document.getElementById('newDeliverableModal').classList.add('hidden'); e.target.reset(); loadDeliverables(); } 
      else { const err = await res.json().catch(()=>({})); alert('Error al guardar tarea: ' + (err.error || res.status)); }
    } catch (err) { alert('Error de red: ' + err.message); } finally { btn.textContent = 'Guardar Tarea'; btn.disabled = false; }
  });

  async function loadRisks() {
    try {
      const res = await fetch(`${API_URL}/gov/risks`, { headers });
      let risks = await res.json(); risks = risks.filter(r => r.orgId === currentOrgId);
      const tbody = document.getElementById('risksTableBody');
      if (risks.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-500">No hay riesgos registrados.</td></tr>`; return; }
      tbody.innerHTML = risks.map(r => {
        let badgeColor = 'bg-slate-700 text-slate-300';
        if (r.riskLevel === 'Crítico') badgeColor = 'bg-rose-950 text-rose-400 border border-rose-800';
        if (r.riskLevel === 'Alto') badgeColor = 'bg-orange-950 text-orange-400 border border-orange-800';
        if (r.riskLevel === 'Medio') badgeColor = 'bg-amber-950 text-amber-400 border border-amber-800';
        if (r.riskLevel === 'Bajo') badgeColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${r.riskName}</td><td class="py-3 px-4 text-slate-400">${r.category}</td><td class="py-3 px-4 text-slate-400 text-center">${r.probability} / 5</td><td class="py-3 px-4 text-slate-400 text-center">${r.impact} / 5</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${badgeColor}">${r.riskLevel} (${r.riskScore})</span></td><td class="py-3 px-4 text-slate-400 text-xs max-w-xs truncate" title="${r.mitigationPlan}">${r.mitigationPlan}</td><td class="py-3 px-4 text-center"><button onclick="deleteRisk('${r._id}')" class="text-rose-500 hover:text-rose-400 transition" title="Eliminar Riesgo">🗑️</button></td></tr>`;
      }).join('');
    } catch (error) { console.error("Error cargando riesgos:", error); }
  }

  window.deleteRisk = async function(id) {
    if(!confirm("¿Estás seguro de eliminar este riesgo?")) return;
    try {
      const res = await fetch(`${API_URL}/gov/risks/${id}`, { method: 'DELETE', headers });
      if (res.ok) loadRisks();
    } catch (error) { alert("Error al eliminar riesgo"); }
  }

  const newRiskForm = document.getElementById('newRiskForm'); if(newRiskForm) newRiskForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { orgId: currentOrgId, companyId: document.getElementById('riskCompany').value, riskName: document.getElementById('riskName').value, category: document.getElementById('riskCategory').value, probability: parseInt(document.getElementById('riskProb').value), impact: parseInt(document.getElementById('riskImpact').value), mitigationPlan: document.getElementById('riskMitigation').value };
    try { 
      const res = await fetch(`${API_URL}/gov/risks`, { method: 'POST', headers, body: JSON.stringify(payload) }); 
      if (res.ok) { document.getElementById('newRiskModal').classList.add('hidden'); e.target.reset(); loadRisks(); } 
      else { const err = await res.json().catch(()=>({})); alert('Error al guardar riesgo: ' + (err.error || res.status)); }
    } catch (err) { alert('Error de red: ' + err.message); } finally { btn.textContent = 'Guardar Riesgo'; btn.disabled = false; }
  });

  async function loadLeads() {
    try {
      const res = await fetch(`${API_URL}/leads`, { headers }); const leads = await res.json();
      const tbody = document.getElementById('leadsTableBody');
      if (leads.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">Aún no hay prospectos.</td></tr>`; return; }
      tbody.innerHTML = leads.map(l => {
        const date = new Date(l.ts).toLocaleDateString('es-MX'); let badgeColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        if (l.risk_level === 'alto') badgeColor = 'bg-rose-950 text-rose-400 border border-rose-800';
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 text-slate-500">${date}</td><td class="py-3 px-4 font-semibold text-slate-200">${l.name}</td><td class="py-3 px-4 text-teal-400">${l.email}</td><td class="py-3 px-4 text-slate-300">${l.company}</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${badgeColor}">${l.risk_level}</span></td></tr>`;
      }).join('');
    } catch (error) {}
  }

  async function loadUsers() {
    try {
      const res = await fetch(`${API_URL}/gov/users`, { headers }); const users = await res.json();
      const tbody = document.getElementById('usersTableBody');
      tbody.innerHTML = users.map(u => `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 font-semibold text-slate-200">${u.name || 'Sin nombre'}</td><td class="py-3 px-4 text-slate-300">${u.email}</td><td class="py-3 px-4 text-teal-400 capitalize">${u.role}</td><td class="py-3 px-4 text-slate-500 font-mono text-xs">${u.orgId}</td></tr>`).join('');
    } catch (error) { console.error("Error users:", error); }
  }

  async function loadEvidence() {
    try {
      const res = await fetch(`${API_URL}/gov/evidence`, { headers }); if (!res.ok) throw new Error('Error');
      let evidence = await res.json(); const tbody = document.getElementById('evidenceTableBody');
      if (evidence.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No hay evidencias subidas aún.</td></tr>`; return; }
      tbody.innerHTML = evidence.map(e => {
        const date = new Date(e.ts).toLocaleDateString('es-MX'); let statusColor = 'bg-teal-950 text-teal-400 border border-teal-800';
        if (!e.validation.valido) statusColor = 'bg-rose-950 text-rose-400 border border-rose-800';
        const downloadBtn = `<a href="${e.r2Url}" target="_blank" class="text-teal-400 hover:text-teal-300 underline text-xs font-bold">Descargar PDF</a>`;
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/50 transition"><td class="py-3 px-4 text-slate-500">${date}</td><td class="py-3 px-4 text-slate-300 font-mono text-xs">${e.fileName.split('/').pop()}</td><td class="py-3 px-4 text-slate-200 font-semibold uppercase">${e.questionId.replace('_', ' ')}</td><td class="py-3 px-4"><span class="px-3 py-1 rounded-full text-xs font-semibold uppercase ${statusColor}">${e.validation.valido ? 'Válido' : 'Rechazado'}</span><div class="text-[10px] text-slate-500 mt-1 max-w-xs truncate" title="${e.validation.razon}">${e.validation.razon}</div></td><td class="py-3 px-4">${downloadBtn}</td></tr>`;
      }).join('');
    } catch (error) { document.getElementById('evidenceTableBody').innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-500">Error al cargar el expediente.</td></tr>`; }
  }

  window.subirEvidencia = async function(event, qId) {
    const file = event.target.files[0]; if (!file) return;
    const btn = document.getElementById(`btn_${qId}`); const status = document.getElementById(`status_${qId}`); const select = document.getElementById(qId);
    const companyId = document.getElementById('diagCompany').value;
    if (!companyId) { alert("Por favor selecciona una filial primero."); event.target.value = ""; return; }
    btn.textContent = "⏳ Analizando..."; btn.disabled = true; status.textContent = "";
    const formData = new FormData(); formData.append("file", file); formData.append("companyId", companyId); formData.append("questionId", qId);
    try {
      const res = await fetch(`${API_URL}/gov/upload-evidence`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      const data = await res.json();
      if (res.ok && data.validation && data.validation.valido) {
        btn.textContent = "✅ Validado"; btn.classList.replace('bg-slate-700', 'bg-teal-900'); btn.classList.replace('hover:bg-slate-600', 'hover:bg-teal-800'); status.textContent = "Aprobado"; status.className = "text-[10px] mt-1 text-teal-400 font-bold text-right w-36 truncate"; select.value = "5"; select.dataset.hasEvidence = "true";
      } else {
        btn.textContent = "❌ Rechazado"; btn.classList.replace('bg-slate-700', 'bg-rose-900');
        const errorMsg = data.error || (data.validation ? data.validation.razon : "No válido"); status.textContent = errorMsg; status.className = "text-[10px] mt-1 text-rose-400 text-right w-36 truncate"; select.value = "0"; select.dataset.hasEvidence = "false";
      }
    } catch (err) { console.error(err); btn.textContent = "📎 Subir Evidencia"; status.textContent = "Error de conexión"; status.className = "text-[10px] mt-1 text-rose-400 text-right w-36 truncate"; select.dataset.hasEvidence = "false"; } finally { btn.disabled = false; event.target.value = ""; }
  }

  const newModelForm = document.getElementById('newModelForm'); if(newModelForm) newModelForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { companyId: document.getElementById('modelCompany').value, model_name: document.getElementById('modelName').value, category: document.getElementById('modelCategory').value, risk_level: document.getElementById('modelRisk').value, vendor: 'Desconocido', status: 'en_uso' };
    try { const res = await fetch(`${API_URL}/gov/ai-inventory`, { method: 'POST', headers, body: JSON.stringify(payload) }); if (res.ok) { document.getElementById('newModelModal').classList.add('hidden'); e.target.reset(); loadInventory(); } else alert('Error'); } catch (err) { alert('Error'); } finally { btn.textContent = 'Guardar Modelo'; btn.disabled = false; }
  });

  const newCompanyForm = document.getElementById('newCompanyForm'); if(newCompanyForm) newCompanyForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Guardando...'; btn.disabled = true;
    const payload = { name: document.getElementById('companyNameInput').value, riskProfile: document.getElementById('companyProfileInput').value };
    try { const res = await fetch(`${API_URL}/gov/orgs/${currentOrgId}/companies`, { method: 'POST', headers, body: JSON.stringify(payload) }); if (res.ok) { document.getElementById('newCompanyModal').classList.add('hidden'); e.target.reset(); loadCompanies(); } else alert('Error'); } catch (err) { alert('Error'); } finally { btn.textContent = 'Guardar Filial'; btn.disabled = false; }
  });

  const newUserForm = document.getElementById('newUserForm'); if(newUserForm) newUserForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Creando...'; btn.disabled = true;
    const payload = { name: document.getElementById('userName').value, email: document.getElementById('userEmailInput').value, password: document.getElementById('userPassword').value, role: document.getElementById('userRole').value, orgId: document.getElementById('userOrg').value };
    try { const res = await fetch(`${API_URL}/gov/users`, { method: 'POST', headers, body: JSON.stringify(payload) }); let data = {}; try { data = await res.json(); } catch (e) {} if (res.ok) { document.getElementById('newUserModal').classList.add('hidden'); e.target.reset(); loadUsers(); alert("Usuario creado exitosamente."); } else { alert('Error: ' + (data.error || 'Revisa la terminal')); } } catch (err) { alert('Error de red.'); } finally { btn.textContent = 'Crear Usuario'; btn.disabled = false; }
  });

  const diagnosticForm = document.getElementById('diagnosticForm'); if(diagnosticForm) diagnosticForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]'); btn.textContent = 'Calculando...'; btn.disabled = true;
    const companySelect = document.getElementById('diagCompany'); const companyId = companySelect.value; const companyName = companySelect.options[companySelect.selectedIndex].text;
    const framework = document.getElementById('diagFramework').value;
    const qSelects = document.querySelectorAll('.diag-q');
    let totalScore = 0; const answers = {}; let phase1 = [], phase2 = [], phase3 = [];
    const recs = [ {p1:"Política IA.",p2:"Capacitar.",p3:"Auditar."}, {p1:"Oficial IA.",p2:"Comité.",p3:"Revisión."}, {p1:"Presupuesto.",p2:"Plan anual.",p3:"ROI."}, {p1:"Checklist AIA.",p2:"Automatizar.",p3:"Auditoría."}, {p1:"Modelos críticos.",p2:"Equidad.",p3:"Monitoreo."}, {p1:"Kill Switch.",p2:"Simulacros.",p3:"BCP."}, {p1:"Linaje.",p2:"Catálogo.",p3:"DPIA."}, {p1:"Métricas.",p2:"MLOps.",p3:"Reentrenar."}, {p1:"Backup prompts.",p2:"Git.",p3:"Trazabilidad."}, {p1:"Aviso IA.",p2:"Explicar.",p3:"XAI."}, {p1:"Caja negra.",p2:"Reportes.",p3:"Razones."}, {p1:"Buzón quejas.",p2:"Human-in-loop.",p3:"Métricas."} ];

    qSelects.forEach((sel, index) => {
      let val = parseInt(sel.value); const hasEvidence = sel.dataset.hasEvidence === "true";
      if (val >= 4 && !hasEvidence) val = 2; 
      totalScore += val; answers[`q${index+1}`] = { score: val, evidence: hasEvidence };
      const rec = recs[index];
      if (val <= 2) { phase1.push(rec.p1); phase2.push(rec.p2); phase3.push(rec.p3); }
      else if (val === 3) { phase2.push(rec.p2); phase3.push(rec.p3); }
      else if (val >= 4) { phase3.push(rec.p3); }
    });

    const percentage = Math.round((totalScore / 60) * 100);
    
    // Calcular Puntajes por Pilar
    const p1 = (answers['q1']?.score||0) + (answers['q2']?.score||0) + (answers['q3']?.score||0);
    const p2 = (answers['q4']?.score||0) + (answers['q5']?.score||0) + (answers['q6']?.score||0);
    const p3 = (answers['q7']?.score||0) + (answers['q8']?.score||0) + (answers['q9']?.score||0);
    const p4 = (answers['q10']?.score||0) + (answers['q11']?.score||0) + (answers['q12']?.score||0);
    
    const p1Pct = Math.round((p1 / 15) * 100);
    const p2Pct = Math.round((p2 / 15) * 100);
    const p3Pct = Math.round((p3 / 15) * 100);
    const p4Pct = Math.round((p4 / 15) * 100);

    // Pintar Barras
    document.getElementById('scorePillar1').textContent = `${p1Pct}%`;
    document.getElementById('barPillar1').style.width = `${p1Pct}%`;
    document.getElementById('scorePillar2').textContent = `${p2Pct}%`;
    document.getElementById('barPillar2').style.width = `${p2Pct}%`;
    document.getElementById('scorePillar3').textContent = `${p3Pct}%`;
    document.getElementById('barPillar3').style.width = `${p3Pct}%`;
    document.getElementById('scorePillar4').textContent = `${p4Pct}%`;
    document.getElementById('barPillar4').style.width = `${p4Pct}%`;

    let riskLevel = 'alto', label = 'Crítico', color = 'text-rose-400';
    if (percentage > 30 && percentage <= 60) { riskLevel = 'medio'; label = 'En Desarrollo'; color = 'text-amber-400'; }
    else if (percentage > 60 && percentage <= 85) { riskLevel = 'bajo'; label = 'Maduro'; color = 'text-blue-400'; }
    else if (percentage > 85) { riskLevel = 'bajo'; label = 'Excelente'; color = 'text-teal-400'; }

    const payload = { companyId, framework, answers, score: percentage, risk_level: riskLevel, recommendations: { phase1, phase2, phase3 } };

    try {
      const res = await fetch(`${API_URL}/gov/evaluations`, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (res.ok) {
        document.getElementById('statMaturity').textContent = `${percentage}%`; document.getElementById('statMaturity').className = `text-4xl font-bold ${color}`;
        document.getElementById('finalScore').textContent = `${percentage}%`; document.getElementById('finalScore').className = `text-6xl font-black mb-1 ${color}`;
        document.getElementById('finalRiskLabel').textContent = label;
        document.getElementById('resultFrameworkName').textContent = `Marco: ${framework}`;
        document.getElementById('roadmapPhase1').textContent = phase1.join(" ") || "Nada pendiente.";
        document.getElementById('roadmapPhase2').textContent = phase2.join(" ") || "Nada pendiente.";
        document.getElementById('roadmapPhase3').textContent = phase3.join(" ") || "Nada pendiente.";

        const btnAI = document.getElementById('btnGenerateAIReport');
        btnAI.classList.remove('hidden'); btnAI.textContent = '🧠 Generando Reporte...'; btnAI.disabled = true;

        const aiRes = await fetch(`${API_URL}/gov/generate-report`, { method: 'POST', headers, body: JSON.stringify({ companyName, score: percentage, riskLevel, answers, framework }) });
        if (aiRes.ok) {
          const aiData = await aiRes.json(); document.getElementById('aiReportText').innerText = aiData.report;
          btnAI.textContent = '📄 Ver Reporte en PDF'; btnAI.disabled = false; btnAI.classList.replace('bg-slate-600', 'bg-blue-600');
          btnAI.onclick = () => {
            const w = window.open('', '_blank');
            w.document.write(`<!DOCTYPE html><html><head><title>Reporte - ${companyName}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="p-12"><div class="max-w-3xl mx-auto"><h1 class="text-3xl font-black border-b-4 border-blue-600 pb-4 mb-4">Reporte Ejecutivo (${framework})</h1><p class="text-xl"><b>Empresa:</b> ${companyName}</p><p class="mb-6"><b>Score:</b> ${percentage}% (${label})</p><div class="prose"><h3 class="font-bold text-lg">Análisis IA:</h3><p class="whitespace-pre-wrap">${aiData.report}</p></div></div></body></html>`);
            w.document.close();
          };
        } else { btnAI.textContent = '❌ Error de IA'; btnAI.disabled = false; }
        diagFormCont.classList.add('hidden'); diagResultCont.classList.remove('hidden');
      }
    } catch (err) { alert('Error de conexión'); } finally { btn.textContent = 'Calcular Madurez'; btn.disabled = false; }
  });

  const btnGeneratePolicy = document.getElementById('btnGeneratePolicy'); if(btnGeneratePolicy) btnGeneratePolicy.addEventListener('click', () => {
    const orgName = document.getElementById('orgSelector')?.selectedOptions[0]?.text || "Organización";
    const currentDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const policyWindow = window.open('', '_blank');
    policyWindow.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Política de IA - ${orgName}</title><script src="https://cdn.tailwindcss.com"></script><style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }</style></head><body class="bg-gray-100 font-sans text-gray-800 p-8"><div class="max-w-4xl mx-auto mb-4 no-print flex justify-end"><button onclick="window.print()" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded shadow-lg transition">🖨️ Guardar como PDF / Imprimir</button></div><div class="max-w-4xl mx-auto bg-white p-12 shadow-xl border-t-8 border-teal-600 rounded-sm"><div class="text-center mb-12 border-b pb-8"><h1 class="text-3xl font-black text-gray-900 uppercase tracking-tight">Política Corporativa de Uso Aceptable de Inteligencia Artificial</h1><p class="text-gray-500 mt-2 font-semibold">${orgName}</p><p class="text-gray-400 text-sm mt-1">Versión 1.0 | Fecha de emisión: ${currentDate}</p></div><div class="space-y-6 text-sm text-justify leading-relaxed text-gray-700"><section><h2 class="text-lg font-bold text-gray-900 mb-2">1. Propósito y Alcance</h2><p>La presente política establece los lineamientos obligatorios para el uso, desarrollo, adquisición y despliegue de sistemas de Inteligencia Artificial (IA) dentro de <strong>${orgName}</strong>. Es aplicable a todos los colaboradores, contratistas y proveedores...</p></section><section><h2 class="text-lg font-bold text-gray-900 mb-2">2. Principios Rectores</h2><ul class="list-disc pl-5 space-y-1"><li><strong>Supervisión Humana:</strong> Todo sistema de IA debe mantener un nivel de control humano significativo en la toma de decisiones críticas.</li><li><strong>Privacidad por Diseño:</strong> Queda estrictamente prohibido ingresar datos personales o secretos comerciales en herramientas de IA Generativa públicas.</li></ul></section><div class="mt-16 pt-8 border-t border-gray-300"><div class="flex justify-between px-12"><div class="text-center"><div class="border-t border-gray-400 w-48 mt-8"></div><p class="font-bold mt-2 text-gray-800">Dirección General</p></div><div class="text-center"><div class="border-t border-gray-400 w-48 mt-8"></div><p class="font-bold mt-2 text-gray-800">Oficial de Cumplimiento de IA</p></div></div></div></div></div></body></html>`);
    policyWindow.document.close();
  });

  init();
});