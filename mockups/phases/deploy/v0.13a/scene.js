/**
 * scene.js — Army data + initialisation wiring for deployment v0.13a.
 * ES module entry point. "Frozen Synapse" SVG glow style.
 * Pure CSS/SVG — no image textures. Neon glow on terrain.
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

  // ── Frozen Synapse style: SVG noise filter for board surface ──
  var noiseFilter = document.createElementNS(NS, 'filter');
  noiseFilter.setAttribute('id', 'board-noise');
  noiseFilter.setAttribute('x', '0'); noiseFilter.setAttribute('y', '0');
  noiseFilter.setAttribute('width', '100%'); noiseFilter.setAttribute('height', '100%');
  
  var feTurb = document.createElementNS(NS, 'feTurbulence');
  feTurb.setAttribute('type', 'fractalNoise');
  feTurb.setAttribute('baseFrequency', '0.65');
  feTurb.setAttribute('numOctaves', '4');
  feTurb.setAttribute('stitchTiles', 'stitch');
  feTurb.setAttribute('result', 'noise');
  noiseFilter.appendChild(feTurb);
  
  var feColorNoise = document.createElementNS(NS, 'feColorMatrix');
  feColorNoise.setAttribute('in', 'noise');
  feColorNoise.setAttribute('type', 'saturate');
  feColorNoise.setAttribute('values', '0');
  feColorNoise.setAttribute('result', 'grayNoise');
  noiseFilter.appendChild(feColorNoise);

  var feBlendNoise = document.createElementNS(NS, 'feBlend');
  feBlendNoise.setAttribute('in', 'SourceGraphic');
  feBlendNoise.setAttribute('in2', 'grayNoise');
  feBlendNoise.setAttribute('mode', 'overlay');
  noiseFilter.appendChild(feBlendNoise);
  
  defs.appendChild(noiseFilter);

  // ── Terrain glow filter (Frozen Synapse neon bloom) ──
  var glowFilter = document.createElementNS(NS, 'filter');
  glowFilter.setAttribute('id', 'terrain-glow');
  glowFilter.setAttribute('x', '-40%'); glowFilter.setAttribute('y', '-40%');
  glowFilter.setAttribute('width', '180%'); glowFilter.setAttribute('height', '180%');
  
  // Blur the source to create glow
  var feGlowBlur = document.createElementNS(NS, 'feGaussianBlur');
  feGlowBlur.setAttribute('in', 'SourceGraphic');
  feGlowBlur.setAttribute('stdDeviation', '3');
  feGlowBlur.setAttribute('result', 'glow');
  glowFilter.appendChild(feGlowBlur);

  // Brighten the glow
  var feGlowBrighten = document.createElementNS(NS, 'feColorMatrix');
  feGlowBrighten.setAttribute('in', 'glow');
  feGlowBrighten.setAttribute('type', 'matrix');
  feGlowBrighten.setAttribute('values', '1.5 0 0 0 0  0 1.5 0 0 0  0 0 1.5 0 0  0 0 0 1.2 0');
  feGlowBrighten.setAttribute('result', 'brightGlow');
  glowFilter.appendChild(feGlowBrighten);
  
  // Composite: glow behind source
  var feMergeGlow = document.createElementNS(NS, 'feMerge');
  var feMerge1 = document.createElementNS(NS, 'feMergeNode');
  feMerge1.setAttribute('in', 'brightGlow');
  feMergeGlow.appendChild(feMerge1);
  var feMerge2 = document.createElementNS(NS, 'feMergeNode');
  feMerge2.setAttribute('in', 'SourceGraphic');
  feMergeGlow.appendChild(feMerge2);
  glowFilter.appendChild(feMergeGlow);
  
  defs.appendChild(glowFilter);

  // ── Subtle scatter glow (softer, dimmer) ──
  var scatterGlowFilter = document.createElementNS(NS, 'filter');
  scatterGlowFilter.setAttribute('id', 'scatter-glow');
  scatterGlowFilter.setAttribute('x', '-30%'); scatterGlowFilter.setAttribute('y', '-30%');
  scatterGlowFilter.setAttribute('width', '160%'); scatterGlowFilter.setAttribute('height', '160%');
  
  var feScatterBlur = document.createElementNS(NS, 'feGaussianBlur');
  feScatterBlur.setAttribute('in', 'SourceGraphic');
  feScatterBlur.setAttribute('stdDeviation', '2');
  feScatterBlur.setAttribute('result', 'scGlow');
  scatterGlowFilter.appendChild(feScatterBlur);

  var feMergeScatter = document.createElementNS(NS, 'feMerge');
  var feMSc1 = document.createElementNS(NS, 'feMergeNode');
  feMSc1.setAttribute('in', 'scGlow');
  feMergeScatter.appendChild(feMSc1);
  var feMSc2 = document.createElementNS(NS, 'feMergeNode');
  feMSc2.setAttribute('in', 'SourceGraphic');
  feMergeScatter.appendChild(feMSc2);
  scatterGlowFilter.appendChild(feMergeScatter);
  
  defs.appendChild(scatterGlowFilter);

  // Dark board surface with subtle noise
  var boardBg = document.createElementNS(NS, 'rect');
  boardBg.setAttribute('x', '0');
  boardBg.setAttribute('y', '0');
  boardBg.setAttribute('width', '720');
  boardBg.setAttribute('height', '528');
  boardBg.setAttribute('fill', 'rgba(10,16,24,0.92)');
  boardBg.setAttribute('filter', 'url(#board-noise)');
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

// ── Frozen Synapse: Restyle terrain with glow ────────────
// Walls: teal/cyan with neon glow filter
// Floors: subtle gradient, slightly lighter than board
// Scatter: amber/warm glow, differentiated from ruins
(function applyFrozenSynapseStyle() {
  var terrainLayer = document.getElementById('terrain-layer');
  if (!terrainLayer) return;

  var allPaths = terrainLayer.querySelectorAll('path');
  allPaths.forEach(function(p) {
    var fill = p.getAttribute('fill') || '';
    
    if (fill.indexOf('106,114,114') !== -1) {
      // WALL paths — teal/cyan with glow
      p.setAttribute('fill', 'rgba(40,160,180,0.85)');
      p.setAttribute('stroke', 'rgba(60,200,220,0.9)');
      p.setAttribute('stroke-width', '1.2');
      p.setAttribute('filter', 'url(#terrain-glow)');
    } else if (fill.indexOf('58,64,64') !== -1) {
      // FLOOR paths — subtle dark teal
      p.setAttribute('fill', 'rgba(18,30,38,0.7)');
      p.setAttribute('stroke', 'rgba(40,160,180,0.25)');
      p.setAttribute('stroke-width', '0.8');
    } else if (fill.indexOf('58,48,24') !== -1) {
      // SCATTER terrain — warm amber/gold glow
      p.setAttribute('fill', 'rgba(30,24,12,0.6)');
      p.setAttribute('stroke', 'rgba(200,160,60,0.7)');
      p.setAttribute('stroke-width', '1.2');
      p.setAttribute('filter', 'url(#scatter-glow)');
    }
  });
})();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// ── Frozen Synapse: no drop shadows — glow replaces them ──
// (shadows defined inline in applyFrozenSynapseStyle above)

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
