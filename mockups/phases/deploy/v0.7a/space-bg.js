/**
 * space-bg.js — Deep space/nebula background renderer for v0.7a.
 * Renders behind the battlefield board. Subtle, dark, moody.
 */
(function() {
  'use strict';

  var canvas = document.getElementById('space-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var stars = [];
  var bigStars = [];
  var nebulae = [];
  var frame = 0;

  function resize() {
    var parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    generateField();
  }

  function generateField() {
    var w = canvas.width;
    var h = canvas.height;

    // Small stars (~200)
    stars = [];
    for (var i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 0.5 + Math.random() * 1.5,
        baseOpacity: 0.1 + Math.random() * 0.4,
        opacity: 0,
        twinkleSpeed: 0.002 + Math.random() * 0.005,
        twinkleOffset: Math.random() * Math.PI * 2
      });
    }

    // Larger stars (~30)
    bigStars = [];
    for (var j = 0; j < 30; j++) {
      bigStars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 1.5 + Math.random() * 1.5,
        baseOpacity: 0.3 + Math.random() * 0.4,
        opacity: 0,
        twinkleSpeed: 0.001 + Math.random() * 0.003,
        twinkleOffset: Math.random() * Math.PI * 2
      });
    }

    // Nebula clouds (2-3, very subtle)
    nebulae = [];
    var nebulaColors = [
      { r: 20, g: 15, b: 60 },   // deep blue-purple
      { r: 30, g: 10, b: 50 },   // dark purple
      { r: 10, g: 20, b: 45 }    // dark blue
    ];
    for (var k = 0; k < 3; k++) {
      var c = nebulaColors[k];
      nebulae.push({
        x: w * (0.2 + Math.random() * 0.6),
        y: h * (0.2 + Math.random() * 0.6),
        radius: Math.max(w, h) * (0.3 + Math.random() * 0.3),
        color: c,
        opacity: 0.03 + Math.random() * 0.05,
        driftX: (Math.random() - 0.5) * 0.02,
        driftY: (Math.random() - 0.5) * 0.02
      });
    }
  }

  function draw() {
    frame++;
    var w = canvas.width;
    var h = canvas.height;
    if (w === 0 || h === 0) { requestAnimationFrame(draw); return; }

    // Deep dark gradient background
    var grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#04060e');
    grad.addColorStop(0.5, '#060a18');
    grad.addColorStop(1, '#08061a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Nebula clouds
    for (var n = 0; n < nebulae.length; n++) {
      var neb = nebulae[n];
      neb.x += neb.driftX;
      neb.y += neb.driftY;
      // Wrap around
      if (neb.x < -neb.radius) neb.x = w + neb.radius;
      if (neb.x > w + neb.radius) neb.x = -neb.radius;
      if (neb.y < -neb.radius) neb.y = h + neb.radius;
      if (neb.y > h + neb.radius) neb.y = -neb.radius;

      var ng = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
      ng.addColorStop(0, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',' + neb.opacity + ')');
      ng.addColorStop(1, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',0)');
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, w, h);
    }

    // Small stars
    var time = frame * 0.016; // ~60fps approximation
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.opacity = s.baseOpacity * (0.6 + 0.4 * Math.sin(time * s.twinkleSpeed * 60 + s.twinkleOffset));
      ctx.fillStyle = 'rgba(255,255,255,' + s.opacity + ')';
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    // Big stars
    for (var j = 0; j < bigStars.length; j++) {
      var bs = bigStars[j];
      bs.opacity = bs.baseOpacity * (0.7 + 0.3 * Math.sin(time * bs.twinkleSpeed * 60 + bs.twinkleOffset));
      ctx.beginPath();
      ctx.arc(bs.x, bs.y, bs.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + bs.opacity + ')';
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  // Init on load
  window.addEventListener('resize', resize);
  resize();
  draw();
})();
