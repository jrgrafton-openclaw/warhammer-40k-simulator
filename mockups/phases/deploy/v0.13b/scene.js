/**
 * scene.js — Army data + initialisation wiring for deployment v0.13b.
 * ES module entry point. Imagen 4 sprite sheet terrain textures.
 * Ground texture (tiled) + per-piece ruin/scatter images clipped to SVG paths.
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         renderModels, applyTx } from '../../../shared/world/svg-renderer.js';
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

  // ── Ground texture pattern (tileable) ──
  var groundPat = document.createElementNS(NS, 'pattern');
  groundPat.setAttribute('id', 'ground-texture');
  groundPat.setAttribute('patternUnits', 'userSpaceOnUse');
  groundPat.setAttribute('width', '180');
  groundPat.setAttribute('height', '180');
  var groundImg = document.createElementNS(NS, 'image');
  groundImg.setAttribute('href', 'ground-tile.jpg');
  groundImg.setAttribute('width', '180');
  groundImg.setAttribute('height', '180');
  groundImg.setAttribute('opacity', '0.4');
  groundPat.appendChild(groundImg);
  // Dark overlay to keep it subdued
  var groundOverlay = document.createElementNS(NS, 'rect');
  groundOverlay.setAttribute('width', '180');
  groundOverlay.setAttribute('height', '180');
  groundOverlay.setAttribute('fill', 'rgba(8,14,22,0.55)');
  groundPat.appendChild(groundOverlay);
  defs.appendChild(groundPat);

  // Dark board surface with ground texture
  var boardBg = document.createElementNS(NS, 'rect');
  boardBg.setAttribute('x', '0');
  boardBg.setAttribute('y', '0');
  boardBg.setAttribute('width', '720');
  boardBg.setAttribute('height', '528');
  boardBg.setAttribute('fill', 'url(#ground-texture)');
  terrainSvg.insertBefore(boardBg, terrainSvg.firstChild);

  // Grid overlay rect — same area, uses the grid pattern
  var gridRect = document.createElementNS(NS, 'rect');
  gridRect.setAttribute('x', '0');
  gridRect.setAttribute('y', '0');
  gridRect.setAttribute('width', '720');
  gridRect.setAttribute('height', '528');
  gridRect.setAttribute('fill', 'url(#board-grid)');
  gridRect.setAttribute('pointer-events', 'none');
  boardBg.after(gridRect);
})();

// ── Initialise shared modules ────────────────────────────
renderTerrain();

// ── Apply terrain textures from Imagen 4 sprite sheets ──────
// Each terrain piece gets a per-piece image clipped to its SVG path.
// Ruins use ruin-N.png, scatter uses scatter-N.png.
(function applyTerrainTextures() {
  var terrainSvg = document.getElementById('bf-svg-terrain');
  var terrainLayer = document.getElementById('terrain-layer');
  if (!terrainSvg || !terrainLayer) return;
  var NS = 'http://www.w3.org/2000/svg';

  var defs = terrainSvg.querySelector('defs') || (function() {
    var d = document.createElementNS(NS, 'defs');
    terrainSvg.insertBefore(d, terrainSvg.firstChild);
    return d;
  })();

  var allGroups = terrainLayer.querySelectorAll('g[opacity]');
  var ruinIdx = 0;
  var scatterIdx = 0;

  allGroups.forEach(function(g) {
    var paths = g.querySelectorAll('path');
    if (paths.length === 0) return;

    // Detect type from first path fill
    var firstFill = (paths[0].getAttribute('fill') || '');
    var isRuin = firstFill.indexOf('58,64,64') !== -1;
    var isScatter = firstFill.indexOf('58,48,24') !== -1;

    if (!isRuin && !isScatter) return;

    // Get bounding box of the group's paths
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    paths.forEach(function(p) {
      try {
        var bb = p.getBBox();
        minX = Math.min(minX, bb.x);
        minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width);
        maxY = Math.max(maxY, bb.y + bb.height);
      } catch(e) {}
    });

    var bw = maxX - minX;
    var bh = maxY - minY;
    if (bw <= 0 || bh <= 0) return;

    // Create clipPath from the terrain paths
    var clipId = (isRuin ? 'ruin-clip-' + ruinIdx : 'scatter-clip-' + scatterIdx);
    var clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', clipId);
    paths.forEach(function(p) {
      var clone = p.cloneNode(true);
      clone.removeAttribute('fill');
      clone.removeAttribute('stroke');
      clone.removeAttribute('filter');
      clip.appendChild(clone);
    });
    defs.appendChild(clip);

    // Add image element inside the group, behind the paths
    var imgFile = isRuin ? 'ruin-' + (ruinIdx % 8) + '.png' : 'scatter-' + (scatterIdx % 8) + '.png';
    var img = document.createElementNS(NS, 'image');
    img.setAttribute('href', imgFile);
    img.setAttribute('x', String(minX));
    img.setAttribute('y', String(minY));
    img.setAttribute('width', String(bw));
    img.setAttribute('height', String(bh));
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    img.setAttribute('clip-path', 'url(#' + clipId + ')');
    img.setAttribute('opacity', '0.85');

    // Insert image AFTER paths (image overlays the solid-fill backgrounds)
    g.appendChild(img);

    // Make original paths serve as solid background behind texture
    // (prevents PNG transparency checkerboard showing through)
    paths.forEach(function(p) {
      var fill = p.getAttribute('fill') || '';
      if (fill.indexOf('106,114,114') !== -1) {
        // Wall paths — solid dark background
        p.setAttribute('fill', 'rgba(50,55,55,0.9)');
      } else if (fill.indexOf('58,64,64') !== -1) {
        // Floor paths — solid darker background  
        p.setAttribute('fill', 'rgba(35,40,40,0.85)');
      } else if (fill.indexOf('58,48,24') !== -1) {
        // Scatter — solid dark background
        p.setAttribute('fill', 'rgba(40,35,20,0.85)');
      }
    });

    if (isRuin) ruinIdx++;
    else scatterIdx++;
  });

  console.log('Terrain textures applied:', ruinIdx, 'ruins,', scatterIdx, 'scatter');
})();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

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
// With standard viewBox (0 0 720 528) and scale 0.5, the board renders normally.
// Staging zones are at negative x coords (overflow:visible makes them render).
// We need to pan RIGHT (positive tx) to reveal the staging area to the left of x=0.
// At scale 0.5, each SVG unit ≈ 0.7 display px. Staging center is at x≈-415.
// tx=350 shifts the canvas right enough to show staging + deployment zone together.
// With transform-origin: center, translate(0,0) centers the board.
// Offset right to show staging zone during deployment.
var inner = document.getElementById('battlefield-inner');
if (inner) {
  inner.style.transform = 'translate(200px, 0px) scale(0.5)';
}

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
