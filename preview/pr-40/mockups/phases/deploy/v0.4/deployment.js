/**
 * deployment.js — v0.4 Deployment state machine with SVG tabletop extension.
 * Main entry point. Imports helpers and UI from split modules.
 * ES module.
 */

import { simState, callbacks, activeRangeTypes } from '../../../shared/state/store.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';
import { resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { clearRangeRings } from '../../../shared/world/range-rings.js';
import { deployState, IMP_ZONE, getAnchorPos, detectZone,
         highlightAllZonesByDetection, _clampToZone } from './deploy-helpers.js';
import { updateUI, startPlacement, finishPlacement, checkDeploymentComplete,
         confirmPlacement, cancelPlacement, confirmDeployment,
         deploySelectUnit, wireRangeToggleSingleSelect,
         _redrawActiveRangeRings } from './deploy-ui.js';

// ── Drag interceptor — block enemy + non-placing drags ───
function installDragInterceptor() {
  var _drag = simState.drag;
  Object.defineProperty(simState, 'drag', {
    get: function() { return _drag; },
    set: function(v) {
      if (deployState.locked) { return; }
      if (v) {
        // Determine the unit being dragged
        var dragUnit = null;
        if (v.type === 'unit' && v.unit) dragUnit = v.unit;
        else if (v.type === 'model' && v.model) {
          dragUnit = simState.units.find(function(u) {
            return u.models.some(function(m) { return m.id === v.model.id; });
          });
        }
        else if (v.type === 'rotate' && v.unit) dragUnit = v.unit;

        if (dragUnit) {
          // Block enemy unit dragging entirely
          if (dragUnit.faction === 'ork') {
            baseSelectUnit(dragUnit.id);
            return;
          }
          // Allow dragging ANY imp unit (staging or already deployed)
          if (dragUnit.id !== deployState.placingUnit) {
            // Start placement for this unit (saves pre-drag positions for snap-back)
            startPlacement(dragUnit.id);
            // Fall through to set _drag so the mousedown drag begins immediately
          }
          deployState._wasDragging = true;
        }
      } else {
        // drag set to null = mouseup / drag end
        // _wasDragging stays true for the mouseup handler to read
      }
      _drag = v;
    },
    configurable: true, enumerable: true
  });
}

// ── Drag enforcement — zone detection + button updates ───
function installDragEnforcement() {
  var svg = document.getElementById('bf-svg');
  if (!svg) return;

  svg.addEventListener('mousemove', function() {
    if (deployState.locked) return;
    if (!simState.drag) return;

    var uid = deployState.placingUnit;
    if (!uid) return;

    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (!unit) return;

    var anchor = getAnchorPos(unit);
    var zone = detectZone(anchor.x, anchor.y);

    // Highlight active zone
    highlightAllZonesByDetection(zone);

    // No terrain push-back during deploy — just highlight overlaps (orange glow).
    // Matches movement phase: user sees the warning and repositions manually.
    // Cross-unit collision still resolved to prevent stacking.
    if (anchor.x >= 0) {
      resolveUnitDragCollisions(unit, simState.units);
    }

    renderModels();  // callbacks.afterRender → _updateDeployWallCollisions()
  });
}

// ── Terrain collision — same UX as movement phase ───────
// Orange glow on overlapping models + orange banner.
// Matches movement.js: modelCollidesTerrain, applyModelWallHighlights,
// updateAllWallCollisionWarnings — replicated here to avoid modifying shared/.
function _modelCollidesTerrainDeploy(model) {
  var aabbs = window._terrainAABBs || [];
  var r = model.shape === 'rect' ? Math.max(model.w, model.h) / 2 : model.r;
  for (var i = 0; i < aabbs.length; i++) {
    var box = aabbs[i];
    var lx = box.iA * model.x + box.iC * model.y + box.iE;
    var ly = box.iB * model.x + box.iD * model.y + box.iF;
    var cpx = Math.max(box.minX, Math.min(box.maxX, lx));
    var cpy = Math.max(box.minY, Math.min(box.maxY, ly));
    if (Math.hypot(lx - cpx, ly - cpy) < r - 0.001) return true;
  }
  return false;
}

function _applyDeployWallHighlights(unit) {
  unit.models.forEach(function(m) {
    if (_modelCollidesTerrainDeploy(m)) {
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

function _updateDeployWallCollisions() {
  var banner = document.getElementById('wall-collision-banner');
  document.querySelectorAll('#layer-models .model-base.wall-collision').forEach(function(el) {
    el.classList.remove('wall-collision');
  });
  var anyCollision = false;
  simState.units.forEach(function(unit) {
    if (unit.faction !== 'imp') return;
    if (!deployState.deployedUnits.has(unit.id) && unit.id !== deployState.placingUnit) return;
    var unitHasCollision = false;
    unit.models.forEach(function(m) {
      if (_modelCollidesTerrainDeploy(m)) { unitHasCollision = true; anyCollision = true; }
    });
    if (unitHasCollision) _applyDeployWallHighlights(unit);
  });
  if (banner) banner.style.display = anyCollision ? 'block' : 'none';
}

// ── Auto-confirm on mouseup — detect zone + confirm/snap-back ──
function _deployMouseupHandler() {
  if (deployState.locked) return;
  if (!deployState.placingUnit) return;
  // Only auto-confirm if an actual SVG drag occurred (not a roster click)
  if (!deployState._wasDragging) return;
  deployState._wasDragging = false;

  var uid = deployState.placingUnit;
  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit) return;

  var anchor = getAnchorPos(unit);
  var zone = detectZone(anchor.x, anchor.y);

  if (zone === 'imp' || zone === 'nml' || zone === 'ork' || zone === 'none') {
    // Clamp all models into the imp deployment zone (nearest legal position)
    _clampToZone(unit, IMP_ZONE);
    deployState.deployedUnits.add(uid);
    unit.deployed = true;
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();

  } else if (zone === 'ds') {
    deployState.deepStrikeUnits.add(uid);
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();

  } else if (zone === 'reserves') {
    deployState.reserveUnits.add(uid);
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();

  } else if (zone === 'staging') {
    // Return to staging
    unit.deployed = false;
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();

  } else {
    // Fallback: clamp to imp zone
    _clampToZone(unit, IMP_ZONE);
    deployState.deployedUnits.add(uid);
    unit.deployed = true;
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();
  }
}

function installAutoConfirmOnDrop() {
  window.addEventListener('mouseup', _deployMouseupHandler);
}

// ── Button wiring ────────────────────────────────────────
function wireButtons() {
  // Confirm / Cancel
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.addEventListener('click', confirmPlacement);
  if (btnCancel) btnCancel.addEventListener('click', cancelPlacement);

  // End deployment
  var btnEnd = document.getElementById('btn-end');
  if (btnEnd) btnEnd.addEventListener('click', confirmDeployment);

  // Stratagem modal
  var btnStrat = document.getElementById('btn-strat');
  var modalBg = document.getElementById('modal-bg');
  var modalClose = document.getElementById('modal-close');
  if (btnStrat && modalBg) {
    btnStrat.addEventListener('click', function() { modalBg.style.display = 'flex'; });
  }
  if (modalClose && modalBg) {
    modalClose.addEventListener('click', function() { modalBg.style.display = 'none'; });
  }
  if (modalBg) {
    modalBg.addEventListener('click', function(e) {
      if (e.target === modalBg) modalBg.style.display = 'none';
    });
  }

  // Roster unit clicks → start placement (Imperium only)
  document.querySelectorAll('.rail-unit').forEach(function(el) {
    el.addEventListener('click', function() {
      var uid = el.dataset.unit;
      if (!uid) return;
      var unit = simState.units.find(function(u) { return u.id === uid; });
      if (!unit) return;
      if (unit.faction !== 'imp') {
        deploySelectUnit(uid);
        return;
      }
      if (deployState.locked) {
        deploySelectUnit(uid);
        return;
      }
      // Allow clicking any imp unit (staging or deployed) to start placement
      startPlacement(uid);
    });
  });
}

// ── Keyboard shortcuts ───────────────────────────────────
// Named handler so cleanupDeployment() can remove it
function _deployKeyHandler(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  var key = e.key.toUpperCase();
  if (key === 'ESCAPE' || key === 'X') {
    if (deployState.placingUnit) cancelPlacement();
  }
}
function wireKeyboard() {
  document.addEventListener('keydown', _deployKeyHandler);
}

// ── Click-on-empty deselect ──────────────────────────────
// Named handler so cleanupDeployment() can remove it
function _deployClickOutsideHandler(e) {
  if (e.target === document.getElementById('bf-svg') || e.target.tagName === 'g') {
    if (!deployState.placingUnit) {
      deploySelectUnit(null);
    }
  }
}
function setupClickOutside() {
  var svg = document.getElementById('bf-svg');
  if (!svg) return;
  svg.addEventListener('click', _deployClickOutsideHandler);
}

// ── Cleanup (for integrated phase transition) ────────────
export function cleanupDeployment() {
  // Remove button event listeners by cloning nodes
  ['btn-confirm-unit', 'btn-cancel-unit', 'btn-end'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { var clone = el.cloneNode(true); el.parentNode.replaceChild(clone, el); }
  });

  // Remove roster click listeners by cloning
  document.querySelectorAll('.rail-unit').forEach(function(el) {
    var clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
  });

  // Remove global deploy listeners (keyboard + click-outside + mouseup)
  document.removeEventListener('keydown', _deployKeyHandler);
  window.removeEventListener('mouseup', _deployMouseupHandler);
  var svg = document.getElementById('bf-svg');
  if (svg) svg.removeEventListener('click', _deployClickOutsideHandler);

  // Clear SVG range rings + active range types + wall collision banner
  clearRangeRings();
  activeRangeTypes.clear();
  var banner = document.getElementById('wall-collision-banner');
  if (banner) banner.style.display = 'none';

  // Reset deploy state
  deployState.locked = false;
  deployState.placingUnit = null;

  // Remove deployment-complete class
  document.body.classList.remove('deployment-complete');
}

// ── Init ─────────────────────────────────────────────────
export function initDeployment() {
  // Count units per faction
  simState.units.forEach(function(u) {
    if (u.faction === 'imp') deployState.impTotal++;
    else if (u.faction === 'ork') deployState.orkTotal++;
  });

  // Mark Ork units as deployed (they're pre-placed in scene.js)
  simState.units.forEach(function(u) {
    if (u.faction === 'ork') {
      deployState.deployedUnits.add(u.id);
    }
  });

  // Register selection override
  callbacks.selectUnit = deploySelectUnit;

  // After every renderModels(), reapply wall collision highlights (same pattern as movement.js)
  callbacks.afterRender = function() {
    _updateDeployWallCollisions();
    // Redraw range rings so they follow the unit during drag
    _redrawActiveRangeRings();
  };

  // Wire up UI
  wireButtons();
  wireKeyboard();
  setupClickOutside();
  installDragInterceptor();
  installDragEnforcement();

  // Auto-confirm on mouseup (free drag-and-drop UX)
  installAutoConfirmOnDrop();

  // Override range toggles for single-select behavior
  wireRangeToggleSingleSelect();

  // Initial render
  renderModels();
  updateUI();
}
