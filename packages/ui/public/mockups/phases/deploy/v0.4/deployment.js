/**
 * deployment.js — v0.4 Deployment state machine with SVG tabletop extension.
 * Staging/DS/Reserves are SVG zones on an extended canvas (negative x).
 * Standard 2-column layout, no extra HTML panels.
 * ES module.
 */

import { PX_PER_INCH, simState, callbacks, currentUnit, activeRangeTypes } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion, updateRangeCirclesFromUnit, clearRangeCircles,
         applyTx, getCamera } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { drawPerModelRangeRings, clearRangeRings } from '../../../shared/world/range-rings.js';

// ── Constants ────────────────────────────────────────────
var BOARD_W = 720;
var BOARD_H = 528;
var IMP_ZONE      = { xMin: 0,    xMax: 240,  yMin: 0,   yMax: BOARD_H };
var ORK_ZONE      = { xMin: 480,  xMax: 720,  yMin: 0,   yMax: BOARD_H };
var NML_ZONE      = { xMin: 240,  xMax: 480,  yMin: 0,   yMax: BOARD_H };
var STAGING_ZONE  = { xMin: -540, xMax: -290, yMin: 20,  yMax: 508 };
var DS_ZONE       = { xMin: -270, xMax: -20,  yMin: 20,  yMax: 250 };
var RESERVES_ZONE = { xMin: -270, xMax: -20,  yMin: 278, yMax: 508 };

// ── Deployment state ─────────────────────────────────────
var deployState = {
  activePlayer: 'imp',
  deployedUnits: new Set(),
  reserveUnits: new Set(),
  deepStrikeUnits: new Set(),
  placingUnit: null,
  stagingPositions: {},   // unit id → [{x,y}, ...] original staging model positions
  impTotal: 0,
  orkTotal: 0,
  locked: false
};

// Expose for renderModels to detect off-board units
window.__deployedUnitIds = deployState.deployedUnits;

// ── Zone helpers ─────────────────────────────────────────
function getDeployZone(faction) {
  return faction === 'imp' ? IMP_ZONE : ORK_ZONE;
}

function isInZone(x, y, r, zone) {
  return (x - r) >= zone.xMin && (x + r) <= zone.xMax &&
         (y - r) >= zone.yMin && (y + r) <= zone.yMax;
}

function isPointInZone(x, y, zone) {
  return x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax;
}

function isUnitInZone(unit, zone) {
  for (var i = 0; i < unit.models.length; i++) {
    var m = unit.models[i];
    var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
    if (!isInZone(m.x, m.y, r, zone)) return false;
  }
  return true;
}

function detectZone(x, y) {
  if (isPointInZone(x, y, IMP_ZONE)) return 'imp';
  if (isPointInZone(x, y, ORK_ZONE)) return 'ork';
  if (isPointInZone(x, y, NML_ZONE)) return 'nml';
  if (isPointInZone(x, y, STAGING_ZONE)) return 'staging';
  if (isPointInZone(x, y, DS_ZONE)) return 'ds';
  if (isPointInZone(x, y, RESERVES_ZONE)) return 'reserves';
  return 'none';
}

function getAnchorPos(unit) {
  var m = unit.models[0];
  return { x: m.x, y: m.y };
}

// ── Formation: arrange models in a coherent cluster ──────
function arrangeModels(unit, cx, cy) {
  var models = unit.models;
  var n = models.length;
  if (n === 1) {
    models[0].x = cx;
    models[0].y = cy;
    return;
  }
  var spacing = 17;
  var cols = Math.ceil(Math.sqrt(n));
  var rows = Math.ceil(n / cols);
  var startX = cx - ((cols - 1) * spacing) / 2;
  var startY = cy - ((rows - 1) * spacing) / 2;
  for (var i = 0; i < n; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    models[i].x = startX + col * spacing;
    models[i].y = startY + row * spacing;
  }
}

