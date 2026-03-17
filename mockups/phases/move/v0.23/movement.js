/**
 * movement.js — Movement phase main entry point: UI wiring, init/cleanup.
 *
 * Imports helpers from move-helpers.js and drag/overlay logic from move-drag.js.
 */

import { PX_PER_INCH, simState, callbacks, currentUnit, activeRangeTypes } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, checkCohesion } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision } from '../../../shared/world/collision.js';
import { getGrid, renderGridDebug } from '../../../shared/world/pathfinding.js';
import { rollAdvanceDie } from './advance-dice.js';
import { clearRangeRings } from '../../../shared/world/range-rings.js';
import { installDragInterceptor, installDragEnforcement,
         drawMoveRangeRings, renderMoveOverlays, clearMoveOverlays,
         renderCardRangeRings, setExclusiveCardRange, syncCardRangeButtons,
         wireCardRangeButtons } from './move-drag.js';
import { moveState, phaseTurnStarts, ACTIVE_PLAYER_FACTION,
         isCurrentMoveLegal, getMoveRangePx,
         updateWallCollisionWarning, updateAllWallCollisionWarnings,
         toggleGridDebug, isDebugGridVisible } from './move-helpers.js';
// Re-export debugMoveValidation from helpers (consumers import from movement.js)
export { debugMoveValidation } from './move-helpers.js';

// ── Phase turn-start capture ───────────────────────────
function captureTurnStarts() {
  simState.units.forEach(function(u) {
    u.models.forEach(function(m) {
      phaseTurnStarts[m.id] = { x: m.x, y: m.y };
    });
  });
}

// ── Roster state pills ────────────────────────────────
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

// ── Selection override via callbacks ─────────────────
function movementSelectUnit(uid) {
  var previousUid = currentUnit;
  clearRangeRings();
  if (moveState.mode !== null && uid !== currentUnit) cancelMove();
  baseSelectUnit(uid);

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

  if (isDebugGridVisible() && uid) {
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
    if (moveState.mode === 'move') {
      var unit = simState.units.find(function(u) { return u.id === uid; });
      if (unit) { unit.models.forEach(function(m) { var ts = phaseTurnStarts[m.id]; if (ts) { m.x = ts.x; m.y = ts.y; } }); }
      moveState.mode = null; clearMoveOverlays();
    }
    rollAdvanceDie(uid, function(die) {
      moveState.advanceDie = die;
      moveState.unitsAdvanced[uid] = die;
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
  installDragInterceptor();
  installDragEnforcement({
    updateMoveButtons: updateMoveButtons
  });

  callbacks.selectUnit = movementSelectUnit;
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

  const unitCard = document.getElementById('unit-card');
  if (unitCard) unitCard.classList.remove('visible');
  updateMoveButtons();

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

// ── Cleanup (for integrated phase transition) ─────────
export function cleanupMovement() {
  if (moveState.mode !== null && currentUnit) {
    var uid = currentUnit;
    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (unit) {
      if (isCurrentMoveLegal(uid)) {
        checkCohesion(unit);
        if (!unit.broken) {
          moveState.unitsMoved.add(uid);
        }
      }
      if (!moveState.unitsMoved.has(uid)) {
        unit.models.forEach(function(m) {
          var ts = phaseTurnStarts[m.id];
          if (ts) { m.x = ts.x; m.y = ts.y; }
        });
      }
    }
    moveState.mode = null;
    moveState.advanceDie = null;
  }

  clearMoveOverlays();
  clearRangeRings();
  activeRangeTypes.clear();

  moveState.unitsMoved.clear();
  moveState.unitsAdvanced = {};
  if (window.__movedUnitIds) window.__movedUnitIds.clear();

  var debugGrid = document.getElementById('layer-debug-grid');
  if (debugGrid) debugGrid.innerHTML = '';
  var debugPaths = document.getElementById('layer-debug-paths');
  if (debugPaths) debugPaths.innerHTML = '';

  var banner = document.getElementById('wall-collision-banner');
  if (banner) banner.style.display = 'none';

  document.querySelectorAll('#layer-models .model-base.wall-collision').forEach(function(el) {
    el.classList.remove('wall-collision');
  });

  baseSelectUnit(null);
}
