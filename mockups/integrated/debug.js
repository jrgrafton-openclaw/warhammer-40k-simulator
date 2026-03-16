/**
 * debug.js — Debug panel for the integrated prototype.
 * Provides auto-deploy, phase-skip, and state display.
 */

import { simState, callbacks } from '../shared/state/store.js';
import { selectUnit as baseSelectUnit, renderModels, setCamera } from '../shared/world/svg-renderer.js';
import { currentPhase, nextPhase, setTransitionCallback } from './phase-machine.js';

// ── Constants (must match deployment.js) ─────────────────
var IMP_ZONE = { xMin: 0, xMax: 240, yMin: 0, yMax: 528 };

// ── State ────────────────────────────────────────────────
var _panelVisible = false;
var _onPhaseTransition = null;  // original callback we chain into

// ── Auto Deploy ──────────────────────────────────────────
// Places all undeployed Imperium units in valid positions within
// the deployment zone, arranged to avoid overlap.
function autoDeploy() {
  var impUnits = simState.units.filter(function(u) {
    return u.faction === 'imp' && !u.deployed;
  });

  if (impUnits.length === 0) return;

  // Layout: stack units vertically in the imp deployment zone
  var startX = 80;   // well inside the zone
  var startY = 40;
  var yStep = 75;     // vertical spacing between units
  var xSpacing = 18;  // model spacing within a unit

  impUnits.forEach(function(unit, unitIdx) {
    var cx = startX + (unitIdx % 2) * 80;  // alternate columns
    var cy = startY + Math.floor(unitIdx / 2) * yStep;

    var models = unit.models;
    var n = models.length;
    var cols = Math.ceil(Math.sqrt(n));
    var rows = Math.ceil(n / cols);
    var ox = cx - ((cols - 1) * xSpacing) / 2;
    var oy = cy - ((rows - 1) * xSpacing) / 2;

    for (var i = 0; i < n; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      models[i].x = ox + col * xSpacing;
      models[i].y = oy + row * xSpacing;
    }

    unit.deployed = true;
  });

  // Update deployment state if the deployment module exposed it
  // We need to trigger the deployment UI to recognize these as deployed.
  // The simplest way: simulate what confirmPlacement does for each unit.
  if (window.__deployedUnitIds) {
    impUnits.forEach(function(u) {
      window.__deployedUnitIds.add(u.id);
    });
  }

  // Update UI elements
  _updateDeployUI(impUnits.length);
  renderModels();
  baseSelectUnit(null);
}

function _updateDeployUI(deployedCount) {
  // Update roster pills
  document.querySelectorAll('.rail-unit').forEach(function(el) {
    var uid = el.dataset.unit;
    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (!unit || unit.faction !== 'imp') return;
    var pill = el.querySelector('.roster-state-pill');
    if (pill && unit.deployed) {
      pill.textContent = '✓ DEPLOYED';
      pill.className = 'roster-state-pill deploy-state deployed';
    }
  });

  // Update status label
  var label = document.getElementById('deploy-status-label');
  var total = simState.units.filter(function(u) { return u.faction === 'imp'; }).length;
  if (label) label.textContent = 'IMPERIUM DEPLOYING · ' + total + '/' + total;

  // Update subtitle
  var sub = document.getElementById('deploy-subtitle');
  if (sub) sub.textContent = 'Imperium Deploying · ' + total + '/' + total + ' units';

  // Enable CONFIRM DEPLOYMENT button
  var btn = document.getElementById('btn-end');
  if (btn) {
    btn.disabled = false;
    btn.title = 'Lock deployment and begin game';
  }
}

// ── Phase Skip ───────────────────────────────────────────
// Auto-deploys if needed, then advances through phases to the target.
function skipToPhase(targetPhase) {
  var current = currentPhase();
  if (current === targetPhase) return;

  // If we're in deploy and units aren't deployed, auto-deploy first
  if (current === 'deploy') {
    var undeployed = simState.units.filter(function(u) {
      return u.faction === 'imp' && !u.deployed;
    });
    if (undeployed.length > 0) {
      autoDeploy();
    }
  }

  // Advance phases until we reach the target
  var phases = ['deploy', 'move', 'shoot', 'charge', 'fight', 'game-end'];
  var currentIdx = phases.indexOf(current);
  var targetIdx = phases.indexOf(targetPhase);

  if (targetIdx <= currentIdx) return;

  for (var i = currentIdx; i < targetIdx; i++) {
    nextPhase();
  }

  _updateStateDisplay();
}

// ── State Display ────────────────────────────────────────
function _updateStateDisplay() {
  var display = document.getElementById('dbg-state-display');
  if (!display) return;

  var phase = currentPhase();
  var deployed = simState.units.filter(function(u) { return u.deployed; }).length;
  var total = simState.units.length;

  display.textContent =
    'Phase: ' + phase + '\n' +
    'Deployed: ' + deployed + '/' + total;

  // Disable skip buttons for already-passed phases
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
    btn.addEventListener('click', function() {
      skipToPhase(btn.dataset.phase);
    });
  });

  // Update state display on phase transitions
  _updateStateDisplay();
}
