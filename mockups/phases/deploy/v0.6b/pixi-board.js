/**
 * pixi-board.js — PixiJS v8 canvas layer for WH40K battlefield
 * Renders behind SVG layers: board surface, terrain textures, particles, unit glows
 */

import { mapData } from '../../../shared/state/terrain-data.js';
import { simState } from '../../../shared/state/store.js';

// Board dimensions (SVG coordinate space)
const BOARD_W = 720;
const BOARD_H = 528;
const EXTEND = 600; // Extra pixels beyond board edges for surround area

// ── PixiJS Application Setup ─────────────────────────────
let app;
let terrainContainer;
let particleContainer;
let glowContainer;
let vignetteSprite;

export async function initPixiBoard() {
  const inner = document.getElementById('battlefield-inner');
  if (!inner) return;

  app = new PIXI.Application();
  await app.init({
    width: BOARD_W + EXTEND * 2,
    height: BOARD_H + EXTEND * 2,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // Position canvas to cover extended area
  const canvas = app.canvas;
  canvas.style.position = 'absolute';
  canvas.style.left = (-EXTEND) + 'px';
  canvas.style.top = (-EXTEND) + 'px';
  canvas.style.width = (BOARD_W + EXTEND * 2) + 'px';
  canvas.style.height = (BOARD_H + EXTEND * 2) + 'px';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';

  // Insert at beginning of battlefield-inner (behind SVGs)
  inner.insertBefore(canvas, inner.firstChild);

  // Build layers
  buildBoardSurface();
  buildBoardEdge();
  buildTerrain();
  buildVignette();
  initParticles();
  initUnitGlows();

  // Start render loop
  app.ticker.add(updateLoop);
}

// ── Board Surface (procedural deck plates) ───────────────
function buildBoardSurface() {
  const totalW = BOARD_W + EXTEND * 2;
  const totalH = BOARD_H + EXTEND * 2;

  // Create tiling texture from procedural deck plate
  const tileSize = 60;
  const tileGfx = new PIXI.Graphics();

  // Base plate color
  tileGfx.rect(0, 0, tileSize, tileSize);
  tileGfx.fill({ color: 0x0d1218 });

  // Plate border lines (subtle grid)
  tileGfx.rect(0, 0, tileSize, 1);
  tileGfx.fill({ color: 0x1a2230, alpha: 0.6 });
  tileGfx.rect(0, 0, 1, tileSize);
  tileGfx.fill({ color: 0x1a2230, alpha: 0.6 });

  // Rivet dots at corners
  tileGfx.circle(3, 3, 1);
  tileGfx.fill({ color: 0x252f3a, alpha: 0.5 });
  tileGfx.circle(tileSize - 3, 3, 1);
  tileGfx.fill({ color: 0x252f3a, alpha: 0.5 });
  tileGfx.circle(3, tileSize - 3, 1);
  tileGfx.fill({ color: 0x252f3a, alpha: 0.5 });
  tileGfx.circle(tileSize - 3, tileSize - 3, 1);
  tileGfx.fill({ color: 0x252f3a, alpha: 0.5 });

  // Cross-hatch scratch marks (subtle)
  tileGfx.moveTo(12, 0);
  tileGfx.lineTo(tileSize, tileSize - 12);
  tileGfx.stroke({ color: 0x151d28, alpha: 0.3, width: 0.5 });

  tileGfx.moveTo(0, 20);
  tileGfx.lineTo(40, tileSize);
  tileGfx.stroke({ color: 0x151d28, alpha: 0.2, width: 0.5 });

  const tileTexture = app.renderer.generateTexture(tileGfx);

  const tilingSprite = new PIXI.TilingSprite({
    texture: tileTexture,
    width: totalW,
    height: totalH,
  });

  app.stage.addChild(tilingSprite);

  // Add noise/grain overlay for texture variation
  const noiseGfx = new PIXI.Graphics();
  const noiseStep = 4;
  for (let x = 0; x < totalW; x += noiseStep) {
    for (let y = 0; y < totalH; y += noiseStep) {
      const brightness = Math.random() * 0.04;
      const shade = Math.floor(brightness * 255);
      noiseGfx.rect(x, y, noiseStep, noiseStep);
      noiseGfx.fill({ color: (shade << 16) | (shade << 8) | shade, alpha: 0.3 });
    }
  }
  app.stage.addChild(noiseGfx);

  // Surround darkening — darken area outside board
  const darken = new PIXI.Graphics();

  // Top band
  darken.rect(0, 0, totalW, EXTEND);
  darken.fill({ color: 0x000000, alpha: 0.4 });
  // Bottom band
  darken.rect(0, EXTEND + BOARD_H, totalW, EXTEND);
  darken.fill({ color: 0x000000, alpha: 0.4 });
  // Left band
  darken.rect(0, EXTEND, EXTEND, BOARD_H);
  darken.fill({ color: 0x000000, alpha: 0.4 });
  // Right band
  darken.rect(EXTEND + BOARD_W, EXTEND, EXTEND, BOARD_H);
  darken.fill({ color: 0x000000, alpha: 0.4 });

  app.stage.addChild(darken);
}

// ── Board Edge (metallic border) ─────────────────────────
function buildBoardEdge() {
  const edge = new PIXI.Graphics();
  const ox = EXTEND;
  const oy = EXTEND;

  // Outer glow line
  edge.rect(ox - 2, oy - 2, BOARD_W + 4, BOARD_H + 4);
  edge.stroke({ color: 0x2a3a4a, width: 3, alpha: 0.4 });

  // Main metallic edge
  edge.rect(ox, oy, BOARD_W, BOARD_H);
  edge.stroke({ color: 0x4a5a6a, width: 1.5, alpha: 0.7 });

  // Inner highlight (top-left light source)
  edge.moveTo(ox, oy + BOARD_H);
  edge.lineTo(ox, oy);
  edge.lineTo(ox + BOARD_W, oy);
  edge.stroke({ color: 0x6a7a8a, width: 0.5, alpha: 0.4 });

  app.stage.addChild(edge);
}

// ── Terrain Pieces ───────────────────────────────────────
function buildTerrain() {
  terrainContainer = new PIXI.Container();
  app.stage.addChild(terrainContainer);

  mapData.terrain.forEach((piece) => {
    const container = new PIXI.Container();

    // Parse transform to get origin-based transformation
    const ox = piece.origin[0] + EXTEND;
    const oy = piece.origin[1] + EXTEND;

    piece.paths.forEach((pathData, idx) => {
      const points = parseSVGPath(pathData.d);
      if (points.length < 3) return;

      const gfx = new PIXI.Graphics();

      // Determine texture color based on type and path index
      let baseColor, highlightColor;
      if (piece.type === 'ruins') {
        if (idx === 0) {
          // Floor/foundation — dark concrete
          baseColor = 0x2a3038;
          highlightColor = 0x3a4048;
        } else {
          // Walls — lighter concrete with detail
          baseColor = 0x4a5258;
          highlightColor = 0x5a6268;
        }
      } else {
        // Scatter — rusty metal/debris
        baseColor = 0x3a2818;
        highlightColor = 0x4a3828;
      }

      // Draw filled shape
      gfx.moveTo(points[0].x + EXTEND, points[0].y + EXTEND);
      for (let i = 1; i < points.length; i++) {
        gfx.lineTo(points[i].x + EXTEND, points[i].y + EXTEND);
      }
      gfx.closePath();
      gfx.fill({ color: baseColor, alpha: 0.9 });

      // Add texture detail — procedural noise rectangles within bounds
      const bounds = getPointsBounds(points);
      const detailStep = piece.type === 'ruins' ? 6 : 4;
      for (let dx = bounds.minX; dx < bounds.maxX; dx += detailStep) {
        for (let dy = bounds.minY; dy < bounds.maxY; dy += detailStep) {
          if (Math.random() > 0.4) continue;
          if (!isPointInPolygon(dx + detailStep/2, dy + detailStep/2, points)) continue;
          const variation = Math.random() * 0.15;
          const shade = piece.type === 'ruins' ?
            lerpColor(baseColor, highlightColor, variation) :
            lerpColor(baseColor, 0x5a3a1a, variation);
          gfx.rect(dx + EXTEND, dy + EXTEND, detailStep - 1, detailStep - 1);
          gfx.fill({ color: shade, alpha: 0.5 });
        }
      }

      // Edge outline
      gfx.moveTo(points[0].x + EXTEND, points[0].y + EXTEND);
      for (let i = 1; i < points.length; i++) {
        gfx.lineTo(points[i].x + EXTEND, points[i].y + EXTEND);
      }
      gfx.closePath();
      gfx.stroke({ color: 0x000000, width: 1.5, alpha: 0.5 });

      // Top-left edge highlight (light source simulation)
      if (idx === (piece.type === 'ruins' ? 1 : 0)) {
        // Highlight top and left edges
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          // Top edge (y is small) or left edge (x is small)
          const isTop = Math.abs(a.y - b.y) < 2 && a.y <= bounds.minY + 2;
          const isLeft = Math.abs(a.x - b.x) < 2 && a.x <= bounds.minX + 2;
          if (isTop || isLeft) {
            gfx.moveTo(a.x + EXTEND, a.y + EXTEND);
            gfx.lineTo(b.x + EXTEND, b.y + EXTEND);
            gfx.stroke({ color: 0x8a9aaa, width: 1, alpha: 0.35 });
          }
        }
      }

      container.addChild(gfx);
    });

    // Apply SVG transform (origin-based rotation/scale)
    applyTerrainTransform(container, piece);

    // Drop shadow — render a dark duplicate offset behind
    const shadow = new PIXI.Graphics();
    piece.paths.forEach((pathData) => {
      const points = parseSVGPath(pathData.d);
      if (points.length < 3) return;
      shadow.moveTo(points[0].x + EXTEND + 4, points[0].y + EXTEND + 4);
      for (let i = 1; i < points.length; i++) {
        shadow.lineTo(points[i].x + EXTEND + 4, points[i].y + EXTEND + 4);
      }
      shadow.closePath();
      shadow.fill({ color: 0x000000, alpha: 0.35 });
    });
    applyTerrainTransform(shadow, piece);

    // Insert shadow before terrain
    terrainContainer.addChild(shadow);
    terrainContainer.addChild(container);
  });
}

function applyTerrainTransform(container, piece) {
  const ox = piece.origin[0] + EXTEND;
  const oy = piece.origin[1] + EXTEND;
  const t = piece.transform;

  // Parse transform string
  let scaleX = 1, scaleY = 1, rotation = 0;

  const scaleMatch = t.match(/scale\(([^)]+)\)/);
  if (scaleMatch) {
    const parts = scaleMatch[1].split(',');
    scaleX = parseFloat(parts[0]);
    scaleY = parts[1] !== undefined ? parseFloat(parts[1]) : scaleX;
  }

  const rotMatch = t.match(/rotate\(([^)]+)\)/);
  if (rotMatch) {
    rotation = parseFloat(rotMatch[1]) * Math.PI / 180;
  }

  container.pivot.set(ox, oy);
  container.position.set(ox, oy);
  container.rotation = rotation;
  container.scale.set(scaleX, scaleY);
}

