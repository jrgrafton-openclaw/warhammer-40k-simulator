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
  var canvas = document.getElementById('fog-fx');
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
    initExplosions(canvas.width, canvas.height);
  }

  // ── Self-contained explosion hotspots ────────────────
  var explosions = [];

  function initExplosions(w, h) {
    explosions = [];
    var positions = [
      { x: 0.07, y: 0.1  },
      { x: 0.93, y: 0.08 },
      { x: 0.04, y: 0.88 },
      { x: 0.92, y: 0.9  },
      { x: 0.5,  y: 0.04 }
    ];
    var colorPresets = [
      { coreR:255,coreG:245,coreB:200, glowR:255,glowG:180,glowB:60 },
      { coreR:255,coreG:220,coreB:160, glowR:255,glowG:120,glowB:30 },
      { coreR:255,coreG:200,coreB:140, glowR:220,glowG:80,glowB:15 },
      { coreR:255,coreG:235,coreB:220, glowR:255,glowG:160,glowB:80 },
      { coreR:255,coreG:180,coreB:120, glowR:200,glowG:60,glowB:10 }
    ];
    for (var i = 0; i < 5; i++) {
      var p = positions[i]; var c = colorPresets[i];
      explosions.push({
        x: p.x * w, y: p.y * h, phase:'dormant',
        timer: 120 + Math.random() * 400, flashAlpha: 0, glowAlpha: 0,
        radius: 25 + Math.random() * 20, maxFlash: 0.4 + Math.random() * 0.35, colors: c
      });
    }
  }

  function updateExplosions() {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i]; ex.timer -= 1;
      switch (ex.phase) {
        case 'dormant':
          ex.flashAlpha *= 0.94; ex.glowAlpha *= 0.96;
          if (ex.timer <= 0) { ex.phase = 'flash'; ex.timer = 3 + Math.random() * 4; }
          break;
        case 'flash':
          ex.flashAlpha = Math.min(ex.maxFlash, ex.flashAlpha + ex.maxFlash / 2);
          ex.glowAlpha = ex.flashAlpha * 0.6;
          if (ex.timer <= 0) { ex.phase = 'afterglow'; ex.timer = 25 + Math.random() * 25; }
          break;
        case 'afterglow':
          ex.flashAlpha *= 0.88; ex.glowAlpha *= 0.94;
          if (ex.timer <= 0) { ex.phase = 'dormant'; ex.timer = 300 + Math.random() * 420; }
          break;
      }
    }
  }

  function drawExplosions(pan) {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i]; var c = ex.colors;
      if (ex.flashAlpha < 0.005 && ex.glowAlpha < 0.005) continue;
      var px = ex.x + pan.tx * 0.03, py = ex.y + pan.ty * 0.03;
      if (ex.glowAlpha > 0.005) {
        var gr = ex.radius * 2.5;
        var gg = ctx.createRadialGradient(px,py,0,px,py,gr);
        gg.addColorStop(0,'rgba('+c.glowR+','+c.glowG+','+c.glowB+','+(ex.glowAlpha*0.4)+')');
        gg.addColorStop(0.3,'rgba('+c.glowR+','+c.glowG+','+c.glowB+','+(ex.glowAlpha*0.15)+')');
        gg.addColorStop(1,'rgba('+c.glowR+','+Math.max(0,c.glowG-30)+','+Math.max(0,c.glowB-20)+',0)');
        ctx.fillStyle = gg; ctx.fillRect(px-gr,py-gr,gr*2,gr*2);
      }
      if (ex.flashAlpha > 0.01) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var cr = ex.radius * 0.6;
        var cg = ctx.createRadialGradient(px,py,0,px,py,cr);
        cg.addColorStop(0,'rgba('+c.coreR+','+c.coreG+','+c.coreB+','+(ex.flashAlpha*0.8)+')');
        cg.addColorStop(0.3,'rgba('+c.glowR+','+c.glowG+','+c.glowB+','+(ex.flashAlpha*0.4)+')');
        cg.addColorStop(1,'rgba('+c.glowR+','+Math.max(0,c.glowG-40)+','+Math.max(0,c.glowB-30)+',0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(px,py,cr,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // ── Track explosion flashes for spark spawning ──────
  var lastFlashState = {};

  function checkExplosions() {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
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

    updateExplosions();
    checkExplosions();
    drawExplosions(pan);

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
