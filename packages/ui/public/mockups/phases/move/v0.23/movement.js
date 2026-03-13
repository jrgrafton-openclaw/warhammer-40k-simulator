/**
 * movement.js — Movement state machine + drag enforcement + UI wiring (ES module).
 *
 * Imports shared modules instead of using BattleUI global.
 */

import { PX_PER_INCH, simState, callbacks, currentUnit, activeRangeTypes } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';
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

// ── Helpers ────────────────────────────────────────────
function getMoveRangePx(unitId, isAdvance) {
  var u = UNITS[unitId]; if (!u) return 0;
  if (isAdvance) {
    var bonus = (moveState.advanceDie !== null) ? moveState.advanceDie : 3.5;
    return (u.M + bonus) * PX_PER_INCH;
  }
  return u.M * PX_PER_INCH;
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
  updateMoveButtons();
  drawMoveRangeRings(uid, mode);
  renderMoveOverlays(uid);
  renderModels();
}

function confirmMove() {
  var uid = currentUnit;
  var unit = uid ? simState.units.find(function(u) { return u.id === uid; }) : null;
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
    btnMove.disabled = isEnemy || alreadyMoved || hasAdvanced || (moveState.mode === 'advance');
  }
  if (btnAdvance) {
    btnAdvance.classList.toggle('active', moveState.mode === 'advance');
    btnAdvance.disabled = isEnemy || alreadyMoved || hasAdvanced || moveState.mode === 'advance';
  }
  if (btnConfirm) btnConfirm.disabled = isEnemy || !inMode;
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

  unit.models.forEach(function(m) {
    var ts = phaseTurnStarts[m.id]; if (!ts) return;
    var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    var overRange = dist > rangePx + 0.5;

    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', ts.x); line.setAttribute('y1', ts.y);
    line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
    line.setAttribute('class', 'move-ruler');
    line.style.stroke = overRange ? '#ff3333' : color;
    layerRulers.appendChild(line);

    var label = document.createElementNS(NS, 'text');
    label.setAttribute('x', (ts.x + m.x) / 2); label.setAttribute('y', (ts.y + m.y) / 2 - 4);
    label.setAttribute('class', 'move-ruler-label'); label.setAttribute('text-anchor', 'middle');
    label.textContent = (dist / PX_PER_INCH).toFixed(1) + '"';
    layerRulers.appendChild(label);
  });
}

function clearMoveOverlays() {
  ['layer-move-ghosts', 'layer-move-rulers'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.innerHTML = '';
  });
}

function renderCardRangeRings(uid) {
  if (!uid) {
    clearRangeRings();
    return;
  }
  var u = UNITS[uid];
  if (!u) {
    clearRangeRings();
    return;
  }

  if (moveState.mode) {
    drawMoveRangeRings(uid, moveState.mode);
    return;
  }

  if (activeRangeTypes.size === 0) {
    clearRangeRings();
    return;
  }

  var RANGE_COLORS = {
    move:    { fill: 'rgba(0,212,255,0.04)', stroke: 'rgba(0,212,255,0.2)' },
    advance: { fill: 'rgba(204,136,0,0.04)', stroke: 'rgba(204,136,0,0.2)' },
    charge:  { fill: 'rgba(204,100,0,0.04)', stroke: 'rgba(204,100,0,0.2)' },
    ds:      { fill: 'rgba(186,126,255,0.04)', stroke: 'rgba(186,126,255,0.2)' }
  };

  var ranges = [];
  activeRangeTypes.forEach(function(type) {
    var radiusInches;
    if (type === 'move') radiusInches = u.M;
    else if (type === 'advance') radiusInches = u.M + 3.5;
    else if (type === 'charge') radiusInches = u.M + 7;
    else if (type === 'ds') radiusInches = 9;
    else return;
    var col = RANGE_COLORS[type] || RANGE_COLORS.move;
    ranges.push({ radiusInches: radiusInches, fill: col.fill, stroke: col.stroke });
  });

  if (ranges.length) drawPerModelRangeRings(uid, ranges);
  else clearRangeRings();
}

function wireCardRangeButtons() {
  ['move','advance','charge','ds'].forEach(function(type) {
    var btn = document.getElementById('rt-' + type);
    if (!btn) return;
    btn.addEventListener('click', function() {
      setTimeout(function() {
        renderCardRangeRings(currentUnit);
      }, 0);
    });
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

    if (drag.type === 'model') {
      var m = drag.model, ts = phaseTurnStarts[m.id]; if (!ts) return;
      // Zone clamp from turn-start
      var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
      if (dist > rangePx) {
        var sc = rangePx / dist; m.x = ts.x + dx * sc; m.y = ts.y + dy * sc;
        var reRes = resolveOverlaps(m, m.x, m.y); m.x = reRes.x; m.y = reRes.y;
      }
      // Terrain collision (continuous)
      var tr = doTerrainCollision(m.x, m.y, m.r); m.x = tr.x; m.y = tr.y;
    }
    else if (drag.type === 'unit') {
      // Cross-unit collision
      doUnitDragCollisions(drag.unit);
      // Zone clamp per model
      drag.unit.models.forEach(function(m) {
        var ts = phaseTurnStarts[m.id]; if (!ts) return;
        var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > rangePx) { var sc = rangePx/dist; m.x = ts.x+dx*sc; m.y = ts.y+dy*sc; }
      });
      // Terrain: push entire unit as block
      var maxPX = 0, maxPY = 0;
      drag.unit.models.forEach(function(m) {
        var tr = doTerrainCollision(m.x, m.y, m.r);
        var px = tr.x - m.x, py = tr.y - m.y;
        if (Math.abs(px) > Math.abs(maxPX)) maxPX = px;
        if (Math.abs(py) > Math.abs(maxPY)) maxPY = py;
      });
      if (maxPX !== 0 || maxPY !== 0) {
        drag.unit.models.forEach(function(m) { m.x += maxPX; m.y += maxPY; });
      }
      doUnitDragCollisions(drag.unit);
    }

    // Re-render: models first, then overlays, then z-lift (matches v1 patched renderModels order)
    renderModels();
    renderCardRangeRings(uid);
    renderMoveOverlays(uid);
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

  updateMoveButtons();
  syncMovedUI();
  renderCardRangeRings(uid);
  if (uid) {
    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (unit && unit.faction === ACTIVE_PLAYER_FACTION && moveState.mode === null && !moveState.unitsMoved.has(uid)) {
      if (moveState.unitsAdvanced[uid] !== undefined) {
        moveState.advanceDie = moveState.unitsAdvanced[uid];
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
    if (e.target.closest('#bf-svg, #bf-svg-terrain, #unit-card, #vp-bar, #action-bar, #phase-header, .obj-hex-wrap, #advance-dice-overlay')) return;
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

  wireButtons();
  wireCardRangeButtons();
  setupClickOutside();
  captureTurnStarts();
  renderModels();
  updateMoveButtons();
  syncMovedUI();

  activeRangeTypes.clear();

  // Select the first unit
  movementSelectUnit('assault-intercessors');
}