// ── Atmospheric Vignette ─────────────────────────────────
function buildVignette() {
  const totalW = BOARD_W + EXTEND * 2;
  const totalH = BOARD_H + EXTEND * 2;
  const cx = totalW / 2;
  const cy = totalH / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  // Use a radial-ish gradient via concentric circles
  const vignette = new PIXI.Graphics();

  const steps = 8;
  for (let i = steps; i > 0; i--) {
    const r = (maxR * i) / steps;
    const alpha = 0.02 + (i / steps) * 0.12;
    vignette.ellipse(cx, cy, r, r * (totalH / totalW));
    vignette.fill({ color: 0x000000, alpha: alpha });
  }
  // Clear center
  const centerR = maxR * 0.3;
  vignette.ellipse(cx, cy, centerR, centerR * (totalH / totalW));
  vignette.fill({ color: 0x000000, alpha: 0 });

  // Use blend mode to make it subtle
  vignette.alpha = 0.5;
  app.stage.addChild(vignette);
  vignetteSprite = vignette;
}

// ── Particle System (dust/embers) ────────────────────────
const particles = [];

function initParticles() {
  particleContainer = new PIXI.Container();
  app.stage.addChild(particleContainer);

  // Spawn particles near terrain positions
  const terrainPositions = mapData.terrain.map(t => ({
    x: t.origin[0] + EXTEND,
    y: t.origin[1] + EXTEND
  }));

  for (let i = 0; i < 28; i++) {
    const src = terrainPositions[i % terrainPositions.length];
    spawnParticle(src.x + (Math.random() - 0.5) * 60, src.y + (Math.random() - 0.5) * 40);
  }
}

