/**
 * fog-fg.js — Foreground fog effects for v0.6a.
 *
 * Renders ABOVE the battlefield:
 *   1. Drifting foreground wisps (elongated gradient ellipses)
 *   2. Spark particles bursting from explosion hotspots
 *   3. Floating debris (ash, embers, shrapnel)
 *
 * Reads explosion state from fog-bg.js via window._fogExplosions.
 */

(function initFogForeground() {
  var canvas = document.getElementById('fog-fg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // ── Spark particles ─────────────────────────────────
  var sparks = [];
  var MAX_SPARKS = 80;

  // ── Floating debris ─────────────────────────────────
  var debris = [];
  var NUM_DEBRIS = 30;

  // ── Foreground wisps ────────────────────────────────
  var wisps = [];
  var NUM_WISPS = 10;

  // ── Board pan ───────────────────────────────────────
  function getBoardPan() {
    var inner = document.getElementById('battlefield-inner');
    if (!inner) return { tx: 0, ty: 0 };
    var style = inner.style.transform || '';
    var match = style.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
    if (match) return { tx: parseFloat(match[1]), ty: parseFloat(match[2]) };
    return { tx: 0, ty: 0 };
  }

  // ── Init wisps ──────────────────────────────────────
  function initWisps(w, h) {
    wisps = [];
    for (var i = 0; i < NUM_WISPS; i++) {
      wisps.push({
        x: Math.random() * w * 1.4 - w * 0.2,
        y: h * 0.05 + Math.random() * h * 0.9,
        vx: 0.1 + Math.random() * 0.3,
        vy: (Math.random() - 0.5) * 0.04,
        // Elongated ellipse dimensions
        radiusX: 150 + Math.random() * 350,
        radiusY: 20 + Math.random() * 50,
        alpha: 0.015 + Math.random() * 0.045,
        phase: Math.random() * Math.PI * 2,
        alphaSpeed: 0.002 + Math.random() * 0.003,
        rotation: (Math.random() - 0.5) * 0.3, // slight tilt
        depth: 0.03 + Math.random() * 0.05,
        wrapW: w
      });
    }
  }

  // ── Init debris ─────────────────────────────────────
  function initDebris(w, h) {
    debris = [];
    for (var i = 0; i < NUM_DEBRIS; i++) {
      var isEmber = Math.random() < 0.15;
      debris.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.12 - 0.04,
        size: 0.5 + Math.random() * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        alpha: 0.03 + Math.random() * 0.09,
        isRect: Math.random() > 0.5 && !isEmber,
        isEmber: isEmber,
        emberPhase: Math.random() * Math.PI * 2,
        wrapW: w,
        wrapH: h
      });
    }
  }

  // ── Spawn sparks ────────────────────────────────────
  function spawnSparks(x, y) {
    var count = 6 + Math.floor(Math.random() * 10);
    for (var i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1.5 + Math.random() * 3.5;
      sparks.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        life: 1.0,
        decay: 0.012 + Math.random() * 0.015,
        size: 0.8 + Math.random() * 2,
        gravity: 0.02 + Math.random() * 0.03
      });
    }
  }

  // ── Resize ──────────────────────────────────────────
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    initWisps(canvas.width, canvas.height);
    initDebris(canvas.width, canvas.height);
  }

  // ── Track explosion flashes ─────────────────────────
  var lastFlashState = {};

  function checkExplosions() {
    var exps = window._fogExplosions;
    if (!exps) return;
    for (var i = 0; i < exps.length; i++) {
      var ex = exps[i];
      var wasFlashing = lastFlashState[i] || false;
      var isFlashing = ex.phase === 'flash' && ex.flashAlpha > 0.3;
      if (isFlashing && !wasFlashing) {
        spawnSparks(ex.x, ex.y);
      }
      lastFlashState[i] = isFlashing;
    }
  }

  // ── Draw ────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var pan = getBoardPan();

    checkExplosions();

    // ── 1. Foreground wisps (drifting gradient ellipses) ──
    for (var w = 0; w < wisps.length; w++) {
      var wi = wisps[w];
      wi.x += wi.vx;
      wi.y += wi.vy;
      wi.phase += wi.alphaSpeed;

      // Wrap
      if (wi.x - wi.radiusX > canvas.width + 100) {
        wi.x = -wi.radiusX - 50;
      }

      var wx = wi.x + pan.tx * wi.depth;
      var wy = wi.y + pan.ty * wi.depth;
      var wAlpha = wi.alpha * (0.6 + 0.4 * Math.sin(wi.phase));

      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(wi.rotation);

      var wGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, wi.radiusX);
      wGrad.addColorStop(0, 'rgba(175,175,185,' + wAlpha + ')');
      wGrad.addColorStop(0.35, 'rgba(170,170,180,' + (wAlpha * 0.5) + ')');
      wGrad.addColorStop(0.7, 'rgba(165,165,175,' + (wAlpha * 0.15) + ')');
      wGrad.addColorStop(1, 'rgba(160,160,170,0)');
      ctx.fillStyle = wGrad;

      // Draw as scaled circle → ellipse
      ctx.scale(1, wi.radiusY / wi.radiusX);
      ctx.beginPath();
      ctx.arc(0, 0, wi.radiusX, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ── 2. Floating debris ────────────────────────────
    for (var d = 0; d < debris.length; d++) {
      var db = debris[d];
      db.x += db.vx;
      db.y += db.vy;
      db.rotation += db.rotSpeed;

      // Wrap
      if (db.x > canvas.width + 10) db.x = -10;
      if (db.x < -10) db.x = canvas.width + 10;
      if (db.y > canvas.height + 10) db.y = -10;
      if (db.y < -10) db.y = canvas.height + 10;

      var dx = db.x + pan.tx * 0.08;
      var dy = db.y + pan.ty * 0.08;

      if (db.isEmber) {
        db.emberPhase += 0.04;
        var ea = db.alpha * (0.5 + 0.5 * Math.sin(db.emberPhase));
        ctx.fillStyle = 'rgba(255,160,40,' + ea + ')';
        ctx.beginPath();
        ctx.arc(dx, dy, db.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Tiny glow
        ctx.fillStyle = 'rgba(255,120,20,' + (ea * 0.3) + ')';
        ctx.beginPath();
        ctx.arc(dx, dy, db.size * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (db.isRect) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(db.rotation);
        ctx.fillStyle = 'rgba(180,180,180,' + db.alpha + ')';
        ctx.fillRect(-db.size, -db.size * 0.4, db.size * 2, db.size * 0.8);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(160,160,160,' + db.alpha + ')';
        ctx.beginPath();
        ctx.arc(dx, dy, db.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── 3. Spark particles ────────────────────────────
    for (var s = sparks.length - 1; s >= 0; s--) {
      var sp = sparks[s];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += sp.gravity;
      sp.vx *= 0.99;
      sp.vy *= 0.99;
      sp.life -= sp.decay;

      if (sp.life <= 0) { sparks.splice(s, 1); continue; }

      var spx = sp.x + pan.tx * 0.08;
      var spy = sp.y + pan.ty * 0.08;

      // Color: white → yellow → orange → red
      var r, g, b;
      if (sp.life > 0.7) {
        r = 255; g = 240 + (sp.life - 0.7) * 50; b = 200 * sp.life;
      } else if (sp.life > 0.3) {
        r = 255; g = 120 + sp.life * 200; b = 20;
      } else {
        r = 255 * (sp.life / 0.3); g = 60 * (sp.life / 0.3); b = 10;
      }

      ctx.fillStyle = 'rgba(' + (r|0) + ',' + Math.min(255, g|0) + ',' + (b|0) + ',' + (sp.life * 0.9) + ')';
      ctx.beginPath();
      ctx.arc(spx, spy, sp.size * sp.life, 0, Math.PI * 2);
      ctx.fill();

      if (sp.life > 0.4) {
        ctx.fillStyle = 'rgba(255,180,60,' + (sp.life * 0.15) + ')';
        ctx.beginPath();
        ctx.arc(spx, spy, sp.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (sp.life > 0.3) {
        var tailX = spx - sp.vx * 3;
        var tailY = spy - sp.vy * 3;
        ctx.strokeStyle = 'rgba(255,200,80,' + (sp.life * 0.3) + ')';
        ctx.lineWidth = sp.size * sp.life * 0.5;
        ctx.beginPath();
        ctx.moveTo(spx, spy);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }
    }

    requestAnimationFrame(draw);
  }

  // ── Init ───────────────────────────────────────────
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