// ── Placement flow ───────────────────────────────────────
function startPlacement(unitId) {
  if (deployState.locked) return;
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // Cancel any current placement
  if (deployState.placingUnit && deployState.placingUnit !== unitId) {
    cancelPlacement();
  }

  // Track previous deployment status for snap-back
  var wasDeployed = deployState.deployedUnits.has(unitId);
  var wasDS = deployState.deepStrikeUnits.has(unitId);
  var wasReserves = deployState.reserveUnits.has(unitId);

  deployState.deployedUnits.delete(unitId);
  deployState.reserveUnits.delete(unitId);
  deployState.deepStrikeUnits.delete(unitId);
  deployState.placingUnit = unitId;

  // Store current positions so we can snap back on invalid drop
  deployState.stagingPositions[unitId] = unit.models.map(function(m) {
    return { x: m.x, y: m.y };
  });
  // Remember previous zone for snap-back logic
  deployState._preDragZone = wasDeployed ? 'imp' : wasDS ? 'ds' : wasReserves ? 'reserves' : 'staging';

  renderModels();
  baseSelectUnit(unitId);
  updateUI();

  highlightZones(true);
}

function confirmPlacement() {
  var unitId = deployState.placingUnit;
  if (!unitId) return;

  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  var anchor = getAnchorPos(unit);
  var zone = detectZone(anchor.x, anchor.y);

  if (zone === 'imp') {
    // Validate all models are within imp deployment zone
    if (!isUnitInZone(unit, IMP_ZONE)) {
      showZoneWarning();
      shakeConfirm();
      return;
    }
    // Deploy to board
    deployState.deployedUnits.add(unitId);
    unit.deployed = true;
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();

  } else if (zone === 'staging') {
    // Return to staging — restore original staging positions
    var saved = deployState.stagingPositions[unitId];
    if (saved) {
      unit.models.forEach(function(m, i) {
        if (saved[i]) { m.x = saved[i].x; m.y = saved[i].y; }
      });
    }
    deployState.placingUnit = null;
    finishPlacement();

  } else if (zone === 'ds') {
    // Assign to deep strike — leave models wherever the player put them
    deployState.deepStrikeUnits.add(unitId);
    deployState.reserveUnits.delete(unitId);
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();

  } else if (zone === 'reserves') {
    // Assign to reserves — leave models wherever the player put them
    deployState.reserveUnits.add(unitId);
    deployState.deepStrikeUnits.delete(unitId);
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();

  } else {
    // Invalid zone (NML, ork, or off all zones)
    showZoneWarning();
    shakeConfirm();
  }
}

function finishPlacement() {
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
  highlightZones(false);
  renderModels();  // callbacks.afterRender → _updateDeployWallCollisions()
  updateUI();
}

function cancelPlacement() {
  var unitId = deployState.placingUnit;
  if (!unitId) return;

  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // Snap back to pre-drag position and restore previous deployment status
  _snapBack(unitId, unit);
}

function shakeConfirm() {
  var btn = document.getElementById('btn-confirm-unit');
  if (btn) {
    btn.classList.add('shake-error');
    setTimeout(function() { btn.classList.remove('shake-error'); }, 400);
  }
}

// ── Deployment completion ────────────────────────────────
function checkDeploymentComplete() {
  var placed = 0;
  var total = 0;
  simState.units.forEach(function(u) {
    if (u.faction !== 'imp') return;
    total++;
    if (deployState.deployedUnits.has(u.id) ||
        deployState.reserveUnits.has(u.id) ||
        deployState.deepStrikeUnits.has(u.id)) {
      placed++;
    }
  });
  var allImpPlaced = placed === total && total > 0;
  var btn = document.getElementById('btn-end');
  if (btn) {
    btn.disabled = !allImpPlaced;
    btn.title = allImpPlaced ? 'Lock deployment and begin game' : 'Deploy all ' + total + ' Imperium units first (' + placed + '/' + total + ' placed)';
  }
}

