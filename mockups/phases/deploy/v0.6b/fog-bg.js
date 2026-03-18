/**
 * fog-bg.js — Fog-of-war background layer for v0.6b.
 *
 * Warm white gradient blobs + single elliptical viewport mask.
 * Palette: Civ 5-style warm cream/white clouds against dark ground.
 */

(function initFogBackground() {
  var canvas = document.getElementById('fog-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // ── Cloud blobs ─────────────────────────────────────
  var blobs = [];
  var NUM_BLOBS = 30;

  function initBlobs(w, h) {
    blobs = [];
    for (var i = 0; i < NUM_BLOBS; i++) {
      var edgeBias = Math.random() < 0.65;
      var bx, by;
      if (edgeBias) {
        var side = Math.floor(Math.random() * 4);
        switch (side) {
          case 0: bx = Math.random() * 0.22; by = Math.random(); break;
          case 1: bx = 0.78 + Math.random() * 0.22; by = Math.random(); break;
          case 2: bx = Math.random(); by = Math.random() * 0.22; break;
          case 3: bx = Math.random(); by = 0.78 + Math.random() * 0.22; break;
        }
      } else {
        bx = 0.1 + Math.random() * 0.8;
        by = 0.1 + Math.random() * 0.8;
      }

      var baseRadius = 140 + Math.random() * 320;

      // Warm white palette — no blue/pink cast
      // Range: cream (225,222,215) → near-white (245,243,240)
      var warmBase = 225 + Math.floor(Math.random() * 20);
      var warmShift = Math.floor(Math.random() * 5);

      blobs.push({
        x: bx * w,
        y: by * h,
        baseX: bx * w,
        baseY: by * h,
        radius: baseRadius,
        baseRadius: baseRadius,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.14,
        sizePhase: Math.random() * Math.PI * 2,
        sizeSpeed: 0.002 + Math.random() * 0.004,
        sizeAmp: 0.06 + Math.random() * 0.12,
        alphaPhase: Math.random() * Math.PI * 2,
        alphaSpeed: 0.0015 + Math.random() * 0.003,
        // Warm whites only — R slightly > G slightly > B
        colorR: warmBase,
        colorG: warmBase - warmShift,
        colorB: warmBase - warmShift * 2,
        alpha: edgeBias ? (0.14 + Math.random() * 0.18) : (0.04 + Math.random() * 0.07),
        depth: 0.02 + Math.random() * 0.05
      });
    }
  }

  // ── Explosion hotspots ──────────────────────────────
  var explosions = [];
  var NUM_EXPLOSIONS = 5;

  function initExplosions(w, h) {
    explosions = [];
    var positions = [
      { x: 0.07, y: 0.1  },
      { x: 0.93, y: 0.08 },
      { x: 0.04, y: 0.88 },
      { x: 0.92, y: 0.9  },
      { x: 0.5,  y: 0.04 }
    ];

    // Color presets: pale yellow (artillery), deep orange (ordnance), red-white (las)
    var colorPresets = [
      { coreR: 255, coreG: 245, coreB: 200, glowR: 255, glowG: 180, glowB: 60  },  // pale yellow
      { coreR: 255, coreG: 220, coreB: 160, glowR: 255, glowG: 120, glowB: 30  },  // warm orange
      { coreR: 255, coreG: 200, coreB: 140, glowR: 220, glowG: 80,  glowB: 15  },  // deep orange
      { coreR: 255, coreG: 235, coreB: 220, glowR: 255, glowG: 160, glowB: 80  },  // pale white-orange
      { coreR: 255, coreG: 180, coreB: 120, glowR: 200, glowG: 60,  glowB: 10  }   // red-orange
    ];

    for (var i = 0; i < NUM_EXPLOSIONS; i++) {
      var p = positions[i];
      var c = colorPresets[i];
      explosions.push({
        x: p.x * w,
        y: p.y * h,
        phase: 'dormant',
        timer: 120 + Math.random() * 400,
        flashAlpha: 0,
        glowAlpha: 0,
        radius: 25 + Math.random() * 20,
        maxFlash: 0.4 + Math.random() * 0.35,
        colors: c
      });
    }
    window._fogExplosions = explosions;
  }

  // ── Board pan ───────────────────────────────────────
  function getBoardPan() {
    var inner = document.getElementById('battlefield-inner');
    if (!inner) return { tx: 0, ty: 0, scale: 0.5 };
    var style = inner.style.transform || '';
    var match = style.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/);
    if (match) return { tx: parseFloat(match[1]), ty: parseFloat(match[2]), scale: parseFloat(match[3]) };
    return { tx: 0, ty: 0, scale: 0.5 };
  }

  function getBoardRect() {
    var bf = document.getElementById('battlefield');
    var inner = document.getElementById('battlefield-inner');
    if (!bf || !inner) return null;
    var pan = getBoardPan();
    var bfW = bf.clientWidth;
    var bfH = bf.clientHeight;
    var renderW = bfW * pan.scale;
    var renderH = bfH * pan.scale;
    var cx = bfW / 2 + pan.tx;
    var cy = bfH / 2 + pan.ty;
    return { left: cx - renderW / 2, top: cy - renderH / 2, width: renderW, height: renderH, cx: cx, cy: cy };
  }

  // ── Resize ──────────────────────────────────────────
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    initBlobs(canvas.width, canvas.height);
    initExplosions(canvas.width, canvas.height);
  }

  // ── Draw blobs ──────────────────────────────────────
  function drawBlobs(pan) {
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];

      b.x += b.vx;
      b.y += b.vy;
      var driftX = b.x - b.baseX;
      var driftY = b.y - b.baseY;
      b.vx -= driftX * 0.0001;
      b.vy -= driftY * 0.0001;

      b.sizePhase += b.sizeSpeed;
      b.alphaPhase += b.alphaSpeed;
      var sizeM = 1 + b.sizeAmp * Math.sin(b.sizePhase);
      var alphaM = 0.7 + 0.3 * Math.sin(b.alphaPhase);

      var r = b.radius * sizeM;
      var a = b.alpha * alphaM;
      var px = b.x + pan.tx * b.depth;
      var py = b.y + pan.ty * b.depth;

      var grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',' + a + ')');
      grad.addColorStop(0.3, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',' + (a * 0.65) + ')');
      grad.addColorStop(0.6, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',' + (a * 0.25) + ')');
      grad.addColorStop(1, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }

  // ── Explosions ──────────────────────────────────────
  function updateExplosions() {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
      ex.timer -= 1;

      switch (ex.phase) {
        case 'dormant':
          ex.flashAlpha *= 0.94;
          ex.glowAlpha *= 0.96;
          if (ex.timer <= 0) {
            ex.phase = 'flash';
            ex.timer = 3 + Math.random() * 4; // quick flash: 3-7 frames
          }
          break;
        case 'flash':
          ex.flashAlpha = Math.min(ex.maxFlash, ex.flashAlpha + ex.maxFlash / 2);
          ex.glowAlpha = ex.flashAlpha * 0.6;
          if (ex.timer <= 0) {
            ex.phase = 'afterglow';
            ex.timer = 30 + Math.random() * 30; // longer fade
          }
          break;
        case 'afterglow':
          ex.flashAlpha *= 0.88;
          ex.glowAlpha *= 0.94;
          if (ex.timer <= 0) {
            ex.phase = 'dormant';
            ex.timer = 300 + Math.random() * 420; // 5-12 seconds at 60fps
          }
          break;
      }
    }
  }

  function drawExplosions(pan) {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
      if (ex.flashAlpha < 0.005 && ex.glowAlpha < 0.005) continue;

      var c = ex.colors;
      var px = ex.x + pan.tx * 0.03;
      var py = ex.y + pan.ty * 0.03;

      // Glow bleed into clouds
      if (ex.glowAlpha > 0.005) {
        var glowR = ex.radius * 2.5;
        var gg = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        gg.addColorStop(0, 'rgba(' + c.glowR + ',' + c.glowG + ',' + c.glowB + ',' + (ex.glowAlpha * 0.4) + ')');
        gg.addColorStop(0.3, 'rgba(' + c.glowR + ',' + c.glowG + ',' + c.glowB + ',' + (ex.glowAlpha * 0.15) + ')');
        gg.addColorStop(1, 'rgba(' + c.glowR + ',' + Math.max(0, c.glowG - 30) + ',' + Math.max(0, c.glowB - 20) + ',0)');
        ctx.fillStyle = gg;
        ctx.fillRect(px - glowR, py - glowR, glowR * 2, glowR * 2);
      }

      // Core flash
      if (ex.flashAlpha > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var coreR = ex.radius * 0.6;
        var cg = ctx.createRadialGradient(px, py, 0, px, py, coreR);
        cg.addColorStop(0, 'rgba(' + c.coreR + ',' + c.coreG + ',' + c.coreB + ',' + (ex.flashAlpha * 0.8) + ')');
        cg.addColorStop(0.3, 'rgba(' + c.glowR + ',' + c.glowG + ',' + c.glowB + ',' + (ex.flashAlpha * 0.4) + ')');
        cg.addColorStop(1, 'rgba(' + c.glowR + ',' + Math.max(0, c.glowG - 40) + ',' + Math.max(0, c.glowB - 30) + ',0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(px, py, coreR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ── Viewport mask — single elliptical gradient ──────
  // One radial gradient, zero seams, zero corner artifacts.
  function drawViewportMask() {
    var rect = getBoardRect();
    if (!rect) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    // Single elliptical radial gradient centered on the board
    // We use ctx.scale to turn a circle into an ellipse matching the board aspect
    var rx = rect.width * 0.52;  // slightly wider than board
    var ry = rect.height * 0.54;
    var maxR = Math.max(rx, ry);

    ctx.translate(rect.cx, rect.cy);
    ctx.scale(rx / maxR, ry / maxR);

    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxR);
    // Center: fully erased (board visible)
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.65, 'rgba(0,0,0,1)');
    // Smooth transition zone
    grad.addColorStop(0.78, 'rgba(0,0,0,0.8)');
    grad.addColorStop(0.88, 'rgba(0,0,0,0.4)');
    grad.addColorStop(0.95, 'rgba(0,0,0,0.1)');
    // Edge: no erase (fog fully visible)
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, maxR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Main loop ───────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var pan = getBoardPan();

    // Dark atmospheric base — darker than v0.6a for contrast with white clouds
    var bg = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.5, 0,
      canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.65
    );
    bg.addColorStop(0, '#1e1f24');
    bg.addColorStop(0.6, '#181920');
    bg.addColorStop(1, '#12131a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawBlobs(pan);
    updateExplosions();
    drawExplosions(pan);
    drawViewportMask();

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
