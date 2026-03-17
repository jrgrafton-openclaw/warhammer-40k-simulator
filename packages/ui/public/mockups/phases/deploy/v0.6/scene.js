/**
 * scene.js — Army data + initialisation wiring for deployment v0.6.
 * ES module entry point. Imperium units start in the SVG Staging zone.
 * Ork units are pre-deployed on the board.
 * v0.5a adds: terrain drop shadows, space background.
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

// ── Initialise shared modules ────────────────────────────
renderTerrain();
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

  // Shadow filter: offset dark shadow for depth
  var filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', 'terrain-shadow');
  filter.setAttribute('x', '-30%');
  filter.setAttribute('y', '-30%');
  filter.setAttribute('width', '180%');
  filter.setAttribute('height', '180%');

  // Step 1: source graphic
  // Dark shadow offset (bottom-right)
  var feFlood = document.createElementNS(NS, 'feFlood');
  feFlood.setAttribute('flood-color', '#000000');
  feFlood.setAttribute('flood-opacity', '0.8');
  feFlood.setAttribute('result', 'shadowColor');

  var feComp = document.createElementNS(NS, 'feComposite');
  feComp.setAttribute('in', 'shadowColor');
  feComp.setAttribute('in2', 'SourceAlpha');
  feComp.setAttribute('operator', 'in');
  feComp.setAttribute('result', 'shadow');

  var feOffset = document.createElementNS(NS, 'feOffset');
  feOffset.setAttribute('in', 'shadow');
  feOffset.setAttribute('dx', '6');
  feOffset.setAttribute('dy', '6');
  feOffset.setAttribute('result', 'offsetShadow');

  var feBlur = document.createElementNS(NS, 'feGaussianBlur');
  feBlur.setAttribute('in', 'offsetShadow');
  feBlur.setAttribute('stdDeviation', '4');
  feBlur.setAttribute('result', 'blurredShadow');

  // Light edge highlight (top-left) — gives 3D raised effect
  var feFlood2 = document.createElementNS(NS, 'feFlood');
  feFlood2.setAttribute('flood-color', '#405870');
  feFlood2.setAttribute('flood-opacity', '0.35');
  feFlood2.setAttribute('result', 'lightColor');

  var feComp2 = document.createElementNS(NS, 'feComposite');
  feComp2.setAttribute('in', 'lightColor');
  feComp2.setAttribute('in2', 'SourceAlpha');
  feComp2.setAttribute('operator', 'in');
  feComp2.setAttribute('result', 'lightShape');

  var feOffset2 = document.createElementNS(NS, 'feOffset');
  feOffset2.setAttribute('in', 'lightShape');
  feOffset2.setAttribute('dx', '-2');
  feOffset2.setAttribute('dy', '-2');
  feOffset2.setAttribute('result', 'lightEdge');

  var feBlur2 = document.createElementNS(NS, 'feGaussianBlur');
  feBlur2.setAttribute('in', 'lightEdge');
  feBlur2.setAttribute('stdDeviation', '1.5');
  feBlur2.setAttribute('result', 'blurredLight');

  // Merge: shadow behind, light edge, source on top
  var feMerge = document.createElementNS(NS, 'feMerge');
  var mergeNode1 = document.createElementNS(NS, 'feMergeNode');
  mergeNode1.setAttribute('in', 'blurredShadow');
  var mergeNode2 = document.createElementNS(NS, 'feMergeNode');
  mergeNode2.setAttribute('in', 'blurredLight');
  var mergeNode3 = document.createElementNS(NS, 'feMergeNode');
  mergeNode3.setAttribute('in', 'SourceGraphic');
  feMerge.appendChild(mergeNode1);
  feMerge.appendChild(mergeNode2);
  feMerge.appendChild(mergeNode3);

  filter.appendChild(feFlood);
  filter.appendChild(feComp);
  filter.appendChild(feOffset);
  filter.appendChild(feBlur);
  filter.appendChild(feFlood2);
  filter.appendChild(feComp2);
  filter.appendChild(feOffset2);
  filter.appendChild(feBlur2);
  filter.appendChild(feMerge);
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

// ── Pan limits — centered, even on all sides ──
// Board center should be the center of the scrollable range.
(function addPanLimits() {
  var bf = document.getElementById('battlefield');
  var inner = document.getElementById('battlefield-inner');
  if (!bf || !inner) return;

  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.attributeName !== 'style') return;
      var t = inner.style.transform || '';
      var match = t.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/);
      if (!match) return;

      var curTx = parseFloat(match[1]);
      var curTy = parseFloat(match[2]);
      var curScale = parseFloat(match[3]);

      var bfW = bf.clientWidth;
      var bfH = bf.clientHeight;

      // Board play area is 720x528 SVG units.
      // Center of board = (360, 264) in SVG coords.
      // At scale, center of board in screen px = 360*scale + tx, 264*scale + ty
      // We want center of board to stay within the viewport +/- some margin.
      // "Centered pan": the board center can move ±panRange from viewport center.
      var boardCenterScreenX = 360 * curScale + curTx;
      var boardCenterScreenY = 264 * curScale + curTy;
      var viewCenterX = bfW / 2;
      var viewCenterY = bfH / 2;

      // Allow board center to be within ±60% of viewport size from viewport center
      var panRangeX = bfW * 0.6;
      var panRangeY = bfH * 0.6;

      var targetCenterX = Math.max(viewCenterX - panRangeX, Math.min(viewCenterX + panRangeX, boardCenterScreenX));
      var targetCenterY = Math.max(viewCenterY - panRangeY, Math.min(viewCenterY + panRangeY, boardCenterScreenY));

      // Convert back to tx/ty
      var clampedTx = targetCenterX - 360 * curScale;
      var clampedTy = targetCenterY - 264 * curScale;

      if (Math.abs(clampedTx - curTx) > 0.5 || Math.abs(clampedTy - curTy) > 0.5) {
        observer.disconnect();
        inner.style.transform = 'translate(' + clampedTx + 'px,' + clampedTy + 'px) scale(' + curScale + ')';
        observer.observe(inner, { attributes: true, attributeFilter: ['style'] });
      }
    });
  });

  observer.observe(inner, { attributes: true, attributeFilter: ['style'] });
})();

// ── Set initial camera pan to show staging + deployment zone ──
// With standard viewBox (0 0 720 528) and scale 0.5, the board renders normally.
// Staging zones are at negative x coords (overflow:visible makes them render).
// We need to pan RIGHT (positive tx) to reveal the staging area to the left of x=0.
// At scale 0.5, each SVG unit ≈ 0.7 display px. Staging center is at x≈-415.
// tx=350 shifts the canvas right enough to show staging + deployment zone together.
var inner = document.getElementById('battlefield-inner');
if (inner) {
  inner.style.transform = 'translate(350px, 0px) scale(0.5)';
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