function confirmDeployment() {
  var btn = document.getElementById('btn-end');
  if (btn && btn.disabled) return;

  deployState.locked = true;

  btn.textContent = '✓ DEPLOYMENT LOCKED';
  btn.disabled = true;
  btn.style.background = 'rgba(0,200,80,0.15)';
  btn.style.borderColor = 'rgba(0,200,80,0.4)';
  btn.style.color = '#00c850';

  var sub = document.getElementById('deploy-subtitle');
  if (sub) sub.textContent = 'Deployment Complete — Ready for Command Phase';

  deployState.placingUnit = null;
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;

  // Add deployment-complete class to hide zone overlays
  document.body.classList.add('deployment-complete');

  // Animate camera to center the board (tx=0, ty=0 is the natural center)
  var inner = document.getElementById('battlefield-inner');
  if (inner) {
    inner.style.transition = 'transform 0.6s ease';
    inner.style.transform = 'translate(0px, 0px) scale(0.5)';
    setTimeout(function() {
      inner.style.transition = '';
    }, 700);
  }
}

// ── UI updates ───────────────────────────────────────────
function updateUI() {
  updateStatusLabel();
  updateSubtitle();
  updateRosterPills();
  checkDeploymentComplete();
}

function updateStatusLabel() {
  var label = document.getElementById('deploy-status-label');
  if (!label) return;
  var placed = 0;
  simState.units.forEach(function(u) {
    if (u.faction !== 'imp') return;
    if (deployState.deployedUnits.has(u.id) ||
        deployState.reserveUnits.has(u.id) ||
        deployState.deepStrikeUnits.has(u.id)) {
      placed++;
    }
  });
  label.textContent = 'IMPERIUM DEPLOYING · ' + placed + '/' + deployState.impTotal;
}

function updateSubtitle() {
  var sub = document.getElementById('deploy-subtitle');
  if (!sub) return;
  var placed = 0;
  simState.units.forEach(function(u) {
    if (u.faction !== 'imp') return;
    if (deployState.deployedUnits.has(u.id) ||
        deployState.reserveUnits.has(u.id) ||
        deployState.deepStrikeUnits.has(u.id)) {
      placed++;
    }
  });
  sub.textContent = 'Imperium Deploying · ' + placed + '/' + deployState.impTotal + ' units';
}

function updateRosterPills() {
  document.querySelectorAll('.rail-unit').forEach(function(el) {
    var uid = el.dataset.unit;
    var pill = el.querySelector('.roster-state-pill');
    if (!pill) return;

    if (deployState.deployedUnits.has(uid)) {
      pill.textContent = '✓ DEPLOYED';
      pill.className = 'roster-state-pill deploy-state deployed';
    } else if (deployState.reserveUnits.has(uid)) {
      pill.textContent = 'RESERVES';
      pill.className = 'roster-state-pill deploy-state in-reserves';
    } else if (deployState.deepStrikeUnits.has(uid)) {
      pill.textContent = 'DEEP STRIKE';
      pill.className = 'roster-state-pill deploy-state in-reserves';
    } else {
      pill.textContent = 'UNDEPLOYED';
      pill.className = 'roster-state-pill deploy-state';
    }
  });
}

function showZoneWarning(msg) {
  var warn = document.getElementById('zone-warning');
  if (!warn) return;
  if (msg) warn.textContent = msg;
  else warn.textContent = 'OUTSIDE DEPLOYMENT ZONE';
  warn.classList.add('visible');
  setTimeout(function() { warn.classList.remove('visible'); }, 1500);
}

function highlightZones(active) {
  var impZone = document.querySelector('.deploy-zone-bg.imp-zone');
  var stagingZone = document.querySelector('.offboard-zone.staging-zone-bg');
  var dsZone = document.querySelector('.offboard-zone.ds-zone-bg');
  var reservesZone = document.querySelector('.offboard-zone.reserves-zone-bg');

  if (impZone) impZone.classList.toggle('zone-active', active);
  if (stagingZone) stagingZone.classList.toggle('zone-active', active);
  if (dsZone) dsZone.classList.toggle('zone-active', active);
  if (reservesZone) reservesZone.classList.toggle('zone-active', active);
}

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