function spawnParticle(x, y) {
  const gfx = new PIXI.Graphics();
  const size = 1 + Math.random() * 2;
  // Warm amber color
  const colors = [0xffaa44, 0xff8833, 0xffcc66, 0xff9944];
  const color = colors[Math.floor(Math.random() * colors.length)];

  gfx.circle(0, 0, size);
  gfx.fill({ color: color, alpha: 0.8 });

  gfx.position.set(x, y);

  const particle = {
    gfx: gfx,
    x: x,
    y: y,
    baseX: x,
    baseY: y,
    vx: (Math.random() - 0.5) * 0.15,
    vy: -(0.2 + Math.random() * 0.3),
    life: Math.random() * 200,
    maxLife: 200 + Math.random() * 150,
    size: size,
    color: color,
  };

  particles.push(particle);
  particleContainer.addChild(gfx);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;

    if (p.life >= p.maxLife) {
      // Reset particle
      p.life = 0;
      p.x = p.baseX + (Math.random() - 0.5) * 60;
      p.y = p.baseY + (Math.random() - 0.5) * 40;
      p.vx = (Math.random() - 0.5) * 0.15;
      p.vy = -(0.2 + Math.random() * 0.3);
    }

    p.x += p.vx * dt * 0.06;
    p.y += p.vy * dt * 0.06;
    p.vx += (Math.random() - 0.5) * 0.01; // horizontal wander

    p.gfx.position.set(p.x, p.y);

    // Fade in/out
    const lifeRatio = p.life / p.maxLife;
    let alpha;
    if (lifeRatio < 0.15) {
      alpha = lifeRatio / 0.15;
    } else if (lifeRatio > 0.7) {
      alpha = 1 - (lifeRatio - 0.7) / 0.3;
    } else {
      alpha = 1;
    }
    p.gfx.alpha = alpha * 0.6;
  }
}

