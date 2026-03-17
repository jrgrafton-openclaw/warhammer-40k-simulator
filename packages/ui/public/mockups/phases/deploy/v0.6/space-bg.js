/**
 * space-bg.js — Animated deep space background with parallax.
 * Features: rotating stars, flickering, shooting stars, nebula clouds,
 * sun with glow pulse, small planets.
 * Parallax: reads board pan (tx/ty) and offsets layers at different rates.
 */

(function initSpaceBackground() {
  var canvas = document.getElementById('space-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var stars = [];
  var shootingStars = [];
  var nebulae = [];
  var planets = [];
  var sun = null;
  var centerX, centerY, maxRadius;

  // Parallax: read board transform to offset space layers
  function getBoardPan() {
    var inner = document.getElementById('battlefield-inner');
    if (!inner) return { tx: 0, ty: 0 };
    var style = inner.style.transform || '';
    var match = style.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
    if (match) return { tx: parseFloat(match[1]), ty: parseFloat(match[2]) };
    return { tx: 0, ty: 0 };
  }

  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    maxRadius = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height) * 0.6;
    initStars();
    initNebulae();
    initSun();
    initPlanets();
  }

  function initStars() {
    stars = [];
    for (var i = 0; i < 600; i++) {
      stars.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * maxRadius,
        speed: (Math.random() * 0.00008 + 0.00002) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() < 0.92 ? (0.4 + Math.random() * 0.8) : (1.2 + Math.random() * 1.0),
        brightness: 0.3 + Math.random() * 0.7,
        flickerSpeed: 0.001 + Math.random() * 0.003,
        flickerPhase: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.7 ? (200 + Math.random() * 40) : (30 + Math.random() * 30),
        sat: 10 + Math.random() * 40
      });
    }
  }

  function initNebulae() {
    nebulae = [];
    var colors = [
      { r: 20, g: 40, b: 80 },
      { r: 40, g: 20, b: 60 },
      { r: 15, g: 30, b: 50 },
      { r: 30, g: 15, b: 45 }
    ];
    for (var i = 0; i < 4; i++) {
      var c = colors[i];
      nebulae.push({
        x: canvas.width * (0.1 + Math.random() * 0.8),
        y: canvas.height * (0.1 + Math.random() * 0.8),
        radius: 120 + Math.random() * 200,
        color: c,
        alpha: 0.05 + Math.random() * 0.06,
        driftX: (Math.random() - 0.5) * 0.015,
        driftY: (Math.random() - 0.5) * 0.015
      });
    }
  }

  function initSun() {
    // Large sun in upper-right area — acts as the light source
    sun = {
      x: canvas.width * 0.82,
      y: canvas.height * 0.15,
      radius: 60,
      glowRadius: 200,
      pulsePhase: 0
    };
  }

  function initPlanets() {
    planets = [];
    // 2-3 small planets at various positions
    var configs = [
      { x: 0.12, y: 0.22, r: 18, color: { r: 60, g: 80, b: 120 }, ringColor: null },
      { x: 0.92, y: 0.75, r: 12, color: { r: 100, g: 60, b: 50 }, ringColor: null },
      { x: 0.35, y: 0.88, r: 24, color: { r: 50, g: 70, b: 90 }, ringColor: 'rgba(120,140,170,0.15)' }
    ];
    configs.forEach(function(cfg) {
      planets.push({
        x: canvas.width * cfg.x,
        y: canvas.height * cfg.y,
        radius: cfg.r,
        color: cfg.color,
        ringColor: cfg.ringColor
      });
    });
  }

  function spawnShootingStar() {
    if (shootingStars.length > 0) return;
    if (Math.random() > 0.003) return;
    var angle = -Math.PI * 0.25 + (Math.random() - 0.5) * 0.5; // roughly upper-left to lower-right
    var speed = 3 + Math.random() * 3;
    shootingStars.push({
      x: Math.random() * canvas.width * 0.7,
      y: Math.random() * canvas.height * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 1.5,
      life: 1.0,
      decay: 0.015 + Math.random() * 0.01,
      length: 30 + Math.random() * 20
    });
  }

  function drawSun(pan, now) {
    if (!sun) return;
    var px = sun.x + pan.tx * 0.05; // very slow parallax (distant)
    var py = sun.y + pan.ty * 0.05;

    // Animated glow pulse
    sun.pulsePhase += 0.008;
    var pulse = 1.0 + 0.15 * Math.sin(sun.pulsePhase);

    // Outer glow
    var outerGrad = ctx.createRadialGradient(px, py, 0, px, py, sun.glowRadius * pulse);
    outerGrad.addColorStop(0, 'rgba(255,200,100,0.08)');
    outerGrad.addColorStop(0.3, 'rgba(255,160,60,0.03)');
    outerGrad.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(px - sun.glowRadius * 1.5, py - sun.glowRadius * 1.5, sun.glowRadius * 3, sun.glowRadius * 3);

    // Inner core
    var coreGrad = ctx.createRadialGradient(px, py, 0, px, py, sun.radius * pulse);
    coreGrad.addColorStop(0, 'rgba(255,240,200,0.35)');
    coreGrad.addColorStop(0.5, 'rgba(255,180,80,0.15)');
    coreGrad.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(px, py, sun.radius * pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Bright center dot
    ctx.fillStyle = 'rgba(255,250,230,0.5)';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlanets(pan) {
    planets.forEach(function(p) {
      var px = p.x + pan.tx * 0.08;
      var py = p.y + pan.ty * 0.08;

      // Planet body with shading (lit from upper-right = sun direction)
      var grad = ctx.createRadialGradient(
        px + p.radius * 0.3, py - p.radius * 0.3, 0,
        px, py, p.radius
      );
      grad.addColorStop(0, 'rgba(' + (p.color.r + 40) + ',' + (p.color.g + 40) + ',' + (p.color.b + 40) + ',0.6)');
      grad.addColorStop(0.7, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',0.4)');
      grad.addColorStop(1, 'rgba(' + Math.max(0, p.color.r - 30) + ',' + Math.max(0, p.color.g - 30) + ',' + Math.max(0, p.color.b - 30) + ',0.2)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric glow
      var atmoGrad = ctx.createRadialGradient(px, py, p.radius * 0.9, px, py, p.radius * 1.4);
      atmoGrad.addColorStop(0, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',0.08)');
      atmoGrad.addColorStop(1, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',0)');
      ctx.fillStyle = atmoGrad;
      ctx.beginPath();
      ctx.arc(px, py, p.radius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Ring (if configured)
      if (p.ringColor) {
        ctx.strokeStyle = p.ringColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px, py, p.radius * 1.8, p.radius * 0.4, -0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pan = getBoardPan();

    // Deep space gradient base (static, no parallax on the base gradient)
    var bg = ctx.createRadialGradient(centerX, centerY * 0.7, 0, centerX, centerY, maxRadius);
    bg.addColorStop(0, '#0c1420');
    bg.addColorStop(0.5, '#080e18');
    bg.addColorStop(1, '#040810');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nebulae (very slow parallax — 0.05)
    for (var n = 0; n < nebulae.length; n++) {
      var neb = nebulae[n];
      neb.x += neb.driftX;
      neb.y += neb.driftY;
      if (neb.x < -neb.radius) neb.x = canvas.width + neb.radius;
      if (neb.x > canvas.width + neb.radius) neb.x = -neb.radius;
      if (neb.y < -neb.radius) neb.y = canvas.height + neb.radius;
      if (neb.y > canvas.height + neb.radius) neb.y = -neb.radius;

      var npx = neb.x + pan.tx * 0.05;
      var npy = neb.y + pan.ty * 0.05;

      var grad = ctx.createRadialGradient(npx, npy, 0, npx, npy, neb.radius);
      grad.addColorStop(0, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',' + neb.alpha + ')');
      grad.addColorStop(1, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(npx - neb.radius, npy - neb.radius, neb.radius * 2, neb.radius * 2);
    }

    // Sun (slow parallax — 0.05)
    drawSun(pan, now);

    // Planets (slightly faster parallax — 0.08)
    drawPlanets(pan);

    // Stars (faster parallax — 0.12, still slow relative to board)
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.angle += s.speed;

      var x = centerX + s.radius * Math.cos(s.angle) + pan.tx * 0.12;
      var y = centerY + s.radius * Math.sin(s.angle) + pan.ty * 0.12;

      if (x < -2 || x > canvas.width + 2 || y < -2 || y > canvas.height + 2) continue;

      var flicker = s.brightness * (0.5 + 0.5 * Math.sin(now * s.flickerSpeed + s.flickerPhase));
      flicker = Math.max(0.05, flicker);

      ctx.fillStyle = 'hsla(' + s.hue + ',' + s.sat + '%,85%,' + flicker + ')';

      if (s.size < 1.0) {
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Shooting stars (follow star parallax)
    spawnShootingStar();
    for (var j = shootingStars.length - 1; j >= 0; j--) {
      var ss = shootingStars[j];
      ss.x += ss.vx;
      ss.y += ss.vy;
      ss.life -= ss.decay;

      if (ss.life <= 0) { shootingStars.splice(j, 1); continue; }

      var ssx = ss.x + pan.tx * 0.12;
      var ssy = ss.y + pan.ty * 0.12;
      var tailX = ssx - ss.vx * ss.length * 0.5;
      var tailY = ssy - ss.vy * ss.length * 0.5;

      var grad = ctx.createLinearGradient(ssx, ssy, tailX, tailY);
      grad.addColorStop(0, 'rgba(200,220,255,' + (ss.life * 0.7) + ')');
      grad.addColorStop(1, 'rgba(200,220,255,0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ssx, ssy);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,' + (ss.life * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(ssx, ssy, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