// ── Clamp unit into a zone (nearest legal position) ─────
// ── Clamp unit into zone as a GROUP (preserve relative layout) ─
function _clampToZone(unit, zone) {
  // Find the minimum shift to bring ALL models inside the zone
  var needRight = 0, needLeft = 0, needDown = 0, needUp = 0;
  unit.models.forEach(function(m) {
    var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
    var minX = zone.xMin + r, maxX = zone.xMax - r;
    var minY = zone.yMin + r, maxY = zone.yMax - r;
    if (m.x < minX) needRight = Math.max(needRight, minX - m.x);
    if (m.x > maxX) needLeft  = Math.max(needLeft,  m.x - maxX);
    if (m.y < minY) needDown  = Math.max(needDown,  minY - m.y);
    if (m.y > maxY) needUp    = Math.max(needUp,    m.y - maxY);
  });
  var dx = needRight - needLeft;
  var dy = needDown - needUp;
  if (dx !== 0 || dy !== 0) {
    unit.models.forEach(function(m) { m.x += dx; m.y += dy; });
  }
  // No terrain push-back — wall collision shown as orange highlight.
  // User repositions manually (matches movement phase UX).
  resolveUnitDragCollisions(unit, simState.units);
}

function _snapBack(uid, unit) {
  var saved = deployState.stagingPositions[uid];
  if (saved) {
    unit.models.forEach(function(m, i) {
      if (saved[i]) { m.x = saved[i].x; m.y = saved[i].y; }
    });
  }
  // Restore previous deployment status
  var prevZone = deployState._preDragZone || 'staging';
  if (prevZone === 'imp') {
    deployState.deployedUnits.add(uid);
    unit.deployed = true;
  } else if (prevZone === 'ds') {
    deployState.deepStrikeUnits.add(uid);
  } else if (prevZone === 'reserves') {
    deployState.reserveUnits.add(uid);
  }
  deployState.placingUnit = null;
  showZoneWarning();
  finishPlacement();
  checkDeploymentComplete();
}

function installAutoConfirmOnDrop() {
  window.addEventListener('mouseup', _deployMouseupHandler);
}

function highlightAllZonesByDetection(activeZoneName) {
  var impZone = document.querySelector('.deploy-zone-bg.imp-zone');
  var stagingZone = document.querySelector('.offboard-zone.staging-zone-bg');
  var dsZone = document.querySelector('.offboard-zone.ds-zone-bg');
  var reservesZone = document.querySelector('.offboard-zone.reserves-zone-bg');

  if (impZone) impZone.classList.toggle('zone-active', activeZoneName === 'imp');
  if (stagingZone) stagingZone.classList.toggle('zone-active', activeZoneName === 'staging');
  if (dsZone) dsZone.classList.toggle('zone-active', activeZoneName === 'ds');
  if (reservesZone) reservesZone.classList.toggle('zone-active', activeZoneName === 'reserves');
}

// ── Selection override ───────────────────────────────────
function _parseRange(rng) {
  if (!rng || rng === '—' || rng === 'Melee') return 0;
  return parseFloat(rng) || 0;
}

