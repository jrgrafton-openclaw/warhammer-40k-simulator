/**
 * fog-bg.js — Fog-of-war background layer for v0.6a.
 *
 * SOTA approach: overlapping radial gradient blobs + drifting animation.
 * No tiled textures — zero tiling artifacts by design.
 *
 * Renders behind the battlefield:
 *   1. Atmospheric base fill
 *   2. 25+ large soft radial gradient blobs (cloud masses)
 *   3. Explosion glows with light bleed into cloud layer
 *   4. Viewport mask — soft-edged hole revealing the board
 */

(function initFogBackground() {
  var canvas = document.getElementById('fog-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // ── Cloud blob config ──────────────────────────────
  var blobs = [];
  var NUM_BLOBS = 28;

  function initBlobs(w, h) {
    blobs = [];
    for (var i = 0; i < NUM_BLOBS; i++) {
      // Distribute across the full viewport with some clustering at edges
      var edgeBias = Math.random() < 0.6;
      var bx, by;
      if (edgeBias) {
        // Push towards edges (where fog is thickest)
        var side = Math.floor(Math.random() * 4);
        switch (side) {
          case 0: bx = Math.random() * 0.25; by = Math.random(); break;       // left
          case 1: bx = 0.75 + Math.random() * 0.25; by = Math.random(); break; // right
          case 2: bx = Math.random(); by = Math.random() * 0.25; break;       // top
          case 3: bx = Math.random(); by = 0.75 + Math.random() * 0.25; break; // bottom
        }
      } else {
        // Some blobs in the middle too (thinner fog over board)
        bx = 0.15 + Math.random() * 0.7;
        by = 0.15 + Math.random() * 0.7;
      }

      var baseRadius = 120 + Math.random() * 350;

      blobs.push({
        x: bx * w,
        y: by * h,
        baseX: bx * w,
        baseY: by * h,
        radius: baseRadius,
        baseRadius: baseRadius,
        // Drift velocity
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.15,
        // Oscillation
        sizePhase: Math.random() * Math.PI * 2,
        sizeSpeed: 0.003 + Math.random() * 0.005,
        sizeAmp: 0.08 + Math.random() * 0.15,
        alphaPhase: Math.random() * Math.PI * 2,
        alphaSpeed: 0.002 + Math.random() * 0.004,
        // Base opacity — edge blobs are denser
        alpha: edgeBias ? (0.12 + Math.random() * 0.16) : (0.04 + Math.random() * 0.08),
        // Color variation: light grey with subtle warm/cool shifts
        colorR: 155 + Math.floor(Math.random() * 40),
        colorG: 155 + Math.floor(Math.random() * 35),
        colorB: 160 + Math.floor(Math.random() * 35),
        // Parallax depth (0 = far/slow, 1 = near/fast)
        depth: 0.02 + Math.random() * 0.06,
        // Wrap bounds
        wrapW: w,
        wrapH: h
      });
    }
  }

  // ── Explosion hotspots ──────────────────────────────
  var explosions = [];
  var NUM_EXPLOSIONS = 8;

  function initExplosions(w, h) {
    explosions = [];
    var positions = [
      { x: 0.06, y: 0.08 },
      { x: 0.94, y: 0.06 },
      { x: 0.04, y: 0.55 },
      { x: 0.96, y: 0.5  },
      { x: 0.08, y: 0.92 },
      { x: 0.9,  y: 0.94 },
      { x: 0.45, y: 0.03 },
      { x: 0.55, y: 0.97 }
    ];

    for (var i = 0; i < NUM_EXPLOSIONS; i++) {
      var p = positions[i];
      explosions.push({
        x: p.x * w,
        y: p.y * h,
        phase: 'dormant',
        timer: 60 + Math.random() * 300,
        flashAlpha: 0,
        glowAlpha: 0,
        radius: 50 + Math.random() * 70,
        maxFlash: 0.5 + Math.random() * 0.5
      });
    }

    // Expose for fog-fg.js spark spawning
    window._fogExplosions = explosions;
  }

  // ── Board pan tracking ──────────────────────────────
  function getBoardPan() {
    var inner = document.getElementById('battlefield-inner');
    if (!inner) return { tx: 0, ty: 0, scale: 0.5 };
    var style = inner.style.transform || '';
    var match = style.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/);
    if (match) return { tx: parseFloat(match[1]), ty: parseFloat(match[2]), scale: parseFloat(match[3]) };
    return { tx: 0, ty: 0, scale: 0.5 };
  }

  // ── Get board rect in viewport space for mask ──────
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

    return {
      left: cx - renderW / 2,
      top: cy - renderH / 2,
      width: renderW,
      height: renderH
    };
  }

  // ── Resize ─────────────────────────────────────────
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    initBlobs(canvas.width, canvas.height);
    initExplosions(canvas.width, canvas.height);
  }

  // ── Draw cloud blobs ───────────────────────────────
  function drawBlobs(pan, time) {
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];

      // Drift
      b.x += b.vx;
      b.y += b.vy;

      // Gentle return drift (so blobs don't wander too far)
      var driftX = b.x - b.baseX;
      var driftY = b.y - b.baseY;
      b.vx -= driftX * 0.0001;
      b.vy -= driftY * 0.0001;

      // Oscillation
      b.sizePhase += b.sizeSpeed;
      b.alphaPhase += b.alphaSpeed;
      var sizeMultiplier = 1 + b.sizeAmp * Math.sin(b.sizePhase);
      var alphaMultiplier = 0.7 + 0.3 * Math.sin(b.alphaPhase);

      var r = b.radius * sizeMultiplier;
      var a = b.alpha * alphaMultiplier;

      // Apply parallax
      var px = b.x + pan.tx * b.depth;
      var py = b.y + pan.ty * b.depth;

      // Draw soft radial gradient blob
      var grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',' + a + ')');
      grad.addColorStop(0.4, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',' + (a * 0.6) + ')');
      grad.addColorStop(0.7, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',' + (a * 0.2) + ')');
      grad.addColorStop(1, 'rgba(' + b.colorR + ',' + b.colorG + ',' + b.colorB + ',0)');

      ctx.fillStyle = grad;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }

  // ── Update + draw explosions ───────────────────────
  function updateExplosions() {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
      ex.timer -= 1;

      switch (ex.phase) {
        case 'dormant':
          ex.flashAlpha *= 0.95;
          ex.glowAlpha *= 0.97;
          if (ex.timer <= 0) {
            ex.phase = 'flash';
            ex.timer = 6 + Math.random() * 8;
          }
          break;
        case 'flash':
          ex.flashAlpha = Math.min(ex.maxFlash, ex.flashAlpha + ex.maxFlash / 3);
          ex.glowAlpha = ex.flashAlpha * 0.7;
          if (ex.timer <= 0) {
            ex.phase = 'afterglow';
            ex.timer = 25 + Math.random() * 25;
          }
          break;
        case 'afterglow':
          ex.flashAlpha *= 0.9;
          ex.glowAlpha *= 0.95;
          if (ex.timer <= 0) {
            ex.phase = 'dormant';
            ex.timer = 100 + Math.random() * 280;
          }
          break;
      }
    }
  }

  function drawExplosions(pan) {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
      if (ex.flashAlpha < 0.005 && ex.glowAlpha < 0.005) continue;

      var px = ex.x + pan.tx * 0.03;
      var py = ex.y + pan.ty * 0.03;

      // Wide orange glow bleeding into clouds
      if (ex.glowAlpha > 0.005) {
        var glowR = ex.radius * 3;
        var glowGrad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        glowGrad.addColorStop(0, 'rgba(255,150,40,' + (ex.glowAlpha * 0.5) + ')');
        glowGrad.addColorStop(0.25, 'rgba(255,110,25,' + (ex.glowAlpha * 0.25) + ')');
        glowGrad.addColorStop(0.6, 'rgba(200,60,10,' + (ex.glowAlpha * 0.08) + ')');
        glowGrad.addColorStop(1, 'rgba(120,30,5,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(px - glowR, py - glowR, glowR * 2, glowR * 2);
      }

      // Core flash
      if (ex.flashAlpha > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        var coreR = ex.radius * 0.7;
        var coreGrad = ctx.createRadialGradient(px, py, 0, px, py, coreR);
        coreGrad.addColorStop(0, 'rgba(255,250,225,' + (ex.flashAlpha * 0.85) + ')');
        coreGrad.addColorStop(0.2, 'rgba(255,210,100,' + (ex.flashAlpha * 0.6) + ')');
        coreGrad.addColorStop(0.5, 'rgba(255,130,40,' + (ex.flashAlpha * 0.25) + ')');
        coreGrad.addColorStop(1, 'rgba(180,50,10,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(px, py, coreR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  // ── Viewport mask ──────────────────────────────────
  function drawViewportMask() {
    var rect = getBoardRect();
    if (!rect) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    var feather = 100;

    // Core clear area (slightly inset from board edges)
    var inset = feather * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(rect.left + inset, rect.top + inset,
                 rect.width - inset * 2, rect.height - inset * 2);

    // Feathered edges using linear gradients
    // Left edge
    var gL = ctx.createLinearGradient(rect.left - feather * 0.2, 0, rect.left + inset + 10, 0);
    gL.addColorStop(0, 'rgba(0,0,0,0)');
    gL.addColorStop(0.3, 'rgba(0,0,0,0.3)');
    gL.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gL;
    ctx.fillRect(rect.left - feather * 0.2, rect.top + inset,
                 inset + feather * 0.2 + 10, rect.height - inset * 2);

    // Right edge
    var gR = ctx.createLinearGradient(rect.left + rect.width + feather * 0.2, 0,
                                      rect.left + rect.width - inset - 10, 0);
    gR.addColorStop(0, 'rgba(0,0,0,0)');
    gR.addColorStop(0.3, 'rgba(0,0,0,0.3)');
    gR.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gR;
    ctx.fillRect(rect.left + rect.width - inset - 10, rect.top + inset,
                 inset + feather * 0.2 + 10, rect.height - inset * 2);

    // Top edge
    var gT = ctx.createLinearGradient(0, rect.top - feather * 0.2, 0, rect.top + inset + 10);
    gT.addColorStop(0, 'rgba(0,0,0,0)');
    gT.addColorStop(0.3, 'rgba(0,0,0,0.3)');
    gT.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gT;
    ctx.fillRect(rect.left + inset, rect.top - feather * 0.2,
                 rect.width - inset * 2, inset + feather * 0.2 + 10);

    // Bottom edge
    var gB = ctx.createLinearGradient(0, rect.top + rect.height + feather * 0.2,
                                      0, rect.top + rect.height - inset - 10);
    gB.addColorStop(0, 'rgba(0,0,0,0)');
    gB.addColorStop(0.3, 'rgba(0,0,0,0.3)');
    gB.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gB;
    ctx.fillRect(rect.left + inset, rect.top + rect.height - inset - 10,
                 rect.width - inset * 2, inset + feather * 0.2 + 10);

    // Corner feathers (radial gradients for smooth corners)
    var corners = [
      [rect.left + inset, rect.top + inset],
      [rect.left + rect.width - inset, rect.top + inset],
      [rect.left + inset, rect.top + rect.height - inset],
      [rect.left + rect.width - inset, rect.top + rect.height - inset]
    ];
    var cornerR = feather * 0.7;
    for (var c = 0; c < 4; c++) {
      var cg = ctx.createRadialGradient(
        corners[c][0], corners[c][1], 0,
        corners[c][0], corners[c][1], cornerR
      );
      cg.addColorStop(0, 'rgba(0,0,0,1)');
      cg.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(corners[c][0] - cornerR, corners[c][1] - cornerR,
                   cornerR * 2, cornerR * 2);
    }

    ctx.restore();
  }

  // ── Main draw loop ─────────────────────────────────
  var time = 0;

  function draw() {
    time++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pan = getBoardPan();

    // 1. Dark atmospheric base
    var baseBg = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.5, 0,
      canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.7
    );
    baseBg.addColorStop(0, '#2a2a30');
    baseBg.addColorStop(0.5, '#222228');
    baseBg.addColorStop(1, '#1a1a20');
    ctx.fillStyle = baseBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Cloud blobs
    drawBlobs(pan, time);

    // 3. Explosions
    updateExplosions();
    drawExplosions(pan);

    // 4. Viewport mask
    drawViewportMask();

    requestAnimationFrame(draw);
  }

  // ── Init ───────────────────────────────────────────
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
