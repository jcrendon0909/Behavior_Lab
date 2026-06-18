// Partículas animadas (fondo hero)
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');

let width, height;
let particles = [];

function init() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  particles = [];
  const count = Math.floor((width * height) / 12000);
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2 + 1,
      alpha: Math.random() * 0.5 + 0.2
    });
  }
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  
  // Dibujar líneas entre partículas cercanas
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(0, 212, 170, ${0.08 * (1 - dist / 150)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
  
  // Dibujar partículas
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 212, 170, ${p.alpha})`;
    ctx.fill();
    // Mover
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x > width) p.vx *= -1;
    if (p.y < 0 || p.y > height) p.vy *= -1;
  });
  
  requestAnimationFrame(draw);
}

init();
draw();

window.addEventListener('resize', () => {
  init();
});