function _addWeaponRangeButtons(uid) {
  var u = UNITS[uid]; if (!u) return;
  var rangesEl = document.getElementById('card-ranges');
  if (!rangesEl) return;

  // Collect unique ranged weapons with their ranges
  var weapons = [].concat(u.weapons || []);
  var seen = {};
  var rangedWeapons = [];
  weapons.forEach(function(w) {
    if (w.type === 'MELEE' || !w.rng || w.rng === '—') return;
    var rng = _parseRange(w.rng);
    if (rng <= 0) return;
    var key = w.name + '|' + rng;
    if (seen[key]) return;
    seen[key] = true;
    rangedWeapons.push({ name: w.name, range: rng, kw: w.kw || [] });
  });
  if (rangedWeapons.length === 0) return;

  // Weapon ring color palette (matches shoot v0.9)
  var WEAPON_COLORS = [
    { fill: 'rgba(255,100,60,0.06)', stroke: 'rgba(255,100,60,0.35)' },
    { fill: 'rgba(255,180,40,0.06)', stroke: 'rgba(255,180,40,0.35)' },
    { fill: 'rgba(120,220,80,0.06)', stroke: 'rgba(120,220,80,0.35)' },
    { fill: 'rgba(80,180,255,0.06)', stroke: 'rgba(80,180,255,0.35)' }
  ];

  rangedWeapons.forEach(function(w, i) {
    var btn = document.createElement('button');
    btn.className = 'range-toggle weapon';
    btn.dataset.rangeType = 'weapon-' + i;
    // Short name: first word or abbreviation
    var shortName = w.name.length > 14 ? w.name.split(/[\s(]/)[0] : w.name;
    btn.innerHTML = shortName + '<br>' + w.range + '"';
    btn.title = w.name + ' — ' + w.range + '" range';
    var color = WEAPON_COLORS[i % WEAPON_COLORS.length];

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasActive = btn.classList.contains('active');

      // Deactivate all range toggles (movement + weapon)
      rangesEl.querySelectorAll('.range-toggle').forEach(function(b) {
        b.classList.remove('active');
      });
      clearRangeRings();
      activeRangeTypes.clear();

      if (!wasActive) {
        btn.classList.add('active');
        activeRangeTypes.add('weapon-' + i);
        drawPerModelRangeRings(uid, [{ radiusInches: w.range, fill: color.fill, stroke: color.stroke }]);
      }
    });
    rangesEl.appendChild(btn);
  });
}

function deploySelectUnit(uid) {
  if (!uid) {
    baseSelectUnit(null);
    clearRangeRings();
    return;
  }

  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit) return;

  baseSelectUnit(uid);
  _addWeaponRangeButtons(uid);

  var badge = document.getElementById('unit-state-badge');
  if (badge) {
    if (deployState.deployedUnits.has(uid)) {
      badge.textContent = 'DEPLOYED';
      badge.style.background = 'rgba(0,200,80,0.15)';
      badge.style.color = '#00c850';
    } else if (deployState.reserveUnits.has(uid)) {
      badge.textContent = 'RESERVES';
      badge.style.background = 'rgba(186,126,255,0.15)';
      badge.style.color = '#ba7eff';
    } else if (deployState.deepStrikeUnits.has(uid)) {
      badge.textContent = 'DEEP STRIKE';
      badge.style.background = 'rgba(255,170,0,0.15)';
      badge.style.color = '#ffaa00';
    } else {
      badge.textContent = 'UNDEPLOYED';
      badge.style.background = 'rgba(255,170,0,0.15)';
      badge.style.color = '#ffaa00';
    }
  }
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

// ── Global handlers needed by inline onclick in HTML ─────
window.toggleFaction = function(header) {
  var body = header.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  var chev = header.querySelector('.faction-chevron');
  if (chev) chev.textContent = body.style.display === 'none' ? '▸' : '▾';
};
window.toggleAA = function(header) {
  var body = header.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  var chev = header.querySelector('.aa-chev');
  if (chev) chev.textContent = body.style.display === 'none' ? '▸' : '▾';
};

// ── Single-select range toggles ──────────────────────────
// ── Redraw active range rings at current model positions ─
// Called from callbacks.afterRender so rings follow units during drag.
var _DEPLOY_RANGE_COLORS = {
  move:    { fill: 'rgba(0,212,255,0.06)', stroke: 'rgba(0,212,255,0.3)' },
  advance: { fill: 'rgba(204,136,0,0.06)', stroke: 'rgba(204,136,0,0.3)' },
  charge:  { fill: 'rgba(204,100,0,0.06)', stroke: 'rgba(204,100,0,0.3)' },
  ds:      { fill: 'rgba(186,126,255,0.06)', stroke: 'rgba(186,126,255,0.3)' }
};

