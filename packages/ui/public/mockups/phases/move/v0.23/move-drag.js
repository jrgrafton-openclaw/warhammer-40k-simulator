/**
 * move-drag.js — Drag enforcement + rendering overlays for movement phase.
 *
 * Split from movement.js for maintainability.
 */

import { PX_PER_INCH, simState, currentUnit, activeRangeTypes } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { renderModels, resolveOverlaps } from '../../../shared/world/svg-renderer.js';
import { canBreachTerrain, resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { renderPathDebug } from '../../../shared/world/pathfinding.js';
import { clearRangeRings, drawPerModelRangeRings } from '../../../shared/world/range-rings.js';
import { moveState, phaseTurnStarts, _modelPathCache, getMoveRangePx,
         computeModelPaths, ACTIVE_PLAYER_FACTION, MOVE_RING_COLOR,
         ADVANCE_RING_COLOR, getFactionColor,
         updateWallCollisionWarning } from './move-helpers.js';

// ── Helpers ────────────────────────────────────────────
function getDragUnitId() {
  if (!simState.drag) return null;
  if (simState.drag.type === 'unit') return simState.drag.unit.id;
  if (simState.drag.type === 'model') {
    var m = simState.drag.model;
    var unit = simState.units.find(function(u) { return u.models.includes(m); });
    return unit ? unit.id : null;
  }
  return null;
}

function doUnitDragCollisions(unit) {
  resolveUnitDragCollisions(unit, simState.units);
}

// ── Draw move/advance range rings ──────────────────────
export function drawMoveRangeRings(uid, mode) {
  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit) return;
  var layer = document.getElementById('layer-range-rings');
  if (!layer) return;
  layer.innerHTML = '';

  var NS = 'http://www.w3.org/2000/svg';
  var isAdvance = mode === 'advance';
  var bonus = isAdvance ? ((moveState.advanceDie !== null) ? moveState.advanceDie : 3.5) : 0;
  var radiusPx = (UNITS[uid].M + bonus) * PX_PER_INCH;
  var color = isAdvance ? ADVANCE_RING_COLOR : MOVE_RING_COLOR;

  unit.models.forEach(function(m) {
    var start = phaseTurnStarts[m.id];
    if (!start) return;
    var circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', start.x);
    circle.setAttribute('cy', start.y);
    circle.setAttribute('r', radiusPx);
    circle.setAttribute('fill', color.fill);
    circle.setAttribute('stroke', color.stroke);
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('class', 'range-ring');
    circle.setAttribute('pointer-events', 'none');
    layer.appendChild(circle);
  });
}

// ── Render overlays (ghosts, rulers) ───────────────────
export function renderMoveOverlays(uid) {
  var layerGhosts = document.getElementById('layer-move-ghosts');
  if (!layerGhosts) return;
  layerGhosts.innerHTML = '';
  if (!moveState.mode || !uid) return;
  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit || unit.faction !== ACTIVE_PLAYER_FACTION) return;

  var NS = 'http://www.w3.org/2000/svg';
  var color = getFactionColor(uid);

  unit.models.forEach(function(m) {
    var start = phaseTurnStarts[m.id]; if (!start) return;
    var ghost;
    if (m.shape === 'rect') {
      ghost = document.createElementNS(NS, 'rect');
      ghost.setAttribute('x', start.x - m.w/2); ghost.setAttribute('y', start.y - m.h/2);
      ghost.setAttribute('width', m.w); ghost.setAttribute('height', m.h);
      ghost.setAttribute('rx', '5'); ghost.setAttribute('ry', '5');
    } else {
      ghost = document.createElementNS(NS, 'circle');
      ghost.setAttribute('cx', start.x); ghost.setAttribute('cy', start.y); ghost.setAttribute('r', m.r);
    }
    ghost.setAttribute('class', 'move-ghost');
    ghost.style.stroke = color; ghost.style.strokeWidth = '1.5'; ghost.style.pointerEvents = 'none';
    layerGhosts.appendChild(ghost);
  });

  renderMoveRulers(uid);
}

