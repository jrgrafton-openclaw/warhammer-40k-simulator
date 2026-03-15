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
// Positioned to test shooting edge cases:
//   • Partial LoS (some models behind tall ruins, others peeking out)
//   • Full LoS block (entire unit behind terrain)
//   • Benefit of Cover (models inside ruin footprint → +1 save)
//   • Clear LoS at range (open ground targets)
//   • Mixed ranges (some in weapon range, some not)
simState.units = [
  // ── IMPERIUM ──
  // Assault Intercessors — spread along t3 ruin edge (192-288, 264-336)
  // 3 models peeking right of the ruin, 2 tucked behind it
  { id:'assault-intercessors', rosterIndex:0, faction:'imp',
    models:[{id:'ai1',x:295,y:275,r:R32},{id:'ai2',x:295,y:295,r:R32},{id:'ai3',x:295,y:315,r:R32},
            {id:'ai4',x:210,y:290,r:R32},{id:'ai5',x:210,y:310,r:R32}], broken:false },
  // Primaris Lieutenant — open ground left flank, clear LoS across board
  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp',
    models:[{id:'pl1',x:120,y:180,r:R40}], broken:false },
  // Intercessor Squad A — near top, behind t1 ruin edge (some peeking, some blocked)
  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp',
    models:[{id:'isa1',x:155,y:130,r:R32},{id:'isa2',x:172,y:125,r:R32},{id:'isa3',x:190,y:130,r:R32},
            {id:'isa4',x:162,y:148,r:R32},{id:'isa5',x:180,y:148,r:R32}], broken:false },
  // Hellblasters — mid-left, open position for long-range shooting
  { id:'hellblasters', rosterIndex:3, faction:'imp',
    models:[{id:'hb1',x:130,y:370,r:R32},{id:'hb2',x:147,y:365,r:R32},{id:'hb3',x:164,y:370,r:R32},
            {id:'hb4',x:138,y:386,r:R32},{id:'hb5',x:155,y:386,r:R32}], broken:false },
  // Redemptor Dreadnought — center-left, partially behind scatter terrain t4
  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp',
    models:[{id:'rd1',x:100,y:295,r:22,shape:'rect',w:43,h:25}], broken:false },

  // ── ORKS ──
  // Boss Nob — behind t11 ruin edge (528-624, 264-336), partially visible
  { id:'boss-nob', rosterIndex:6, faction:'ork',
    models:[{id:'bn1',x:635,y:300,r:R40}], broken:false },
  // Nobz Mob — straddling t10 ruin (456-600, 192-264): 1 model peeking left, 2 behind
  { id:'nobz-mob', rosterIndex:7, faction:'ork',
    models:[{id:'nm1',x:448,y:230,r:R40},{id:'nm2',x:520,y:220,r:R40},{id:'nm3',x:540,y:245,r:R40}], broken:false },
  // Mekboy — inside t11 ruin footprint (benefit of cover test)
  { id:'mekboy', rosterIndex:8, faction:'ork',
    models:[{id:'mb1',x:570,y:295,r:R32}], broken:false },
  // Gretchin — open ground right flank (clear LoS, easy targets)
  { id:'gretchin', rosterIndex:9, faction:'ork',
    models:[{id:'gr1',x:640,y:400,r:R32},{id:'gr2',x:658,y:395,r:R32},{id:'gr3',x:676,y:400,r:R32}], broken:false }
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
