/**
 * pixi-layer.js — PixiJS v8 rendering layer for v0.6c "Reference-Grade"
 * Renders behind SVG layers inside #battlefield-inner.
 * Board surface, terrain textures/shadows, faction zones, objective glows,
 * particles, board frame, and subtle color grading.
 */

import { mapData } from '../../../shared/state/terrain-data.js';

const BW = 720, BH = 528;

// ── Seeded RNG ──────────────────────────────────────────
function srand(s) {
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// ── Procedural Texture Canvases ─────────────────────────
function addCanvasNoise(ctx, w, h, alpha, seed) {
  const rng = srand(seed);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rng() - 0.5) * 2 * alpha;
    d[i]   = Math.max(0, Math.min(255, d[i]   + v));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + v));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + v));
  }
  ctx.putImageData(id, 0, 0);
}

function makeRuinsCanvas(sz) {
  sz = sz || 128;
  const c = document.createElement('canvas'); c.width = c.height = sz;
  const ctx = c.getContext('2d'), rng = srand(42);
  // Dark concrete base — slightly brighter for visible texture
  ctx.fillStyle = '#222c34'; ctx.fillRect(0, 0, sz, sz);
  addCanvasNoise(ctx, sz, sz, 28, 42);
  // Cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.7;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath(); let x = rng()*sz, y = rng()*sz; ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (rng()-0.5)*35; y += (rng()-0.5)*35; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // Rubble patches
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = 'rgba(8,12,18,' + (0.15+rng()*0.15) + ')';
    ctx.beginPath(); ctx.arc(rng()*sz, rng()*sz, 5+rng()*14, 0, Math.PI*2); ctx.fill();
  }
  // Lighter block outlines
  ctx.strokeStyle = 'rgba(50,60,70,0.08)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) ctx.strokeRect(rng()*sz, rng()*sz, 12+rng()*28, 8+rng()*22);
  return c;
}

function makeMetalCanvas(sz) {
  sz = sz || 128;
  const c = document.createElement('canvas'); c.width = c.height = sz;
  const ctx = c.getContext('2d'), rng = srand(99);
  // Rusted metal for scatter terrain — warmer, distinguishable from board
  ctx.fillStyle = '#1c2228'; ctx.fillRect(0, 0, sz, sz);
  addCanvasNoise(ctx, sz, sz, 16, 99);
  // Rust patches
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(45,28,14,' + (0.12+rng()*0.1) + ')';
    ctx.beginPath(); ctx.arc(rng()*sz, rng()*sz, 7+rng()*16, 0, Math.PI*2); ctx.fill();
  }
  // Plate seams
  ctx.strokeStyle = 'rgba(35,45,55,0.22)'; ctx.lineWidth = 0.5;
  for (let y = 0; y < sz; y += 30) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(sz,y); ctx.stroke(); }
  for (let x = 0; x < sz; x += 42) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,sz); ctx.stroke(); }
  // Rivets
  ctx.fillStyle = 'rgba(55,65,75,0.18)';
  for (let y = 0; y < sz; y += 30) for (let x = 12; x < sz; x += 42) {
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI*2); ctx.fill();
  }
  return c;
}

function makeDeckCanvas(sz) {
  sz = sz || 128;
  const c = document.createElement('canvas'); c.width = c.height = sz;
  const ctx = c.getContext('2d'), rng = srand(77);
  ctx.fillStyle = '#070a10'; ctx.fillRect(0, 0, sz, sz);
  addCanvasNoise(ctx, sz, sz, 5, 77);
  // Faint plate grid
  ctx.strokeStyle = 'rgba(20,30,40,0.12)'; ctx.lineWidth = 0.4;
  for (let x = 0; x < sz; x += 48) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,sz); ctx.stroke(); }
  for (let y = 0; y < sz; y += 48) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(sz,y); ctx.stroke(); }
  // Subtle wear
  ctx.strokeStyle = 'rgba(16,22,30,0.1)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(rng()*sz,rng()*sz); ctx.lineTo(rng()*sz,rng()*sz); ctx.stroke(); }
  return c;
}

