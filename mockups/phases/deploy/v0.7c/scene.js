/**
 * scene.js — Army data + initialisation wiring for deployment v0.4.
 * ES module entry point. Imperium units start in the SVG Staging zone.
 * Ork units are pre-deployed on the board.
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

// ── Layer 1: Drop shadows on terrain ─────────────────────
(function() {
  var svgTerrain = document.getElementById('bf-svg-terrain');
  if (!svgTerrain) return;
  var NS = 'http://www.w3.org/2000/svg';

  // Get or create defs
  var defs = svgTerrain.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svgTerrain.insertBefore(defs, svgTerrain.firstChild);
  }

  // Shadow filter
  var filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', 'terrain-shadow');
  filter.setAttribute('x', '-20%'); filter.setAttribute('y', '-20%');
  filter.setAttribute('width', '140%'); filter.setAttribute('height', '140%');
  var shadow = document.createElementNS(NS, 'feDropShadow');
  shadow.setAttribute('dx', '4'); shadow.setAttribute('dy', '4');
  shadow.setAttribute('stdDeviation', '5');
  shadow.setAttribute('flood-color', 'rgba(0,0,0,0.6)');
  filter.appendChild(shadow);
  defs.appendChild(filter);

  // Apply shadow to all terrain groups
  var terrainGroups = document.querySelectorAll('#terrain-layer > g');
  terrainGroups.forEach(function(g) {
    g.setAttribute('filter', 'url(#terrain-shadow)');
  });

  // ── Layer 5: Texture patterns ──────────────────────────
  var texBase = '../../../shared/textures/img/';

  // Ruins floor pattern (concrete)
  var patRuins = document.createElementNS(NS, 'pattern');
  patRuins.setAttribute('id', 'tex-ruins');
  patRuins.setAttribute('patternUnits', 'userSpaceOnUse');
  patRuins.setAttribute('width', '128'); patRuins.setAttribute('height', '128');
  var imgRuins = document.createElementNS(NS, 'image');
  imgRuins.setAttribute('href', texBase + 'concrete-ruins.jpg');
  imgRuins.setAttribute('width', '128'); imgRuins.setAttribute('height', '128');
  imgRuins.setAttribute('opacity', '0.25');
  patRuins.appendChild(imgRuins);
  // Dark overlay rect inside pattern to tint
  var overlayRuins = document.createElementNS(NS, 'rect');
  overlayRuins.setAttribute('width', '128'); overlayRuins.setAttribute('height', '128');
  overlayRuins.setAttribute('fill', 'rgba(30,38,38,0.7)');
  patRuins.appendChild(overlayRuins);
  defs.appendChild(patRuins);

  // Walls pattern (brick)
  var patWalls = document.createElementNS(NS, 'pattern');
  patWalls.setAttribute('id', 'tex-walls');
  patWalls.setAttribute('patternUnits', 'userSpaceOnUse');
  patWalls.setAttribute('width', '128'); patWalls.setAttribute('height', '128');
  var imgWalls = document.createElementNS(NS, 'image');
  imgWalls.setAttribute('href', texBase + 'brick-walls.jpg');
  imgWalls.setAttribute('width', '128'); imgWalls.setAttribute('height', '128');
  imgWalls.setAttribute('opacity', '0.3');
  patWalls.appendChild(imgWalls);
  var overlayWalls = document.createElementNS(NS, 'rect');
  overlayWalls.setAttribute('width', '128'); overlayWalls.setAttribute('height', '128');
  overlayWalls.setAttribute('fill', 'rgba(50,56,56,0.65)');
  patWalls.appendChild(overlayWalls);
  defs.appendChild(patWalls);

  // Scatter pattern (metal)
  var patScatter = document.createElementNS(NS, 'pattern');
  patScatter.setAttribute('id', 'tex-scatter');
  patScatter.setAttribute('patternUnits', 'userSpaceOnUse');
  patScatter.setAttribute('width', '128'); patScatter.setAttribute('height', '128');
  var imgScatter = document.createElementNS(NS, 'image');
  imgScatter.setAttribute('href', texBase + 'metal-scatter.jpg');
  imgScatter.setAttribute('width', '128'); imgScatter.setAttribute('height', '128');
  imgScatter.setAttribute('opacity', '0.25');
  patScatter.appendChild(imgScatter);
  var overlayScatter = document.createElementNS(NS, 'rect');
  overlayScatter.setAttribute('width', '128'); overlayScatter.setAttribute('height', '128');
  overlayScatter.setAttribute('fill', 'rgba(35,28,14,0.7)');
  patScatter.appendChild(overlayScatter);
  defs.appendChild(patScatter);

  // Post-process terrain paths to use textured fills
  terrainGroups.forEach(function(g) {
    var paths = g.querySelectorAll('path');
    paths.forEach(function(p) {
      var fill = p.getAttribute('fill') || '';
      if (fill.indexOf('106,114,114') !== -1) {
        p.setAttribute('fill', 'url(#tex-walls)');
      } else if (fill.indexOf('58,64,64') !== -1) {
        p.setAttribute('fill', 'url(#tex-ruins)');
      } else if (fill.indexOf('58,48,24') !== -1) {
        p.setAttribute('fill', 'url(#tex-scatter)');
      }
    });
  });
})();

initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

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
