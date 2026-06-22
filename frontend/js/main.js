// ================================================================
// MAIN JS — BehAvIorLab (animaciones, scroll, contadores)
// ================================================================

(function() {
  'use strict';

  // ---------- ANIMACIÓN DE CONTADORES ----------
  function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target'));
      if (isNaN(target) || target === 0) return;
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
    if (!aboutSection) return;
    const rect = aboutSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (isVisible) {
      setTimeout(animateCounters, 300);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(animateCounters, 300);
          observer.disconnect();
        }
      });
    }, { threshold: 0.3 });
    observer.observe(aboutSection);
  }

  // ---------- SCROLL REVEAL ----------
  function setupRevealObserver() {
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length === 0) return;
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
        if (targetId === '#') return;
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

  // ---------- INICIO ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupRevealObserver();
      setupHamburger();
      setupSmoothScroll();
      setupCounterObserver();
      setupPhraseCarousel();
    });
  } else {
    setupRevealObserver();
    setupHamburger();
    setupSmoothScroll();
    setupCounterObserver();
    setupPhraseCarousel();
  }

})();