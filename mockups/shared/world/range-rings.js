/* range-rings.js — Shared per-model range ring drawing (ES module)
 *
 * Draws SVG circles on #layer-range-rings centered on each model in a unit.
 * Used by both movement and shooting phases.
 */

import { simState, PX_PER_INCH } from '../state/store.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Draw per-model range rings for a unit.
 * @param {string} unitId
 * @param {Array<{radiusInches: number, fill: string, stroke: string}>} ranges
 */
export function drawPerModelRangeRings(unitId, ranges) {
  clearRangeRings();
  const layer = document.getElementById('layer-range-rings');
  if (!layer) return;

  const unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit || !unit.models.length) return;

  unit.models.forEach(function(model) {
    ranges.forEach(function(range) {
      var r = range.radiusInches * PX_PER_INCH;
      var circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', model.x);
      circle.setAttribute('cy', model.y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', range.fill);
      circle.setAttribute('stroke', range.stroke);
      circle.setAttribute('stroke-width', '1.5');
      circle.setAttribute('class', 'range-ring');
      circle.setAttribute('pointer-events', 'none');
      layer.appendChild(circle);
    });
  });
}

/**
 * Clear all range rings.
 */
export function clearRangeRings() {
  var layer = document.getElementById('layer-range-rings');
  if (layer) layer.innerHTML = '';
}