function renderMoveRulers(uid) {
  var layerRulers = document.getElementById('layer-move-rulers');
  if (!layerRulers) return;
  layerRulers.innerHTML = '';
  if (!moveState.mode || !uid) return;
  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit) return;
  var NS = 'http://www.w3.org/2000/svg';
  var color = getFactionColor(uid);
  var rangePx = getMoveRangePx(uid, moveState.mode === 'advance');
  var usePathCost = !canBreachTerrain(unit);

  unit.models.forEach(function(m) {
    var ts = phaseTurnStarts[m.id]; if (!ts) return;
    var dx = m.x - ts.x, dy = m.y - ts.y, straightDist = Math.hypot(dx, dy);
    if (straightDist < 1) return;

    if (usePathCost && _modelPathCache[m.id]) {
      var pathData = _modelPathCache[m.id];
      var pathCost = pathData.cost;
      var overRange = pathCost > rangePx + 0.5;
      var waypoints = pathData.path;

      if (waypoints.length >= 2) {
        var points = waypoints.map(function(p) { return p.x + ',' + p.y; }).join(' ');
        var polyline = document.createElementNS(NS, 'polyline');
        polyline.setAttribute('points', points);
        polyline.setAttribute('class', 'move-ruler');
        polyline.setAttribute('fill', 'none');
        polyline.style.stroke = overRange ? '#ff3333' : color;
        polyline.style.strokeDasharray = '4,3';
        layerRulers.appendChild(polyline);
      }

      var labelPt = { x: (ts.x + m.x) / 2, y: (ts.y + m.y) / 2 };
      var label = document.createElementNS(NS, 'text');
      label.setAttribute('x', labelPt.x); label.setAttribute('y', labelPt.y - 4);
      label.setAttribute('class', 'move-ruler-label'); label.setAttribute('text-anchor', 'middle');
      label.textContent = (pathCost / PX_PER_INCH).toFixed(1) + '"';
      if (overRange) label.style.fill = '#ff3333';
      layerRulers.appendChild(label);
    } else if (usePathCost && _modelPathCache[m.id] === null) {
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', ts.x); line.setAttribute('y1', ts.y);
      line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
      line.setAttribute('class', 'move-ruler');
      line.style.stroke = '#ff3333';
      line.style.strokeDasharray = '2,4';
      layerRulers.appendChild(line);
    } else {
      var overRange = straightDist > rangePx + 0.5;

      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', ts.x); line.setAttribute('y1', ts.y);
      line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
      line.setAttribute('class', 'move-ruler');
      line.style.stroke = overRange ? '#ff3333' : color;
      layerRulers.appendChild(line);

      var label = document.createElementNS(NS, 'text');
      label.setAttribute('x', (ts.x + m.x) / 2); label.setAttribute('y', (ts.y + m.y) / 2 - 4);
      label.setAttribute('class', 'move-ruler-label'); label.setAttribute('text-anchor', 'middle');
      label.textContent = (straightDist / PX_PER_INCH).toFixed(1) + '"';
      layerRulers.appendChild(label);
    }
  });
}

export function clearMoveOverlays() {
  ['layer-move-ghosts', 'layer-move-rulers'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.innerHTML = '';
  });
}

// ── Card range ring controls ──────────────────────────
export function syncCardRangeButtons(activeType) {
  ['move','advance','charge','ds'].forEach(function(type) {
    var btn = document.getElementById('rt-' + type);
    if (btn) btn.classList.toggle('active', type === activeType);
  });
}

export function setExclusiveCardRange(type) {
  activeRangeTypes.clear();
  if (type) activeRangeTypes.add(type);
  syncCardRangeButtons(type);
}

export function renderCardRangeRings(uid) {
  if (!uid) { clearRangeRings(); syncCardRangeButtons(null); return; }
  var u = UNITS[uid];
  var unit = simState.units.find(function(su) { return su.id === uid; });
  if (!u || !unit) { clearRangeRings(); syncCardRangeButtons(null); return; }
  if (activeRangeTypes.size === 0) { clearRangeRings(); syncCardRangeButtons(null); return; }

  var activeType = Array.from(activeRangeTypes)[0] || null;
  syncCardRangeButtons(activeType);

  var RANGE_COLORS = {
    move:    { fill: 'rgba(0,212,255,0.04)', stroke: 'rgba(0,212,255,0.2)' },
    advance: { fill: 'rgba(204,136,0,0.04)', stroke: 'rgba(204,136,0,0.2)' },
    charge:  { fill: 'rgba(204,100,0,0.04)', stroke: 'rgba(204,100,0,0.2)' },
    ds:      { fill: 'rgba(186,126,255,0.04)', stroke: 'rgba(186,126,255,0.2)' }
  };

  var radiusInches;
  if (activeType === 'move') radiusInches = u.M;
  else if (activeType === 'advance') {
    var advBonus = (moveState.advanceDie !== null) ? moveState.advanceDie : 3.5;
    radiusInches = u.M + advBonus;
  }
  else if (activeType === 'charge') radiusInches = u.M + 7;
  else if (activeType === 'ds') radiusInches = 9;
  else { clearRangeRings(); return; }

  if (activeType === 'ds') {
    drawPerModelRangeRings(uid, [{ radiusInches: radiusInches, fill: RANGE_COLORS.ds.fill, stroke: RANGE_COLORS.ds.stroke }]);
    return;
  }

  var layer = document.getElementById('layer-range-rings');
  if (!layer) return;
  layer.innerHTML = '';
  var NS = 'http://www.w3.org/2000/svg';
  var radiusPx = radiusInches * PX_PER_INCH;
  var color = RANGE_COLORS[activeType] || RANGE_COLORS.move;

  unit.models.forEach(function(m) {
    var start = phaseTurnStarts[m.id];
    if (!start) return;
    var circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', start.x);
    circle.setAttribute('cy', start.y);
    circle.setAttribute('r', radiusPx);
    circle.setAttribute('fill', color.fill);
    circle.setAttribute('stroke', color.stroke);
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('class', 'range-ring');
    circle.setAttribute('pointer-events', 'none');
    layer.appendChild(circle);
  });
}

