/**
 * scene.js — Army data + initialisation wiring for deployment v0.5a.
 * ES module entry point. Imperium units start in the SVG Staging zone.
 * Ork units are pre-deployed on the board.
 * v0.6e adds: fog-of-war background, SVG grid overlay fix.
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
    lineH.setAttribute('data-grid', 'minor');
    gridPat.appendChild(lineH);

    var lineV = document.createElementNS(NS, 'line');
    lineV.setAttribute('x1', String(i)); lineV.setAttribute('y1', '0');
    lineV.setAttribute('x2', String(i)); lineV.setAttribute('y2', '60');
    lineV.setAttribute('stroke', 'rgba(201,163,82,0.025)');
    lineV.setAttribute('stroke-width', '0.5');
    lineV.setAttribute('data-grid', 'minor');
    gridPat.appendChild(lineV);
  }

  // Major grid lines (60px spacing = pattern boundary)
  var majorH = document.createElementNS(NS, 'line');
  majorH.setAttribute('x1', '0'); majorH.setAttribute('y1', '0');
  majorH.setAttribute('x2', '60'); majorH.setAttribute('y2', '0');
  majorH.setAttribute('stroke', 'rgba(201,163,82,0.055)');
  majorH.setAttribute('stroke-width', '0.5');
  majorH.setAttribute('data-grid', 'major');
  gridPat.appendChild(majorH);

  var majorV = document.createElementNS(NS, 'line');
  majorV.setAttribute('x1', '0'); majorV.setAttribute('y1', '0');
  majorV.setAttribute('x2', '0'); majorV.setAttribute('y2', '60');
  majorV.setAttribute('stroke', 'rgba(201,163,82,0.055)');
  majorV.setAttribute('stroke-width', '0.5');
  majorV.setAttribute('data-grid', 'major');
  gridPat.appendChild(majorV);

  defs.appendChild(gridPat);

  // Board surface — massive to cover any zoom/pan combination
  // Centered on the battlefield midpoint (360, 264)
  var SURFACE_SIZE = 5000;
  var boardBg = document.createElementNS(NS, 'rect');
  boardBg.setAttribute('id', 'board-surface');
  boardBg.setAttribute('x', String(360 - SURFACE_SIZE / 2));
  boardBg.setAttribute('y', String(264 - SURFACE_SIZE / 2));
  boardBg.setAttribute('width', String(SURFACE_SIZE));
  boardBg.setAttribute('height', String(SURFACE_SIZE));
  boardBg.setAttribute('fill', '#080e16');
  terrainSvg.insertBefore(boardBg, terrainSvg.firstChild);

  // Grid overlay rect — originates from battlefield center, same size
  var gridRect = document.createElementNS(NS, 'rect');
  gridRect.setAttribute('id', 'board-grid-rect');
  gridRect.setAttribute('x', String(360 - SURFACE_SIZE / 2));
  gridRect.setAttribute('y', String(264 - SURFACE_SIZE / 2));
  gridRect.setAttribute('width', String(SURFACE_SIZE));
  gridRect.setAttribute('height', String(SURFACE_SIZE));
  gridRect.setAttribute('fill', 'url(#board-grid)');
  gridRect.setAttribute('pointer-events', 'none');
  boardBg.after(gridRect);

  // ── Ground texture defs ──
  defs.innerHTML += '<radialGradient id="grd-depth" cx="50%" cy="45%" r="65%"><stop offset="0%" stop-color="#0e1822"/><stop offset="100%" stop-color="#060a0e"/></radialGradient>' +
    '<radialGradient id="grd-warm" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#14181e"/><stop offset="50%" stop-color="#0c1018"/><stop offset="100%" stop-color="#060a0e"/></radialGradient>' +
    '<radialGradient id="grd-warm-tint" cx="50%" cy="40%" r="50%"><stop offset="0%" stop-color="rgba(40,30,15,0.06)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>' +
    '<radialGradient id="grd-imp-pool" cx="22%" cy="50%" r="35%"><stop offset="0%" stop-color="rgba(0,80,120,0.04)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>' +
    '<radialGradient id="grd-ork-pool" cx="78%" cy="50%" r="35%"><stop offset="0%" stop-color="rgba(120,30,10,0.04)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>' +
    '<pattern id="slab-pat" width="60" height="60" patternUnits="userSpaceOnUse">' +
      '<rect width="60" height="60" fill="#0b1018"/>' +
      '<rect x="1" y="1" width="58" height="58" fill="#0d1420" rx="1"/>' +
      '<line x1="0" y1="0" x2="60" y2="0" stroke="#0a0e14" stroke-width="1.5"/>' +
      '<line x1="0" y1="0" x2="0" y2="60" stroke="#0a0e14" stroke-width="1.5"/>' +
    '</pattern>';

  // ── Ground texture groups (100% larger, centered on play area) ──
  var groundStyles = [
    { id: 'ground-gradient', innerHTML: '<rect x="-360" y="-264" width="1440" height="1056" fill="url(#grd-depth)"/><rect x="-360" y="-264" width="1440" height="1056" fill="url(#slab-pat)" opacity="0.15"/>' },
    { id: 'ground-warm', innerHTML: '<rect x="-360" y="-264" width="1440" height="1056" fill="url(#grd-warm)"/><rect x="-360" y="-264" width="1440" height="1056" fill="url(#grd-warm-tint)"/><rect x="-360" y="-264" width="1440" height="1056" fill="url(#slab-pat)" opacity="0.1"/>' },
    { id: 'ground-dual', innerHTML: '<rect x="-360" y="-264" width="1440" height="1056" fill="url(#grd-depth)"/><rect x="-360" y="-264" width="1440" height="1056" fill="url(#grd-imp-pool)"/><rect x="-360" y="-264" width="1440" height="1056" fill="url(#grd-ork-pool)"/><rect x="-360" y="-264" width="1440" height="1056" fill="url(#slab-pat)" opacity="0.08"/>' }
  ];

  // Insert ground groups after gridRect but before the first zone element
  var firstZone = terrainSvg.querySelector('.offboard-zone, .staging-zone-bg');
  groundStyles.forEach(function(gs) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('id', gs.id);
    g.setAttribute('pointer-events', 'none');
    g.innerHTML = gs.innerHTML;
    g.style.display = gs.id === 'ground-gradient' ? '' : 'none';
    if (firstZone) {
      terrainSvg.insertBefore(g, firstZone);
    } else {
      terrainSvg.appendChild(g);
    }
  });

  // ── Off-board zones: clear fill (vignettes replace it) ──
  var zoneMap = [
    { cls: 'staging-zone-bg' },
    { cls: 'ds-zone-bg' },
    { cls: 'reserves-zone-bg' }
  ];
  zoneMap.forEach(function(zm) {
    var rect = terrainSvg.querySelector('.' + zm.cls);
    if (!rect) return;
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'none');
  });

  // ── Edge vignette — fade board edges to pure black ──
  // Vignettes rendered in a SEPARATE SVG at z-index:8 (above objectives/units)
  var vigColor = '#000000';

  var DEPTH = 200; // default vignette depth at ground texture boundary

  var vigSvg = document.createElementNS(NS, 'svg');
  vigSvg.setAttribute('id', 'bf-svg-vignette');
  vigSvg.setAttribute('viewBox', '0 0 720 528');
  vigSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  vigSvg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:8;overflow:visible;';

  var vigDefs = document.createElementNS(NS, 'defs');
  vigSvg.appendChild(vigDefs);

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
    lg.innerHTML = '<stop offset="0%" stop-color="' + vigColor + '" stop-opacity="0.95"/>' +
      '<stop offset="35%" stop-color="' + vigColor + '" stop-opacity="0.4"/>' +
      '<stop offset="100%" stop-color="' + vigColor + '" stop-opacity="0"/>';
    vigDefs.appendChild(lg);
  });

  // Organic vignette noise filter (feTurbulence displacement)
  var vigFilter = document.createElementNS(NS, 'filter');
  vigFilter.setAttribute('id', 'vig-noise');
  vigFilter.setAttribute('x', '-20%');
  vigFilter.setAttribute('y', '-20%');
  vigFilter.setAttribute('width', '140%');
  vigFilter.setAttribute('height', '140%');
  vigFilter.innerHTML = '<feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="40" xChannelSelector="R" yChannelSelector="G"/>';
  vigDefs.appendChild(vigFilter);

  var vigGroup = document.createElementNS(NS, 'g');
  vigGroup.setAttribute('pointer-events', 'none');
  vigGroup.setAttribute('filter', 'url(#vig-noise)');

  // Vignette rects at GROUND TEXTURE boundary (-360,-264,1440,1056)
  [
    { gradId: 'vig-l', rectId: 'vig-rect-l', x: -360, y: -264, w: DEPTH, h: 1056 },
    { gradId: 'vig-r', rectId: 'vig-rect-r', x: 1080 - DEPTH, y: -264, w: DEPTH, h: 1056 },
    { gradId: 'vig-t', rectId: 'vig-rect-t', x: -360, y: -264, w: 1440, h: DEPTH },
    { gradId: 'vig-b', rectId: 'vig-rect-b', x: -360, y: 1056 - 264 - DEPTH, w: 1440, h: DEPTH }
  ].forEach(function(s) {
    var r = document.createElementNS(NS, 'rect');
    r.setAttribute('id', s.rectId);
    r.setAttribute('x', String(s.x)); r.setAttribute('y', String(s.y));
    r.setAttribute('width', String(s.w)); r.setAttribute('height', String(s.h));
    r.setAttribute('fill', 'url(#' + s.gradId + ')');
    vigGroup.appendChild(r);
  });
  vigSvg.appendChild(vigGroup);

  // ── Zone vignettes — 4 linear gradients per off-board zone ──
  var zoneVigInfo = [
    { key: 'staging', color: '0,212,255', x: -540, y: 20, w: 250, h: 488 },
    { key: 'ds',      color: '255,170,0', x: -270, y: 20, w: 250, h: 230 },
    { key: 'reserves',color: '186,126,255', x: -270, y: 278, w: 250, h: 230 }
  ];
  var ZONE_VIG_DEPTH = 80;
  var ZONE_VIG_OPACITY = 0.25;
  zoneVigInfo.forEach(function(zi) {
    var dirs = [
      { suffix: '-l', x1: '0', y1: '0', x2: '1', y2: '0' },
      { suffix: '-r', x1: '1', y1: '0', x2: '0', y2: '0' },
      { suffix: '-t', x1: '0', y1: '0', x2: '0', y2: '1' },
      { suffix: '-b', x1: '0', y1: '1', x2: '0', y2: '0' }
    ];
    dirs.forEach(function(d) {
      var lg = document.createElementNS(NS, 'linearGradient');
      lg.setAttribute('id', 'zvig-' + zi.key + d.suffix);
      lg.setAttribute('x1', d.x1); lg.setAttribute('y1', d.y1);
      lg.setAttribute('x2', d.x2); lg.setAttribute('y2', d.y2);
      lg.innerHTML =
        '<stop offset="0%" stop-color="rgb(' + zi.color + ')" stop-opacity="' + ZONE_VIG_OPACITY + '"/>' +
        '<stop offset="40%" stop-color="rgb(' + zi.color + ')" stop-opacity="0.08"/>' +
        '<stop offset="100%" stop-color="rgb(' + zi.color + ')" stop-opacity="0"/>';
      vigDefs.appendChild(lg);
    });
    var sides = [
      { suffix: '-l', x: zi.x, y: zi.y, w: ZONE_VIG_DEPTH, h: zi.h },
      { suffix: '-r', x: zi.x + zi.w - ZONE_VIG_DEPTH, y: zi.y, w: ZONE_VIG_DEPTH, h: zi.h },
      { suffix: '-t', x: zi.x, y: zi.y, w: zi.w, h: ZONE_VIG_DEPTH },
      { suffix: '-b', x: zi.x, y: zi.y + zi.h - ZONE_VIG_DEPTH, w: zi.w, h: ZONE_VIG_DEPTH }
    ];
    sides.forEach(function(s) {
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('id', 'zvig-rect-' + zi.key + s.suffix);
      r.setAttribute('x', String(s.x));
      r.setAttribute('y', String(s.y));
      r.setAttribute('width', String(s.w));
      r.setAttribute('height', String(s.h));
      r.setAttribute('fill', 'url(#zvig-' + zi.key + s.suffix + ')');
      r.setAttribute('pointer-events', 'none');
      r.classList.add('zone-vig-rect');
      vigSvg.appendChild(r);
    });
  });

  // Append vignette SVG to battlefield-inner (same parent as other SVGs)
  var bfInner = document.getElementById('battlefield-inner');
  if (bfInner) bfInner.appendChild(vigSvg);

  // ── Drag overlay SVG — models reparented here during drag to render above vignette ──
  var dragSvg = document.createElementNS(NS, 'svg');
  dragSvg.setAttribute('id', 'bf-svg-drag');
  dragSvg.setAttribute('viewBox', '0 0 720 528');
  dragSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  dragSvg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9;overflow:visible;';
  var dragHulls = document.createElementNS(NS, 'g');
  dragHulls.setAttribute('id', 'drag-hulls');
  dragSvg.appendChild(dragHulls);
  var dragModels = document.createElementNS(NS, 'g');
  dragModels.setAttribute('id', 'drag-models');
  dragSvg.appendChild(dragModels);
  bfInner.appendChild(dragSvg);
})();

// ── Initialise shared modules ────────────────────────────
renderTerrain();
initAllTooltips();
initBoard({ initialScale: 0.47 });
initBattleControls();
initModelInteraction();

// ── Pan limits ──
// Clamping now handled inside camera.js applyTx() — single source of truth.

// ── Set initial camera pan to show staging + deployment zone ──
// Use setCamera() so camera.js internal state (tx/ty/scale) stays in sync
// with the DOM. Writing inner.style.transform directly causes a desync —
// camera.js thinks tx=0 and the first drag snaps to centre.
setCamera(0, 0, 0.47);

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
