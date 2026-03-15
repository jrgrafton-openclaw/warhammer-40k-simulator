/**
 * scene.js — Army data + initialisation wiring for the shooting phase prototype.
 * ES module entry point.
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         selectUnit } from '../../../shared/world/svg-renderer.js';
// Import shooting to register its selectUnit override and init
import { initShooting } from './shooting.js';
// Import WorldAPI so it's available (side-effect: wires up the facade)
import '../../../shared/world/world-api.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Army positions ─────────────────────────────────────
// Edge cases tested:
//   • Nobz Mob just right of t6 ruin — partial LoS obstruction
//   • Mekboy inside t14 ruin — Benefit of Cover (+1 save)
//   • Boss Nob open ground at medium range
//   • Gretchin open ground — clear LoS, easy targets
simState.units = [
  // ── IMPERIUM (original positions — validated clear ground) ──
  { id:'assault-intercessors', rosterIndex:0, faction:'imp',
    models:[{id:'ai1',x:165,y:233,r:R32},{id:'ai2',x:182,y:228,r:R32},{id:'ai3',x:199,y:233,r:R32},
            {id:'ai4',x:173,y:249,r:R32},{id:'ai5',x:190,y:249,r:R32}], broken:false },
  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp',
    models:[{id:'pl1',x:125,y:312,r:R40}], broken:false },
  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp',
    models:[{id:'isa1',x:222,y:200,r:R32},{id:'isa2',x:239,y:195,r:R32},{id:'isa3',x:256,y:200,r:R32},
            {id:'isa4',x:230,y:216,r:R32},{id:'isa5',x:248,y:216,r:R32}], broken:false },
  { id:'hellblasters', rosterIndex:3, faction:'imp',
    models:[{id:'hb1',x:80,y:200,r:R32},{id:'hb2',x:97,y:195,r:R32},{id:'hb3',x:114,y:200,r:R32},
            {id:'hb4',x:88,y:216,r:R32},{id:'hb5',x:105,y:216,r:R32}], broken:false },
  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp',
    models:[{id:'rd1',x:150,y:278,r:22,shape:'rect',w:43,h:25}], broken:false },

  // ── ORKS ──
  // Boss Nob — right flank, long range
  { id:'boss-nob', rosterIndex:6, faction:'ork',
    models:[{id:'bn1',x:560,y:118,r:R40}], broken:false },
  // Nobz Mob — pushed close to t6 ruin right edge (polygon ends ~x:360)
  // Creates partial LoS: some Imperial models see around t6, some are blocked
  { id:'nobz-mob', rosterIndex:7, faction:'ork',
    models:[{id:'nm1',x:400,y:128,r:R40},{id:'nm2',x:420,y:136,r:R40},{id:'nm3',x:410,y:158,r:R40}], broken:false },
  // Mekboy — positioned at t6/t14 ruin border for partial cover interaction
  { id:'mekboy', rosterIndex:8, faction:'ork',
    models:[{id:'mb1',x:338,y:258,r:R32}], broken:false },
  // Gretchin — near t6 ruin right edge, partial terrain obstruction
  // Some models just right of the ruin polygon, testing edge-of-ruin LoS
  { id:'gretchin', rosterIndex:9, faction:'ork',
    models:[{id:'gr1',x:370,y:250,r:R32},{id:'gr2',x:388,y:245,r:R32},{id:'gr3',x:406,y:250,r:R32}], broken:false }
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

// Block all unit dragging — shooting phase is position-locked
(function installShootDragBlock() {
  let _drag = null;
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get() { return _drag; },
    set(value) {
      // Block all model/unit drags — only allow null (drag end)
      if (value !== null) return;
      _drag = value;
    }
  });
})();

// ── Initialise shooting interaction ──────────────────────
initShooting();

// ── Build terrain collision AABBs ────────────────────────
const svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

// ── Build tall ruin footprint blockers for LoS ──────────
// Uses paths[0] (full floor footprint) for each ruins piece.
// Scatter terrain does NOT block LoS.
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

    // Remove closing duplicate point if present
    const last = pts[pts.length - 1];
    if (Math.abs(pts[0].x - last.x) < 0.1 && Math.abs(pts[0].y - last.y) < 0.1) {
      pts.pop();
    }

    // Compute transform matrix using SVG element
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

    // Inverse matrix (SVG → local)
    const inv = {
      a:  mat.d / det, b: -mat.b / det,
      c: -mat.c / det, d:  mat.a / det,
      e: (mat.c * mat.f - mat.d * mat.e) / det,
      f: (mat.b * mat.e - mat.a * mat.f) / det
    };

    blockers.push({
      kind: 'tall-ruin',
      terrainId: piece.id,
      polygon: pts,  // local-space polygon points
      // Inverse matrix (SVG → local)
      iA: inv.a, iB: inv.b, iC: inv.c, iD: inv.d, iE: inv.e, iF: inv.f,
      // Forward matrix (local → SVG)
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
