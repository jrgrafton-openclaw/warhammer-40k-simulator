/**
 * move-helpers.js — Movement state, constants, and helper functions.
 *
 * Split from movement.js for maintainability.
 */

import { PX_PER_INCH, simState, currentUnit } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { checkCohesion } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, canBreachTerrain } from '../../../shared/world/collision.js';
import { getGrid, findPath, renderGridDebug } from '../../../shared/world/pathfinding.js';

// ── Constants ──────────────────────────────────────────
export var ACTIVE_PLAYER_FACTION = 'imp';
export var MOVE_RING_COLOR   = { fill: 'rgba(0,212,255,0.04)', stroke: 'rgba(0,212,255,0.2)' };
export var ADVANCE_RING_COLOR = { fill: 'rgba(204,136,0,0.04)', stroke: 'rgba(204,136,0,0.2)' };

// ── Phase turn-start positions ─────────────────────────
export var phaseTurnStarts = {};

// ── Movement state ─────────────────────────────────────
export var moveState = {
  mode: null,          // null | 'move' | 'advance'
  advanceDie: null,    // 1–6 once ADVANCE declared (current unit's roll)
  unitsMoved: new Set(),
  unitsAdvanced: {}    // unitId → dieResult (persists across deselect/reselect)
};
window.__movedUnitIds = moveState.unitsMoved;

// ── Pathfinding state (grid-based) ─────────────────────
export var _modelPathCache = {};
var _debugGridVisible = false;

export function computeModelPaths(unit) {
  _modelPathCache = {};
  if (!unit || canBreachTerrain(unit)) return;
  var aabbs = window._terrainAABBs || [];
  unit.models.forEach(function(m) {
    var ts = phaseTurnStarts[m.id];
    if (!ts) return;
    var grid = getGrid(aabbs, m.r, resolveTerrainCollision);
    var result = findPath(grid, { x: ts.x, y: ts.y }, { x: m.x, y: m.y });
    _modelPathCache[m.id] = result;
  });
}

export function getModelPathCost(modelId) {
  var entry = _modelPathCache[modelId];
  if (!entry) return 0;
  return entry.cost;
}

export function toggleGridDebug() {
  _debugGridVisible = !_debugGridVisible;
  var layer = document.getElementById('layer-debug-grid');
  if (!layer) return;
  if (_debugGridVisible) {
    var aabbs = window._terrainAABBs || [];
    var uid = currentUnit;
    var modelRadius = 13;
    if (uid) {
      var unit = simState.units.find(function(u) { return u.id === uid; });
      if (unit && unit.models[0]) modelRadius = unit.models[0].r;
    }
    var grid = getGrid(aabbs, modelRadius, resolveTerrainCollision);
    renderGridDebug(grid, layer);
  } else {
    layer.innerHTML = '';
  }
}

export function isDebugGridVisible() { return _debugGridVisible; }

// ── Helpers ────────────────────────────────────────────
export function getMoveRangePx(unitId, isAdvance) {
  var u = UNITS[unitId]; if (!u) return 0;
  if (isAdvance) {
    var bonus = (moveState.advanceDie !== null) ? moveState.advanceDie : 3.5;
    return (u.M + bonus) * PX_PER_INCH;
  }
  return u.M * PX_PER_INCH;
}

export function getFactionColor(unitId) {
  var u = UNITS[unitId]; if (!u) return '#888';
  return u.faction_side === 'imp' ? '#2266ee' : '#cc2222';
}

export function doTerrainCollision(cx, cy, r) {
  return resolveTerrainCollision(cx, cy, r, window._terrainAABBs || []);
}

export function modelCollidesTerrain(model) {
  var aabbs = window._terrainAABBs || [];
  for (var i = 0; i < aabbs.length; i++) {
    var box = aabbs[i];
    var lx = box.iA * model.x + box.iC * model.y + box.iE;
    var ly = box.iB * model.x + box.iD * model.y + box.iF;
    var cpx = Math.max(box.minX, Math.min(box.maxX, lx));
    var cpy = Math.max(box.minY, Math.min(box.maxY, ly));
    if (Math.hypot(lx - cpx, ly - cpy) < model.r - 0.001) return true;
  }
  return false;
}

export function modelsOverlap(a, b) {
  var buffer = 1;
  var minDist = (a.r || 0) + (b.r || 0) + buffer;
  return Math.hypot(a.x - b.x, a.y - b.y) < minDist - 0.001;
}

export function isCurrentMoveLegal(uid) {
  if (!uid || !moveState.mode) return false;
  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit || unit.faction !== ACTIVE_PLAYER_FACTION) return false;

  var rangePx = getMoveRangePx(uid, moveState.mode === 'advance');
  var usePathCost = !canBreachTerrain(unit);

  for (var i = 0; i < unit.models.length; i++) {
    var m = unit.models[i];
    var ts = phaseTurnStarts[m.id];
    if (!ts) return false;
    if (usePathCost) {
      var pathEntry = _modelPathCache[m.id];
      if (pathEntry === null) {
        if (modelCollidesTerrain(m)) return false;
        if (Math.hypot(m.x - ts.x, m.y - ts.y) > rangePx + 0.5) return false;
      } else {
        var pathCost = pathEntry ? pathEntry.cost : 0;
        if (pathCost > rangePx + 0.5) return false;
      }
    } else {
      if (Math.hypot(m.x - ts.x, m.y - ts.y) > rangePx + 0.5) return false;
    }
    if (modelCollidesTerrain(m)) return false;
    for (var j = i + 1; j < unit.models.length; j++) {
      if (modelsOverlap(m, unit.models[j])) return false;
    }
    for (var ui = 0; ui < simState.units.length; ui++) {
      var other = simState.units[ui];
      if (other.id === uid) continue;
      for (var oi = 0; oi < other.models.length; oi++) {
        if (modelsOverlap(m, other.models[oi])) return false;
      }
    }
  }

  checkCohesion(unit);
  return !unit.broken;
}

