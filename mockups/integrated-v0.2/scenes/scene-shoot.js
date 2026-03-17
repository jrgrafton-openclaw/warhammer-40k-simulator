/**
 * scene-shoot.js — Thin wrapper around phases/shoot/v0.9/shooting.js.
 * Exports initShoot() and cleanupShoot() for the integrated app.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { selectUnit as baseSelectUnit } from '../../shared/world/svg-renderer.js';
import { clearRangeRings } from '../../shared/world/range-rings.js';
import { initShooting, cleanupShooting } from '../../phases/shoot/v0.9/shooting.js';
import { mapData } from '../../shared/state/terrain-data.js';

// ── Build LoS blockers from terrain ruin footprints ──────
function buildLosBlockers() {
  var NS = 'http://www.w3.org/2000/svg';
  var svgEl = document.getElementById('bf-svg');
  var blockers = [];

  function parsePathPoints(d) {
    var pts = [];
    var re = /[ML]\s*([-\d.]+)[\s,]+([-\d.]+)/gi;
    var m;
    while ((m = re.exec(d)) !== null) pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
    return pts;
  }

  mapData.terrain.forEach(function(piece) {
    if (piece.type !== 'ruins' || !piece.paths || !piece.paths[0]) return;

    var floorPath = piece.paths[0];
    var pts = parsePathPoints(floorPath.d);
    if (pts.length < 3) return;

    // Remove closing duplicate point if present
    var last = pts[pts.length - 1];
    if (Math.abs(pts[0].x - last.x) < 0.1 && Math.abs(pts[0].y - last.y) < 0.1) {
      pts.pop();
    }

    // Compute transform matrix using SVG element
    var ox = piece.origin[0], oy = piece.origin[1];
    var tfStr = 'translate(' + ox + ',' + oy + ') ' + piece.transform + ' translate(' + (-ox) + ',' + (-oy) + ')';
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', tfStr);
    svgEl.appendChild(g);
    var consolidated = g.transform.baseVal.consolidate();
    svgEl.removeChild(g);
    if (!consolidated) return;

    var mat = consolidated.matrix;
    var det = mat.a * mat.d - mat.b * mat.c;
    if (Math.abs(det) < 0.001) return;

    // Inverse matrix (SVG → local)
    var inv = {
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

  return blockers;
}

// ── Init ─────────────────────────────────────────────────
export function initShoot() {
  // 1. Build LoS blockers from terrain data
  window._losBlockers = buildLosBlockers();

  // 2. Block all unit dragging — shooting phase is position-locked
  var _drag = null;
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get: function() { return _drag; },
    set: function(value) {
      if (value !== null) return;
      _drag = value;
    }
  });

  // 3. Init shooting interaction
  initShooting();
}

// ── Cleanup ──────────────────────────────────────────────
export function cleanupShoot() {
  // 1. Run shooting.js's own cleanup
  cleanupShooting();

  // 2. Remove the drag interceptor
  delete simState.drag;
  simState.drag = null;

  // 3. Clear shoot-specific callback overrides
  callbacks.selectUnit = null;
  callbacks.afterRender = null;

  // 4. Clear LoS blockers
  window._losBlockers = [];

  // 5. Deselect any unit
  baseSelectUnit(null);
}
