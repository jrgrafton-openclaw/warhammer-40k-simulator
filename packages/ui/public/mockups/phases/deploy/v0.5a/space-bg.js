/**
 * space-bg.js — Animated deep space background with rotating stars + nebula.
 * Inspired by GROK-style starfield: polar coordinates, slow cinematic rotation,
 * natural flicker/glow, rare shooting stars.
 * 
 * Canvas fills #battlefield behind everything else.
 */

(function initSpaceBackground() {
  var canvas = document.getElementById('space-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var stars = [];
  var shootingStars = [];
  var nebulae = [];
  var centerX, centerY, maxRadius;

  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    maxRadius = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height) * 0.6;
    initStars();
    initNebulae();
  }

  function initStars() {
    stars = [];
    var numStars = 600;
    for (var i = 0; i < numStars; i++) {
      stars.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * maxRadius,
        speed: (Math.random() * 0.00008 + 0.00002) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() < 0.92 ? (0.4 + Math.random() * 0.8) : (1.2 + Math.random() * 1.0),
        brightness: 0.3 + Math.random() * 0.7,
        flickerSpeed: 0.001 + Math.random() * 0.003,
        flickerPhase: Math.random() * Math.PI * 2,
        // Color: mostly white/blue-white, some warm
        hue: Math.random() < 0.7 ? (200 + Math.random() * 40) : (30 + Math.random() * 30),
        sat: 10 + Math.random() * 40
      });
    }
  }

  function initNebulae() {
    nebulae = [];
    // 3-4 very subtle nebula clouds at random positions
    var colors = [
      { r: 20, g: 40, b: 80 },   // deep blue
      { r: 40, g: 20, b: 60 },   // deep purple
      { r: 15, g: 30, b: 50 },   // dark navy
      { r: 30, g: 15, b: 45 }    // plum
    ];
    for (var i = 0; i < 4; i++) {
      var c = colors[i];
      nebulae.push({
        x: canvas.width * (0.15 + Math.random() * 0.7),
        y: canvas.height * (0.15 + Math.random() * 0.7),
        radius: 120 + Math.random() * 200,
        color: c,
        alpha: 0.05 + Math.random() * 0.06,
        driftX: (Math.random() - 0.5) * 0.02,
        driftY: (Math.random() - 0.5) * 0.02
      });
    }
  }

  function spawnShootingStar() {
    if (shootingStars.length > 0) return;
    if (Math.random() > 0.003) return; // ~0.3% chance per frame = ~every 5-10 seconds
    
    var angle = Math.random() * Math.PI * 2;
    var speed = 3 + Math.random() * 3;
    shootingStars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 1, // slight downward bias
      life: 1.0,
      decay: 0.015 + Math.random() * 0.01,
      length: 30 + Math.random() * 20
    });
  }

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Deep space gradient base
    var bg = ctx.createRadialGradient(centerX, centerY * 0.7, 0, centerX, centerY, maxRadius);
    bg.addColorStop(0, '#0c1420');
    bg.addColorStop(0.5, '#080e18');
    bg.addColorStop(1, '#040810');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nebulae
    for (var n = 0; n < nebulae.length; n++) {
      var neb = nebulae[n];
      neb.x += neb.driftX;
      neb.y += neb.driftY;
      // Wrap around
      if (neb.x < -neb.radius) neb.x = canvas.width + neb.radius;
      if (neb.x > canvas.width + neb.radius) neb.x = -neb.radius;
      if (neb.y < -neb.radius) neb.y = canvas.height + neb.radius;
      if (neb.y > canvas.height + neb.radius) neb.y = -neb.radius;

      var grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
      grad.addColorStop(0, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',' + neb.alpha + ')');
      grad.addColorStop(1, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(neb.x - neb.radius, neb.y - neb.radius, neb.radius * 2, neb.radius * 2);
    }

    // Stars — polar coordinate rotation with flicker
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.angle += s.speed;

      var x = centerX + s.radius * Math.cos(s.angle);
      var y = centerY + s.radius * Math.sin(s.angle);

      // Skip if off-screen
      if (x < -2 || x > canvas.width + 2 || y < -2 || y > canvas.height + 2) continue;

      // Flicker
      var flicker = s.brightness * (0.5 + 0.5 * Math.sin(now * s.flickerSpeed + s.flickerPhase));
      flicker = Math.max(0.05, flicker);

      var alpha = flicker;
      ctx.fillStyle = 'hsla(' + s.hue + ',' + s.sat + '%,85%,' + alpha + ')';

      if (s.size < 1.0) {
        // Tiny stars: use fillRect for crispness
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      } else {
        // Larger stars: small circle
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

      if (ss.life <= 0) {
        shootingStars.splice(j, 1);
        continue;
      }

      // Trail gradient
      var tailX = ss.x - ss.vx * ss.length * 0.5;
      var tailY = ss.y - ss.vy * ss.length * 0.5;
      var grad = ctx.createLinearGradient(ss.x, ss.y, tailX, tailY);
      grad.addColorStop(0, 'rgba(200,220,255,' + (ss.life * 0.7) + ')');
      grad.addColorStop(1, 'rgba(200,220,255,0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      // Bright head
      ctx.fillStyle = 'rgba(255,255,255,' + (ss.life * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(ss.x, ss.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
