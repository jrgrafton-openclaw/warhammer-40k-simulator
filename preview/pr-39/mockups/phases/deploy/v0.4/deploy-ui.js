/**
 * deploy-ui.js — Deployment UI updates, placement flow, and range ring controls.
 * ES module. Part of deployment v0.4.
 */
import { simState, callbacks, currentUnit, activeRangeTypes } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, setCamera } from '../../../shared/world/svg-renderer.js';
import { drawPerModelRangeRings, clearRangeRings } from '../../../shared/world/range-rings.js';
import { deployState, IMP_ZONE, getAnchorPos, detectZone, isUnitInZone,
         showZoneWarning, highlightZones, _snapBack } from './deploy-helpers.js';

// ── UI updates ──
export function updateUI() {
  updateStatusLabel();
  updateSubtitle();
  updateRosterPills();
  checkDeploymentComplete();
}
export function updateStatusLabel() {
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
export function updateSubtitle() {
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
export function updateRosterPills() {
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

export function checkDeploymentComplete() {
  var placed = 0, total = 0;
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
export function confirmDeployment() {
  var btn = document.getElementById('btn-end');
  if (btn && btn.disabled) return;
  deployState.locked = true;
  btn.textContent = '✓ DEPLOYMENT LOCKED'; btn.disabled = true;
  btn.style.background = 'rgba(0,200,80,0.15)'; btn.style.borderColor = 'rgba(0,200,80,0.4)'; btn.style.color = '#00c850';
  var sub = document.getElementById('deploy-subtitle');
  if (sub) sub.textContent = 'Deployment Complete — Ready for Command Phase';
  deployState.placingUnit = null;
  var btnConfirm = document.getElementById('btn-confirm-unit'), btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;  if (btnCancel) btnCancel.disabled = true;
  document.body.classList.add('deployment-complete');
  var inner = document.getElementById('battlefield-inner');
  if (inner) {
    inner.style.transition = 'transform 0.6s ease';
    setCamera(0, 0, 0.5);
    setTimeout(function() { inner.style.transition = ''; }, 700);
  }
}

export function startPlacement(unitId) {
  if (deployState.locked) return;
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;
  if (deployState.placingUnit && deployState.placingUnit !== unitId) cancelPlacement();
  var wasDeployed = deployState.deployedUnits.has(unitId);
  var wasDS = deployState.deepStrikeUnits.has(unitId);
  var wasReserves = deployState.reserveUnits.has(unitId);
  deployState.deployedUnits.delete(unitId);
  deployState.reserveUnits.delete(unitId);
  deployState.deepStrikeUnits.delete(unitId);
  deployState.placingUnit = unitId;
  deployState.stagingPositions[unitId] = unit.models.map(function(m) { return { x: m.x, y: m.y }; });
  deployState._preDragZone = wasDeployed ? 'imp' : wasDS ? 'ds' : wasReserves ? 'reserves' : 'staging';
  renderModels();
  baseSelectUnit(unitId);
  updateUI();
  highlightZones(true);
}
export function confirmPlacement() {
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
    deployState.deepStrikeUnits.add(unitId);
    deployState.reserveUnits.delete(unitId);
    deployState.placingUnit = null;
    finishPlacement();
    checkDeploymentComplete();
  } else if (zone === 'reserves') {
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
export function cancelPlacement() {
  var unitId = deployState.placingUnit;
  if (!unitId) return;
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;
  // Snap back to pre-drag position and restore previous deployment status
  _snapBack(unitId, unit);
}
export function finishPlacement() {
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
  highlightZones(false);
  renderModels();  // callbacks.afterRender → _updateDeployWallCollisions()
  updateUI();
}
export function shakeConfirm() {
  var btn = document.getElementById('btn-confirm-unit');
  if (btn) {
    btn.classList.add('shake-error');
    setTimeout(function() { btn.classList.remove('shake-error'); }, 400);
  }
}

// ── Selection override + range rings ──
export function _parseRange(rng) {
  if (!rng || rng === '—' || rng === 'Melee') return 0;
  return parseFloat(rng) || 0;
}
export function _addWeaponRangeButtons(uid) {
  var u = UNITS[uid]; if (!u) return;
  var rangesEl = document.getElementById('card-ranges');
  if (!rangesEl) return;
  // Remove any existing weapon buttons from previous selection
  rangesEl.querySelectorAll('.range-toggle.weapon').forEach(function(b) { b.remove(); });
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
    var shortName = w.name.length > 14 ? w.name.split(/[\s(]/)[0] : w.name;
    btn.innerHTML = shortName + '<br>' + w.range + '"';
    btn.title = w.name + ' — ' + w.range + '" range';
    var color = WEAPON_COLORS[i % WEAPON_COLORS.length];
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasActive = btn.classList.contains('active');
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
  // Click-and-drag horizontal scrolling (with 4px dead zone for clicks)
  if (!rangesEl._dragScrollWired) {
    var _ds = { down: false, dragging: false, startX: 0, scrollStart: 0 };
    rangesEl.addEventListener('mousedown', function(e) {
      if (rangesEl.scrollWidth <= rangesEl.clientWidth) return;
      _ds.down = true; _ds.dragging = false;
      _ds.startX = e.pageX; _ds.scrollStart = rangesEl.scrollLeft;
    });
    window.addEventListener('mousemove', function(e) {
      if (!_ds.down) return;
      var dx = e.pageX - _ds.startX;
      if (!_ds.dragging && Math.abs(dx) > 4) {
        _ds.dragging = true;
        rangesEl.style.cursor = 'grabbing';
      }
      if (_ds.dragging) rangesEl.scrollLeft = _ds.scrollStart - dx;
    });
    window.addEventListener('mouseup', function() {
      _ds.down = false; _ds.dragging = false;
      rangesEl.style.cursor = rangesEl.scrollWidth > rangesEl.clientWidth ? 'grab' : '';
    });
    rangesEl.style.cursor = 'grab';
    rangesEl._dragScrollWired = true;
  }
}
export function deploySelectUnit(uid) {
  if (!uid) {
    baseSelectUnit(null);
    clearRangeRings();
    return;
  }
  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit) return;
  activeRangeTypes.clear();
  clearRangeRings();
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

// ── Range toggle colors + redraw ──
export var _DEPLOY_RANGE_COLORS = {
  move:    { fill: 'rgba(0,212,255,0.06)', stroke: 'rgba(0,212,255,0.3)' },
  advance: { fill: 'rgba(204,136,0,0.06)', stroke: 'rgba(204,136,0,0.3)' },
  charge:  { fill: 'rgba(204,100,0,0.06)', stroke: 'rgba(204,100,0,0.3)' },
  ds:      { fill: 'rgba(186,126,255,0.06)', stroke: 'rgba(186,126,255,0.3)' }
};
export function _redrawActiveRangeRings() {
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
export function wireRangeToggleSingleSelect() {
  var types = ['move', 'advance', 'charge', 'ds'];
  var buttons = {};
  types.forEach(function(t) { buttons[t] = document.getElementById('rt-' + t); });
  types.forEach(function(t) {
    var btn = buttons[t];
    if (!btn) return;
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    buttons[t] = newBtn;
    newBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasActive = newBtn.classList.contains('active');
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
