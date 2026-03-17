/**
 * debug.js — Debug panel controller for the integrated prototype.
 * Delegates to debug-deploy.js (auto-deploy, positioning) and
 * debug-overlays.js (collision grid, ruin footprints, LoS, move validation).
 */

import { simState, callbacks } from '../shared/state/store.js';
import { getCurrentPhase, transitionTo } from './scene-registry.js';
import { autoDeploy, positionUnitsForPhase } from './debug-deploy.js';
import { toggleCollisionGrid, toggleRuinFootprints, toggleModelsInRuins,
         applyModelsInRuinsHighlight, startMoveValidationLoop,
         stopMoveValidationLoop } from './debug-overlays.js';

// ── State ────────────────────────────────────────────────
var _panelVisible = false;

// ── Phase Skip ───────────────────────────────────────────
function skipToPhase(targetPhase) {
  var current = getCurrentPhase();
  if (current === targetPhase) return;

  var phases = ['deploy', 'move', 'shoot', 'charge', 'fight', 'game-end'];
  var currentIdx = phases.indexOf(current);
  var targetIdx = phases.indexOf(targetPhase);
  if (targetIdx <= currentIdx) return;

  // Auto-deploy if needed
  if (current === 'deploy' || currentIdx < 1) {
    var undeployed = simState.units.filter(function(u) {
      return u.faction === 'imp' && !u.deployed;
    });
    if (undeployed.length > 0) autoDeploy();
  }

  // Position units for combat phases
  if (targetPhase === 'shoot' || targetPhase === 'charge' || targetPhase === 'fight') {
    positionUnitsForPhase(targetPhase);
  }

  // Transition through each phase
  for (var i = currentIdx + 1; i <= targetIdx; i++) {
    transitionTo(phases[i]);
  }

  _updateStateDisplay();
}

// ── State Display ────────────────────────────────────────
function _updateStateDisplay() {
  var display = document.getElementById('dbg-state-display');
  if (!display) return;

  var phase = getCurrentPhase();
  var deployed = simState.units.filter(function(u) { return u.deployed; }).length;
  var total = simState.units.length;

  display.textContent = 'Phase: ' + phase + '\nDeployed: ' + deployed + '/' + total;

  // Disable skip buttons for passed phases
  var skipBtns = document.querySelectorAll('.phase-skip');
  skipBtns.forEach(function(btn) {
    var phases = ['deploy', 'move', 'shoot', 'charge', 'fight', 'game-end'];
    var btnPhaseIdx = phases.indexOf(btn.dataset.phase);
    var currentIdx = phases.indexOf(phase);
    btn.disabled = btnPhaseIdx <= currentIdx;
  });

  // Disable auto-deploy if not in deploy phase
  var autoBtn = document.getElementById('dbg-auto-deploy');
  if (autoBtn) {
    var allDeployed = simState.units.filter(function(u) {
      return u.faction === 'imp' && !u.deployed;
    }).length === 0;
    autoBtn.disabled = phase !== 'deploy' || allDeployed;
  }
}

// ── Init ─────────────────────────────────────────────────
export function initDebug() {
  var toggle = document.getElementById('debug-toggle');
  var panel = document.getElementById('debug-panel');
  if (!toggle || !panel) return;

  // Toggle panel
  toggle.addEventListener('click', function() {
    _panelVisible = !_panelVisible;
    panel.style.display = _panelVisible ? 'block' : 'none';
    toggle.classList.toggle('active', _panelVisible);
    if (_panelVisible) _updateStateDisplay();
  });

  // Auto-deploy button
  var autoBtn = document.getElementById('dbg-auto-deploy');
  if (autoBtn) {
    autoBtn.addEventListener('click', function() {
      autoDeploy();
      _updateStateDisplay();
    });
  }

  // Phase skip buttons
  document.querySelectorAll('.phase-skip').forEach(function(btn) {
    btn.addEventListener('click', function() { skipToPhase(btn.dataset.phase); });
  });

  // Debug overlay checkboxes
  var dbgGrid = document.getElementById('dbg-collision-grid');
  if (dbgGrid) dbgGrid.addEventListener('change', function() { toggleCollisionGrid(); });

  var dbgRuins = document.getElementById('dbg-ruin-footprints');
  if (dbgRuins) dbgRuins.addEventListener('change', function() { toggleRuinFootprints(); });

  var dbgModelsInRuins = document.getElementById('dbg-models-in-ruins');
  if (dbgModelsInRuins) dbgModelsInRuins.addEventListener('change', function() { toggleModelsInRuins(); });

  // Move validation debug
  var dbgMoveVal = document.getElementById('dbg-move-validation');
  if (dbgMoveVal) {
    dbgMoveVal.addEventListener('change', function() {
      window.__debugMoveValidation = dbgMoveVal.checked;
      if (dbgMoveVal.checked) startMoveValidationLoop();
      else stopMoveValidationLoop();
    });
  }

  // LoS enhancement
  var dbgLos = document.getElementById('dbg-los-lines');
  if (dbgLos) {
    dbgLos.addEventListener('change', function() {
      document.body.classList.toggle('debug-los-enhanced', dbgLos.checked);
      var svg = document.getElementById('bf-svg');
      var targetLines = document.getElementById('layer-target-lines');
      if (svg && targetLines) {
        if (dbgLos.checked) {
          svg.appendChild(targetLines);
        } else {
          var rangeRings = document.getElementById('layer-range-rings');
          if (rangeRings) svg.insertBefore(targetLines, rangeRings);
        }
      }
    });
  }

  // Hook into afterRender for persistent overlays
  var _origAfterRender = callbacks.afterRender;
  callbacks.afterRender = function() {
    if (_origAfterRender) _origAfterRender();
    applyModelsInRuinsHighlight();
  };

  _updateStateDisplay();
}