function _redrawActiveRangeRings() {
  if (!currentUnit || activeRangeTypes.size === 0) return;
  var u = UNITS[currentUnit]; if (!u) return;
  var t = null;
  activeRangeTypes.forEach(function(v) { t = v; });
  if (!t) return;

  // Movement range types
  if (t === 'move' || t === 'advance' || t === 'charge' || t === 'ds') {
    var radiusInches;
    if (t === 'move') radiusInches = u.M;
    else if (t === 'advance') radiusInches = u.M + 3.5;
    else if (t === 'charge') radiusInches = u.M + 7;
    else if (t === 'ds') radiusInches = 9;
    drawPerModelRangeRings(currentUnit, [{ radiusInches: radiusInches, fill: _DEPLOY_RANGE_COLORS[t].fill, stroke: _DEPLOY_RANGE_COLORS[t].stroke }]);
    return;
  }

  // Weapon range types (weapon-0, weapon-1, etc.)
  if (t.indexOf('weapon-') === 0) {
    var idx = parseInt(t.split('-')[1], 10);
    var weapons = (u.weapons || []).filter(function(w) { return w.type !== 'MELEE' && w.rng && w.rng !== '—'; });
    // Deduplicate by name+range
    var seen = {}; var unique = [];
    weapons.forEach(function(w) {
      var key = w.name + '|' + _parseRange(w.rng);
      if (!seen[key]) { seen[key] = true; unique.push(w); }
    });
    if (idx < unique.length) {
      var WEAPON_COLORS = [
        { fill: 'rgba(255,100,60,0.06)', stroke: 'rgba(255,100,60,0.35)' },
        { fill: 'rgba(255,180,40,0.06)', stroke: 'rgba(255,180,40,0.35)' },
        { fill: 'rgba(120,220,80,0.06)', stroke: 'rgba(120,220,80,0.35)' },
        { fill: 'rgba(80,180,255,0.06)', stroke: 'rgba(80,180,255,0.35)' }
      ];
      var color = WEAPON_COLORS[idx % WEAPON_COLORS.length];
      drawPerModelRangeRings(currentUnit, [{ radiusInches: _parseRange(unique[idx].rng), fill: color.fill, stroke: color.stroke }]);
    }
  }
}

function wireRangeToggleSingleSelect() {
  var types = ['move', 'advance', 'charge', 'ds'];
  var buttons = {};
  types.forEach(function(t) {
    buttons[t] = document.getElementById('rt-' + t);
  });

  types.forEach(function(t) {
    var btn = buttons[t];
    if (!btn) return;

    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    buttons[t] = newBtn;

    newBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasActive = newBtn.classList.contains('active');

      // Deactivate ALL range toggles (movement + weapon) + clear SVG rings
      var rangesEl = document.getElementById('card-ranges');
      if (rangesEl) rangesEl.querySelectorAll('.range-toggle').forEach(function(b) {
        b.classList.remove('active');
      });
      clearRangeRings();

      if (!wasActive) {
        newBtn.classList.add('active');
        activeRangeTypes.clear();
        activeRangeTypes.add(t);
        if (currentUnit) {
          var u = UNITS[currentUnit]; if (!u) return;
          var radiusInches;
          if (t === 'move') radiusInches = u.M;
          else if (t === 'advance') radiusInches = u.M + 3.5;
          else if (t === 'charge') radiusInches = u.M + 7;
          else if (t === 'ds') radiusInches = 9;
          drawPerModelRangeRings(currentUnit, [{
            radiusInches: radiusInches,
            fill: _DEPLOY_RANGE_COLORS[t].fill,
            stroke: _DEPLOY_RANGE_COLORS[t].stroke
          }]);
        }
      } else {
        activeRangeTypes.clear();
      }
    });
  });
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
