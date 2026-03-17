/**
 * atmosphere.js — Smoke wisps + warm area lights renderer.
 * Renders on a canvas overlaid between terrain and model SVGs.
 */

export function initAtmosphere() {
  var canvas = document.getElementById('smoke-canvas');
  if (!canvas) return;

  // Match the battlefield-inner dimensions (SVG viewBox is 720x528)
  // The canvas sits inside battlefield-inner and should match its coordinate space
  canvas.width = 720;
  canvas.height = 528;

  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;

  // ── Smoke wisps near terrain ruins ──
  // Key terrain positions from terrain-data.js:
  // t1: [144,60], t2: [264,336], t6: [360,204], t10: [456,192], t14: [360,324]
  var wisps = [
    // Near t1 ruins
    { x: 155, y: 55,  radius: 40, baseAlpha: 0.05, phase: 0,    driftX: 0.15, driftY: -0.1,  cycleSec: 10 },
    { x: 175, y: 80,  radius: 35, baseAlpha: 0.04, phase: 1.2,  driftX: 0.1,  driftY: -0.15, cycleSec: 12 },
    // Near t2 ruins
    { x: 275, y: 330, radius: 45, baseAlpha: 0.05, phase: 2.0,  driftX: -0.1, driftY: -0.12, cycleSec: 11 },
    { x: 250, y: 350, radius: 30, baseAlpha: 0.03, phase: 3.5,  driftX: 0.2,  driftY: -0.08, cycleSec: 14 },
    // Near t6 ruins
    { x: 370, y: 195, radius: 50, baseAlpha: 0.06, phase: 0.8,  driftX: 0.12, driftY: -0.2,  cycleSec: 9  },
    { x: 350, y: 215, radius: 35, baseAlpha: 0.04, phase: 4.0,  driftX: -0.15,driftY: -0.1,  cycleSec: 13 },
    // Near t10 ruins
    { x: 465, y: 185, radius: 45, baseAlpha: 0.05, phase: 1.5,  driftX: 0.1,  driftY: -0.18, cycleSec: 10 },
    { x: 445, y: 200, radius: 30, baseAlpha: 0.04, phase: 5.0,  driftX: -0.2, driftY: -0.1,  cycleSec: 15 },
    // Near t14 ruins
    { x: 370, y: 318, radius: 40, baseAlpha: 0.05, phase: 2.8,  driftX: 0.15, driftY: -0.15, cycleSec: 11 },
    { x: 350, y: 338, radius: 55, baseAlpha: 0.03, phase: 0.5,  driftX: -0.1, driftY: -0.12, cycleSec: 8  }
  ];

  // ── Warm area lights near/inside ruins ──
  var lights = [
    { x: 200, y: 90,  radius: 30, alpha: 0.06 },  // t1
    { x: 330, y: 370, radius: 25, alpha: 0.05 },  // t2
    { x: 400, y: 230, radius: 28, alpha: 0.06 },  // t6
    { x: 520, y: 230, radius: 22, alpha: 0.04 },  // t10
    { x: 400, y: 350, radius: 25, alpha: 0.05 }   // t14
  ];

  var startTime = performance.now();

  function render() {
    var elapsed = (performance.now() - startTime) / 1000; // seconds

    ctx.clearRect(0, 0, W, H);

    // ── Draw smoke wisps ──
    for (var i = 0; i < wisps.length; i++) {
      var w = wisps[i];
      // Slow drift
      var dx = Math.sin(elapsed * 0.3 + w.phase) * w.driftX * 20;
      var dy = Math.cos(elapsed * 0.2 + w.phase) * w.driftY * 15;
      var wx = w.x + dx;
      var wy = w.y + dy;

      // Fade in/out cycle
      var cyclePos = (elapsed + w.phase) / w.cycleSec;
      var fade = (Math.sin(cyclePos * Math.PI * 2) + 1) * 0.5; // 0..1
      var alpha = w.baseAlpha * (0.3 + fade * 0.7); // never fully invisible

      var grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, w.radius);
      grad.addColorStop(0, 'rgba(40,50,70,' + alpha.toFixed(4) + ')');
      grad.addColorStop(0.5, 'rgba(40,50,70,' + (alpha * 0.4).toFixed(4) + ')');
      grad.addColorStop(1, 'rgba(40,50,70,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wx, wy, w.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Draw warm area lights ──
    for (var j = 0; j < lights.length; j++) {
      var l = lights[j];
      // Very subtle flicker
      var flicker = 1 + Math.sin(elapsed * 1.5 + j * 2.1) * 0.15;
      var la = l.alpha * flicker;

      var lgrad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
      lgrad.addColorStop(0, 'rgba(255,180,80,' + la.toFixed(4) + ')');
      lgrad.addColorStop(0.4, 'rgba(255,160,60,' + (la * 0.5).toFixed(4) + ')');
      lgrad.addColorStop(1, 'rgba(255,140,40,0)');

      ctx.fillStyle = lgrad;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
      ctx.fill();

      // Tiny warm shadow cast (offset down-right, darker)
      var sx = l.x + 4;
      var sy = l.y + 4;
      var sgrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, l.radius * 0.6);
      sgrad.addColorStop(0, 'rgba(0,0,0,' + (la * 0.3).toFixed(4) + ')');
      sgrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = sgrad;
      ctx.beginPath();
      ctx.arc(sx, sy, l.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
}
