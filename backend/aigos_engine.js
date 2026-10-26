// ==========================================
// AIGOS SCORING ENGINE v1.0
// Basado en el Modelo de Puntuación Unificado AIGOS v1.0
// ==========================================

/**
 * 4. Criticidad del sistema de IA (0 a 100)
 * Fórmula: 100 * [0.30*(D-1)/4 + 0.25*(A-1)/4 + 0.25*(I-1)/4 + 0.20*(R-1)/4]
 * Reglas de piso incluidas.
 */
export function calculateCriticality(D, A, I, R) {
  // Normalización de 1-5 a 0-1
  const nD = (D - 1) / 4;
  const nA = (A - 1) / 4;
  const nI = (I - 1) / 4;
  const nR = (R - 1) / 4;

  // Cálculo base
  let score = 100 * (0.30 * nD + 0.25 * nA + 0.25 * nI + 0.20 * nR);
  
  // Nivel Base
  let level = 'Baja';
  if (score >= 75) level = 'Crítica';
  else if (score >= 50) level = 'Alta';
  else if (score >= 25) level = 'Media';

  // Reglas de Piso (Sección 4 del PDF)
  let floorApplied = false;
  if (D === 5) { floorApplied = 'Alta'; }
  if (R >= 4) { floorApplied = 'Alta'; } // Si R=5, además aplica tamizaje SaMD
  if (A === 5 && I >= 4) { floorApplied = 'Crítica'; }
  if (A >= 4 && D >= 4) { floorApplied = 'Alta'; }

  // Aplicar piso si es mayor que el nivel base
  const levelsHierarchy = { 'Baja': 0, 'Media': 1, 'Alta': 2, 'Crítica': 3 };
  const baseLevel = level;
  
  if (floorApplied && levelsHierarchy[floorApplied] > levelsHierarchy[level]) {
    level = floorApplied;
  }

  return {
    score: Math.round(score * 10) / 10,
    level,
    baseLevel,
    floorApplied: floorApplied || null,
    saMDRequired: R === 5
  };
}

/**
 * 5.2 Riesgo Residual
 * Fórmula: Inherente * (1 - e_combinada)
 * e_combinada = min(80%, 1 - (1-e1)*(1-e2)*...)
 */
export function calculateResidualRisk(P, I, controlsEffectiveness = []) {
  const inherent = P * I;
  
  // Nivel Inherente
  let inherentLevel = 'Bajo';
  if (inherent >= 16) inherentLevel = 'Crítico';
  else if (inherent >= 11) inherentLevel = 'Alto';
  else if (inherent >= 6) inherentLevel = 'Medio';

  // Si no hay controles probados, el residual es igual al inherente
  if (!controlsEffectiveness || controlsEffectiveness.length === 0) {
    return { inherent, inherentLevel, residual: inherent, residualLevel: inherentLevel, eCombined: 0 };
  }

  // Calcular efectividad combinada
  let probFailure = 1;
  controlsEffectiveness.forEach(e => {
    // e viene como decimal (ej. 0.6 para 60%)
    probFailure = probFailure * (1 - e);
  });
  
  let eCombined = 1 - probFailure;
  if (eCombined > 0.80) eCombined = 0.80; // Tope del 80%

  const residual = inherent * (1 - eCombined);
  
  let residualLevel = 'Bajo';
  if (residual > 15) residualLevel = 'Crítico';
  else if (residual > 10) residualLevel = 'Alto';
  else if (residual > 5) residualLevel = 'Medio';

  return {
    inherent,
    inherentLevel,
    eCombined: Math.round(eCombined * 100) / 100,
    residual: Math.round(residual * 10) / 10,
    residualLevel
  };
}

/**
 * 7. Madurez Organizacional (0 a 100)
 * Toma un array de respuestas del assessment { domain, level, hasEvidence }
 */
export function calculateMaturity(responses, domainWeights) {
  const domains = {};
  
  responses.forEach(r => {
    let effectiveLevel = r.level;
    // Regla de tope por evidencia: Nivel >= 3 sin evidencia baja a 2
    if (effectiveLevel >= 3 && !r.hasEvidence) {
      effectiveLevel = 2;
    }

    if (!domains[r.domain]) {
      domains[r.domain] = { sum: 0, count: 0, naCount: 0 };
    }
    
    if (r.isNA) {
      domains[r.domain].naCount++;
    } else if (r.level !== null && r.level !== undefined) {
      domains[r.domain].sum += effectiveLevel;
      domains[r.domain].count++;
    }
  });

  let totalMaturity = 0;
  let totalWeight = 0;
  const domainScores = {};

  Object.keys(domainWeights).forEach(domain => {
    const data = domains[domain];
    if (data && data.count > 0) {
      const avgLevel = data.sum / data.count;
      const score = (avgLevel / 5) * 100;
      domainScores[domain] = {
        score: Math.round(score * 10) / 10,
        weight: domainWeights[domain],
        answered: data.count
      };
      totalMaturity += score * domainWeights[domain];
      totalWeight += domainWeights[domain];
    } else {
      domainScores[domain] = { score: 0, weight: domainWeights[domain], answered: 0 };
    }
  });

  // Si no hay datos en ningún dominio
  if (totalWeight === 0) return { overall: 0, domains: domainScores, band: 'Inicial' };

  // Re-normalizar si faltan dominios (Sección 7.3 y 12 del PDF)
  const finalMaturity = totalWeight > 0 ? (totalMaturity / totalWeight) : 0;

  let band = 'Inicial';
  if (finalMaturity >= 80) band = 'Líder';
  else if (finalMaturity >= 60) band = 'Avanzado';
  else if (finalMaturity >= 40) band = 'Intermedio';
  else if (finalMaturity >= 20) band = 'Básico';

  return {
    overall: Math.round(finalMaturity * 10) / 10,
    band,
    domains: domainScores,
    totalWeight
  };
}

/**
 * 9. AI Governance Index v1.0
 * Fórmula: 0.30*M + 0.25*G + 0.15*E + 0.20*C + 0.10*V
 * Incluye Compuertas.
 */
export function calculateAIGI(M, G, E, C, V, gates = {}) {
  const calculated = (0.30 * M) + (0.25 * G) + (0.15 * E) + (0.20 * C) + (0.10 * V);
  
  let published = calculated;
  let appliedGate = null;

  // Compuertas (Sección 9)
  // 1. Sin política de IA o sin Comité operando -> max 59
  if (!gates.hasPolicy || !gates.hasActiveCommittee) {
    if (published > 59) { published = 59; appliedGate = 'Sin política de IA o Comité inactivo (>90 días)'; }
  }
  
  // 2. Cobertura de inventario < 50% -> max 69
  if (V < 50) {
    if (published > 69) { published = 69; appliedGate = 'Cobertura de inventario menor al 50%'; }
  }

  // 3. Riesgo residual Crítico abierto sin plan aprobado -> max 79
  if (gates.hasUnmitigatedCriticalRisk) {
    if (published > 79) { published = 79; appliedGate = 'Riesgo residual Crítico sin plan de tratamiento aprobado'; }
  }

  let band = 'Vulnerable';
  if (published >= 90) band = 'Líder';
  else if (published >= 80) band = 'Optimizado';
  else if (published >= 60) band = 'Gestionado';
  else if (published >= 40) band = 'Básico';

  return {
    calculated: Math.round(calculated * 10) / 10,
    published: Math.round(published * 10) / 10,
    band,
    appliedGate,
    components: { M, G, E, C, V }
  };
}