/**
 * atmosphere.js — Smoke wisps + area lights
 * Renders on a canvas inside #battlefield-inner, between terrain and models.
 */
(function() {
  var canvas = document.getElementById('smoke-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  // Match the SVG viewBox dimensions
  canvas.width = 720;
  canvas.height = 528;

  // ── Smoke wisps near ruins ──
  // Terrain positions: t1(144,60), t2(264,336), t6(360,204), t10(456,192), t14(360,324)
  var wisps = [
    { x: 180, y: 80,  size: 45, phase: 0 },
    { x: 260, y: 96,  size: 35, phase: 1.2 },
    { x: 290, y: 360, size: 50, phase: 2.4 },
    { x: 340, y: 380, size: 40, phase: 0.8 },
    { x: 380, y: 220, size: 55, phase: 3.1 },
    { x: 420, y: 240, size: 38, phase: 1.9 },
    { x: 490, y: 210, size: 42, phase: 4.0 },
    { x: 380, y: 340, size: 48, phase: 2.7 },
    { x: 410, y: 360, size: 35, phase: 0.4 }
  ];

  // ── Area lights near ruins ──
  var lights = [
    { x: 200, y: 90,  radius: 30, alpha: 0.06 },
    { x: 330, y: 370, radius: 35, alpha: 0.05 },
    { x: 400, y: 230, radius: 25, alpha: 0.07 },
    { x: 520, y: 230, radius: 30, alpha: 0.05 },
    { x: 400, y: 350, radius: 28, alpha: 0.06 }
  ];

  function draw(t) {
    ctx.clearRect(0, 0, 720, 528);
    var ts = t * 0.001;

    // ── Draw smoke wisps ──
    for (var i = 0; i < wisps.length; i++) {
      var w = wisps[i];
      // Fade cycle: 8-15s
      var cyclePeriod = 10 + (i % 3) * 2.5;
      var fade = 0.5 + 0.5 * Math.sin(ts / cyclePeriod * Math.PI * 2 + w.phase);
      var opacity = 0.03 + fade * 0.05; // 0.03-0.08

      // Slow drift
      var driftX = Math.sin(ts * 0.15 + w.phase) * 6;
      var driftY = Math.cos(ts * 0.1 + w.phase * 0.7) * 4;

      var grd = ctx.createRadialGradient(
        w.x + driftX, w.y + driftY, 0,
        w.x + driftX, w.y + driftY, w.size
      );
      grd.addColorStop(0, 'rgba(60,70,90,' + opacity.toFixed(4) + ')');
      grd.addColorStop(0.6, 'rgba(50,60,80,' + (opacity * 0.4).toFixed(4) + ')');
      grd.addColorStop(1, 'rgba(40,50,70,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(w.x + driftX, w.y + driftY, w.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Draw area lights ──
    for (var j = 0; j < lights.length; j++) {
      var l = lights[j];
      // Subtle flicker
      var flicker = 0.85 + 0.15 * Math.sin(ts * 1.5 + j * 1.7);
      var a = l.alpha * flicker;

      var lgrd = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
      lgrd.addColorStop(0, 'rgba(220,170,60,' + a.toFixed(4) + ')');
      lgrd.addColorStop(0.5, 'rgba(200,140,40,' + (a * 0.5).toFixed(4) + ')');
      lgrd.addColorStop(1, 'rgba(180,120,30,0)');
      ctx.fillStyle = lgrd;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
