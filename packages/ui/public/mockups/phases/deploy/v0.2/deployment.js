/**
 * deployment.js — v0.2 Deployment state machine with staging areas,
 * drag-to-reserves/deep-strike, auto-deploy enemy, streamlined confirm/cancel.
 * ES module.
 */

import { PX_PER_INCH, simState, callbacks, currentUnit, activeRangeTypes } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion, updateRangeCirclesFromUnit, clearRangeCircles } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';

// ── Constants ────────────────────────────────────────────
var BOARD_W = 900;
var BOARD_H = 528;
// Deployment zones (widened staging: 160px each side)
var IMP_ZONE = { xMin: 160, xMax: 330, yMin: 0, yMax: BOARD_H };
var ORK_ZONE = { xMin: 570, xMax: 740, yMin: 0, yMax: BOARD_H };
// Staging areas
var IMP_STAGING = { xMin: 0, xMax: 160, yMin: 0, yMax: BOARD_H };
var ORK_STAGING = { xMin: 740, xMax: 900, yMin: 0, yMax: BOARD_H };
// Drop zones (reserves / deep strike) — SVG coordinates (140x100 each)
var IMP_RESERVES_DZ = { xMin: 10, xMax: 150, yMin: 310, yMax: 410 };
var IMP_DS_DZ       = { xMin: 10, xMax: 150, yMin: 420, yMax: 520 };
var ORK_RESERVES_DZ = { xMin: 750, xMax: 890, yMin: 310, yMax: 410 };
var ORK_DS_DZ       = { xMin: 750, xMax: 890, yMin: 420, yMax: 520 };

