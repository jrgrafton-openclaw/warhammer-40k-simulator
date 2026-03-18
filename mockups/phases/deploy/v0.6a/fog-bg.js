/**
 * fog-bg.js — Fog-of-war background layer for v0.6a.
 *
 * Renders behind the battlefield:
 *   1. Procedural tileable cloud textures (two layers, scrolling)
 *   2. Explosion glows in the fog (orange/yellow flashes with cloud light-bleed)
 *   3. Viewport mask — soft-edged hole revealing the board
 *
 * All cloud textures are generated procedurally at startup (no external assets).
 */

(function initFogBackground() {
  var canvas = document.getElementById('fog-bg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // ── Procedural Perlin-ish noise for cloud textures ──────────
  // Generates a tileable greyscale noise field using value noise + FBM octaves.

  function makePermutation(seed) {
    var p = [];
    for (var i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates with seeded LCG
    var s = seed | 0;
    for (var i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      var j = s % (i + 1);
      var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    // Double the array for wrapping
    for (var i = 0; i < 256; i++) p[i + 256] = p[i];
    return p;
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }

  function grad(hash, x, y) {
    var h = hash & 3;
    var u = h < 2 ? x : -x;
    var v = h === 0 || h === 3 ? y : -y;
    return u + v;
  }

  function perlin2D(perm, x, y) {
    var X = Math.floor(x) & 255;
    var Y = Math.floor(y) & 255;
    var xf = x - Math.floor(x);
    var yf = y - Math.floor(y);
    var u = fade(xf);
    var v = fade(yf);

    var aa = perm[perm[X] + Y];
    var ab = perm[perm[X] + Y + 1];
    var ba = perm[perm[X + 1] + Y];
    var bb = perm[perm[X + 1] + Y + 1];

    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    );
  }

  function fbm(perm, x, y, octaves) {
    var val = 0, amp = 0.5, freq = 1;
    for (var i = 0; i < octaves; i++) {
      val += amp * perlin2D(perm, x * freq, y * freq);
      amp *= 0.5;
      freq *= 2;
    }
    return val;
  }

  // ── Generate a tileable cloud texture as an offscreen canvas ──
  function generateCloudTexture(size, scale, octaves, seed, contrast, brightness) {
    var perm = makePermutation(seed);
    var offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    var octx = offscreen.getContext('2d');
    var imgData = octx.createImageData(size, size);
    var data = imgData.data;

    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var nx = px / size * scale;
        var ny = py / size * scale;
        var n = fbm(perm, nx, ny, octaves);
        // Normalize from [-0.5, 0.5] to [0, 1]
        n = (n + 0.5);
        // Apply contrast + brightness
        n = Math.pow(Math.max(0, Math.min(1, n)), contrast) * brightness;
        var v = Math.max(0, Math.min(255, n * 255)) | 0;

        var idx = (py * size + px) * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = v; // Alpha = luminance (brighter = more opaque cloud)
      }
    }

    octx.putImageData(imgData, 0, 0);
    return offscreen;
  }

  // ── Cloud layer config ──────────────────────────────
  var CLOUD_SIZE = 512;
  var cloudBase = null;     // darker, slower layer
  var cloudDetail = null;   // lighter, wispy layer

  // ── Explosion hotspots ──────────────────────────────
  var explosions = [];
  var NUM_EXPLOSIONS = 8;

  function initExplosions(w, h) {
    explosions = [];
    // Place hotspots in the fog (edges/corners, away from board center)
    var positions = [
      { x: 0.08, y: 0.1  },
      { x: 0.92, y: 0.08 },
      { x: 0.05, y: 0.55 },
      { x: 0.95, y: 0.5  },
      { x: 0.1,  y: 0.9  },
      { x: 0.88, y: 0.92 },
      { x: 0.5,  y: 0.04 },
      { x: 0.5,  y: 0.96 }
    ];

    for (var i = 0; i < NUM_EXPLOSIONS; i++) {
      var p = positions[i];
      explosions.push({
        x: p.x * w,
        y: p.y * h,
        phase: 'dormant',
        timer: Math.random() * 300 + 60, // stagger initial delays
        flashAlpha: 0,
        glowAlpha: 0,
        radius: 60 + Math.random() * 80,
        maxFlash: 0.6 + Math.random() * 0.4
      });
    }
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

    // Board is 720x528 in SVG coords, rendered at scale within battlefield-inner
    // battlefield-inner uses transform-origin: center
    // The SVG fills battlefield-inner which fills battlefield
    // At scale S, centered, then offset by tx/ty:
    var renderW = bfW * pan.scale;
    var renderH = bfH * pan.scale;
    var cx = bfW / 2 + pan.tx;
    var cy = bfH / 2 + pan.ty;

    return {
      left: cx - renderW / 2,
      top: cy - renderH / 2,
      width: renderW,
      height: renderH,
      cx: cx,
      cy: cy
    };
  }

  // ── Resize ─────────────────────────────────────────
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    initExplosions(canvas.width, canvas.height);
  }

  // ── Init textures ──────────────────────────────────
  function initTextures() {
    // Base: darker, lower-detail — broad cloud masses
    cloudBase = generateCloudTexture(CLOUD_SIZE, 4, 5, 42, 1.2, 0.9);
    // Detail: lighter, wispier — fine structure
    cloudDetail = generateCloudTexture(CLOUD_SIZE, 6, 7, 137, 0.8, 0.7);
  }

  // ── Draw tiled cloud layer with scroll offset ──────
  function drawCloudLayer(tex, offsetX, offsetY, alpha, tint) {
    if (!tex) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    var w = tex.width;
    var h = tex.height;

    // Wrap offsets
    var ox = ((offsetX % w) + w) % w;
    var oy = ((offsetY % h) + h) % h;

    // Need to tile to cover the canvas
    var tilesX = Math.ceil(canvas.width / w) + 2;
    var tilesY = Math.ceil(canvas.height / h) + 2;
    var startX = -ox;
    var startY = -oy;

    // Apply tint via composite
    if (tint) {
      // Draw cloud texture, then tint overlay
      for (var ty = 0; ty < tilesY; ty++) {
        for (var tx = 0; tx < tilesX; tx++) {
          ctx.drawImage(tex, startX + tx * w, startY + ty * h);
        }
      }
    } else {
      for (var ty = 0; ty < tilesY; ty++) {
        for (var tx = 0; tx < tilesX; tx++) {
          ctx.drawImage(tex, startX + tx * w, startY + ty * h);
        }
      }
    }
    ctx.restore();
  }

  // ── Update + draw explosion hotspots ───────────────
  function updateExplosions(dt) {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
      ex.timer -= dt;

      switch (ex.phase) {
        case 'dormant':
          ex.flashAlpha = 0;
          ex.glowAlpha *= 0.97; // fade any residual glow
          if (ex.timer <= 0) {
            ex.phase = 'flash';
            ex.timer = 8 + Math.random() * 6; // flash duration (frames)
            ex.flashAlpha = 0;
          }
          break;

        case 'flash':
          // Rapid ramp up
          ex.flashAlpha = Math.min(ex.maxFlash, ex.flashAlpha + ex.maxFlash / 4);
          ex.glowAlpha = ex.flashAlpha * 0.8;
          if (ex.timer <= 0) {
            ex.phase = 'afterglow';
            ex.timer = 30 + Math.random() * 20; // afterglow duration
          }
          break;

        case 'afterglow':
          ex.flashAlpha *= 0.92;
          ex.glowAlpha *= 0.96;
          if (ex.timer <= 0) {
            ex.phase = 'dormant';
            ex.timer = 120 + Math.random() * 240; // wait 2-6 seconds at 60fps
          }
          break;
      }
    }
  }

  function drawExplosions(pan) {
    for (var i = 0; i < explosions.length; i++) {
      var ex = explosions[i];
      if (ex.flashAlpha < 0.01 && ex.glowAlpha < 0.01) continue;

      var px = ex.x + pan.tx * 0.03;
      var py = ex.y + pan.ty * 0.03;

      // Outer orange glow (light bleeding into clouds)
      if (ex.glowAlpha > 0.01) {
        var glowR = ex.radius * 2.5;
        var glowGrad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        glowGrad.addColorStop(0, 'rgba(255,140,30,' + (ex.glowAlpha * 0.4) + ')');
        glowGrad.addColorStop(0.3, 'rgba(255,100,20,' + (ex.glowAlpha * 0.15) + ')');
        glowGrad.addColorStop(1, 'rgba(139,37,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(px - glowR, py - glowR, glowR * 2, glowR * 2);
      }

      // Core flash (bright yellow-white)
      if (ex.flashAlpha > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        var coreR = ex.radius * 0.8;
        var coreGrad = ctx.createRadialGradient(px, py, 0, px, py, coreR);
        coreGrad.addColorStop(0, 'rgba(255,248,220,' + (ex.flashAlpha * 0.9) + ')');
        coreGrad.addColorStop(0.25, 'rgba(255,200,80,' + (ex.flashAlpha * 0.6) + ')');
        coreGrad.addColorStop(0.6, 'rgba(255,120,30,' + (ex.flashAlpha * 0.2) + ')');
        coreGrad.addColorStop(1, 'rgba(200,60,10,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(px, py, coreR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  // ── Draw viewport mask (soft-edged hole for the board) ──
  function drawViewportMask() {
    var rect = getBoardRect();
    if (!rect) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    // Multi-layered soft mask for a natural feathered edge
    var feather = 120; // px of feathering

    // Inner fully-transparent area (board is fully visible here)
    var innerL = rect.left + feather * 0.4;
    var innerT = rect.top + feather * 0.4;
    var innerW = rect.width - feather * 0.8;
    var innerH = rect.height - feather * 0.8;

    // Draw multiple gradient passes for smooth feathering
    // Horizontal gradients
    var gradL = ctx.createLinearGradient(rect.left - feather * 0.3, 0, rect.left + feather * 0.8, 0);
    gradL.addColorStop(0, 'rgba(0,0,0,0)');
    gradL.addColorStop(1, 'rgba(0,0,0,1)');

    var gradR = ctx.createLinearGradient(rect.left + rect.width + feather * 0.3, 0, rect.left + rect.width - feather * 0.8, 0);
    gradR.addColorStop(0, 'rgba(0,0,0,0)');
    gradR.addColorStop(1, 'rgba(0,0,0,1)');

    var gradT = ctx.createLinearGradient(0, rect.top - feather * 0.3, 0, rect.top + feather * 0.8);
    gradT.addColorStop(0, 'rgba(0,0,0,0)');
    gradT.addColorStop(1, 'rgba(0,0,0,1)');

    var gradB = ctx.createLinearGradient(0, rect.top + rect.height + feather * 0.3, 0, rect.top + rect.height - feather * 0.8);
    gradB.addColorStop(0, 'rgba(0,0,0,0)');
    gradB.addColorStop(1, 'rgba(0,0,0,1)');

    // Central solid erase
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(innerL, innerT, innerW, innerH);

    // Feathered edges
    // Left
    ctx.fillStyle = gradL;
    ctx.fillRect(rect.left - feather * 0.3, innerT, feather * 1.1 + (innerL - rect.left), innerH);
    // Right
    ctx.fillStyle = gradR;
    ctx.fillRect(innerL + innerW - feather * 0.2, innerT, feather * 1.3, innerH);
    // Top
    ctx.fillStyle = gradT;
    ctx.fillRect(rect.left - feather * 0.3, rect.top - feather * 0.3, rect.width + feather * 0.6, feather * 1.1 + (innerT - rect.top));
    // Bottom
    ctx.fillStyle = gradB;
    ctx.fillRect(rect.left - feather * 0.3, innerT + innerH - feather * 0.2, rect.width + feather * 0.6, feather * 1.3);

    // Corner radial gradients (blend the corners smoothly)
    var corners = [
      { x: innerL, y: innerT },                        // top-left
      { x: innerL + innerW, y: innerT },                // top-right
      { x: innerL, y: innerT + innerH },                // bottom-left
      { x: innerL + innerW, y: innerT + innerH }        // bottom-right
    ];

    for (var c = 0; c < corners.length; c++) {
      var cr = feather * 0.9;
      var cGrad = ctx.createRadialGradient(corners[c].x, corners[c].y, 0, corners[c].x, corners[c].y, cr);
      cGrad.addColorStop(0, 'rgba(0,0,0,1)');
      cGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cGrad;
      ctx.fillRect(corners[c].x - cr, corners[c].y - cr, cr * 2, cr * 2);
    }

    ctx.restore();
  }

  // ── Main draw loop ─────────────────────────────────
  var scrollTime = 0;

  function draw() {
    scrollTime += 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pan = getBoardPan();

    // 1. Dark atmospheric base
    ctx.fillStyle = '#1a1a20';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Base cloud layer — slow drift, darker
    var baseOx = scrollTime * 0.25 + pan.tx * 0.03;
    var baseOy = scrollTime * 0.12 + pan.ty * 0.03;
    drawCloudLayer(cloudBase, baseOx, baseOy, 0.22, false);

    // 3. Detail cloud layer — different angle/speed, lighter
    var detOx = scrollTime * 0.4 * Math.cos(0.52) + pan.tx * 0.06;
    var detOy = scrollTime * 0.4 * Math.sin(0.52) + pan.ty * 0.06;
    drawCloudLayer(cloudDetail, detOx, detOy, 0.15, false);

    // 4. Grey fog tint over the clouds
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(160,160,170,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 5. Explosion glows (drawn BEFORE mask so they show in fog)
    updateExplosions(1);
    drawExplosions(pan);

    // 6. Viewport mask — cut a soft hole for the board
    drawViewportMask();

    requestAnimationFrame(draw);
  }

  // ── Init ───────────────────────────────────────────
  window.addEventListener('resize', resize);
  resize();
  initTextures();

  // Expose explosion state for fog-fg.js spark spawning
  window._fogExplosions = explosions;

  requestAnimationFrame(draw);
})();