function makeWallCanvas(sz) {
  sz = sz || 128;
  const c = document.createElement('canvas'); c.width = c.height = sz;
  const ctx = c.getContext('2d'), rng = srand(33);
  // Wall texture — noticeably lighter than floor for 3D effect
  ctx.fillStyle = '#303c48'; ctx.fillRect(0, 0, sz, sz);
  addCanvasNoise(ctx, sz, sz, 20, 33);
  // Block pattern
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.8;
  const bh = 18;
  for (let row = 0; row < sz/bh+1; row++) {
    const y = row * bh;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(sz,y); ctx.stroke();
    const off = (row % 2) * 14;
    for (let x = off; x < sz; x += 28) { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+bh); ctx.stroke(); }
  }
  return c;
}

function makeVignetteCanvas() {
  const c = document.createElement('canvas'); c.width = BW; c.height = BH;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(BW/2, BH/2, Math.min(BW,BH)*0.15, BW/2, BH/2, Math.max(BW,BH)*0.62);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.6, 'rgba(0,3,10,0.04)');
  grd.addColorStop(1, 'rgba(0,5,15,0.12)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, BW, BH);
  return c;
}

// ── SVG Path Parsing ────────────────────────────────────
function parsePath(d) {
  const pts = [];
  const tokens = d.replace(/[MLZ]/gi, ' ').trim().split(/[\s,]+/);
  for (let i = 0; i < tokens.length - 1; i += 2) {
    pts.push(parseFloat(tokens[i]), parseFloat(tokens[i+1]));
  }
  return pts;
}