// ── Deployment state ─────────────────────────────────────
var deployState = {
  activePlayer: 'imp',
  deployedUnits: new Set(),
  reserveUnits: new Set(),
  deepStrikeUnits: new Set(),
  placingUnit: null,
  impTotal: 0,
  orkTotal: 0,
  unitInDropZone: null,  // 'reserves' | 'deepstrike' | null
  locked: false          // true after confirmDeployment()
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

function isPointInRect(x, y, rect) {
  return x >= rect.xMin && x <= rect.xMax && y >= rect.yMin && y <= rect.yMax;
}

function isUnitInZone(unit) {
  var zone = getDeployZone(unit.faction);
  for (var i = 0; i < unit.models.length; i++) {
    var m = unit.models[i];
    var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
    if (!isInZone(m.x, m.y, r, zone)) return false;
  }
  return true;
}

function clampToZone(x, y, r, zone) {
  return {
    x: Math.max(zone.xMin + r, Math.min(zone.xMax - r, x)),
    y: Math.max(zone.yMin + r, Math.min(zone.yMax - r, y))
  };
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

// ── Position undeployed units in staging area (SVG models) ──
function positionUnitsInStaging() {
  var impY = 55;
  var orkY = 55;
  var spacing = 22;

  simState.units.forEach(function(unit) {
    if (deployState.deployedUnits.has(unit.id)) return;
    if (deployState.placingUnit === unit.id) return;

    var staging, cx;
    if (unit.faction === 'imp') {
      staging = IMP_STAGING;
      cx = (staging.xMin + staging.xMax) / 2;
      // Skip reserves/deep strike units (keep off-screen)
      if (deployState.reserveUnits.has(unit.id) ||
          deployState.deepStrikeUnits.has(unit.id)) {
        unit.models.forEach(function(m) { m.x = -9999; m.y = -9999; });
        return;
      }
      arrangeModels(unit, cx, impY);
      // Advance Y for next unit
      var rows = Math.ceil(unit.models.length / Math.ceil(Math.sqrt(unit.models.length)));
      impY += rows * spacing + 15;
    } else if (unit.faction === 'ork') {
      staging = ORK_STAGING;
      cx = (staging.xMin + staging.xMax) / 2;
      if (deployState.reserveUnits.has(unit.id) ||
          deployState.deepStrikeUnits.has(unit.id)) {
        unit.models.forEach(function(m) { m.x = -9999; m.y = -9999; });
        return;
      }
      // Orks are pre-deployed, skip
      return;
    }
  });
}

// ── Staging token rendering ──────────────────────────────
function renderStagingTokens() {
  var impContainer = document.getElementById('staging-tokens-imp');
  var orkContainer = document.getElementById('staging-tokens-ork');
  if (!impContainer || !orkContainer) return;

  // Clear HTML tokens — we now use SVG models in staging
  impContainer.innerHTML = '';
  orkContainer.innerHTML = '';

  // Position undeployed units in staging area as actual SVG models
  positionUnitsInStaging();
}

function onStagingTokenClick(unitId) {
  if (deployState.locked) return;
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;
  if (unit.faction !== 'imp') return;
  if (deployState.deployedUnits.has(unitId)) return;

  // Remove from reserves/deep strike if assigned
  deployState.reserveUnits.delete(unitId);
  deployState.deepStrikeUnits.delete(unitId);

  startPlacement(unitId);
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

  deployState.reserveUnits.delete(unitId);
  deployState.deepStrikeUnits.delete(unitId);
  deployState.placingUnit = unitId;
  deployState.unitInDropZone = null;

  // Position models in center of deployment zone
  var zone = getDeployZone(unit.faction);
  var cx = (zone.xMin + zone.xMax) / 2;
  var cy = BOARD_H / 2;
  arrangeModels(unit, cx, cy);

  // Clamp to zone
  clampUnitToZone(unit);

  renderModels();
  baseSelectUnit(unitId);
  updateUI();

  // Enable confirm/cancel
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) {
    btnConfirm.disabled = false;
    btnConfirm.textContent = '✓ CONFIRM';
  }
  if (btnCancel) btnCancel.disabled = false;

  highlightActiveZone(true);
}

function clampUnitToZone(unit) {
  var zone = getDeployZone(unit.faction);
  unit.models.forEach(function(m) {
    var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
    var clamped = clampToZone(m.x, m.y, r, zone);
    m.x = clamped.x;
    m.y = clamped.y;
  });
}

function confirmPlacement() {
  var unitId = deployState.placingUnit;
  if (!unitId) return;

  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // If unit was dropped in a drop zone, handle that
  if (deployState.unitInDropZone === 'reserves') {
    assignToReserves(unitId);
    return;
  }
  if (deployState.unitInDropZone === 'deepstrike') {
    assignToDeepStrike(unitId);
    return;
  }

  // Validate zone
  if (!isUnitInZone(unit)) {
    showZoneWarning();
    var btn = document.getElementById('btn-confirm-unit');
    if (btn) {
      btn.classList.add('shake-error');
      setTimeout(function() { btn.classList.remove('shake-error'); }, 400);
    }
    return;
  }

  // Mark as deployed
  deployState.deployedUnits.add(unitId);
  unit.deployed = true;
  deployState.placingUnit = null;
  deployState.unitInDropZone = null;

  // Disable confirm/cancel
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;

  highlightActiveZone(false);
  clearDropZoneHighlights();
  renderModels();
  updateUI();
  checkDeploymentComplete();
}

function cancelPlacement() {
  var unitId = deployState.placingUnit;
  if (!unitId) return;

  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // Return to staging (positionUnitsInStaging will place them)
  deployState.placingUnit = null;
  deployState.unitInDropZone = null;

  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;

  highlightActiveZone(false);
  clearDropZoneHighlights();
  renderModels();
  updateUI();
}

function assignToReserves(unitId) {
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  deployState.reserveUnits.add(unitId);
  deployState.deepStrikeUnits.delete(unitId);
  unit.models.forEach(function(m) { m.x = -9999; m.y = -9999; });
  deployState.placingUnit = null;
  deployState.unitInDropZone = null;

  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;

  highlightActiveZone(false);
  clearDropZoneHighlights();
  renderModels();
  updateUI();
  checkDeploymentComplete();
}

function assignToDeepStrike(unitId) {
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  deployState.deepStrikeUnits.add(unitId);
  deployState.reserveUnits.delete(unitId);
  unit.models.forEach(function(m) { m.x = -9999; m.y = -9999; });
  deployState.placingUnit = null;
  deployState.unitInDropZone = null;

  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;

  highlightActiveZone(false);
  clearDropZoneHighlights();
  renderModels();
  updateUI();
  checkDeploymentComplete();
}

// ── Drop zone detection ─────────────────────────────────
function getDropZoneForUnit(unit) {
  if (!unit || unit.models.length === 0) return null;
  var m = unit.models[0];
  var dz = unit.faction === 'imp'
    ? { reserves: IMP_RESERVES_DZ, ds: IMP_DS_DZ }
    : { reserves: ORK_RESERVES_DZ, ds: ORK_DS_DZ };

  if (isPointInRect(m.x, m.y, dz.reserves)) return 'reserves';
  if (isPointInRect(m.x, m.y, dz.ds)) return 'deepstrike';
  return null;
}

function highlightDropZones(faction, dropType) {
  clearDropZoneHighlights();
  if (!dropType) return;

  var prefix = faction === 'imp' ? 'imp' : 'ork';
  if (dropType === 'reserves') {
    var el = document.getElementById(prefix + '-reserves-dz');
    if (el) el.classList.add('dz-highlight');
  } else if (dropType === 'deepstrike') {
    var el = document.getElementById(prefix + '-deepstrike-dz');
    if (el) el.classList.add('dz-highlight');
  }
}

function clearDropZoneHighlights() {
  document.querySelectorAll('.drop-zone-bg').forEach(function(el) {
    el.classList.remove('dz-highlight');
  });
}

// ── Deployment completion ────────────────────────────────
function checkDeploymentComplete() {
  var allImpPlaced = simState.units.every(function(u) {
    if (u.faction !== 'imp') return true;
    return deployState.deployedUnits.has(u.id) ||
      deployState.reserveUnits.has(u.id) ||
      deployState.deepStrikeUnits.has(u.id);
  });
  var btn = document.getElementById('btn-end');
  if (btn) btn.disabled = !allImpPlaced;
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
}

// ── UI updates ───────────────────────────────────────────
function updateUI() {
  updateStatusLabel();
  updateSubtitle();
  updateRosterPills();
  renderStagingTokens();
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

function showZoneWarning() {
  var warn = document.getElementById('zone-warning');
  if (!warn) return;
  warn.classList.add('visible');
  setTimeout(function() { warn.classList.remove('visible'); }, 1500);
}

function highlightActiveZone(active) {
  var faction = deployState.placingUnit ?
    simState.units.find(function(u) { return u.id === deployState.placingUnit; })?.faction :
    'imp';
  var impZone = document.querySelector('.deploy-zone-bg.imp-zone');
  var orkZone = document.querySelector('.deploy-zone-bg.ork-zone');
  if (impZone) impZone.classList.toggle('zone-active', active && faction === 'imp');
  if (orkZone) orkZone.classList.toggle('zone-active', active && faction === 'ork');
}

// ── Drag enforcement ─────────────────────────────────────
function installDragInterceptor() {
  var _drag = simState.drag;
  Object.defineProperty(simState, 'drag', {
    get: function() { return _drag; },
    set: function(v) {
      if (deployState.locked) { return; }
      if (v && v.unitId) {
        var uid = v.unitId;
        if (uid !== deployState.placingUnit) {
          if (deployState.deployedUnits.has(uid)) {
            baseSelectUnit(uid);
          }
          return;
        }
      }
      _drag = v;
    },
    configurable: true, enumerable: true
  });
}

function installDragEnforcement() {
  var svg = document.getElementById('bf-svg');
  if (!svg) return;

  svg.addEventListener('mousemove', function() {
    if (deployState.locked) return;
    if (!simState.drag || !simState.drag.unitId) return;
    var uid = simState.drag.unitId;
    if (uid !== deployState.placingUnit) return;

    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (!unit) return;

    // Check if unit anchor is in a drop zone
    var dropType = getDropZoneForUnit(unit);
    deployState.unitInDropZone = dropType;
    highlightDropZones(unit.faction, dropType);

    // Update confirm button state based on position
    var btnConfirm = document.getElementById('btn-confirm-unit');
    if (btnConfirm) {
      if (dropType) {
        btnConfirm.disabled = false;
        btnConfirm.textContent = dropType === 'reserves' ? '✓ TO RESERVES' : '✓ TO DEEP STRIKE';
      } else if (isUnitInZone(unit)) {
        btnConfirm.disabled = false;
        btnConfirm.textContent = '✓ CONFIRM';
      } else {
        btnConfirm.disabled = true;
        btnConfirm.textContent = '✓ CONFIRM';
      }
    }

    // Don't clamp if in staging/drop zone area
    var anchorModel = unit.models[0];
    var inStaging = isPointInRect(anchorModel.x, anchorModel.y,
      unit.faction === 'imp' ? IMP_STAGING : ORK_STAGING);

    if (!inStaging && !dropType) {
      // Clamp to deployment zone
      var zone = getDeployZone(unit.faction);
      var wasOutside = false;
      unit.models.forEach(function(m) {
        var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
        if (!isInZone(m.x, m.y, r, zone)) {
          var clamped = clampToZone(m.x, m.y, r, zone);
          m.x = clamped.x;
          m.y = clamped.y;
          wasOutside = true;
        }
      });
      if (wasOutside) showZoneWarning();
    }

    // Terrain collision
    var aabbs = window._terrainAABBs || [];
    unit.models.forEach(function(m) {
      if (m.shape === 'rect') return;
      var resolved = resolveTerrainCollision(m.x, m.y, m.r, aabbs);
      m.x = resolved.x;
      m.y = resolved.y;
    });

    // Cross-unit collision
    resolveUnitDragCollisions(unit, simState.units);

    renderModels();
  });
}

// ── Selection override ───────────────────────────────────
function deploySelectUnit(uid) {
  if (!uid) {
    baseSelectUnit(null);
    return;
  }

  var unit = simState.units.find(function(u) { return u.id === uid; });
  if (!unit) return;

  baseSelectUnit(uid);

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
      if (deployState.deployedUnits.has(uid)) {
        deploySelectUnit(uid);
        return;
      }
      deployState.reserveUnits.delete(uid);
      deployState.deepStrikeUnits.delete(uid);
      startPlacement(uid);
    });
  });
}