export function wireCardRangeButtons() {
  ['move','advance','charge','ds'].forEach(function(type) {
    var btn = document.getElementById('rt-' + type);
    if (!btn) return;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var isSameActive = activeRangeTypes.has(type);
      setExclusiveCardRange(isSameActive ? null : type);
      renderCardRangeRings(currentUnit);
    }, true);
  });
}

// ── Drag interceptor: block already-moved + enemy ──────
export function installDragInterceptor() {
  var _drag = null;
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get: function() { return _drag; },
    set: function(value) {
      if (value !== null) {
        var unit = null;
        if (value.type === 'unit') unit = value.unit;
        else if (value.type === 'model') unit = simState.units.find(function(u) { return u.models.includes(value.model); });
        if (unit) {
          if (moveState.unitsMoved.has(unit.id)) return;
          if (unit.faction !== ACTIVE_PLAYER_FACTION) return;
        }
      }
      _drag = value;
    }
  });
}

// ── Drag enforcement: zone clamp + terrain + re-render ─
// opts.updateMoveButtons is passed from movement.js to avoid circular imports.
export function installDragEnforcement(opts) {
  var updateMoveButtons = opts.updateMoveButtons;

  window.addEventListener('mousemove', function() {
    var drag = simState.drag;
    if (!drag || !moveState.mode) return;
    var uid = currentUnit; if (!uid) return;
    var rangePx = getMoveRangePx(uid, moveState.mode === 'advance');

    var dragUnit = null;
    if (drag.type === 'model') {
      var m = drag.model, ts = phaseTurnStarts[m.id]; if (!ts) return;
      dragUnit = simState.units.find(function(u) { return u.models.includes(m); });
      var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
      if (dist > rangePx) {
        var sc = rangePx / dist; m.x = ts.x + dx * sc; m.y = ts.y + dy * sc;
        var reRes = resolveOverlaps(m, m.x, m.y); m.x = reRes.x; m.y = reRes.y;
      }
    }
    else if (drag.type === 'unit') {
      dragUnit = drag.unit;
      doUnitDragCollisions(drag.unit);
      drag.unit.models.forEach(function(m) {
        var ts = phaseTurnStarts[m.id]; if (!ts) return;
        var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > rangePx) { var sc = rangePx/dist; m.x = ts.x+dx*sc; m.y = ts.y+dy*sc; }
      });
      doUnitDragCollisions(drag.unit);
    }

    // Compute pathfinding costs for non-breachable units
    if (dragUnit && !canBreachTerrain(dragUnit)) {
      computeModelPaths(dragUnit);
      if (window.__debugPaths) {
        var debugLayer = document.getElementById('layer-debug-paths');
        if (debugLayer) {
          debugLayer.innerHTML = '';
          dragUnit.models.forEach(function(m) {
            var pathData = _modelPathCache[m.id];
            if (pathData && pathData.path) {
              renderPathDebug(pathData.path, debugLayer, '#ff0');
            }
          });
        }
      }
    }

    // Re-render: models first, then overlays, then z-lift
    renderModels();
    renderCardRangeRings(uid);
    renderMoveOverlays(uid);
    updateMoveButtons();
    if (dragUnit) updateWallCollisionWarning(dragUnit);
    var dragUnitId = getDragUnitId();
    if (dragUnitId) {
      ['layer-hulls', 'layer-models'].forEach(function(layerId) {
        var layer = document.getElementById(layerId); if (!layer) return;
        Array.from(layer.children).forEach(function(el) {
          if (el.dataset && el.dataset.unitId === dragUnitId) layer.appendChild(el);
        });
      });
    }
  });
}
