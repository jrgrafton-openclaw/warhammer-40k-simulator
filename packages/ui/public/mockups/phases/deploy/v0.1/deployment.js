/**
 * deployment.js — Deployment state machine, zone validation, reserves management,
 * drag enforcement, and UI wiring (ES module).
 */

import { PX_PER_INCH, simState, callbacks, currentUnit } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';

// ── Constants ────────────────────────────────────────────
var BOARD_W = 720;
var BOARD_H = 528;
// Deployment zones: left third for Imperium, right third for Orks
var IMP_ZONE = { xMin: 0, xMax: 240, yMin: 0, yMax: BOARD_H };
var ORK_ZONE = { xMin: 480, xMax: BOARD_W, yMin: 0, yMax: BOARD_H };

// ── Deployment state ─────────────────────────────────────
var deployState = {
  activePlayer: 'imp',        // 'imp' | 'ork' — alternates after each placement
  mode: 'place',              // 'place' | 'reserves'
  deployedUnits: new Set(),   // unit IDs on the board
  reserveUnits: new Set(),    // unit IDs assigned to strategic reserves
  deepStrikeUnits: new Set(), // unit IDs assigned to deep strike
  placingUnit: null,          // unit ID currently being positioned (not yet confirmed)
  impTotal: 0,                // total imp units
  orkTotal: 0,                // total ork units
  impPlaced: 0,               // imp units deployed or in reserves
  orkPlaced: 0                // ork units deployed or in reserves
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
  // Place in rows with 2" coherency spacing (~17px between bases)
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

// ── Reserve panel management ─────────────────────────────
function buildReserveCard(unit, unitData) {
  var card = document.createElement('div');
  card.className = 'reserve-card faction-' + unit.faction;
  card.dataset.unitId = unit.id;
  card.innerHTML =
    '<div class="rc-icon">' + unit.models.length + '</div>' +
    '<span class="rc-name">' + unitData.name + '</span>' +
    '<span class="rc-count">×' + unit.models.length + '</span>';
  card.addEventListener('click', function() {
    onReserveCardClick(unit.id);
  });
  return card;
}

function populateReservePanels() {
  var impUndep = document.getElementById('imp-undeployed');
  var orkUndep = document.getElementById('ork-undeployed');
  var impStrat = document.getElementById('imp-strategic');
  var orkStrat = document.getElementById('ork-strategic');
  var impDs    = document.getElementById('imp-deepstrike');
  var orkDs    = document.getElementById('ork-deepstrike');

  // Clear all
  [impUndep, orkUndep, impStrat, orkStrat, impDs, orkDs].forEach(function(el) {
    if (el) el.innerHTML = '';
  });

  simState.units.forEach(function(unit) {
    var ud = UNITS[unit.id];
    if (!ud) return;
    var card = buildReserveCard(unit, ud);

    if (deployState.deployedUnits.has(unit.id)) {
      // deployed — don't show in reserves
      return;
    }
    if (deployState.reserveUnits.has(unit.id)) {
      var stratList = unit.faction === 'imp' ? impStrat : orkStrat;
      if (stratList) stratList.appendChild(card);
      return;
    }
    if (deployState.deepStrikeUnits.has(unit.id)) {
      var dsList = unit.faction === 'imp' ? impDs : orkDs;
      if (dsList) dsList.appendChild(card);
      return;
    }
    // Undeployed
    var undepList = unit.faction === 'imp' ? impUndep : orkUndep;
    if (undepList) undepList.appendChild(card);
  });

  // Highlight selected card
  document.querySelectorAll('.reserve-card').forEach(function(c) {
    c.classList.toggle('selected', c.dataset.unitId === deployState.placingUnit);
  });
}

function onReserveCardClick(unitId) {
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // Can only interact with current player's units
  if (unit.faction !== deployState.activePlayer) return;

  // If already deployed or in reserves, ignore
  if (deployState.deployedUnits.has(unitId)) return;

  if (deployState.mode === 'reserves') {
    assignToReserves(unitId);
    return;
  }

  // Place mode: start placing this unit
  startPlacement(unitId);
}

// ── Placement flow ───────────────────────────────────────
function startPlacement(unitId) {
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // Remove from reserves if it was there
  deployState.reserveUnits.delete(unitId);
  deployState.deepStrikeUnits.delete(unitId);

  deployState.placingUnit = unitId;

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
  if (btnConfirm) btnConfirm.disabled = false;
  if (btnCancel) btnCancel.disabled = false;

  // Highlight deployment zone
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

  // Update counts
  if (unit.faction === 'imp') deployState.impPlaced++;
  else deployState.orkPlaced++;

  // Disable confirm/cancel
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;

  highlightActiveZone(false);
  advanceTurn();
  renderModels();
  updateUI();
}

function cancelPlacement() {
  var unitId = deployState.placingUnit;
  if (!unitId) return;

  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // Move models back off-screen
  unit.models.forEach(function(m) { m.x = -9999; m.y = -9999; });
  deployState.placingUnit = null;

  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;

  highlightActiveZone(false);
  renderModels();
  updateUI();
}

function assignToReserves(unitId) {
  var unit = simState.units.find(function(u) { return u.id === unitId; });
  if (!unit) return;

  // Can only assign current player's units
  if (unit.faction !== deployState.activePlayer) return;
  if (deployState.deployedUnits.has(unitId)) return;

  // Toggle: if already in reserves, remove
  if (deployState.reserveUnits.has(unitId)) {
    deployState.reserveUnits.delete(unitId);
  } else {
    deployState.deepStrikeUnits.delete(unitId);
    deployState.reserveUnits.add(unitId);

    // Move models off-screen
    unit.models.forEach(function(m) { m.x = -9999; m.y = -9999; });

    // Count as placed
    if (unit.faction === 'imp') deployState.impPlaced++;
    else deployState.orkPlaced++;

    advanceTurn();
  }

  renderModels();
  updateUI();
}

// ── Turn management ──────────────────────────────────────
function advanceTurn() {
  // Switch active player
  deployState.activePlayer = deployState.activePlayer === 'imp' ? 'ork' : 'imp';

  // Check if the new active player has any undeployed units
  var hasUndeployed = simState.units.some(function(u) {
    return u.faction === deployState.activePlayer &&
      !deployState.deployedUnits.has(u.id) &&
      !deployState.reserveUnits.has(u.id) &&
      !deployState.deepStrikeUnits.has(u.id);
  });

  if (!hasUndeployed) {
    // Check if the other player still has units
    var otherFaction = deployState.activePlayer === 'imp' ? 'ork' : 'imp';
    var otherHasUndeployed = simState.units.some(function(u) {
      return u.faction === otherFaction &&
        !deployState.deployedUnits.has(u.id) &&
        !deployState.reserveUnits.has(u.id) &&
        !deployState.deepStrikeUnits.has(u.id);
    });
    if (otherHasUndeployed) {
      deployState.activePlayer = otherFaction;
    }
    // Otherwise both done — deployment complete
  }

  checkDeploymentComplete();
}

function checkDeploymentComplete() {
  var allPlaced = simState.units.every(function(u) {
    return deployState.deployedUnits.has(u.id) ||
      deployState.reserveUnits.has(u.id) ||
      deployState.deepStrikeUnits.has(u.id);
  });
  var btn = document.getElementById('btn-end');
  if (btn) btn.disabled = !allPlaced;
}

function confirmDeployment() {
  // Final confirmation — freeze state
  var btn = document.getElementById('btn-end');
  if (btn && btn.disabled) return;

  // Visual confirmation
  btn.textContent = '✓ DEPLOYMENT LOCKED';
  btn.disabled = true;
  btn.style.background = 'rgba(0,200,80,0.15)';
  btn.style.borderColor = 'rgba(0,200,80,0.4)';
  btn.style.color = '#00c850';

  // Update phase header
  var sub = document.getElementById('deploy-subtitle');
  if (sub) sub.textContent = 'Deployment Complete — Ready for Command Phase';

  // Disable all interaction
  deployState.placingUnit = null;
  var btnConfirm = document.getElementById('btn-confirm-unit');
  var btnCancel = document.getElementById('btn-cancel-unit');
  var btnPlace = document.getElementById('btn-place');
  var btnRes = document.getElementById('btn-reserves');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
  if (btnPlace) btnPlace.disabled = true;
  if (btnRes) btnRes.disabled = true;
}

// ── UI updates ───────────────────────────────────────────
function updateUI() {
  updateStatusLabel();
  updateSubtitle();
  updateRosterPills();
  populateReservePanels();
  checkDeploymentComplete();
}

function updateStatusLabel() {
  var label = document.getElementById('deploy-status-label');
  if (!label) return;

  var faction = deployState.activePlayer;
  var factionName = faction === 'imp' ? 'IMPERIUM' : 'ORKS';
  var total = faction === 'imp' ? deployState.impTotal : deployState.orkTotal;
  var placed = 0;
  simState.units.forEach(function(u) {
    if (u.faction !== faction) return;
    if (deployState.deployedUnits.has(u.id) ||
        deployState.reserveUnits.has(u.id) ||
        deployState.deepStrikeUnits.has(u.id)) {
      placed++;
    }
  });

  label.textContent = factionName + ' DEPLOYING · ' + placed + '/' + total;
  label.classList.toggle('ork-turn', faction === 'ork');
}

function updateSubtitle() {
  var sub = document.getElementById('deploy-subtitle');
  if (!sub) return;
  var faction = deployState.activePlayer;
  var factionName = faction === 'imp' ? 'Imperium' : 'Orks';
  var total = faction === 'imp' ? deployState.impTotal : deployState.orkTotal;
  var placed = 0;
  simState.units.forEach(function(u) {
    if (u.faction !== faction) return;
    if (deployState.deployedUnits.has(u.id) ||
        deployState.reserveUnits.has(u.id) ||
        deployState.deepStrikeUnits.has(u.id)) {
      placed++;
    }
  });
  sub.textContent = factionName + ' Deploying · ' + placed + '/' + total + ' units';
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
    deployState.activePlayer;
  var impZone = document.querySelector('.deploy-zone-bg.imp-zone');
  var orkZone = document.querySelector('.deploy-zone-bg.ork-zone');
  if (impZone) impZone.classList.toggle('zone-active', active && faction === 'imp');
  if (orkZone) orkZone.classList.toggle('zone-active', active && faction === 'ork');
}

// ── Drag enforcement ─────────────────────────────────────
function installDragInterceptor() {
  // Block drags on units that are not the placing unit
  var origDrag = Object.getOwnPropertyDescriptor(simState, 'drag') || {};
  var _drag = simState.drag;
  Object.defineProperty(simState, 'drag', {
    get: function() { return _drag; },
    set: function(v) {
      if (v && v.unitId) {
        var uid = v.unitId;
        // Only allow dragging the currently-placing unit
        if (uid !== deployState.placingUnit) {
          // But allow selecting deployed units for viewing
          if (deployState.deployedUnits.has(uid)) {
            baseSelectUnit(uid);
          }
          return; // block the drag
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
    if (!simState.drag || !simState.drag.unitId) return;
    var uid = simState.drag.unitId;
    if (uid !== deployState.placingUnit) return;

    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (!unit) return;

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

    if (wasOutside) {
      showZoneWarning();
    }

    // Terrain collision
    var aabbs = window._terrainAABBs || [];
    unit.models.forEach(function(m) {
      if (m.shape === 'rect') return; // skip rect collision for simplicity
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

  // If clicking a reserve card (handled elsewhere), skip
  baseSelectUnit(uid);

  // Update unit state badge
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
    } else {
      badge.textContent = 'UNDEPLOYED';
      badge.style.background = 'rgba(255,170,0,0.15)';
      badge.style.color = '#ffaa00';
    }
  }
}

// ── Button wiring ────────────────────────────────────────
function wireButtons() {
  // Mode toggle: Place vs Reserves
  var btnPlace = document.getElementById('btn-place');
  var btnRes = document.getElementById('btn-reserves');
  if (btnPlace) {
    btnPlace.addEventListener('click', function() {
      deployState.mode = 'place';
      btnPlace.classList.add('active');
      if (btnRes) btnRes.classList.remove('active');
    });
  }
  if (btnRes) {
    btnRes.addEventListener('click', function() {
      deployState.mode = 'reserves';
      if (btnPlace) btnPlace.classList.remove('active');
      btnRes.classList.add('active');
    });
  }

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

  // Roster unit clicks → start placement
  document.querySelectorAll('.rail-unit').forEach(function(el) {
    el.addEventListener('click', function() {
      var uid = el.dataset.unit;
      if (!uid) return;
      var unit = simState.units.find(function(u) { return u.id === uid; });
      if (!unit) return;
      if (unit.faction !== deployState.activePlayer) return;
      if (deployState.deployedUnits.has(uid)) {
        // Already deployed — just select for viewing
        deploySelectUnit(uid);
        return;
      }
      if (deployState.mode === 'reserves') {
        assignToReserves(uid);
      } else {
        startPlacement(uid);
      }
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
    } else if (key === 'P') {
      var btnPlace = document.getElementById('btn-place');
      if (btnPlace) btnPlace.click();
    } else if (key === 'R') {
      // Only switch to reserves mode if not also the reset key
      if (!e.ctrlKey && !e.metaKey) {
        var btnRes = document.getElementById('btn-reserves');
        if (btnRes) btnRes.click();
      }
    }
  });
}

// ── Click-on-empty deselect ──────────────────────────────
function setupClickOutside() {
  var svg = document.getElementById('bf-svg');
  if (!svg) return;
  svg.addEventListener('click', function(e) {
    if (e.target === svg || e.target.tagName === 'g') {
      // Clicked empty space
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

  // Register selection override
  callbacks.selectUnit = deploySelectUnit;

  // Wire up UI
  wireButtons();
  wireKeyboard();
  setupClickOutside();
  installDragInterceptor();
  installDragEnforcement();

  // Initial render — models are off-screen, only terrain shows
  renderModels();
  populateReservePanels();
  updateUI();
}
