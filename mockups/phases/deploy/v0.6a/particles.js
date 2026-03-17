/**
 * particles.js — Subtle dust/ember particle overlay for v0.6a
 * Spawns particles near terrain positions, rising slowly with warm amber glow.
 */

import { mapData } from '../../../shared/state/terrain-data.js';

export function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Match canvas to battlefield-inner size
  function resize() {
    const inner = document.getElementById('battlefield-inner');
    if (!inner) return;
    canvas.width = inner.offsetWidth || 1440;
    canvas.height = inner.offsetHeight || 1056;
  }
  resize();
  window.addEventListener('resize', resize);

  // Gather terrain center positions (in SVG coords) for spawn points
  const spawnPoints = mapData.terrain.map(t => {
    const paths = t.paths;
    // Parse rough center from first path's origin
    return { x: t.origin[0], y: t.origin[1] };
  });

  // SVG viewBox is 720x528, but the inner element renders at CSS size
  // We need to map SVG coords to canvas coords
  function svgToCanvas(sx, sy) {
    const inner = document.getElementById('battlefield-inner');
    if (!inner) return { x: sx, y: sy };
    return {
      x: (sx / 720) * canvas.width,
      y: (sy / 528) * canvas.height
    };
  }

  const MAX_PARTICLES = 18;
  const particles = [];

  function spawnParticle() {
    const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    // Offset slightly from terrain center
    const offsetX = (Math.random() - 0.5) * 60;
    const offsetY = (Math.random() - 0.5) * 40;
    return {
      sx: sp.x + offsetX,
      sy: sp.y + offsetY,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.2 + Math.random() * 0.3), // rise upward
      life: 1.0,
      decay: 0.002 + Math.random() * 0.003,
      size: 1 + Math.random() * 2,
      // Warm amber palette with slight variation
      hue: 25 + Math.random() * 20,
      sat: 70 + Math.random() * 30,
      bright: 60 + Math.random() * 30,
    };
  }

  // Pre-populate some particles
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = spawnParticle();
    p.life = Math.random(); // random starting life
    particles.push(p);
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.sx += p.vx;
      p.sy += p.vy;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles[i] = spawnParticle();
        continue;
      }

      const pos = svgToCanvas(p.sx, p.sy);
      const alpha = p.life * 0.55; // max opacity ~0.55

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.bright}%, ${alpha})`;
      ctx.fill();

      // Subtle glow
      if (p.size > 1.5) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.bright}%, ${alpha * 0.15})`;
        ctx.fill();
      }
    }

    // Keep particle count stable
    while (particles.length < MAX_PARTICLES) {
      particles.push(spawnParticle());
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
