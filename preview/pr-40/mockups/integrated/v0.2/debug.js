/**
 * debug.js — Debug panel for the integrated prototype.
 * Provides auto-deploy, phase-skip, and state display.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { selectUnit as baseSelectUnit, renderModels, setCamera } from '../../shared/world/svg-renderer.js';
import { mapData } from '../../shared/state/terrain-data.js';
import { currentPhase, nextPhase, setTransitionCallback } from './phase-machine.js';

// ── Constants (must match deployment.js) ─────────────────
var IMP_ZONE = { xMin: 0, xMax: 240, yMin: 0, yMax: 528 };

// ── Terrain collision check ──────────────────────────────
function modelCollidesTerrainAt(x, y, r) {
  var aabbs = window._terrainAABBs || [];
  for (var i = 0; i < aabbs.length; i++) {
    var box = aabbs[i];
    var lx = box.iA * x + box.iC * y + box.iE;
    var ly = box.iB * x + box.iD * y + box.iF;
    var cpx = Math.max(box.minX, Math.min(box.maxX, lx));
    var cpy = Math.max(box.minY, Math.min(box.maxY, ly));
    if (Math.hypot(lx - cpx, ly - cpy) < r - 0.001) return true;
  }
  return false;
}

function unitCollidesToerrain(unit) {
  for (var i = 0; i < unit.models.length; i++) {
    var m = unit.models[i];
    var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
    if (modelCollidesTerrainAt(m.x, m.y, r)) return true;
  }
  return false;
}

function _placeUnitAt(unit, cx, cy, spacing) {
  var models = unit.models;
  var n = models.length;
  var cols = Math.ceil(Math.sqrt(n));
  var rows = Math.ceil(n / cols);
  var ox = cx - ((cols - 1) * spacing) / 2;
  var oy = cy - ((rows - 1) * spacing) / 2;
  for (var i = 0; i < n; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    models[i].x = ox + col * spacing;
    models[i].y = oy + row * spacing;
  }
}

// ── State ────────────────────────────────────────────────
var _panelVisible = false;
var _onPhaseTransition = null;  // original callback we chain into

// ── Auto Deploy ──────────────────────────────────────────
// Places all undeployed Imperium units in valid positions within
// the deployment zone, arranged to avoid overlap and terrain.
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

    _placeUnitAt(unit, cx, cy, xSpacing);

    // If any model collides with terrain, try shifting positions
    if (unitCollidesToerrain(unit)) {
      var shifted = false;
      // Try different positions within the deployment zone
      var offsets = [
        { dx: -40, dy: 0 }, { dx: 40, dy: 0 },
        { dx: 0, dy: -40 }, { dx: 0, dy: 40 },
        { dx: -40, dy: -40 }, { dx: 40, dy: -40 },
        { dx: -40, dy: 40 }, { dx: 40, dy: 40 },
        { dx: -60, dy: 0 }, { dx: 60, dy: 0 },
        { dx: 0, dy: -60 }, { dx: 0, dy: 60 },
      ];
      for (var i = 0; i < offsets.length; i++) {
        var newCx = cx + offsets[i].dx;
        var newCy = cy + offsets[i].dy;
        // Stay within zone bounds (with margin for model radius)
        if (newCx < 20 || newCx > 220 || newCy < 20 || newCy > 508) continue;
        _placeUnitAt(unit, newCx, newCy, xSpacing);
        if (!unitCollidesToerrain(unit)) { shifted = true; break; }
      }
      // If still colliding, scan the zone more thoroughly
      if (!shifted) {
        for (var sx = 30; sx <= 210; sx += 30) {
          for (var sy = 30; sy <= 500; sy += 30) {
            _placeUnitAt(unit, sx, sy, xSpacing);
            if (!unitCollidesToerrain(unit)) { shifted = true; break; }
          }
          if (shifted) break;
        }
      }
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

// ── Debug Overlays ───────────────────────────────────────
var _collisionGridVisible = false;
var _ruinFootprintsVisible = false;
var _modelsInRuinsVisible = false;

function toggleCollisionGrid() {
  _collisionGridVisible = !_collisionGridVisible;
  var layer = document.getElementById('layer-debug-grid');
  if (!layer) return;
  if (!_collisionGridVisible) { layer.innerHTML = ''; return; }

  // Build grid showing terrain AABB outlines
  var aabbs = window._terrainAABBs || [];
  var NS = 'http://www.w3.org/2000/svg';
  layer.innerHTML = '';

  aabbs.forEach(function(box) {
    var corners = [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY },
      { x: box.minX, y: box.maxY }
    ];
    // Inverse of the inverse = forward. Compute from iA-iF.
    var det = box.iA * box.iD - box.iB * box.iC;
    if (Math.abs(det) < 0.001) return;
    var fA =  box.iD / det, fB = -box.iB / det;
    var fC = -box.iC / det, fD =  box.iA / det;
    var fE = (box.iC * box.iF - box.iD * box.iE) / det;
    var fF = (box.iB * box.iE - box.iA * box.iF) / det;

    var svgCorners = corners.map(function(c) {
      return { x: fA * c.x + fC * c.y + fE, y: fB * c.x + fD * c.y + fF };
    });
    var pts = svgCorners.map(function(c) { return c.x + ',' + c.y; }).join(' ');
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'rgba(255,200,60,0.08)');
    poly.setAttribute('stroke', 'rgba(255,200,60,0.35)');
    poly.setAttribute('stroke-width', '1');
    poly.setAttribute('pointer-events', 'none');
    layer.appendChild(poly);
  });
}

function toggleRuinFootprints() {
  _ruinFootprintsVisible = !_ruinFootprintsVisible;
  var layer = document.getElementById('layer-debug-grid');
  if (!layer) return;

  // Remove existing footprint elements
  layer.querySelectorAll('.debug-ruin-footprint').forEach(function(el) { el.remove(); });
  if (!_ruinFootprintsVisible) return;

  var NS = 'http://www.w3.org/2000/svg';
  var blockers = window._losBlockers || [];

  blockers.forEach(function(b) {
    if (b.kind !== 'tall-ruin') return;
    var svgPts = b.polygon.map(function(p) {
      return {
        x: b.fA * p.x + b.fC * p.y + b.fE,
        y: b.fB * p.x + b.fD * p.y + b.fF
      };
    });
    var pts = svgPts.map(function(c) { return c.x + ',' + c.y; }).join(' ');
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('class', 'debug-ruin-footprint');
    layer.appendChild(poly);
  });
}

function toggleModelsInRuins() {
  _modelsInRuinsVisible = !_modelsInRuinsVisible;
  document.querySelectorAll('#layer-models .model-base.debug-in-ruin').forEach(function(el) {
    el.classList.remove('debug-in-ruin');
  });
  if (!_modelsInRuinsVisible) return;
  _applyModelsInRuinsHighlight();
}

function _pointInPoly(px, py, poly) {
  var inside = false;
  for (var j = 0, k = poly.length - 1; j < poly.length; k = j++) {
    var xi = poly[j].x, yi = poly[j].y;
    var xk = poly[k].x, yk = poly[k].y;
    if (((yi > py) !== (yk > py)) && (px < (xk - xi) * (py - yi) / (yk - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function _applyModelsInRuinsHighlight() {
  if (!_modelsInRuinsVisible) return;
  var blockers = window._losBlockers || [];
  if (!blockers.length) return;

  document.querySelectorAll('#layer-models .model-base').forEach(function(g) {
    var mx = 0, my = 0;
    var circle = g.querySelector('circle');
    var rect = g.querySelector('rect');
    if (circle) {
      mx = parseFloat(circle.getAttribute('cx'));
      my = parseFloat(circle.getAttribute('cy'));
    } else if (rect) {
      mx = parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width')) / 2;
      my = parseFloat(rect.getAttribute('y')) + parseFloat(rect.getAttribute('height')) / 2;
    }

    var inside = false;
    for (var i = 0; i < blockers.length; i++) {
      var b = blockers[i];
      var lx = b.iA * mx + b.iC * my + b.iE;
      var ly = b.iB * mx + b.iD * my + b.iF;
      if (_pointInPoly(lx, ly, b.polygon)) { inside = true; break; }
    }
    g.classList.toggle('debug-in-ruin', inside);
  });
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

  // Debug overlay checkboxes
  var dbgGrid = document.getElementById('dbg-collision-grid');
  if (dbgGrid) {
    dbgGrid.addEventListener('change', function() { toggleCollisionGrid(); });
  }
  var dbgRuins = document.getElementById('dbg-ruin-footprints');
  if (dbgRuins) {
    dbgRuins.addEventListener('change', function() { toggleRuinFootprints(); });
  }
  var dbgModelsInRuins = document.getElementById('dbg-models-in-ruins');
  if (dbgModelsInRuins) {
    dbgModelsInRuins.addEventListener('change', function() { toggleModelsInRuins(); });
  }
  var dbgLos = document.getElementById('dbg-los-lines');
  if (dbgLos) {
    dbgLos.addEventListener('change', function() {
      document.body.classList.toggle('debug-los-enhanced', dbgLos.checked);
      // Move target-lines layer on top of models when enhanced
      var svg = document.getElementById('bf-svg');
      var targetLines = document.getElementById('layer-target-lines');
      if (svg && targetLines) {
        if (dbgLos.checked) {
          // Move to end of SVG (renders on top of everything)
          svg.appendChild(targetLines);
        } else {
          // Restore original position (before layer-range-rings)
          var rangeRings = document.getElementById('layer-range-rings');
          if (rangeRings) svg.insertBefore(targetLines, rangeRings);
        }
      }
    });
  }

  // Hook into afterRender to maintain debug overlays after model re-renders
  var _origAfterRender = callbacks.afterRender;
  callbacks.afterRender = function() {
    if (_origAfterRender) _origAfterRender();
    if (_modelsInRuinsVisible) _applyModelsInRuinsHighlight();
  };

  // Update state display on phase transitions
  _updateStateDisplay();
}
