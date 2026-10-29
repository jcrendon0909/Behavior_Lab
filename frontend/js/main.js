// ================================================================
// MAIN JS — BehAvIorLab
// v6 — scrollRestoration + reload detection + all fixes
// ================================================================

(function() {
  'use strict';

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // ---------- Forzar scroll al top en carga ----------
  // Si es RELOAD (F5) → siempre top (ignora hash)
  // Si es NAVEGACIÓN FRESCA con hash → respeta hash (deep-link)
  // Si es NAVEGACIÓN FRESCA sin hash → top
  function forceScrollTopOnLoad() {
    let isReload = false;
    try {
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries.length > 0) {
        isReload = navEntries[0].type === 'reload';
      }
    } catch (err) { /* fallback: tratar como navegación fresca */ }

    const hash = window.location.hash;

    // Si es navegación fresca CON hash intencional → respetar
    if (!isReload && hash && hash !== '#' && hash !== '#hero') {
      return;
    }

    const goTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    goTop();
    setTimeout(goTop, 30);
    setTimeout(goTop, 100);
    setTimeout(goTop, 300);
    setTimeout(goTop, 800);
  }

  // ---------- CONTADORES ----------
  function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    if (!counters.length) return;
    counters.forEach(counter => {
      if (counter.dataset.animated === 'true') return;
      counter.dataset.animated = 'true';
      const target = parseInt(counter.getAttribute('data-target'), 10);
      if (isNaN(target) || target <= 0) { counter.textContent = '0'; return; }
      const duration = 2000;
      const startTime = performance.now();
      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        counter.textContent = Math.round(easeOutQuart * target);
        if (progress < 1) requestAnimationFrame(updateCounter);
        else counter.textContent = target;
      }
      requestAnimationFrame(updateCounter);
    });
  }

  function setupCounterObserver() {
    const aboutSection = document.querySelector('.about');
    if (!aboutSection) { animateCounters(); return; }
    const rect = aboutSection.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) { setTimeout(animateCounters, 200); return; }
    if (typeof IntersectionObserver === 'undefined') { animateCounters(); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { setTimeout(animateCounters, 200); observer.disconnect(); }
      });
    }, { threshold: 0.1 });
    observer.observe(aboutSection);
  }

  function setupCounterFallback() {
    setTimeout(() => {
      document.querySelectorAll('.stat-number').forEach(el => {
        if (el.dataset.animated === 'true') return;
        const t = parseInt(el.dataset.target, 10);
        if (!isNaN(t) && t > 0 && (el.textContent === '0' || el.textContent === '')) el.textContent = t;
      });
    }, 2000);
  }

  // ---------- SCROLL REVEAL ----------
  function setupRevealObserver() {
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') { reveals.forEach(el => el.classList.add('visible')); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
    }, { threshold: 0.15 });
    reveals.forEach(el => observer.observe(el));
  }

  // ---------- HAMBURGER ----------
  function setupHamburger() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (!hamburger || !navLinks) return;
    hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ---------- SMOOTH SCROLL ----------
  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#' || targetId.length <= 1) return;
        const target = document.querySelector(targetId);
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
      });
    });
  }

  // ---------- CARRUSEL ----------
  function setupPhraseCarousel() {
    const phrases = [
      "Agentes de IA que entienden procesos, no solo palabras.",
      "De procesos complejos a flujos que corren solos.",
      "Comportamiento, datos y operación, en un mismo laboratorio.",
      "La IA que se integra a lo que ya eres.",
      "Menos fricción operativa, más foco estratégico."
    ];
    const phraseElement = document.querySelector('#hero-phrases .phrase');
    if (!phraseElement) return;
    let currentIndex = 0;
    function changePhrase() {
      phraseElement.style.opacity = 0;
      setTimeout(() => {
        currentIndex = (currentIndex + 1) % phrases.length;
        phraseElement.textContent = phrases[currentIndex];
        phraseElement.style.opacity = 1;
      }, 600);
    }
    phraseElement.textContent = phrases[0];
    phraseElement.style.transition = 'opacity 0.6s ease';
    phraseElement.style.opacity = 1;
    setInterval(changePhrase, 5000);
  }

  // ---------- MODALES ----------
  function setupModals() {
    const modalTriggers = document.querySelectorAll('.arch-item[data-modal]');
    const modals = document.querySelectorAll('.arch-modal');
    const closeButtons = document.querySelectorAll('.arch-modal-close');
    modalTriggers.forEach(trigger => {
      trigger.addEventListener('click', function() {
        const modalId = this.getAttribute('data-modal');
        const modal = document.getElementById(modalId);
        if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
      });
    });
    closeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const modal = this.closest('.arch-modal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
    modals.forEach(modal => {
      modal.addEventListener('click', function(e) {
        if (e.target === this) { this.classList.remove('active'); document.body.style.overflow = ''; }
      });
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        modals.forEach(modal => modal.classList.remove('active'));
        document.body.style.overflow = '';
      }
    });
  }

  // ---------- 5-QUESTION QUIZ ----------
  function setupFiveQuestions() {
    const submitBtn = document.getElementById('fiveQSubmit');
    if (!submitBtn) return;
    const items = document.querySelectorAll('.five-q-item');
    const resultBox = document.getElementById('fiveQResult');
    const scoreNum = document.getElementById('fiveQScoreNum');
    const resultTitle = document.getElementById('fiveQResultTitle');
    const resultMsg = document.getElementById('fiveQResultMsg');
    const ctaPrimary = document.getElementById('fiveQCtaPrimary');
    const ctaSecondary = document.getElementById('fiveQCtaSecondary');
    const state = { q1: null, q2: null, q3: null, q4: null, q5: null };

    items.forEach(item => {
      const qKey = 'q' + item.dataset.q;
      item.querySelectorAll('.q-option').forEach(opt => {
        opt.addEventListener('click', () => {
          item.querySelectorAll('.q-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          item.classList.add('answered');
          const val = parseInt(opt.querySelector('input').value, 10);
          state[qKey] = val;
          checkComplete();
        });
      });
    });

    function checkComplete() {
      const allAnswered = Object.values(state).every(v => v !== null);
      submitBtn.disabled = !allAnswered;
    }

    function animateScore(target) {
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 20));
      const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        scoreNum.innerHTML = current + '<small>/5</small>';
      }, 40);
    }

    submitBtn.addEventListener('click', () => {
      const total = Object.values(state).reduce((a, b) => a + b, 0);
      let color = '#34d399', title = '', msg = '', primary = '#readiness';
      if (total <= 1) {
        color = '#34d399'; title = 'Base sólida.';
        msg = 'Un diagnóstico completo le dará el respaldo que su consejo y sus clientes pedirán. Es el siguiente paso.';
        primary = '#readiness';
      } else if (total <= 3) {
        color = '#fbbf24'; title = 'Puntos ciegos.';
        msg = 'Conviene descubrirlos antes de que lo haga un cliente o un auditor. El diagnóstico completo los mapea en 6 minutos.';
        primary = '#readiness';
      } else {
        color = '#f87171'; title = 'Hoy no ve lo que su gente ya usa.';
        msg = 'Es exactamente la conversación que debemos tener. Agende 30 minutos y le mostramos el mapa real de la IA en su empresa.';
        primary = '#contacto';
      }
      scoreNum.style.color = color;
      animateScore(total);
      resultTitle.textContent = title;
      resultTitle.style.color = color;
      resultMsg.textContent = msg;
      ctaPrimary.href = primary;
      ctaPrimary.textContent = (primary === '#readiness' ? 'Ver mi diagnóstico completo →' : 'Hablar con un experto →');
      resultBox.style.display = 'block';
      setTimeout(() => resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  // ---------- INIT ----------
  function init() {
    const safe = (fn, name) => { try { fn(); } catch (err) { console.error('[main.js] ' + name + ':', err); } };
    safe(forceScrollTopOnLoad, 'forceScrollTopOnLoad');
    safe(setupCounterObserver, 'setupCounterObserver');
    safe(setupCounterFallback, 'setupCounterFallback');
    safe(setupRevealObserver, 'setupRevealObserver');
    safe(setupHamburger, 'setupHamburger');
    safe(setupSmoothScroll, 'setupSmoothScroll');
    safe(setupPhraseCarousel, 'setupPhraseCarousel');
    safe(setupModals, 'setupModals');
    safe(setupFiveQuestions, 'setupFiveQuestions');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('load', forceScrollTopOnLoad);
})();