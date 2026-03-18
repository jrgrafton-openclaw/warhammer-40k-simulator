/**
 * scene.js — Army data + initialisation wiring for deployment v0.5a.
 * ES module entry point. Imperium units start in the SVG Staging zone.
 * Ork units are pre-deployed on the board.
 * v0.6i: Combined — extended bleed + edge vignette + depth blur pit effect.
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

  // ── v0.6i: COMBINED — Extended bleed + edge vignette + depth blur ──

  // 1. Extended bleed zone (same as v0.6g)
  var BLEED = 400;
  var bx = -BLEED, by = -BLEED;
  var bw = 720 + BLEED * 2, bh = 528 + BLEED * 2;

  // Radial gradient mask for bleed fade
  var maskGrad = document.createElementNS(NS, 'radialGradient');
  maskGrad.setAttribute('id', 'bleed-fade');
  maskGrad.setAttribute('cx', '50%'); maskGrad.setAttribute('cy', '50%');
  maskGrad.setAttribute('rx', '50%'); maskGrad.setAttribute('ry', '50%');
  [
    { offset: '0%', opacity: '1' },
    { offset: '40%', opacity: '1' },
    { offset: '65%', opacity: '0.85' },
    { offset: '80%', opacity: '0.5' },
    { offset: '90%', opacity: '0.2' },
    { offset: '100%', opacity: '0' }
  ].forEach(function(s) {
    var stop = document.createElementNS(NS, 'stop');
    stop.setAttribute('offset', s.offset);
    stop.setAttribute('stop-color', 'white');
    stop.setAttribute('stop-opacity', s.opacity);
    maskGrad.appendChild(stop);
  });
  defs.appendChild(maskGrad);

  var mask = document.createElementNS(NS, 'mask');
  mask.setAttribute('id', 'bleed-mask');
  mask.setAttribute('maskUnits', 'objectBoundingBox');
  mask.setAttribute('maskContentUnits', 'objectBoundingBox');
  var maskRect = document.createElementNS(NS, 'rect');
  maskRect.setAttribute('x', '0'); maskRect.setAttribute('y', '0');
  maskRect.setAttribute('width', '1'); maskRect.setAttribute('height', '1');
  maskRect.setAttribute('fill', 'url(#bleed-fade)');
  mask.appendChild(maskRect);
  defs.appendChild(mask);

  // Extended board surface with bleed + fade
  var boardBg = document.createElementNS(NS, 'rect');
  boardBg.setAttribute('x', String(bx));
  boardBg.setAttribute('y', String(by));
  boardBg.setAttribute('width', String(bw));
  boardBg.setAttribute('height', String(bh));
  boardBg.setAttribute('fill', 'rgba(8,14,22,0.92)');
  boardBg.setAttribute('mask', 'url(#bleed-mask)');
  terrainSvg.insertBefore(boardBg, terrainSvg.firstChild);

  // Grid overlay — playable area only
  var gridRect = document.createElementNS(NS, 'rect');
  gridRect.setAttribute('x', '0');
  gridRect.setAttribute('y', '0');
  gridRect.setAttribute('width', '720');
  gridRect.setAttribute('height', '528');
  gridRect.setAttribute('fill', 'url(#board-grid)');
  gridRect.setAttribute('pointer-events', 'none');
  boardBg.after(gridRect);

  // 2. Edge vignette (same as v0.6h) — darken board perimeter
  var VIGNETTE_DEPTH = 100;
  var vigColor = '#2a2830';

  var gradDefs = [
    { id: 'vig-l', x1: '0', y1: '0', x2: '1', y2: '0' },
    { id: 'vig-r', x1: '1', y1: '0', x2: '0', y2: '0' },
    { id: 'vig-t', x1: '0', y1: '0', x2: '0', y2: '1' },
    { id: 'vig-b', x1: '0', y1: '1', x2: '0', y2: '0' }
  ];
  gradDefs.forEach(function(g) {
    var lg = document.createElementNS(NS, 'linearGradient');
    lg.setAttribute('id', g.id);
    lg.setAttribute('x1', g.x1); lg.setAttribute('y1', g.y1);
    lg.setAttribute('x2', g.x2); lg.setAttribute('y2', g.y2);
    lg.innerHTML = '<stop offset="0%" stop-color="' + vigColor + '" stop-opacity="0.85"/><stop offset="100%" stop-color="' + vigColor + '" stop-opacity="0"/>';
    defs.appendChild(lg);
  });

  var vigGroup = document.createElementNS(NS, 'g');
  vigGroup.setAttribute('pointer-events', 'none');
  vigGroup.setAttribute('style', 'mix-blend-mode: multiply;');

  [
    { id: 'vig-l', x: 0, y: 0, w: VIGNETTE_DEPTH, h: 528 },
    { id: 'vig-r', x: 720 - VIGNETTE_DEPTH, y: 0, w: VIGNETTE_DEPTH, h: 528 },
    { id: 'vig-t', x: 0, y: 0, w: 720, h: VIGNETTE_DEPTH },
    { id: 'vig-b', x: 0, y: 528 - VIGNETTE_DEPTH, w: 720, h: VIGNETTE_DEPTH }
  ].forEach(function(s) {
    var r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(s.x)); r.setAttribute('y', String(s.y));
    r.setAttribute('width', String(s.w)); r.setAttribute('height', String(s.h));
    r.setAttribute('fill', 'url(#' + s.id + ')');
    vigGroup.appendChild(r);
  });
  terrainSvg.appendChild(vigGroup);
})();

// ── Initialise shared modules ────────────────────────────
renderTerrain();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

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
// Use setCamera() so camera.js internal state (tx/ty/scale) stays in sync
// with the DOM. Writing inner.style.transform directly causes a desync —
// camera.js thinks tx=0 and the first drag snaps to centre.
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
