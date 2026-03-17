/**
 * space-bg.js — Deep space / nebula background canvas
 * Renders behind everything in #battlefield (z-index: 0)
 */
(function() {
  var canvas = document.getElementById('space-bg');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var W, H;

  function resize() {
    var bf = document.getElementById('battlefield');
    W = canvas.width = bf.offsetWidth;
    H = canvas.height = bf.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Stars ──
  var stars = [];
  // ~200 small stars
  for (var i = 0; i < 200; i++) {
    stars.push({
      x: Math.random(), y: Math.random(),
      size: 0.5 + Math.random() * 1.5,
      alpha: 0.15 + Math.random() * 0.45,
      twinkleSpeed: 0.3 + Math.random() * 0.7,
      twinkleOffset: Math.random() * Math.PI * 2
    });
  }
  // ~30 larger stars
  for (var j = 0; j < 30; j++) {
    stars.push({
      x: Math.random(), y: Math.random(),
      size: 2 + Math.random() * 1.5,
      alpha: 0.3 + Math.random() * 0.4,
      twinkleSpeed: 0.2 + Math.random() * 0.4,
      twinkleOffset: Math.random() * Math.PI * 2
    });
  }

  // ── Nebula clouds ──
  var nebulae = [
    { x: 0.2, y: 0.3, rx: 0.15, ry: 0.1, color: [20, 40, 80], alpha: 0.04 },
    { x: 0.7, y: 0.6, rx: 0.12, ry: 0.08, color: [40, 20, 60], alpha: 0.035 },
    { x: 0.5, y: 0.15, rx: 0.1, ry: 0.06, color: [15, 50, 60], alpha: 0.03 }
  ];

  function draw(t) {
    // Background gradient
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#040810');
    grad.addColorStop(0.5, '#060c14');
    grad.addColorStop(1, '#040a10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Nebula clouds
    for (var n = 0; n < nebulae.length; n++) {
      var nb = nebulae[n];
      var grd = ctx.createRadialGradient(
        nb.x * W, nb.y * H, 0,
        nb.x * W, nb.y * H, nb.rx * W
      );
      grd.addColorStop(0, 'rgba(' + nb.color.join(',') + ',' + nb.alpha + ')');
      grd.addColorStop(1, 'rgba(' + nb.color.join(',') + ',0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(nb.x * W, nb.y * H, nb.rx * W, nb.ry * H, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stars with twinkle
    var ts = t * 0.001;
    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      var twinkle = 0.5 + 0.5 * Math.sin(ts * st.twinkleSpeed + st.twinkleOffset);
      var a = st.alpha * (0.4 + 0.6 * twinkle);
      ctx.fillStyle = 'rgba(200,210,230,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, st.size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
