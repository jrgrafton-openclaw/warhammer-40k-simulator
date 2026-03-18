/**
 * space-bg.js — Animated space overlay on top of a nebula background image.
 * The nebula image is set via CSS on #battlefield.
 * This canvas draws: rotating stars, flicker, shooting stars, sun glow.
 * Parallax: reads board pan (tx/ty) and offsets layers at different rates.
 */

(function initSpaceBackground() {
  var canvas = document.getElementById('space-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var stars = [];
  var shootingStars = [];
  var sun = null;
  var centerX, centerY, maxRadius;

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
    initSun();
  }

  function initStars() {
    stars = [];
    for (var i = 0; i < 300; i++) {
      stars.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * maxRadius,
        speed: (Math.random() * 0.00008 + 0.00002) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() < 0.9 ? (0.3 + Math.random() * 0.6) : (0.8 + Math.random() * 0.8),
        brightness: 0.15 + Math.random() * 0.5,
        flickerSpeed: 0.001 + Math.random() * 0.003,
        flickerPhase: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.6 ? (200 + Math.random() * 40) : (30 + Math.random() * 30),
        sat: 10 + Math.random() * 30
      });
    }
  }

  function initSun() {
    sun = {
      x: canvas.width * 0.85,
      y: canvas.height * 0.12,
      radius: 50,
      glowRadius: 180,
      pulsePhase: 0
    };
  }

  function spawnShootingStar() {
    if (shootingStars.length > 0) return;
    if (Math.random() > 0.003) return;
    var angle = -Math.PI * 0.25 + (Math.random() - 0.5) * 0.5;
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
    var px = sun.x + pan.tx * 0.05;
    var py = sun.y + pan.ty * 0.05;

    sun.pulsePhase += 0.008;
    var pulse = 1.0 + 0.12 * Math.sin(sun.pulsePhase);

    // Outer glow
    var outerGrad = ctx.createRadialGradient(px, py, 0, px, py, sun.glowRadius * pulse);
    outerGrad.addColorStop(0, 'rgba(255,200,100,0.06)');
    outerGrad.addColorStop(0.3, 'rgba(255,160,60,0.02)');
    outerGrad.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(px - sun.glowRadius * 1.5, py - sun.glowRadius * 1.5, sun.glowRadius * 3, sun.glowRadius * 3);

    // Core
    var coreGrad = ctx.createRadialGradient(px, py, 0, px, py, sun.radius * pulse);
    coreGrad.addColorStop(0, 'rgba(255,240,200,0.25)');
    coreGrad.addColorStop(0.5, 'rgba(255,180,80,0.1)');
    coreGrad.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(px, py, sun.radius * pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = 'rgba(255,250,230,0.4)';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pan = getBoardPan();

    // Move nebula background div with parallax (clamped to ±5%)
    var nebulaBg = document.getElementById('nebula-bg');
    if (nebulaBg) {
      var nbOffX = Math.max(-5, Math.min(5, pan.tx * 0.015));
      var nbOffY = Math.max(-5, Math.min(5, pan.ty * 0.015));
      nebulaBg.style.transform = 'translate(' + nbOffX + '%, ' + nbOffY + '%)';
    }

    // Sun glow (parallax 0.05)
    drawSun(pan, now);

    // Stars (parallax 0.12)
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.angle += s.speed;

      var x = centerX + s.radius * Math.cos(s.angle) + pan.tx * 0.12;
      var y = centerY + s.radius * Math.sin(s.angle) + pan.ty * 0.12;

      if (x < -2 || x > canvas.width + 2 || y < -2 || y > canvas.height + 2) continue;

      var flicker = s.brightness * (0.5 + 0.5 * Math.sin(now * s.flickerSpeed + s.flickerPhase));
      flicker = Math.max(0.03, flicker);

      ctx.fillStyle = 'hsla(' + s.hue + ',' + s.sat + '%,88%,' + flicker + ')';

      if (s.size < 0.8) {
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Shooting stars
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