// ── Unit Glows ───────────────────────────────────────────
let glowGraphics = [];

function initUnitGlows() {
  glowContainer = new PIXI.Container();
  app.stage.addChild(glowContainer);
}

function updateUnitGlows() {
  // Clear existing glows
  glowContainer.removeChildren();
  glowGraphics = [];

  if (!simState.units) return;

  simState.units.forEach(unit => {
    if (!unit.deployed && !unit.faction === 'ork') return;

    const isImp = unit.faction === 'imp';
    const glowColor = isImp ? 0x00d4ff : 0xff4020;
    const glowAlpha = isImp ? 0.12 : 0.15;

    unit.models.forEach(model => {
      // Only show glow for models on the board (positive x)
      if (model.x < 0) return;

      const gfx = new PIXI.Graphics();
      const r = model.r || 8;
      const glowR = r * 2.5;

      // Multi-layer glow
      for (let layer = 3; layer > 0; layer--) {
        const layerR = r + (glowR - r) * (layer / 3);
        const layerAlpha = glowAlpha * (1 - layer / 4);
        gfx.circle(model.x + EXTEND, model.y + EXTEND, layerR);
        gfx.fill({ color: glowColor, alpha: layerAlpha });
      }

      glowContainer.addChild(gfx);
      glowGraphics.push(gfx);
    });
  });
}

// ── Render Loop ──────────────────────────────────────────
let frameCount = 0;

function updateLoop(ticker) {
  const dt = ticker.deltaTime;
  updateParticles(dt);

  // Update glows every 30 frames (unit positions don't change that often)
  frameCount++;
  if (frameCount % 30 === 0) {
    updateUnitGlows();
  }
}

// ── SVG Path Parsing Helpers ─────────────────────────────
function parseSVGPath(d) {
  const points = [];
  const parts = d.trim().split(/\s+/);
  let i = 0;
  while (i < parts.length) {
    const cmd = parts[i];
    if (cmd === 'M' || cmd === 'L') {
      i++;
      const x = parseFloat(parts[i++]);
      const y = parseFloat(parts[i++]);
      if (!isNaN(x) && !isNaN(y)) points.push({ x, y });
    } else if (!isNaN(parseFloat(cmd))) {
      // Implicit lineto
      const x = parseFloat(parts[i++]);
      const y = parseFloat(parts[i++]);
      if (!isNaN(x) && !isNaN(y)) points.push({ x, y });
    } else {
      i++;
    }
  }
  return points;
}

function getPointsBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  return { minX, minY, maxX, maxY };
}

function isPointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}