// ── Keyboard shortcuts ───────────────────────────────────
function wireKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var key = e.key.toUpperCase();
    if (key === 'ENTER' || key === 'C') {
      if (deployState.placingUnit) confirmPlacement();
    } else if (key === 'ESCAPE' || key === 'X') {
      if (deployState.placingUnit) cancelPlacement();
    }
  });
}

// ── Click-on-empty deselect ──────────────────────────────
function setupClickOutside() {
  var svg = document.getElementById('bf-svg');
  if (!svg) return;
  svg.addEventListener('click', function(e) {
    if (e.target === svg || e.target.tagName === 'g') {
      if (!deployState.placingUnit) {
        deploySelectUnit(null);
      }
    }
  });
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

  // Wire up UI
  wireButtons();
  wireKeyboard();
  setupClickOutside();
  installDragInterceptor();
  installDragEnforcement();

  // Bug 7: Override range toggles for single-select behavior
  wireRangeToggleSingleSelect();

  // Initial render — position undeployed units in staging
  positionUnitsInStaging();
  renderModels();
  renderStagingTokens();
  updateUI();
}

// ── Single-select range toggles (Bug 7) ──────────────────
function wireRangeToggleSingleSelect() {
  var types = ['move', 'advance', 'charge', 'ds'];
  var buttons = {};
  types.forEach(function(t) {
    buttons[t] = document.getElementById('rt-' + t);
  });

  types.forEach(function(t) {
    var btn = buttons[t];
    if (!btn) return;

    // Clone to remove existing listeners from initBattleControls
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    buttons[t] = newBtn;

    newBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasActive = newBtn.classList.contains('active');

      // Deactivate ALL range toggles and hide ALL range circles
      types.forEach(function(ot) {
        var ob = buttons[ot];
        if (ob) ob.classList.remove('active');
        var circle = document.getElementById('range-' + ot);
        var label = document.getElementById('range-' + ot + '-label');
        if (circle) circle.style.display = 'none';
        if (label) label.style.display = 'none';
      });

      // If it wasn't active, activate this one
      if (!wasActive) {
        newBtn.classList.add('active');
        activeRangeTypes.clear();
        activeRangeTypes.add(t);
        if (currentUnit) updateRangeCirclesFromUnit(currentUnit);
      } else {
        activeRangeTypes.clear();
        clearRangeCircles();
      }
    });
  });
}
