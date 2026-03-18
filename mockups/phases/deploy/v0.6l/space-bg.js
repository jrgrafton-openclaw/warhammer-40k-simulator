/**
 * space-bg.js — Stars only for v0.6l.
 * Pulls in the starfield feel from v0.5a, but without nebulae,
 * background wash, or shooting stars.
 */

(function initSpaceBackground() {
  var canvas = document.getElementById('space-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var stars = [];
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
    maxRadius = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height) * 0.62;
    initStars();
  }

  function initStars() {
    stars = [];
    var numStars = 420;
    for (var i = 0; i < numStars; i++) {
      stars.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * maxRadius,
        speed: (Math.random() * 0.00005 + 0.00001) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() < 0.94 ? (0.35 + Math.random() * 0.6) : (0.9 + Math.random() * 0.7),
        brightness: 0.16 + Math.random() * 0.42,
        flickerSpeed: 0.0008 + Math.random() * 0.002,
        flickerPhase: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.82 ? (200 + Math.random() * 35) : (28 + Math.random() * 20),
        sat: 8 + Math.random() * 24
      });
    }
  }

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var pan = getBoardPan();

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.angle += s.speed;

      var x = centerX + s.radius * Math.cos(s.angle) + pan.tx * 0.08;
      var y = centerY + s.radius * Math.sin(s.angle) + pan.ty * 0.08;
      if (x < -2 || x > canvas.width + 2 || y < -2 || y > canvas.height + 2) continue;

      var flicker = s.brightness * (0.6 + 0.4 * Math.sin(now * s.flickerSpeed + s.flickerPhase));
      flicker = Math.max(0.04, flicker);
      ctx.fillStyle = 'hsla(' + s.hue + ',' + s.sat + '%,84%,' + flicker + ')';

      if (s.size < 0.95) {
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
