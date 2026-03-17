/**
 * scene.js — Army data + initialisation wiring for deployment v0.12a.
 * ES module entry point. Imperium units start in the SVG Staging zone.
 * Ork units are pre-deployed on the board.
 * v0.8: single-source shadows, correct pan limits, grid fix.
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         renderModels, applyTx, setCamera } from '../../../shared/world/svg-renderer.js';
import { initDeployment } from './deployment.js?v=20260314-deploy5';
import '../../../shared/world/world-api.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Unit definitions ────────────────────────────────────
// Imperium starts in the STAGING ZONE (x=-540 to -290, y=20 to 508).
// Orks start pre-deployed in their zone (480-720).

simState.units = [
  // Imperium — positioned inside the Staging zone
  { id:'assault-intercessors', rosterIndex:0, faction:'imp', keywords:['Infantry'],
    models:[
      {id:'ai1',x:-432,y:64,r:R32},{id:'ai2',x:-415,y:64,r:R32},{id:'ai3',x:-398,y:64,r:R32},
      {id:'ai4',x:-424,y:81,r:R32},{id:'ai5',x:-407,y:81,r:R32}
    ], broken:false, deployed:false },

  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp', keywords:['Infantry','Character'],
    models:[{id:'pl1',x:-415,y:160,r:R40}], broken:false, deployed:false },

  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp', keywords:['Infantry'],
    models:[
      {id:'isa1',x:-432,y:224,r:R32},{id:'isa2',x:-415,y:224,r:R32},{id:'isa3',x:-398,y:224,r:R32},
      {id:'isa4',x:-424,y:241,r:R32},{id:'isa5',x:-407,y:241,r:R32}
    ], broken:false, deployed:false },

  { id:'hellblasters', rosterIndex:3, faction:'imp', keywords:['Infantry'],
    models:[
      {id:'hb1',x:-432,y:314,r:R32},{id:'hb2',x:-415,y:314,r:R32},{id:'hb3',x:-398,y:314,r:R32},
      {id:'hb4',x:-424,y:331,r:R32},{id:'hb5',x:-407,y:331,r:R32}
    ], broken:false, deployed:false },

  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp', keywords:['Vehicle'],
    models:[{id:'rd1',x:-415,y:430,r:22,shape:'rect',w:43,h:25}], broken:false, deployed:false },

  // Orks (auto-deployed in their deployment zone — 480-720 range)
  { id:'boss-nob', rosterIndex:6, faction:'ork', keywords:['Infantry','Character'],
    models:[{id:'bn1',x:560,y:100,r:R40}], broken:false, deployed:true },
  { id:'boyz-mob', rosterIndex:7, faction:'ork', keywords:['Infantry'],
    models:[
      {id:'bm1',x:500,y:200,r:R32},{id:'bm2',x:517,y:200,r:R32},{id:'bm3',x:534,y:200,r:R32},
      {id:'bm4',x:551,y:200,r:R32},{id:'bm5',x:568,y:200,r:R32},{id:'bm6',x:500,y:217,r:R32},
      {id:'bm7',x:517,y:217,r:R32},{id:'bm8',x:534,y:217,r:R32},{id:'bm9',x:551,y:217,r:R32},
      {id:'bm10',x:568,y:217,r:R32}
    ], broken:false, deployed:true },
  { id:'mekboy', rosterIndex:8, faction:'ork', keywords:['Infantry','Character'],
    models:[{id:'mb1',x:560,y:350,r:R32}], broken:false, deployed:true }
];

// ── Add board surface + grid in SVG coordinate space ─────
// This ensures the dark board surface and grid lines match the SVG viewBox
// exactly, regardless of viewport aspect ratio or preserveAspectRatio mode.
(function addSvgBoardSurface() {
  var terrainSvg = document.getElementById('bf-svg-terrain');
  if (!terrainSvg) return;
  var NS = 'http://www.w3.org/2000/svg';

  // Get or create defs
  var defs = terrainSvg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    terrainSvg.insertBefore(defs, terrainSvg.firstChild);
  }

  // Create grid pattern (matches shared/components/battlefield.css grid)
  var gridPat = document.createElementNS(NS, 'pattern');
  gridPat.setAttribute('id', 'board-grid');
  gridPat.setAttribute('patternUnits', 'userSpaceOnUse');
  gridPat.setAttribute('width', '60');
  gridPat.setAttribute('height', '60');

  // Minor grid lines (12px spacing)
  for (var i = 12; i < 60; i += 12) {
    var lineH = document.createElementNS(NS, 'line');
    lineH.setAttribute('x1', '0'); lineH.setAttribute('y1', String(i));
    lineH.setAttribute('x2', '60'); lineH.setAttribute('y2', String(i));
    lineH.setAttribute('stroke', 'rgba(201,163,82,0.025)');
    lineH.setAttribute('stroke-width', '0.5');
    gridPat.appendChild(lineH);

    var lineV = document.createElementNS(NS, 'line');
    lineV.setAttribute('x1', String(i)); lineV.setAttribute('y1', '0');
    lineV.setAttribute('x2', String(i)); lineV.setAttribute('y2', '60');
    lineV.setAttribute('stroke', 'rgba(201,163,82,0.025)');
    lineV.setAttribute('stroke-width', '0.5');
    gridPat.appendChild(lineV);
  }

  // Major grid lines (60px spacing = pattern boundary)
  var majorH = document.createElementNS(NS, 'line');
  majorH.setAttribute('x1', '0'); majorH.setAttribute('y1', '0');
  majorH.setAttribute('x2', '60'); majorH.setAttribute('y2', '0');
  majorH.setAttribute('stroke', 'rgba(201,163,82,0.055)');
  majorH.setAttribute('stroke-width', '0.5');
  gridPat.appendChild(majorH);

  var majorV = document.createElementNS(NS, 'line');
  majorV.setAttribute('x1', '0'); majorV.setAttribute('y1', '0');
  majorV.setAttribute('x2', '0'); majorV.setAttribute('y2', '60');
  majorV.setAttribute('stroke', 'rgba(201,163,82,0.055)');
  majorV.setAttribute('stroke-width', '0.5');
  gridPat.appendChild(majorV);

  defs.appendChild(gridPat);

  // Dark board surface rect — covers the full viewBox area
  var boardBg = document.createElementNS(NS, 'rect');
  boardBg.setAttribute('x', '0');
  boardBg.setAttribute('y', '0');
  boardBg.setAttribute('width', '720');
  boardBg.setAttribute('height', '528');
  boardBg.setAttribute('fill', 'rgba(8,14,22,0.88)');
  terrainSvg.insertBefore(boardBg, terrainSvg.firstChild);

  // Grid overlay rect — same area, uses the grid pattern
  var gridRect = document.createElementNS(NS, 'rect');
  gridRect.setAttribute('x', '0');
  gridRect.setAttribute('y', '0');
  gridRect.setAttribute('width', '720');
  gridRect.setAttribute('height', '528');
  gridRect.setAttribute('fill', 'url(#board-grid)');
  gridRect.setAttribute('pointer-events', 'none');
  // Insert after background but before deployment zones and terrain
  boardBg.after(gridRect);
})();

// ── Initialise shared modules ────────────────────────────
renderTerrain();

// ── Apply terrain textures (per-piece SVG <image>, not tiling) ───
// Each terrain piece gets its own <image> element clipped to the terrain path.
// Nano Banana 2 generated images, strictly top-down orthographic.
(function applyTerrainTextures() {
  var terrainSvg = document.getElementById('bf-svg-terrain');
  var terrainLayer = document.getElementById('terrain-layer');
  if (!terrainSvg || !terrainLayer) return;
  var NS = 'http://www.w3.org/2000/svg';

  var defs = terrainSvg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    terrainSvg.insertBefore(defs, terrainSvg.firstChild);
  }

  var ruinsImages = ['ruins-0.jpg', 'ruins-1.jpg', 'ruins-2.jpg'];
  var scatterImage = 'scatter.jpg';
  var ruinsIdx = 0;
  var scatterIdx = 0;

  // For each terrain group, add an <image> clipped to the floor path
  var groups = terrainLayer.querySelectorAll(':scope > g');
  groups.forEach(function(g, gIdx) {
    var paths = g.querySelectorAll('path');
    if (paths.length === 0) return;

    // Determine terrain type from first path fill
    var firstFill = paths[0].getAttribute('fill') || '';
    var isRuins = firstFill.indexOf('58,64,64') !== -1;
    var isScatter = firstFill.indexOf('58,48,24') !== -1;
    if (!isRuins && !isScatter) return;

    // Get bounding box of the FIRST path (floor for ruins, single rect for scatter)
    var floorPath = paths[0];
    var coords = floorPath.getAttribute('d').match(/[-\d.]+/g).map(Number);
    var xs = [], ys = [];
    for (var i = 0; i < coords.length; i += 2) { xs.push(coords[i]); ys.push(coords[i+1]); }
    var minX = Math.min.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxX = Math.max.apply(null, xs);
    var maxY = Math.max.apply(null, ys);
    var w = maxX - minX;
    var h = maxY - minY;

    // Create clip-path from the floor path
    var clipId = 'terrain-clip-' + gIdx;
    var clipEl = document.createElementNS(NS, 'clipPath');
    clipEl.setAttribute('id', clipId);
    var clipPath = document.createElementNS(NS, 'path');
    clipPath.setAttribute('d', floorPath.getAttribute('d'));
    clipEl.appendChild(clipPath);
    defs.appendChild(clipEl);

    // Create <image> element
    var img = document.createElementNS(NS, 'image');
    var texFile = isRuins ? ruinsImages[ruinsIdx % 3] : scatterImage;
    img.setAttribute('href', texFile);
    img.setAttribute('x', String(minX));
    img.setAttribute('y', String(minY));
    img.setAttribute('width', String(w));
    img.setAttribute('height', String(h));
    img.setAttribute('clip-path', 'url(#' + clipId + ')');
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    img.setAttribute('opacity', isRuins ? '0.7' : '0.65');
    img.setAttribute('pointer-events', 'none');

    // Make the original floor path darker/transparent so the image shows
    floorPath.setAttribute('fill', isRuins ? 'rgba(20,25,30,0.5)' : 'rgba(20,18,12,0.4)');

    // Insert the image BEFORE the group's paths (so it renders behind walls)
    g.insertBefore(img, g.firstChild);

    if (isRuins) ruinsIdx++;
    else scatterIdx++;

    // For ruins: also add a texture to the wall path (second path)
    if (isRuins && paths.length > 1) {
      var wallPath = paths[1]; // the L-shaped wall
      var wallClipId = 'wall-clip-' + gIdx;
      var wallClipEl = document.createElementNS(NS, 'clipPath');
      wallClipEl.setAttribute('id', wallClipId);
      var wallClipPath = document.createElementNS(NS, 'path');
      wallClipPath.setAttribute('d', wallPath.getAttribute('d'));
      wallClipEl.appendChild(wallClipPath);
      defs.appendChild(wallClipEl);

      var wallImg = document.createElementNS(NS, 'image');
      wallImg.setAttribute('href', texFile);
      wallImg.setAttribute('x', String(minX));
      wallImg.setAttribute('y', String(minY));
      wallImg.setAttribute('width', String(w));
      wallImg.setAttribute('height', String(h));
      wallImg.setAttribute('clip-path', 'url(#' + wallClipId + ')');
      wallImg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      wallImg.setAttribute('opacity', '0.85');
      wallImg.setAttribute('pointer-events', 'none');

      // Darken the original wall path
      wallPath.setAttribute('fill', 'rgba(50,55,60,0.4)');

      // Insert after the floor image but before the wall path
      wallPath.parentNode.insertBefore(wallImg, wallPath);
    }
  });
})();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// ── Add terrain overhangs (broken floors above models) ───
// For each ruins piece, add a semi-transparent broken floor image
// in the overhang SVG layer (above models) to create occlusion effect.
(function addTerrainOverhangs() {
  var overhangLayer = document.getElementById('layer-overhangs');
  var overhangSvg = document.getElementById('bf-svg-overhang');
  if (!overhangLayer || !overhangSvg) return;
  var NS = 'http://www.w3.org/2000/svg';

  var ruinsTextures = ['ruins-0.jpg', 'ruins-1.jpg', 'ruins-2.jpg'];

  // Get or create defs in the overhang SVG
  var defs = overhangSvg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    overhangSvg.insertBefore(defs, overhangSvg.firstChild);
  }

  // For each ruins piece in terrain data, create an overhang image
  // clipped to the WALL path (L-shape) — only the wall area has overhanging floor
  var ruinsData = mapData.terrain.filter(function(t) { return t.type === 'ruins'; });

  ruinsData.forEach(function(piece, idx) {
    // The wall path is paths[1] (the L-shaped lighter path)
    if (!piece.paths[1]) return;

    var texFile = ruinsTextures[idx % 3];
    var wallPath = piece.paths[1];

    // Create clip path from the wall shape
    var clipId = 'overhang-clip-' + idx;
    var clipPath = document.createElementNS(NS, 'clipPath');
    clipPath.setAttribute('id', clipId);
    var clipPathEl = document.createElementNS(NS, 'path');
    clipPathEl.setAttribute('d', wallPath.d);
    clipPath.appendChild(clipPathEl);
    defs.appendChild(clipPath);

    // Create a group with the terrain's transform
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('transform',
      'translate(' + piece.origin[0] + ',' + piece.origin[1] + ') ' +
      piece.transform +
      ' translate(' + (-piece.origin[0]) + ',' + (-piece.origin[1]) + ')');

    // Create the overhang image — covers the floor area, clipped to wall shape
    var floorPath = piece.paths[0];
    // Parse the floor rect bounds from the path d attribute
    var coords = floorPath.d.match(/[-\d.]+/g).map(Number);
    var minX = Math.min(coords[0], coords[2], coords[4], coords[6]);
    var minY = Math.min(coords[1], coords[3], coords[5], coords[7]);
    var maxX = Math.max(coords[0], coords[2], coords[4], coords[6]);
    var maxY = Math.max(coords[1], coords[3], coords[5], coords[7]);

    var img = document.createElementNS(NS, 'image');
    img.setAttribute('href', texFile);
    img.setAttribute('x', String(minX));
    img.setAttribute('y', String(minY));
    img.setAttribute('width', String(maxX - minX));
    img.setAttribute('height', String(maxY - minY));
    img.setAttribute('clip-path', 'url(#' + clipId + ')');
    img.setAttribute('opacity', '0.35');  // semi-transparent — models visible beneath
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');

    g.appendChild(img);
    overhangLayer.appendChild(g);
  });
})();

// ── Add drop shadows to terrain ──────────────────────────
// Creates an SVG filter for consistent terrain drop shadows.
// Uses a composite approach: dark offset shadow + subtle light edge.
(function addTerrainShadows() {
  var terrainSvg = document.getElementById('bf-svg-terrain');
  if (!terrainSvg) return;

  var NS = 'http://www.w3.org/2000/svg';

  // Create or get defs
  var defs = terrainSvg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    terrainSvg.insertBefore(defs, terrainSvg.firstChild);
  }

  // Single shadow filter — one light source only (upper-right sun)
  // Shadow falls to bottom-left (dx:-4, dy:4), soft, moderate opacity
  var filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', 'terrain-shadow');
  filter.setAttribute('x', '-30%');
  filter.setAttribute('y', '-20%');
  filter.setAttribute('width', '160%');
  filter.setAttribute('height', '160%');

  var feDropShadow = document.createElementNS(NS, 'feDropShadow');
  feDropShadow.setAttribute('dx', '-3');
  feDropShadow.setAttribute('dy', '3');
  feDropShadow.setAttribute('stdDeviation', '3');
  feDropShadow.setAttribute('flood-color', '#000000');
  feDropShadow.setAttribute('flood-opacity', '0.5');

  filter.appendChild(feDropShadow);
  defs.appendChild(filter);

  // Apply shadow to WALL paths only (not floors or scatter terrain).
  // Wall paths have fill='rgba(106,114,114,...)' — the lighter L-shaped structures.
  // Floor paths have fill='rgba(58,64,64,...)' — darker floor slabs, no shadow.
  // Scatter terrain has fill='rgba(58,48,24,...)' — low obstacles, no shadow.
  var terrainLayer = document.getElementById('terrain-layer');
  if (terrainLayer) {
    var allPaths = terrainLayer.querySelectorAll('path');
    allPaths.forEach(function(p) {
      var fill = p.getAttribute('fill') || '';
      // Only wall paths (lighter grey) get the shadow
      if (fill.indexOf('106,114,114') !== -1) {
        p.setAttribute('filter', 'url(#terrain-shadow)');
      }
    });
  }
})();

// ── Pan limits — using transform-origin: center ──
// 
// KEY INSIGHT: transform-origin is CENTER, not top-left.
// This means translate(0,0) scale(0.5) = board centered, at half size.
// tx/ty is the offset FROM the centered position.
// So: centered = tx:0, ty:0. Pan limits = |tx| ≤ max, |ty| ≤ max.
//
// Using direct event listeners, NOT MutationObserver (which caused stuck states).
//
(function addPanLimits() {
  var bf = document.getElementById('battlefield');
  var inner = document.getElementById('battlefield-inner');
  if (!bf || !inner) return;

  function clampTransform() {
    var t = inner.style.transform || '';
    var match = t.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/);
    if (!match) return;

    var curTx = parseFloat(match[1]);
    var curTy = parseFloat(match[2]);
    var curScale = parseFloat(match[3]);

    var bfW = bf.clientWidth;
    var bfH = bf.clientHeight;

    // Board renders at bfW*scale x bfH*scale, centered in viewport.
    // Allow panning so board edge can reach viewport center (50% of rendered size).
    var maxPanX = Math.max(0, (bfW * curScale) * 0.4);
    var maxPanY = Math.max(0, (bfH * curScale) * 0.4);

    var clampedTx = Math.max(-maxPanX, Math.min(maxPanX, curTx));
    var clampedTy = Math.max(-maxPanY, Math.min(maxPanY, curTy));

    if (Math.abs(clampedTx - curTx) > 0.5 || Math.abs(clampedTy - curTy) > 0.5) {
      inner.style.transform = 'translate(' + clampedTx + 'px,' + clampedTy + 'px) scale(' + curScale + ')';
    }
  }

  // Run AFTER svg-renderer's handlers (bubbling phase)
  document.addEventListener('mousemove', clampTransform, false);
  document.addEventListener('mouseup', clampTransform, false);
  bf.addEventListener('wheel', function() {
    // Delay slightly so svg-renderer's wheel handler runs first
    requestAnimationFrame(clampTransform);
  }, false);
})();

// ── Set initial camera pan to show staging + deployment zone ──
// Use setCamera() so camera.js internal state (tx/ty/scale) stays in sync.
setCamera(200, 0, 0.5);

// ── Build terrain collision AABBs ────────────────────────
var svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

// ── Initialise deployment interaction ────────────────────
initDeployment();

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
