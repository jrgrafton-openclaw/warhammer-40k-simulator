/**
 * fog-fg.js — Foreground fog effects for v0.6a.
 *
 * Renders ABOVE the battlefield:
 *   1. Thin foreground cloud wisps (very low opacity, drifting across board)
 *   2. Spark particles bursting from explosion points in the fog
 *   3. Floating debris (ash, embers, shrapnel) drifting across the scene
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

  // ── Foreground cloud wisps ──────────────────────────
  var wisps = [];
  var NUM_WISPS = 6;

  // ── Board pan tracking ──────────────────────────────
  function getBoardPan() {
    var inner = document.getElementById('battlefield-inner');
    if (!inner) return { tx: 0, ty: 0 };
    var style = inner.style.transform || '';
    var match = style.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
    if (match) return { tx: parseFloat(match[1]), ty: parseFloat(match[2]) };
    return { tx: 0, ty: 0 };
  }

  // ── Init debris ─────────────────────────────────────
  function initDebris(w, h) {
    debris = [];
    for (var i = 0; i < NUM_DEBRIS; i++) {
      var isEmber = Math.random() < 0.15;
      debris.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.15 - 0.05, // slight upward drift
        size: 0.5 + Math.random() * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        alpha: 0.04 + Math.random() * 0.1,
        isRect: Math.random() > 0.5 && !isEmber,
        isEmber: isEmber,
        emberPhase: Math.random() * Math.PI * 2,
        w: w,
        h: h
      });
    }
  }

  // ── Init wisps ──────────────────────────────────────
  function initWisps(w, h) {
    wisps = [];
    for (var i = 0; i < NUM_WISPS; i++) {
      wisps.push({
        x: Math.random() * w,
        y: h * 0.1 + Math.random() * h * 0.8,
        vx: 0.15 + Math.random() * 0.25,
        vy: (Math.random() - 0.5) * 0.05,
        width: 200 + Math.random() * 400,
        height: 30 + Math.random() * 80,
        alpha: 0.03 + Math.random() * 0.06,
        phase: Math.random() * Math.PI * 2,
        scaleOsc: 0.002 + Math.random() * 0.003
      });
    }
  }

  // ── Spawn sparks from an explosion ──────────────────
  function spawnSparks(x, y) {
    var count = 6 + Math.floor(Math.random() * 10);
    for (var i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1.5 + Math.random() * 3.5;
      sparks.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5, // slight upward bias
        life: 1.0,
        decay: 0.012 + Math.random() * 0.015,
        size: 0.8 + Math.random() * 2,
        gravity: 0.02 + Math.random() * 0.03,
        // Color phase: white → yellow → orange → red
        hue: 40 + Math.random() * 20 // yellow-orange
      });
    }
  }

  // ── Resize ──────────────────────────────────────────
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    initDebris(canvas.width, canvas.height);
    initWisps(canvas.width, canvas.height);
  }

  // ── Track explosion flashes for spark spawning ──────
  var lastFlashState = {};

  function checkExplosions() {
    // Read explosion state from fog-bg.js (shared via window)
    var exps = window._fogExplosions;
    if (!exps) return;

    for (var i = 0; i < exps.length; i++) {
      var ex = exps[i];
      var wasFlashing = lastFlashState[i] || false;
      var isFlashing = ex.phase === 'flash' && ex.flashAlpha > 0.3;

      if (isFlashing && !wasFlashing) {
        // New flash — spawn sparks!
        spawnSparks(ex.x, ex.y);
      }
      lastFlashState[i] = isFlashing;
    }
  }

  // ── Draw ────────────────────────────────────────────
  var frameCount = 0;

  function draw() {
    frameCount++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pan = getBoardPan();

    checkExplosions();

    // ── 1. Foreground cloud wisps ───────────────────
    for (var w = 0; w < wisps.length; w++) {
      var wisp = wisps[w];
      wisp.x += wisp.vx;
      wisp.y += wisp.vy;
      wisp.phase += wisp.scaleOsc;

      // Wrap around
      if (wisp.x > canvas.width + wisp.width) wisp.x = -wisp.width;
      if (wisp.x < -wisp.width * 2) wisp.x = canvas.width;

      var wispX = wisp.x + pan.tx * 0.04;
      var wispY = wisp.y + pan.ty * 0.04;
      var wScale = 1 + 0.15 * Math.sin(wisp.phase);
      var wW = wisp.width * wScale;
      var wH = wisp.height * wScale;

      var wGrad = ctx.createRadialGradient(
        wispX + wW * 0.5, wispY, 0,
        wispX + wW * 0.5, wispY, wW * 0.5
      );
      wGrad.addColorStop(0, 'rgba(180,180,190,' + wisp.alpha + ')');
      wGrad.addColorStop(0.5, 'rgba(160,160,170,' + (wisp.alpha * 0.5) + ')');
      wGrad.addColorStop(1, 'rgba(140,140,150,0)');

      ctx.save();
      ctx.scale(1, wH / wW); // Stretch into ellipse
      ctx.fillStyle = wGrad;
      ctx.beginPath();
      ctx.arc(wispX + wW * 0.5, (wispY) * (wW / wH), wW * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── 2. Floating debris ──────────────────────────
    for (var d = 0; d < debris.length; d++) {
      var db = debris[d];
      db.x += db.vx;
      db.y += db.vy;
      db.rotation += db.rotSpeed;

      // Wrap around
      if (db.x > canvas.width + 10) db.x = -10;
      if (db.x < -10) db.x = canvas.width + 10;
      if (db.y > canvas.height + 10) db.y = -10;
      if (db.y < -10) db.y = canvas.height + 10;

      var dx = db.x + pan.tx * 0.08;
      var dy = db.y + pan.ty * 0.08;

      if (db.isEmber) {
        // Glowing ember — pulsing orange dot
        db.emberPhase += 0.04;
        var emberAlpha = db.alpha * (0.5 + 0.5 * Math.sin(db.emberPhase));
        ctx.fillStyle = 'rgba(255,160,40,' + emberAlpha + ')';
        ctx.beginPath();
        ctx.arc(dx, dy, db.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Tiny glow
        ctx.fillStyle = 'rgba(255,120,20,' + (emberAlpha * 0.3) + ')';
        ctx.beginPath();
        ctx.arc(dx, dy, db.size * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (db.isRect) {
        // Rectangular shrapnel
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(db.rotation);
        ctx.fillStyle = 'rgba(180,180,180,' + db.alpha + ')';
        ctx.fillRect(-db.size, -db.size * 0.4, db.size * 2, db.size * 0.8);
        ctx.restore();
      } else {
        // Circular ash/dust
        ctx.fillStyle = 'rgba(160,160,160,' + db.alpha + ')';
        ctx.beginPath();
        ctx.arc(dx, dy, db.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── 3. Spark particles ──────────────────────────
    for (var s = sparks.length - 1; s >= 0; s--) {
      var sp = sparks[s];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += sp.gravity; // gravity pull
      sp.vx *= 0.99; // air drag
      sp.vy *= 0.99;
      sp.life -= sp.decay;

      if (sp.life <= 0) {
        sparks.splice(s, 1);
        continue;
      }

      var spx = sp.x + pan.tx * 0.08;
      var spy = sp.y + pan.ty * 0.08;

      // Color: white at birth → yellow → orange → red at death
      var r, g, b;
      if (sp.life > 0.7) {
        // White-yellow
        r = 255; g = 240 + (sp.life - 0.7) * 50; b = 200 * sp.life;
      } else if (sp.life > 0.3) {
        // Yellow-orange
        r = 255; g = 120 + sp.life * 200; b = 20;
      } else {
        // Orange-red fade
        r = 255 * (sp.life / 0.3); g = 60 * (sp.life / 0.3); b = 10;
      }

      // Spark body
      ctx.fillStyle = 'rgba(' + (r|0) + ',' + Math.min(255, g|0) + ',' + (b|0) + ',' + (sp.life * 0.9) + ')';
      ctx.beginPath();
      ctx.arc(spx, spy, sp.size * sp.life, 0, Math.PI * 2);
      ctx.fill();

      // Tiny glow around spark
      if (sp.life > 0.4) {
        ctx.fillStyle = 'rgba(255,180,60,' + (sp.life * 0.15) + ')';
        ctx.beginPath();
        ctx.arc(spx, spy, sp.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Motion trail
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
