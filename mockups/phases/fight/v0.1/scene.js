/**
 * scene.js — Army data + initialisation wiring for the fight phase prototype.
 * ES module entry point.
 *
 * Units are positioned for a MELEE ENGAGEMENT scenario:
 * - Assault Intercessors within 1" of Nobz Mob (engaged)
 * - Primaris Lieutenant within 1" of Boss Nob (engaged)
 * - Redemptor Dreadnought within 2" of Mekboy (pile-in candidate)
 * - Intercessor Squad A and Hellblasters further back (NOT engaged)
 * - Gretchin near OBJ 03, not engaged
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         selectUnit } from '../../../shared/world/svg-renderer.js';
// Import fight to register its selectUnit override and init
import { initFight } from './fight.js';
// Import WorldAPI so it's available (side-effect: wires up the facade)
import '../../../shared/world/world-api.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Army positions — MELEE ENGAGEMENT scenario ──────────
// PX_PER_INCH = 12, so 1" = 12px edge-to-edge
// R32 = 8px (infantry), R40 = 9px (characters)
// Engaged pairs are positioned so edge-to-edge < 12px (1")

simState.units = [
  // ── IMPERIUM ─────────────────────────────────────────
  // Assault Intercessors: engaged with Nobz Mob around center-board
  { id:'assault-intercessors', rosterIndex:0, faction:'imp',
    models:[
      {id:'ai1',x:335,y:250,r:R32},
      {id:'ai2',x:350,y:240,r:R32},
      {id:'ai3',x:365,y:250,r:R32},
      {id:'ai4',x:342,y:265,r:R32},
      {id:'ai5',x:358,y:265,r:R32}
    ], broken:false },

  // Primaris Lieutenant: engaged with Boss Nob (south of main melee)
  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp',
    models:[{id:'pl1',x:300,y:310,r:R40}], broken:false },

  // Intercessor Squad A: ~100px back from engagement (NOT engaged)
  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp',
    models:[
      {id:'isa1',x:220,y:180,r:R32},
      {id:'isa2',x:237,y:175,r:R32},
      {id:'isa3',x:254,y:180,r:R32},
      {id:'isa4',x:228,y:196,r:R32},
      {id:'isa5',x:246,y:196,r:R32}
    ], broken:false },

  // Hellblasters: ~100px back (NOT engaged)
  { id:'hellblasters', rosterIndex:3, faction:'imp',
    models:[
      {id:'hb1',x:160,y:200,r:R32},
      {id:'hb2',x:177,y:195,r:R32},
      {id:'hb3',x:194,y:200,r:R32},
      {id:'hb4',x:168,y:216,r:R32},
      {id:'hb5',x:185,y:216,r:R32}
    ], broken:false },

  // Redemptor Dreadnought: ~2" (24px) from Mekboy — pile-in candidate
  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp',
    models:[{id:'rd1',x:405,y:340,r:22,shape:'rect',w:43,h:25}], broken:false },

  // ── ORKS ─────────────────────────────────────────────
  // Boss Nob: engaged with Primaris Lieutenant
  { id:'boss-nob', rosterIndex:6, faction:'ork',
    models:[{id:'bn1',x:320,y:310,r:R40}], broken:false },

  // Nobz Mob: engaged with Assault Intercessors
  { id:'nobz-mob', rosterIndex:7, faction:'ork',
    models:[
      {id:'nm1',x:380,y:245,r:R40},
      {id:'nm2',x:395,y:258,r:R40},
      {id:'nm3',x:378,y:272,r:R40}
    ], broken:false },

  // Mekboy: close to Dreadnought but NOT in engagement (~2" away)
  { id:'mekboy', rosterIndex:8, faction:'ork',
    models:[{id:'mb1',x:438,y:345,r:R32}], broken:false },

  // Gretchin: near OBJ 03 (center), not engaged
  { id:'gretchin', rosterIndex:9, faction:'ork',
    models:[
      {id:'gr1',x:370,y:135,r:R32},
      {id:'gr2',x:388,y:130,r:R32},
      {id:'gr3',x:406,y:135,r:R32}
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

// ── Initialise fight interaction ─────────────────────────
initFight();

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

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
