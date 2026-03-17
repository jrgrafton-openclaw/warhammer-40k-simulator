/**
 * space-bg.js — Deep space / nebula background canvas renderer.
 * Draws behind the battlefield board area.
 */

export function initSpaceBackground() {
  var canvas = document.getElementById('space-bg');
  if (!canvas) return;

  var parent = canvas.parentElement;
  canvas.width = parent.offsetWidth || 1200;
  canvas.height = parent.offsetHeight || 800;

  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;

  // ── Deep dark gradient base ──
  var bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#05060a');
  bg.addColorStop(0.5, '#080a12');
  bg.addColorStop(1, '#060810');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Stars ──
  var stars = [];

  // ~200 small stars
  for (var i = 0; i < 200; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1,
      baseAlpha: 0.1 + Math.random() * 0.4,
      twinkleSpeed: 0.002 + Math.random() * 0.006,
      twinkleOffset: Math.random() * Math.PI * 2
    });
  }

  // ~30 larger stars
  for (var j = 0; j < 30; j++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1.5 + Math.random() * 1.5,
      baseAlpha: 0.3 + Math.random() * 0.5,
      twinkleSpeed: 0.001 + Math.random() * 0.004,
      twinkleOffset: Math.random() * Math.PI * 2
    });
  }

  // ── Nebula clouds (2-3, very subtle) ──
  var nebulae = [
    { x: W * 0.25, y: H * 0.3, rx: 200, ry: 150, color: [15, 10, 40], alpha: 0.05, driftX: 0.02, driftY: 0.01 },
    { x: W * 0.7,  y: H * 0.6, rx: 250, ry: 180, color: [10, 15, 35], alpha: 0.04, driftX: -0.015, driftY: 0.008 },
    { x: W * 0.5,  y: H * 0.8, rx: 180, ry: 120, color: [20, 8, 30],  alpha: 0.03, driftX: 0.01, driftY: -0.005 }
  ];

  var t = 0;

  function render() {
    t++;

    // Clear and redraw base
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Draw nebulae
    for (var n = 0; n < nebulae.length; n++) {
      var neb = nebulae[n];
      var nx = neb.x + Math.sin(t * neb.driftX * 0.01) * 5;
      var ny = neb.y + Math.cos(t * neb.driftY * 0.01) * 3;
      var grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, Math.max(neb.rx, neb.ry));
      var c = neb.color;
      grad.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + neb.alpha + ')');
      grad.addColorStop(0.5, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (neb.alpha * 0.4) + ')');
      grad.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');

      ctx.save();
      ctx.translate(nx, ny);
      ctx.scale(neb.rx / Math.max(neb.rx, neb.ry), neb.ry / Math.max(neb.rx, neb.ry));
      ctx.translate(-nx, -ny);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nx, ny, Math.max(neb.rx, neb.ry), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw stars with twinkling
    for (var s = 0; s < stars.length; s++) {
      var star = stars[s];
      var twinkle = Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
      var alpha = star.baseAlpha + twinkle * 0.15;
      alpha = Math.max(0.05, Math.min(0.8, alpha));

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,210,230,' + alpha.toFixed(3) + ')';
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
}
