// ================================================================
// MAIN JS — BehAvIorLab
// v3 — contadores hardened (fallback 2s), init defensivo con try/catch
// ================================================================

(function() {
  'use strict';

  // ---------- ANIMACIÓN DE CONTADORES ----------
  function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    if (!counters.length) return;
    counters.forEach(counter => {
      if (counter.dataset.animated === 'true') return;
      counter.dataset.animated = 'true';

      const target = parseInt(counter.getAttribute('data-target'), 10);
      if (isNaN(target) || target <= 0) {
        counter.textContent = '0';
        return;
      }

      const duration = 2000;
      const startTime = performance.now();

      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = Math.round(easeOutQuart * target);
        counter.textContent = currentValue;
        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          counter.textContent = target;
        }
      }
      requestAnimationFrame(updateCounter);
    });
  }

  function setupCounterObserver() {
    const aboutSection = document.querySelector('.about');
    if (!aboutSection) {
      animateCounters();
      return;
    }

    const rect = aboutSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (isVisible) {
      setTimeout(animateCounters, 200);
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      animateCounters();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(animateCounters, 200);
          observer.disconnect();
        }
      });
    }, { threshold: 0.1 });

    observer.observe(aboutSection);
  }

  // Fallback de credibilidad: si en 2s no corrió la animación,
  // poner los valores finales. Nunca mostrar "0" falso.
  function setupCounterFallback() {
    setTimeout(() => {
      document.querySelectorAll('.stat-number').forEach(el => {
        if (el.dataset.animated === 'true') return;
        const t = parseInt(el.dataset.target, 10);
        if (!isNaN(t) && t > 0 && (el.textContent === '0' || el.textContent === '')) {
          el.textContent = t;
        }
      });
    }, 2000);
  }

  // ---------- SCROLL REVEAL ----------
  function setupRevealObserver() {
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') {
      reveals.forEach(el => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach(el => observer.observe(el));
  }

  // ---------- HAMBURGER MENU ----------
  function setupHamburger() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (!hamburger || !navLinks) return;
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
      });
    });
  }

  // ---------- SMOOTH SCROLL ----------
  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#' || targetId.length <= 1) return;
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // ---------- CARRUSEL DE FRASES ----------
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

  // ---------- MODALES DE ARQUITECTURA ----------
  function setupModals() {
    const modalTriggers = document.querySelectorAll('.arch-item[data-modal]');
    const modals = document.querySelectorAll('.arch-modal');
    const closeButtons = document.querySelectorAll('.arch-modal-close');

    modalTriggers.forEach(trigger => {
      trigger.addEventListener('click', function() {
        const modalId = this.getAttribute('data-modal');
        const modal = document.getElementById(modalId);
        if (modal) {
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
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
        if (e.target === this) {
          this.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        modals.forEach(modal => {
          modal.classList.remove('active');
        });
        document.body.style.overflow = '';
      }
    });
  }

  // ---------- INIT (defensivo: cada bloque aislado) ----------
  function init() {
    const safe = (fn, name) => {
      try {
        fn();
      } catch (err) {
        console.error('[main.js] Error en ' + name + ':', err);
      }
    };

    safe(setupCounterObserver, 'setupCounterObserver');
    safe(setupCounterFallback, 'setupCounterFallback');
    safe(setupRevealObserver, 'setupRevealObserver');
    safe(setupHamburger, 'setupHamburger');
    safe(setupSmoothScroll, 'setupSmoothScroll');
    safe(setupPhraseCarousel, 'setupPhraseCarousel');
    safe(setupModals, 'setupModals');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();