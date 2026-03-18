/**
 * debug-deploy.js — Auto-deploy and combat positioning for debug panel.
 * Extracted from debug.js to keep files under 300 lines.
 */

import { simState } from '../shared/state/store.js';
import { renderModels } from '../shared/world/svg-renderer.js';
import { selectUnit as baseSelectUnit } from '../shared/world/svg-renderer.js';

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

export function _placeUnitAt(unit, cx, cy, spacing) {
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

// ── Auto Deploy ──────────────────────────────────────────
export function autoDeploy() {
  var impUnits = simState.units.filter(function(u) {
    return u.faction === 'imp' && !u.deployed;
  });
  if (impUnits.length === 0) return;

  var startX = 80;
  var startY = 40;
  var yStep = 75;
  var xSpacing = 22;

  impUnits.forEach(function(unit, unitIdx) {
    var cx = startX + (unitIdx % 2) * 80;
    var cy = startY + Math.floor(unitIdx / 2) * yStep;

    _placeUnitAt(unit, cx, cy, xSpacing);

    if (unitCollidesToerrain(unit)) {
      var found = false;
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
        if (newCx < 20 || newCx > 220 || newCy < 20 || newCy > 508) continue;
        _placeUnitAt(unit, newCx, newCy, xSpacing);
        if (!unitCollidesToerrain(unit)) { found = true; break; }
      }
      if (!found) {
        for (var sx = 30; sx <= 210; sx += 30) {
          for (var sy = 30; sy <= 500; sy += 30) {
            _placeUnitAt(unit, sx, sy, xSpacing);
            if (!unitCollidesToerrain(unit)) { found = true; break; }
          }
          if (found) break;
        }
      }
    }
    unit.deployed = true;
  });

  if (window.__deployedUnitIds) {
    impUnits.forEach(function(u) { window.__deployedUnitIds.add(u.id); });
  }

  _updateDeployUI(impUnits.length);
  renderModels();
  baseSelectUnit(null);
}

function _updateDeployUI(deployedCount) {
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
  var label = document.getElementById('deploy-status-label');
  var total = simState.units.filter(function(u) { return u.faction === 'imp'; }).length;
  if (label) label.textContent = 'IMPERIUM DEPLOYING · ' + total + '/' + total;
  var sub = document.getElementById('deploy-subtitle');
  if (sub) sub.textContent = 'Imperium Deploying · ' + total + '/' + total + ' units';
  var btn = document.getElementById('btn-end');
  if (btn) { btn.disabled = false; btn.title = 'Lock deployment and begin game'; }
}

// ── Combat Positioning ───────────────────────────────────
export function positionUnitsForPhase(targetPhase) {
  var orks = simState.units.filter(function(u) { return u.faction === 'ork'; });
  if (orks.length === 0) return;

  var impUnits = simState.units.filter(function(u) { return u.faction === 'imp'; });
  var spacing = 22;

  impUnits.forEach(function(unit, idx) {
    var ork = orks[idx % orks.length];
    var orkCenter = _unitCenter(ork);
    var offsetPx;

    if (targetPhase === 'shoot') {
      offsetPx = 240;
    } else if (targetPhase === 'charge') {
      offsetPx = 90;
    } else if (targetPhase === 'fight') {
      offsetPx = 18;
    } else {
      return;
    }

    var unitsPerOrk = Math.ceil(impUnits.length / orks.length);
    var subIdx = Math.floor(idx / orks.length);
    var yOff = (subIdx - (unitsPerOrk - 1) / 2) * 60;

    var targetCx = orkCenter.x - offsetPx;
    var targetCy = orkCenter.y + yOff;
    targetCx = Math.max(30, Math.min(690, targetCx));
    targetCy = Math.max(30, Math.min(498, targetCy));

    _placeUnitAt(unit, targetCx, targetCy, spacing);

    if (unitCollidesToerrain(unit)) {
      var found = false;
      for (var dx = -40; dx <= 40 && !found; dx += 20) {
        for (var dy = -40; dy <= 40 && !found; dy += 20) {
          if (dx === 0 && dy === 0) continue;
          var nx = targetCx + dx, ny = targetCy + dy;
          if (nx < 20 || nx > 700 || ny < 20 || ny > 508) continue;
          _placeUnitAt(unit, nx, ny, spacing);
          if (!unitCollidesToerrain(unit)) found = true;
        }
      }
      if (!found) {
        for (var sx = 30; sx <= 690 && !found; sx += 40) {
          for (var sy = 30; sy <= 500 && !found; sy += 40) {
            _placeUnitAt(unit, sx, sy, spacing);
            if (!unitCollidesToerrain(unit)) {
              if (Math.hypot(sx - orkCenter.x, sy - orkCenter.y) < offsetPx + 60) found = true;
            }
          }
        }
      }
    }
    _resolveAllModelOverlaps(unit);
  });
}

function _unitCenter(unit) {
  var cx = 0, cy = 0;
  unit.models.forEach(function(m) { cx += m.x; cy += m.y; });
  return { x: cx / unit.models.length, y: cy / unit.models.length };
}

function _resolveAllModelOverlaps(unit) {
  for (var iter = 0; iter < 8; iter++) {
    var moved = false;
    unit.models.forEach(function(m) {
      simState.units.forEach(function(other) {
        other.models.forEach(function(om) {
          if (om === m) return;
          var minDist = (m.r || 8) + (om.r || 8) + 2;
          var dx = m.x - om.x, dy = m.y - om.y;
          var dist = Math.hypot(dx, dy);
          if (dist < minDist && dist > 0.01) {
            var push = (minDist - dist) / 2;
            m.x += (dx / dist) * push;
            m.y += (dy / dist) * push;
            moved = true;
          }
        });
      });
    });
    if (!moved) break;
  }
}