function pathBBox(fp) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < fp.length; i += 2) {
    if (fp[i] < x0) x0 = fp[i]; if (fp[i+1] < y0) y0 = fp[i+1];
    if (fp[i] > x1) x1 = fp[i]; if (fp[i+1] > y1) y1 = fp[i+1];
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function parseTransform(t) {
  let sx = 1, sy = 1, rot = 0;
  const sm = t.match(/scale\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (sm) { sx = parseFloat(sm[1]); sy = parseFloat(sm[2]); }
  const rm = t.match(/rotate\(\s*([-\d.]+)\s*\)/);
  if (rm) rot = parseFloat(rm[1]);
  return { sx, sy, rot };
}

// ── Edge lighting helpers ───────────────────────────────
function classifyEdges(flatPts) {
  const highlights = [], shadows = [];
  const len = flatPts.length;
  for (let i = 0; i < len - 2; i += 2) {
    const x1 = flatPts[i], y1 = flatPts[i+1];
    const x2 = flatPts[i+2], y2 = flatPts[i+3];
    const dx = x2 - x1, dy = y2 - y1;
    // Outward normal for CW polygon: (dy, -dx)
    const nx = dy, ny = -dx;
    // Light from top-left: highlight if normal points up or left
    if (nx - ny < 0) {
      highlights.push(x1, y1, x2, y2);
    } else {
      shadows.push(x1, y1, x2, y2);
    }
  }
  return { highlights, shadows };
}

// ── Main Initialization ─────────────────────────────────
export async function initPixiLayer() {
  if (typeof PIXI === 'undefined') {
    console.warn('[v0.6c] PixiJS not loaded, skipping canvas layer');
    return null;
  }

  const app = new PIXI.Application();
  await app.init({
    width: BW, height: BH,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  const canvas = app.canvas;
  canvas.id = 'pixi-canvas';
  canvas.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    'width:100%', 'height:100%',
    'pointer-events:none', 'z-index:0',
    'object-fit:cover'
  ].join(';');

  const inner = document.getElementById('battlefield-inner');
  if (!inner) return null;
  inner.insertBefore(canvas, inner.firstChild);

  // Generate textures
  const ruinsTex  = PIXI.Texture.from(makeRuinsCanvas(128));
  const metalTex  = PIXI.Texture.from(makeMetalCanvas(128));
  const deckTex   = PIXI.Texture.from(makeDeckCanvas(128));
  const wallTex   = PIXI.Texture.from(makeWallCanvas(128));

  const root = app.stage;
  const rng = srand(7777);

  // ═══════════════════════════════════════════════════════
  // LAYER 1: Board surface — tiled deck plate texture
  // ═══════════════════════════════════════════════════════
  const deckSprite = new PIXI.TilingSprite({
    texture: deckTex, width: BW, height: BH
  });
  root.addChild(deckSprite);

  // Subtle board area highlight (brighter center)
  const boardTint = new PIXI.Graphics();
  boardTint.rect(0, 0, BW, BH).fill({ color: 0x141e2a, alpha: 0.12 });
  root.addChild(boardTint);

  // Atmospheric radial darkening (barely perceptible)
  const vignetteTex = PIXI.Texture.from(makeVignetteCanvas());
  const vignette = new PIXI.Sprite(vignetteTex);
  vignette.width = BW; vignette.height = BH;
  root.addChild(vignette);

  // ═══════════════════════════════════════════════════════
  // LAYER 2: Faction zone lighting (very subtle)
  // ═══════════════════════════════════════════════════════
  const zoneLayer = new PIXI.Container();
  root.addChild(zoneLayer);

  const impZone = new PIXI.Graphics();
  impZone.rect(0, 0, 240, BH).fill({ color: 0x0088cc, alpha: 0.035 });
  zoneLayer.addChild(impZone);

  const orkZone = new PIXI.Graphics();
  orkZone.rect(480, 0, 240, BH).fill({ color: 0xcc3318, alpha: 0.035 });
  zoneLayer.addChild(orkZone);

  // ═══════════════════════════════════════════════════════
  // LAYER 3: Terrain shadows (single blur filter)
  // ═══════════════════════════════════════════════════════
  const shadowLayer = new PIXI.Container();
  try {
    shadowLayer.filters = [new PIXI.BlurFilter({ strength: 5, quality: 3 })];
  } catch(e) {
    // Fallback: no blur, just offset shadows
    console.warn('[v0.6c] BlurFilter failed, using hard shadows');
  }
  root.addChild(shadowLayer);

  // ═══════════════════════════════════════════════════════
  // LAYER 4: Terrain pieces with textures
  // ═══════════════════════════════════════════════════════
  const terrainLayer = new PIXI.Container();
  root.addChild(terrainLayer);

  for (const piece of mapData.terrain) {
    const ox = piece.origin[0], oy = piece.origin[1];
    const { sx, sy, rot } = parseTransform(piece.transform);
    const isRuins = piece.type === 'ruins';

    // ── Terrain container (with transform) ──
    const tc = new PIXI.Container();
    tc.position.set(ox, oy);
    tc.pivot.set(ox, oy);
    tc.scale.set(sx, sy);
    tc.rotation = rot * Math.PI / 180;

    // ── Shadow container (same transform, offset) ──
    const sc = new PIXI.Container();
    sc.position.set(ox + 4, oy + 5);
    sc.pivot.set(ox, oy);
    sc.scale.set(sx, sy);
    sc.rotation = rot * Math.PI / 180;

    // Floor path
    const floorPts = parsePath(piece.paths[0].d);
    const floorBB = pathBBox(floorPts);

    // Shadow graphic
    const shadowG = new PIXI.Graphics();
    shadowG.poly(floorPts).fill({ color: 0x000000, alpha: 0.45 });
    sc.addChild(shadowG);
    shadowLayer.addChild(sc);

    // ── Floor texture ──
    const floorTex = isRuins ? ruinsTex : metalTex;
    const floorTile = new PIXI.TilingSprite({
      texture: floorTex,
      width: floorBB.w + 4,
      height: floorBB.h + 4
    });
    floorTile.position.set(floorBB.x - 2, floorBB.y - 2);
    const floorMask = new PIXI.Graphics();
    floorMask.poly(floorPts).fill({ color: 0xffffff });
    floorTile.mask = floorMask;
    tc.addChild(floorTile);
    tc.addChild(floorMask);

    // ── Floor edge lighting ──
    const floorEdges = classifyEdges(floorPts);

    const floorHL = new PIXI.Graphics();
    for (let i = 0; i < floorEdges.highlights.length; i += 4) {
      floorHL.moveTo(floorEdges.highlights[i], floorEdges.highlights[i+1]);
      floorHL.lineTo(floorEdges.highlights[i+2], floorEdges.highlights[i+3]);
    }
    if (floorEdges.highlights.length > 0) {
      floorHL.stroke({ width: 1.5, color: 0x4a5a6a, alpha: 0.5 });
    }
    tc.addChild(floorHL);

    const floorSH = new PIXI.Graphics();
    for (let i = 0; i < floorEdges.shadows.length; i += 4) {
      floorSH.moveTo(floorEdges.shadows[i], floorEdges.shadows[i+1]);
      floorSH.lineTo(floorEdges.shadows[i+2], floorEdges.shadows[i+3]);
    }
    if (floorEdges.shadows.length > 0) {
      floorSH.stroke({ width: 1.2, color: 0x000000, alpha: 0.35 });
    }
    tc.addChild(floorSH);

    // ── Walls (ruins only) ──
    if (isRuins && piece.paths.length > 1) {
      const wallPts = parsePath(piece.paths[1].d);
      const wallBB = pathBBox(wallPts);

      // Wall texture (lighter than floor)
      const wallTile = new PIXI.TilingSprite({
        texture: wallTex,
        width: wallBB.w + 4,
        height: wallBB.h + 4
      });
      wallTile.position.set(wallBB.x - 2, wallBB.y - 2);
      const wallMask = new PIXI.Graphics();
      wallMask.poly(wallPts).fill({ color: 0xffffff });
      wallTile.mask = wallMask;
      tc.addChild(wallTile);
      tc.addChild(wallMask);

      // Wall edge lighting (3D extrusion effect)
      const wallEdges = classifyEdges(wallPts);

      // Highlight (top edge of wall — light-facing, bright for 3D extrusion)
      const wallHL = new PIXI.Graphics();
      for (let i = 0; i < wallEdges.highlights.length; i += 4) {
        wallHL.moveTo(wallEdges.highlights[i], wallEdges.highlights[i+1]);
        wallHL.lineTo(wallEdges.highlights[i+2], wallEdges.highlights[i+3]);
      }
      if (wallEdges.highlights.length > 0) {
        wallHL.stroke({ width: 2.5, color: 0x8898a8, alpha: 0.7 });
      }
      tc.addChild(wallHL);

      // Second inner highlight line (adds thickness to the extrusion top)
      const wallHL2 = new PIXI.Graphics();
      for (let i = 0; i < wallEdges.highlights.length; i += 4) {
        const dy = wallEdges.highlights[i+3] - wallEdges.highlights[i+1];
        const dx = wallEdges.highlights[i+2] - wallEdges.highlights[i];
        // Offset inward by ~1px
        const nx = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
        const ny = dx === 0 ? 0 : (dx > 0 ? -1 : 1);
        wallHL2.moveTo(wallEdges.highlights[i] + nx, wallEdges.highlights[i+1] + ny);
        wallHL2.lineTo(wallEdges.highlights[i+2] + nx, wallEdges.highlights[i+3] + ny);
      }
      if (wallEdges.highlights.length > 0) {
        wallHL2.stroke({ width: 1, color: 0x607080, alpha: 0.4 });
      }
      tc.addChild(wallHL2);

      // Shadow (bottom edge — away from light, offset for extrusion depth)
      const wallSH = new PIXI.Graphics();
      for (let i = 0; i < wallEdges.shadows.length; i += 4) {
        wallSH.moveTo(wallEdges.shadows[i], wallEdges.shadows[i+1] + 2);
        wallSH.lineTo(wallEdges.shadows[i+2], wallEdges.shadows[i+3] + 2);
      }
      if (wallEdges.shadows.length > 0) {
        wallSH.stroke({ width: 3, color: 0x000000, alpha: 0.4 });
      }
      tc.addChild(wallSH);

      // ── Window glow dots (amber, inside the floor footprint) ──
      const winCount = 2 + Math.floor(rng() * 2);
      for (let w = 0; w < winCount; w++) {
        // Position inside floor area but not on walls
        const wx = floorBB.x + floorBB.w * 0.25 + rng() * floorBB.w * 0.5;
        const wy = floorBB.y + floorBB.h * 0.3 + rng() * floorBB.h * 0.4;
        const winG = new PIXI.Graphics();
        // Tiny bright rectangle (window from above)
        winG.rect(wx - 1.5, wy - 1, 3, 2).fill({ color: 0xdda040, alpha: 0.55 });
        // Warm glow halo
        winG.circle(wx, wy, 5).fill({ color: 0xdda040, alpha: 0.06 });
        winG.circle(wx, wy, 2.5).fill({ color: 0xeebb55, alpha: 0.08 });
        tc.addChild(winG);
      }
    }

    // ── Thin outline ──
    const outlineG = new PIXI.Graphics();
    outlineG.poly(floorPts).stroke({ width: 0.8, color: 0x000000, alpha: 0.45 });
    tc.addChild(outlineG);

    terrainLayer.addChild(tc);
  }

  // ═══════════════════════════════════════════════════════
  // LAYER 5: Objective marker glows
  // ═══════════════════════════════════════════════════════
  const objectives = [
    { x: 360, y: 72 }, { x: 120, y: 264 }, { x: 360, y: 264 },
    { x: 600, y: 264 }, { x: 360, y: 456 }
  ];
  const objLayer = new PIXI.Container();
  root.addChild(objLayer);

  const objGlows = [];
  for (const obj of objectives) {
    const g = new PIXI.Graphics();
    // Outer glow
    g.circle(obj.x, obj.y, 28).fill({ color: 0xc9a352, alpha: 0.04 });
    g.circle(obj.x, obj.y, 20).fill({ color: 0xc9a352, alpha: 0.05 });
    g.circle(obj.x, obj.y, 12).fill({ color: 0xc9a352, alpha: 0.04 });
    g.circle(obj.x, obj.y, 5).fill({ color: 0xddb860, alpha: 0.06 });
    objLayer.addChild(g);
    objGlows.push(g);
  }

  // ═══════════════════════════════════════════════════════
  // LAYER 6: Particle system
  // ═══════════════════════════════════════════════════════
  const particleLayer = new PIXI.Container();
  root.addChild(particleLayer);

  const particles = [];

  // Dust motes — very faint, slow drift
  for (let i = 0; i < 35; i++) {
    const g = new PIXI.Graphics();
    const sz = 0.4 + rng() * 1.2;
    const brightness = 0.07 + rng() * 0.1;
    g.circle(0, 0, sz).fill({ color: 0x8899aa, alpha: brightness });
    g.position.set(rng() * BW, rng() * BH);
    particleLayer.addChild(g);
    particles.push({
      g, vx: (rng() - 0.5) * 0.06, vy: (rng() - 0.5) * 0.04,
      type: 'dust', baseAlpha: brightness
    });
  }

  // Ember particles — slightly brighter, warm, rising from terrain
  for (let i = 0; i < 12; i++) {
    const g = new PIXI.Graphics();
    const sz = 0.6 + rng() * 0.7;
    const brightness = 0.12 + rng() * 0.16;
    g.circle(0, 0, sz).fill({ color: 0xdd8833, alpha: brightness });
    // Start near a random terrain piece
    const ti = Math.floor(rng() * mapData.terrain.length);
    const tp = mapData.terrain[ti];
    const bb = pathBBox(parsePath(tp.paths[0].d));
    g.position.set(bb.x + rng() * bb.w, bb.y + rng() * bb.h);
    particleLayer.addChild(g);
    particles.push({
      g, vx: (rng() - 0.5) * 0.03, vy: -0.015 - rng() * 0.03,
      type: 'ember', life: rng() * 2500, baseAlpha: brightness,
      srcBB: bb
    });
  }

  // ═══════════════════════════════════════════════════════
  // LAYER 7: Board frame & corner accents
  // ═══════════════════════════════════════════════════════
  const frameLayer = new PIXI.Container();
  root.addChild(frameLayer);

  // Main frame line
  const frameOuter = new PIXI.Graphics();
  frameOuter.rect(0, 0, BW, BH).stroke({ width: 1.5, color: 0x7a6a42, alpha: 0.3 });
  frameLayer.addChild(frameOuter);

  // Inner frame line
  const frameInner = new PIXI.Graphics();
  frameInner.rect(1.5, 1.5, BW - 3, BH - 3).stroke({ width: 0.5, color: 0x7a6a42, alpha: 0.12 });
  frameLayer.addChild(frameInner);

  // Corner accents (L-shaped decorations)
  const CL = 18; // corner length
  const corners = [
    [0, 0, 1, 1], [BW, 0, -1, 1], [0, BH, 1, -1], [BW, BH, -1, -1]
  ];
  for (const [cx, cy, dx, dy] of corners) {
    const cg = new PIXI.Graphics();
    cg.moveTo(cx, cy).lineTo(cx + CL * dx, cy);
    cg.moveTo(cx, cy).lineTo(cx, cy + CL * dy);
    cg.stroke({ width: 2.5, color: 0xc9a352, alpha: 0.35 });
    // Small inner L
    cg.moveTo(cx + 3*dx, cy + 3*dy).lineTo(cx + (CL-4)*dx, cy + 3*dy);
    cg.moveTo(cx + 3*dx, cy + 3*dy).lineTo(cx + 3*dx, cy + (CL-4)*dy);
    cg.stroke({ width: 0.8, color: 0xc9a352, alpha: 0.2 });
    frameLayer.addChild(cg);
  }

  // ═══════════════════════════════════════════════════════
  // LAYER 8: Color grading (barely perceptible teal tint)
  // ═══════════════════════════════════════════════════════
  const gradeG = new PIXI.Graphics();
  gradeG.rect(0, 0, BW, BH).fill({ color: 0x081820, alpha: 0.05 });
  root.addChild(gradeG);

  // ═══════════════════════════════════════════════════════
  // Animation loop
  // ═══════════════════════════════════════════════════════
  let elapsed = 0;

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS || 16;
    elapsed += dt;

    // Objective glow pulse (slow breathe, ~5 second cycle)
    const pulse = 0.6 + 0.4 * Math.sin(elapsed * 0.00125);
    for (const g of objGlows) {
      g.alpha = pulse;
    }

    // Particle animation
    for (const p of particles) {
      p.g.x += p.vx;
      p.g.y += p.vy;

      if (p.type === 'dust') {
        // Wrap around board edges
        if (p.g.x < -10) p.g.x = BW + 10;
        if (p.g.x > BW + 10) p.g.x = -10;
        if (p.g.y < -10) p.g.y = BH + 10;
        if (p.g.y > BH + 10) p.g.y = -10;
        // Subtle alpha oscillation
        p.g.alpha = p.baseAlpha * (0.6 + 0.4 * Math.sin(elapsed * 0.0008 + p.vx * 1000));
      } else {
        // Ember: rise and fade, then respawn near terrain
        p.life += dt;
        const lifeRatio = p.life / 3500;
        p.g.alpha = p.baseAlpha * Math.max(0, 1 - lifeRatio);
        if (p.life > 3500) {
          p.life = 0;
          p.g.alpha = p.baseAlpha;
          const bb = p.srcBB;
          p.g.x = bb.x + Math.random() * bb.w;
          p.g.y = bb.y + Math.random() * bb.h;
        }
      }
    }
  });

  return app;
}
