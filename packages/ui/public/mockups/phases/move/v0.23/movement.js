/**
 * movement.js — Movement state machine + drag enforcement + UI wiring (ES module).
 *
 * Imports shared modules instead of using BattleUI global.
 */

import { PX_PER_INCH, simState, callbacks, currentUnit, activeRangeTypes } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, resolveUnitDragCollisions, canBreachTerrain } from '../../../shared/world/collision.js';
import { getGrid, findPath, renderGridDebug, renderPathDebug } from '../../../shared/world/pathfinding.js';
import { rollAdvanceDie } from './advance-dice.js';
import { clearRangeRings, drawPerModelRangeRings } from '../../../shared/world/range-rings.js';

var ACTIVE_PLAYER_FACTION = 'imp';

var MOVE_RING_COLOR   = { fill: 'rgba(0,212,255,0.04)', stroke: 'rgba(0,212,255,0.2)' };
var ADVANCE_RING_COLOR = { fill: 'rgba(204,136,0,0.04)', stroke: 'rgba(204,136,0,0.2)' };

function drawMoveRangeRings(uid, mode) {
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

// ── Phase turn-start positions ─────────────────────────
var phaseTurnStarts = {};

function captureTurnStarts() {
  simState.units.forEach(function(u) {
    u.models.forEach(function(m) {
      phaseTurnStarts[m.id] = { x: m.x, y: m.y };
    });
  });
}

// ── Movement state ─────────────────────────────────────
var moveState = {
  mode: null,          // null | 'move' | 'advance'
  advanceDie: null,    // 1–6 once ADVANCE declared (current unit's roll)
  unitsMoved: new Set(),
  unitsAdvanced: {}    // unitId → dieResult (persists across deselect/reselect)
};
window.__movedUnitIds = moveState.unitsMoved;

// ── Pathfinding state (grid-based) ─────────────────────
var _modelPathCache = {};    // modelId → { path: [{x,y}], cost: number } | null
var _debugGridVisible = false;

function computeModelPaths(unit) {
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

function getModelPathCost(modelId) {
  var entry = _modelPathCache[modelId];
  if (!entry) return 0;
  return entry.cost;
}

function toggleGridDebug() {
  _debugGridVisible = !_debugGridVisible;
  var layer = document.getElementById('layer-debug-grid');
  if (!layer) return;
  if (_debugGridVisible) {
    // Show grid for a default radius (R32 = ~13px)
    var aabbs = window._terrainAABBs || [];
    var uid = currentUnit;
    var modelRadius = 13; // default
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

// ── Helpers ────────────────────────────────────────────
function getMoveRangePx(unitId, isAdvance) {
  var u = UNITS[unitId]; if (!u) return 0;
  if (isAdvance) {
    var bonus = (moveState.advanceDie !== null) ? moveState.advanceDie : 3.5;
    return (u.M + bonus) * PX_PER_INCH;
  }
  return u.M * PX_PER_INCH;
}

// ── Wall collision warning ─────────────────────────────
function applyModelWallHighlights(unit) {
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

function updateWallCollisionWarning(unit) {
  // Clear + recheck all units (so highlights persist when deselected)
  updateAllWallCollisionWarnings();
}

function updateAllWallCollisionWarnings() {
  var banner = document.getElementById('wall-collision-banner');
  // Clear all highlights
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

function getFactionColor(unitId) {
  var u = UNITS[unitId]; if (!u) return '#888';
  return u.faction_side === 'imp' ? '#2266ee' : '#cc2222';
}

function doTerrainCollision(cx, cy, r) {
  return resolveTerrainCollision(cx, cy, r, window._terrainAABBs || []);
}

function doUnitDragCollisions(unit) {
  resolveUnitDragCollisions(unit, simState.units);
}

function modelCollidesTerrain(model) {
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

function modelsOverlap(a, b) {
  var buffer = 1;
  var minDist = (a.r || 0) + (b.r || 0) + buffer;
  return Math.hypot(a.x - b.x, a.y - b.y) < minDist - 0.001;
}

function isCurrentMoveLegal(uid) {
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
      // Non-breachable: use pathfinding cost (distance around walls)
      var pathCost = getModelPathCost(m.id);
      if (pathCost > rangePx + 0.5) return false;
      if (_modelPathCache[m.id] === null) return false; // no valid path (inside obstacle)
    } else {
      // Breachable (Infantry): straight-line distance
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

function ensureRosterStatePills() {
  document.querySelectorAll('.rail-unit').forEach(function(row) {
    if (row.querySelector('.roster-state-pill')) return;
    var pill = document.createElement('span');
    pill.className = 'roster-state-pill';
    pill.textContent = '✓ Moved';
    row.appendChild(pill);
  });
}

function syncMovedUI() {
  ensureRosterStatePills();
  document.querySelectorAll('.rail-unit').forEach(function(row) {
    row.classList.toggle('moved', moveState.unitsMoved.has(row.dataset.unit));
  });

  var badge = document.getElementById('unit-state-badge');
  if (badge) {
    var isMoved = currentUnit && moveState.unitsMoved.has(currentUnit);
    badge.classList.toggle('visible', !!isMoved);
  }
}

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

// ── Enter / Confirm / Cancel ───────────────────────────
function enterMoveMode(mode) {
  var uid = currentUnit;
  if (!uid || moveState.unitsMoved.has(uid)) return;
  clearMoveOverlays();
  moveState.mode = mode;
  setExclusiveCardRange(mode === 'advance' ? 'advance' : 'move');
  updateMoveButtons();
  drawMoveRangeRings(uid, mode);
  renderMoveOverlays(uid);
  renderModels();
}

function confirmMove() {
  var uid = currentUnit;
  var unit = uid ? simState.units.find(function(u) { return u.id === uid; }) : null;
  if (!isCurrentMoveLegal(uid)) {
    var illegalBtn = document.getElementById('btn-confirm-move');
    if (illegalBtn) { illegalBtn.classList.add('shake-error'); setTimeout(function() { illegalBtn.classList.remove('shake-error'); }, 450); }
    return;
  }
  if (unit) {
    checkCohesion(unit);
    if (unit.broken) {
      var btn = document.getElementById('btn-confirm-move');
      if (btn) { btn.classList.add('shake-error'); setTimeout(function() { btn.classList.remove('shake-error'); }, 450); }
      return;
    }
  }
  if (uid) moveState.unitsMoved.add(uid);
  syncMovedUI();
  moveState.mode = null;
  moveState.advanceDie = null;
  clearMoveOverlays();
  clearRangeRings();
  updateMoveButtons();
  updateWallCollisionWarning(null);
  movementSelectUnit(null);
}

function cancelMove() {
  var uid = currentUnit;
  var unit = uid ? simState.units.find(function(u) { return u.id === uid; }) : null;
  if (unit) {
    unit.models.forEach(function(m) {
      var ts = phaseTurnStarts[m.id];
      if (ts) { m.x = ts.x; m.y = ts.y; }
    });
  }
  moveState.mode = null;
  moveState.advanceDie = null;
  clearMoveOverlays();
  clearRangeRings();
  updateMoveButtons();
  updateWallCollisionWarning(null);
  renderModels();
  baseSelectUnit(null);
}

// ── Update action bar buttons ──────────────────────────
function updateMoveButtons() {
  var uid = currentUnit;
  var inMode = moveState.mode !== null;
  var alreadyMoved = uid && moveState.unitsMoved.has(uid);
  var unit = uid ? simState.units.find(function(u) { return u.id === uid; }) : null;
  var isEnemy = unit && unit.faction !== ACTIVE_PLAYER_FACTION;
  var hasAdvanced = uid && moveState.unitsAdvanced[uid] !== undefined;

  var btnMove    = document.getElementById('btn-move');
  var btnAdvance = document.getElementById('btn-advance');
  var btnConfirm = document.getElementById('btn-confirm-move');
  var btnCancel  = document.getElementById('btn-cancel-move');
  var modeLabel  = document.getElementById('move-mode-label');

  if (btnMove) {
    btnMove.classList.toggle('active', moveState.mode === 'move');
    btnMove.disabled = !uid || isEnemy || alreadyMoved || hasAdvanced || (moveState.mode === 'advance');
  }
  if (btnAdvance) {
    var advIsActive = moveState.mode === 'advance';
    btnAdvance.classList.toggle('active', advIsActive);
    btnAdvance.disabled = advIsActive ? false : (!uid || isEnemy || alreadyMoved || hasAdvanced);
  }
  if (btnConfirm) btnConfirm.disabled = isEnemy || !inMode || !isCurrentMoveLegal(uid);
  if (btnCancel)  btnCancel.disabled  = isEnemy || !inMode;

  if (modeLabel) {
    modeLabel.className = '';
    if (isEnemy)             { modeLabel.textContent = '— ENEMY UNIT —'; }
    else if (alreadyMoved)   { modeLabel.textContent = '✓ MOVED'; }
    else if (moveState.mode === 'move')    { modeLabel.textContent = '◉ MOVING'; modeLabel.className = 'active-move'; }
    else if (moveState.mode === 'advance') {
      var d = moveState.advanceDie;
      modeLabel.textContent = d !== null ? '◉ ADVANCING +' + d + '"' : '◉ ADVANCING +D6"';
      modeLabel.className = 'active-advance';
    } else { modeLabel.textContent = uid ? '— SELECT MOVE —' : '— NO UNIT —'; }
  }
}

// ── Render overlays (zones, ghosts, rulers) ────────────
function renderMoveOverlays(uid) {
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

    // Ghost circle at start
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
      // Draw path polyline for non-breachable units
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

      // Label at midpoint of straight line between start and current pos (matches breachable style)
      var labelPt = { x: (ts.x + m.x) / 2, y: (ts.y + m.y) / 2 };
      var label = document.createElementNS(NS, 'text');
      label.setAttribute('x', labelPt.x); label.setAttribute('y', labelPt.y - 4);
      label.setAttribute('class', 'move-ruler-label'); label.setAttribute('text-anchor', 'middle');
      label.textContent = (pathCost / PX_PER_INCH).toFixed(1) + '"';
      if (overRange) label.style.fill = '#ff3333';
      layerRulers.appendChild(label);
    } else if (usePathCost && _modelPathCache[m.id] === null) {
      // No valid path — draw red X indicator
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', ts.x); line.setAttribute('y1', ts.y);
      line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
      line.setAttribute('class', 'move-ruler');
      line.style.stroke = '#ff3333';
      line.style.strokeDasharray = '2,4';
      layerRulers.appendChild(line);
    } else {
      // Breachable units: straight-line ruler (unchanged)
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

function clearMoveOverlays() {
  ['layer-move-ghosts', 'layer-move-rulers'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.innerHTML = '';
  });
}

function syncCardRangeButtons(activeType) {
  ['move','advance','charge','ds'].forEach(function(type) {
    var btn = document.getElementById('rt-' + type);
    if (btn) btn.classList.toggle('active', type === activeType);
  });
}

function setExclusiveCardRange(type) {
  activeRangeTypes.clear();
  if (type) activeRangeTypes.add(type);
  syncCardRangeButtons(type);
}

function renderCardRangeRings(uid) {
  if (!uid) {
    clearRangeRings();
    syncCardRangeButtons(null);
    return;
  }
  var u = UNITS[uid];
  var unit = simState.units.find(function(su) { return su.id === uid; });
  if (!u || !unit) {
    clearRangeRings();
    syncCardRangeButtons(null);
    return;
  }

  if (activeRangeTypes.size === 0) {
    clearRangeRings();
    syncCardRangeButtons(null);
    return;
  }

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
  else {
    clearRangeRings();
    return;
  }

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

function wireCardRangeButtons() {
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
// Called inside initMovement() to ensure it runs AFTER initModelInteraction()
function installDragInterceptor() {
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
// Must be registered AFTER initModelInteraction() so svg-renderer's handler fires first
// and sets raw position, then this handler clamps/corrects it.
function installDragEnforcement() {
  window.addEventListener('mousemove', function() {
    var drag = simState.drag;
    if (!drag || !moveState.mode) return;
    var uid = currentUnit; if (!uid) return;
    var rangePx = getMoveRangePx(uid, moveState.mode === 'advance');

    var dragUnit = null;
    if (drag.type === 'model') {
      var m = drag.model, ts = phaseTurnStarts[m.id]; if (!ts) return;
      dragUnit = simState.units.find(function(u) { return u.models.includes(m); });
      // Zone clamp from turn-start (straight-line — generous for non-breachable, path cost enforces on confirm)
      var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
      if (dist > rangePx) {
        var sc = rangePx / dist; m.x = ts.x + dx * sc; m.y = ts.y + dy * sc;
        var reRes = resolveOverlaps(m, m.x, m.y); m.x = reRes.x; m.y = reRes.y;
      }
      // Terrain collision (continuous) — only for breachable-false units that CAN'T pathfind yet
      // Now: ALL units can drag through walls freely. Terrain enforcement is via path cost + confirm validation.
    }
    else if (drag.type === 'unit') {
      dragUnit = drag.unit;
      // Cross-unit collision
      doUnitDragCollisions(drag.unit);
      // Zone clamp per model (straight-line)
      drag.unit.models.forEach(function(m) {
        var ts = phaseTurnStarts[m.id]; if (!ts) return;
        var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > rangePx) { var sc = rangePx/dist; m.x = ts.x+dx*sc; m.y = ts.y+dy*sc; }
      });
      // No terrain collision push-back during drag — path cost handles enforcement
      doUnitDragCollisions(drag.unit);
    }

    // Compute pathfinding costs for non-breachable units
    if (dragUnit && !canBreachTerrain(dragUnit)) {
      computeModelPaths(dragUnit);

      // Render debug paths if enabled
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

    // Re-render: models first, then overlays, then z-lift (matches v1 patched renderModels order)
    renderModels();
    renderCardRangeRings(uid);
    renderMoveOverlays(uid);
    updateMoveButtons();
    // Check wall collision for ALL units (breachable can't end on walls either)
    if (dragUnit) updateWallCollisionWarning(dragUnit);
    // Lift dragged unit to z-top
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

// ── Selection override via callbacks ─────────────────
function movementSelectUnit(uid) {
  var previousUid = currentUnit;
  clearRangeRings();
  if (moveState.mode !== null && uid !== currentUnit) cancelMove();
  baseSelectUnit(uid);

  // Selection tone: friendly = cyan, enemy = red
  document.querySelectorAll('.rail-unit').forEach(function(r) { r.classList.remove('active-enemy'); });
  if (uid) {
    var selected = simState.units.find(function(u) { return u.id === uid; });
    var row = document.querySelector('.rail-unit[data-unit="' + uid + '"]');
    if (row && selected && selected.faction !== ACTIVE_PLAYER_FACTION) row.classList.add('active-enemy');
  }

  if (uid) {
    var selectedUnit = simState.units.find(function(u) { return u.id === uid; });
    if (selectedUnit && selectedUnit.faction === ACTIVE_PLAYER_FACTION) {
      if (uid !== previousUid || activeRangeTypes.size === 0) setExclusiveCardRange('move');
    } else {
      setExclusiveCardRange(null);
    }
  } else {
    setExclusiveCardRange(null);
  }

  updateMoveButtons();
  syncMovedUI();
  renderCardRangeRings(uid);

  // Refresh debug grid for the selected unit's model radius
  if (_debugGridVisible && uid) {
    var dbgUnit = simState.units.find(function(u) { return u.id === uid; });
    if (dbgUnit && dbgUnit.models[0]) {
      var aabbs = window._terrainAABBs || [];
      var grid = getGrid(aabbs, dbgUnit.models[0].r, resolveTerrainCollision);
      renderGridDebug(grid, document.getElementById('layer-debug-grid'));
    }
  }

  if (uid) {
    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (unit && unit.faction === ACTIVE_PLAYER_FACTION && moveState.mode === null && !moveState.unitsMoved.has(uid)) {
      if (moveState.unitsAdvanced[uid] !== undefined) {
        moveState.advanceDie = moveState.unitsAdvanced[uid];
        // Update card range button: show actual ADV total (not AVG)
        var advBtn = document.getElementById('rt-advance');
        var uData = UNITS[uid];
        if (advBtn && uData) {
          advBtn.innerHTML = 'ADV<br>' + (uData.M + moveState.advanceDie) + '"';
        }
        enterMoveMode('advance');
      } else {
        moveState.advanceDie = null;
        enterMoveMode('move');
      }
    }
  }
}

// ── Click outside: soft-exit ──────────────────────────
function setupClickOutside() {
  document.getElementById('battlefield').addEventListener('mousedown', function(e) {
    if (e.target.closest('#bf-svg, #bf-svg-terrain, #unit-card, #vp-bar, #action-bar, #phase-header, .obj-hex-wrap, #advance-dice-overlay, #roll-overlay')) return;
    if (moveState.mode !== null) {
      moveState.mode = null; moveState.advanceDie = null;
      clearMoveOverlays(); clearRangeRings(); updateMoveButtons(); renderModels();
      baseSelectUnit(null);
    } else if (currentUnit) {
      clearRangeRings();
      baseSelectUnit(null); updateMoveButtons();
    }
  }, true);
}

// ── Button wiring ─────────────────────────────────────
function wireButtons() {
  document.getElementById('btn-move').addEventListener('click', function() {
    var uid = currentUnit;
    if (!uid || moveState.unitsMoved.has(uid)) return;
    enterMoveMode('move');
  });

  document.getElementById('btn-advance').addEventListener('click', function() {
    var uid = currentUnit;
    if (!uid || moveState.unitsMoved.has(uid) || moveState.mode === 'advance') return;
    // Cancel any current normal move first (snap back to turn-start before rolling)
    if (moveState.mode === 'move') {
      var unit = simState.units.find(function(u) { return u.id === uid; });
      if (unit) { unit.models.forEach(function(m) { var ts = phaseTurnStarts[m.id]; if (ts) { m.x = ts.x; m.y = ts.y; } }); }
      moveState.mode = null; clearMoveOverlays();
    }
    rollAdvanceDie(uid, function(die) {
      moveState.advanceDie = die;
      moveState.unitsAdvanced[uid] = die; // persist across deselect/reselect
      // Update card range button: "AVG ADV" → "ADV" with actual total
      var advBtn = document.getElementById('rt-advance');
      var u = UNITS[uid];
      if (advBtn && u) {
        advBtn.innerHTML = 'ADV<br>' + (u.M + die) + '"';
      }
      enterMoveMode('advance');
      updateMoveButtons();
    });
  });

  document.getElementById('btn-confirm-move').addEventListener('click', confirmMove);
  document.getElementById('btn-cancel-move').addEventListener('click', cancelMove);
}

// ── Public init ───────────────────────────────────────
export function initMovement() {
  // Install drag interceptor + enforcement AFTER initModelInteraction()
  // so svg-renderer's mousemove fires first (sets raw position),
  // then our handler clamps/corrects it.
  installDragInterceptor();
  installDragEnforcement();

  // Register the movement selectUnit override via the callback system
  callbacks.selectUnit = movementSelectUnit;

  // After every renderModels(), reapply wall collision highlights for ALL units
  callbacks.afterRender = function() {
    updateAllWallCollisionWarnings();
  };

  wireButtons();
  wireCardRangeButtons();
  setupClickOutside();
  captureTurnStarts();
  renderModels();
  updateMoveButtons();
  syncMovedUI();

  activeRangeTypes.clear();

  // No unit selected by default — user clicks to select
  const unitCard = document.getElementById('unit-card');
  if (unitCard) unitCard.classList.remove('visible');
  updateMoveButtons();

  // Wire debug menu
  var debugToggle = document.getElementById('debug-toggle');
  var debugPanel = document.getElementById('debug-panel');
  if (debugToggle && debugPanel) {
    debugToggle.addEventListener('click', function() {
      debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
    });
  }
  var dbgGrid = document.getElementById('dbg-grid');
  if (dbgGrid) {
    dbgGrid.addEventListener('change', function() {
      toggleGridDebug();
    });
  }
  var dbgPaths = document.getElementById('dbg-paths');
  if (dbgPaths) {
    window.__debugPaths = false;
    dbgPaths.addEventListener('change', function() {
      window.__debugPaths = dbgPaths.checked;
      var layer = document.getElementById('layer-debug-paths');
      if (layer && !dbgPaths.checked) layer.innerHTML = '';
    });
  }
}
