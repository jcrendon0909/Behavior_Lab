// ================================================================
// MAIN JS — BehaviorLab (animaciones, scroll, contadores)
// ================================================================

(function() {
  'use strict';

  // ---------- ANIMACIÓN DE CONTADORES ----------
  function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target'));
      const duration = 2000; // 2 segundos
      const startTime = performance.now();
      const startValue = 0;

      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Función de easing para que sea más suave
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = Math.round(easeOutQuart * target);
        counter.textContent = currentValue;
        
        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          counter.textContent = target; // Asegurar el valor final exacto
        }
      }

      requestAnimationFrame(updateCounter);
    });
  }

  // ---------- OBSERVER PARA DETECTAR CUANDO APARECE LA SECCIÓN ----------
  function setupCounterObserver() {
    const aboutSection = document.querySelector('.about');
    if (!aboutSection) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Esperar un poco para asegurar que todo está renderizado
          setTimeout(() => {
            animateCounters();
          }, 300);
          observer.disconnect(); // Solo ejecutar una vez
        }
      });
    }, { threshold: 0.3 });

    observer.observe(aboutSection);
  }

  // ---------- SCROLL REVEAL (animación de aparición) ----------
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

    // Cerrar al hacer clic en un enlace
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

  // ---------- INICIO ----------
  // Ejecutar cuando el DOM esté completamente cargado
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupRevealObserver();
      setupHamburger();
      setupSmoothScroll();
      setupCounterObserver();
    });
  } else {
    setupRevealObserver();
    setupHamburger();
    setupSmoothScroll();
    setupCounterObserver();
  }
// ========== CARRUSEL DE FRASES EN EL HERO ==========
(function() {
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
    // Efecto fade out
    phraseElement.style.opacity = 0;
    
    setTimeout(() => {
      // Cambiar texto
      currentIndex = (currentIndex + 1) % phrases.length;
      phraseElement.textContent = phrases[currentIndex];
      // Efecto fade in
      phraseElement.style.opacity = 1;
    }, 600); // Coincide con la duración de la transición CSS
  }

  // Establecer la primera frase
  phraseElement.textContent = phrases[0];
  phraseElement.style.transition = 'opacity 0.6s ease';
  phraseElement.style.opacity = 1;

  // Cambiar cada 5 segundos
  setInterval(changePhrase, 5000);
})();