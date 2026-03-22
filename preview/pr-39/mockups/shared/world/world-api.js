/* world-api.js — THE coordinate contract (ES module)
 *
 * Provides a stable API for overlays, popups, and phase code to convert
 * between SVG world coords and screen/battlefield coords.
 */

import { callbacks } from '../state/store.js';
import { toBattlefieldCoords, getUnitAnchor, center } from '../lib/coord-helpers.js';
import { getCamera, resetCamera, selectUnit as baseSelectUnit, getMousePos } from './svg-renderer.js';

/**
 * Convert SVG coords → screen coords relative to #battlefield.
 */
function worldToScreen(svgX, svgY) {
  return toBattlefieldCoords(svgX, svgY);
}

/**
 * Convert screen coords (relative to #battlefield) → SVG coords.
 */
function screenToWorld(screenX, screenY) {
  var svg = document.getElementById('bf-svg');
  var field = document.getElementById('battlefield');
  if (!svg || !field) return { x: screenX, y: screenY, valid: false };
  var ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0, valid: false };
  var rect = field.getBoundingClientRect();
  var sx = screenX + rect.left;
  var sy = screenY + rect.top;
  return { x: (sx - ctm.e) / ctm.a, y: (sy - ctm.f) / ctm.d, valid: true };
}

/**
 * Get screen position for overlays/popups relative to a unit.
 * @param {string} unitId
 * @param {'popup'|'roll'} mode
 */
function apiGetUnitAnchor(unitId, mode) {
  return getUnitAnchor(unitId, mode);
}

/**
 * Get screen position for a specific model token.
 */
function getModelAnchor(modelId) {
  var el = document.querySelector('#layer-models .model-base[data-model-id="' + modelId + '"]');
  if (!el) return { x: 0, y: 0, valid: false };
  var field = document.getElementById('battlefield');
  if (!field) return { x: 0, y: 0, valid: false };
  var r = el.getBoundingClientRect();
  var fr = field.getBoundingClientRect();
  return { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height / 2, valid: true };
}

/**
 * Select a unit (delegates through callback chain so shooting.js can intercept).
 */
function apiSelectUnit(uid) {
  var fn = callbacks.selectUnit || baseSelectUnit;
  fn(uid);
}

/**
 * Get SVG coords from a mouse event.
 */
function apiGetMousePos(evt) {
  return getMousePos(evt);
}

// ── Exported contract object ──────────────────────────
export const WorldAPI = {
  worldToScreen: worldToScreen,
  screenToWorld: screenToWorld,
  getUnitAnchor: apiGetUnitAnchor,
  getModelAnchor: getModelAnchor,
  getCamera: getCamera,
  resetCamera: resetCamera,
  selectUnit: apiSelectUnit,
  getMousePos: apiGetMousePos
};

export default WorldAPI;