// ── Wall collision warning ─────────────────────────────
export function applyModelWallHighlights(unit) {
  unit.models.forEach(function(m) {
    if (modelCollidesTerrain(m)) {
      document.querySelectorAll('#layer-models .model-base').forEach(function(g) {
        var base = g.querySelector('circle, rect');
        if (!base) return;
        var bx = parseFloat(base.getAttribute('cx') || base.getAttribute('x'));
        var by = parseFloat(base.getAttribute('cy') || base.getAttribute('y'));
        if (base.tagName === 'rect') {
          bx += parseFloat(base.getAttribute('width')) / 2;
          by += parseFloat(base.getAttribute('height')) / 2;
        }
        if (Math.abs(bx - m.x) < 1 && Math.abs(by - m.y) < 1) {
          g.classList.add('wall-collision');
        }
      });
    }
  });
}

export function updateWallCollisionWarning(unit) {
  updateAllWallCollisionWarnings();
}

export function updateAllWallCollisionWarnings() {
  var banner = document.getElementById('wall-collision-banner');
  document.querySelectorAll('#layer-models .model-base.wall-collision').forEach(function(el) {
    el.classList.remove('wall-collision');
  });
  var anyCollision = false;
  simState.units.forEach(function(unit) {
    if (unit.faction !== ACTIVE_PLAYER_FACTION) return;
    var unitHasCollision = false;
    unit.models.forEach(function(m) {
      if (modelCollidesTerrain(m)) {
        unitHasCollision = true;
        anyCollision = true;
      }
    });
    if (unitHasCollision) applyModelWallHighlights(unit);
  });
  if (banner) {
    banner.style.display = anyCollision ? 'block' : 'none';
  }
}

// ── Debug: per-model move validation breakdown ──────
export function debugMoveValidation(uid) {
  if (!uid || !moveState.mode) return { legal: false, reason: 'No unit or mode', models: [] };
  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit) return { legal: false, reason: 'Unit not found', models: [] };

  var rangePx = getMoveRangePx(uid, moveState.mode === 'advance');
  var rangeIn = rangePx / PX_PER_INCH;
  var usePathCost = !canBreachTerrain(unit);
  var results = [];

  unit.models.forEach(function(m) {
    var ts = phaseTurnStarts[m.id];
    var result = { id: m.id, x: m.x, y: m.y, issues: [] };
    if (!ts) { result.issues.push('NO_TURNSTART'); results.push(result); return; }

    var straightDist = Math.hypot(m.x - ts.x, m.y - ts.y);
    result.straightDistPx = straightDist;
    result.straightDistIn = (straightDist / PX_PER_INCH).toFixed(1);
    result.rangePx = rangePx;
    result.rangeIn = rangeIn.toFixed(1);

    if (usePathCost) {
      var pathEntry = _modelPathCache[m.id];
      result.pathEntry = pathEntry === null ? 'NULL' : pathEntry ? pathEntry.cost.toFixed(1) : '0';
      if (pathEntry === null) {
        result.issues.push('PATH_NULL');
        if (modelCollidesTerrain(m)) result.issues.push('TERRAIN_COLLISION');
        else if (straightDist > rangePx + 0.5) result.issues.push('STRAIGHT_OVER_RANGE');
      } else if (pathEntry && pathEntry.cost > rangePx + 0.5) {
        result.issues.push('PATH_OVER_RANGE(' + (pathEntry.cost / PX_PER_INCH).toFixed(1) + '">' + rangeIn.toFixed(1) + '")');
      }
    } else {
      if (straightDist > rangePx + 0.5) result.issues.push('OVER_RANGE');
    }

    if (modelCollidesTerrain(m)) result.issues.push('TERRAIN_HIT');
    unit.models.forEach(function(other) {
      if (other === m) return;
      if (modelsOverlap(m, other)) result.issues.push('OVERLAP_SELF(' + other.id + ')');
    });
    simState.units.forEach(function(otherUnit) {
      if (otherUnit.id === uid) return;
      otherUnit.models.forEach(function(other) {
        if (modelsOverlap(m, other)) result.issues.push('OVERLAP_OTHER(' + other.id + ')');
      });
    });
    results.push(result);
  });

  checkCohesion(unit);
  var legal = results.every(function(r) { return r.issues.length === 0; }) && !unit.broken;

  return {
    legal: legal,
    broken: unit.broken,
    usePathCost: usePathCost,
    rangeIn: rangeIn.toFixed(1),
    mode: moveState.mode,
    models: results
  };
}
