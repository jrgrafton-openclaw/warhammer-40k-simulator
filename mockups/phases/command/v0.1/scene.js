/**
 * scene.js — Army data + initialisation wiring for the command phase prototype.
 * ES module entry point.
 *
 * Units are positioned post-move/fight for a ROUND 2 COMMAND PHASE scenario:
 * - Hellblasters reduced to 2 models (below half of 5 starting) — needs battle-shock
 * - All units well-spaced to avoid overlap
 * - Imperium units near OBJ 02 and OBJ 03 for VP scoring
 * - Orks hold OBJ 04, some near OBJ 01
 *
 * NOTE: Only Imperium (ACTIVE player) units get battle-shock tests.
 *       Boyz Mob (ork) is below half but is NOT tested (enemy turn).
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction,
         selectUnit } from '../../../shared/world/svg-renderer.js';
// Import command to register its selectUnit override and init
import { initCommand } from './command.js';
// Import WorldAPI so it's available (side-effect: wires up the facade)
import '../../../shared/world/world-api.js';

// ── Army positions — ROUND 2 POST-FIGHT scenario ────────
// PX_PER_INCH = 12, R32 = 8px (infantry), R40 = 9px (characters)
// OBJ 02 center: ~120, 264    OBJ 03 center: ~360, 264
// OBJ 04 center: ~600, 264    OBJ 01 center: ~360, 72
// Models need 2*R + gap between them to avoid overlap

simState.units = [
  // ── IMPERIUM ─────────────────────────────────────────
  // Assault Intercessors: near OBJ 03 (center battlefield)
  { id:'assault-intercessors', rosterIndex:0, faction:'imp',
    models:[
      {id:'ai1',x:340,y:245,r:R32},
      {id:'ai2',x:360,y:240,r:R32},
      {id:'ai3',x:380,y:245,r:R32},
      {id:'ai4',x:350,y:262,r:R32},
      {id:'ai5',x:370,y:262,r:R32}
    ], broken:false },

  // Primaris Lieutenant: between OBJ 02 and center, well clear
  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp',
    models:[{id:'pl1',x:160,y:240,r:R40}], broken:false },

  // Intercessor Squad A: near OBJ 02 (within 3" = 36px)
  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp',
    models:[
      {id:'isa1',x:95,y:245,r:R32},
      {id:'isa2',x:115,y:240,r:R32},
      {id:'isa3',x:135,y:245,r:R32},
      {id:'isa4',x:105,y:265,r:R32},
      {id:'isa5',x:125,y:265,r:R32}
    ], broken:false },

  // Hellblasters: BELOW HALF (2 of 5 starting) — mid-field, needs battle-shock
  { id:'hellblasters', rosterIndex:3, faction:'imp',
    startingStrength: 5,
    models:[
      {id:'hb1',x:270,y:190,r:R32},
      {id:'hb2',x:290,y:185,r:R32}
    ], broken:false },

  // Redemptor Dreadnought: south mid-field, well-spaced
  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp',
    models:[{id:'rd1',x:220,y:370,r:22,shape:'rect',w:43,h:25}], broken:false },

  // ── ORKS ─────────────────────────────────────────────
  // Boss Nob: Ork deployment zone
  { id:'boss-nob', rosterIndex:6, faction:'ork',
    models:[{id:'bn1',x:570,y:300,r:R40}], broken:false },

  // Nobz Mob: Ork side, spaced out
  { id:'nobz-mob', rosterIndex:7, faction:'ork',
    models:[
      {id:'nm1',x:540,y:190,r:R40},
      {id:'nm2',x:562,y:200,r:R40},
      {id:'nm3',x:551,y:222,r:R40}
    ], broken:false },

  // Mekboy: Ork rear
  { id:'mekboy', rosterIndex:8, faction:'ork',
    models:[{id:'mb1',x:620,y:350,r:R32}], broken:false },

  // Gretchin: near OBJ 04 (holding it)
  { id:'gretchin', rosterIndex:9, faction:'ork',
    models:[
      {id:'gr1',x:585,y:255,r:R32},
      {id:'gr2',x:605,y:250,r:R32},
      {id:'gr3',x:625,y:255,r:R32}
    ], broken:false },

  // Boyz Mob: BELOW HALF (4 of 10 starting) — Ork side
  // NOTE: This is an Ork unit — NOT tested for battle-shock (it's Imperium's turn)
  { id:'boyz-mob', rosterIndex:10, faction:'ork',
    startingStrength: 10,
    models:[
      {id:'bm1',x:470,y:310,r:R32},
      {id:'bm2',x:490,y:305,r:R32},
      {id:'bm3',x:480,y:328,r:R32},
      {id:'bm4',x:500,y:322,r:R32}
    ], broken:false }
];

// ── Initialise shared modules ────────────────────────────
renderTerrain();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// Start with no unit selected — card hidden
const unitCard = document.getElementById('unit-card');
if (unitCard) unitCard.classList.remove('visible');

// ── Initialise command phase interaction ─────────────────
initCommand();

// ── Build terrain collision AABBs ────────────────────────
const svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

// ── Build tall ruin footprint blockers for LoS ──────────
(function buildLosBlockers() {
  const NS = 'http://www.w3.org/2000/svg';
  const blockers = [];

  function parsePathPoints(d) {
    const pts = [];
    const re = /[ML]\s*([-\d.]+)[\s,]+([-\d.]+)/gi;
    let m;
    while ((m = re.exec(d)) !== null) pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
    return pts;
  }

  mapData.terrain.forEach(function(piece) {
    if (piece.type !== 'ruins' || !piece.paths || !piece.paths[0]) return;

    const floorPath = piece.paths[0];
    const pts = parsePathPoints(floorPath.d);
    if (pts.length < 3) return;

    const last = pts[pts.length - 1];
    if (Math.abs(pts[0].x - last.x) < 0.1 && Math.abs(pts[0].y - last.y) < 0.1) {
      pts.pop();
    }

    const ox = piece.origin[0], oy = piece.origin[1];
    const tfStr = 'translate(' + ox + ',' + oy + ') ' + piece.transform + ' translate(' + (-ox) + ',' + (-oy) + ')';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', tfStr);
    svgEl.appendChild(g);
    const consolidated = g.transform.baseVal.consolidate();
    svgEl.removeChild(g);
    if (!consolidated) return;

    const mat = consolidated.matrix;
    const det = mat.a * mat.d - mat.b * mat.c;
    if (Math.abs(det) < 0.001) return;

    const inv = {
      a:  mat.d / det, b: -mat.b / det,
      c: -mat.c / det, d:  mat.a / det,
      e: (mat.c * mat.f - mat.d * mat.e) / det,
      f: (mat.b * mat.e - mat.a * mat.f) / det
    };

    blockers.push({
      kind: 'tall-ruin',
      terrainId: piece.id,
      polygon: pts,
      iA: inv.a, iB: inv.b, iC: inv.c, iD: inv.d, iE: inv.e, iF: inv.f,
      fA: mat.a, fB: mat.b, fC: mat.c, fD: mat.d, fE: mat.e, fF: mat.f
    });
  });

  window._losBlockers = blockers;
})();

// ── Window globals for inline HTML handlers ──────────────
window.toggleFaction = function(el) {
  const body = el.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  const chevron = el.querySelector('.faction-chevron');
  if (chevron) chevron.textContent = body && body.style.display === 'none' ? '▸' : '▾';
};
window.toggleAA = function() {};

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
