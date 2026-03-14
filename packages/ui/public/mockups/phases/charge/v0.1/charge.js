/**
 * charge.js — Charge phase interaction logic (ES module).
 *
 * State machine:
 *   IDLE → SELECT_CHARGER → SELECT_TARGETS → ROLLING → CHARGE_MOVE → RESOLVED
 *
 * 10th Edition rules implemented:
 *   - Eligible charger selection (not advanced, not already charged, not in engagement range)
 *   - Multi-target declaration within 12"
 *   - 2D6 charge roll with animated dice
 *   - Charge movement with wall collision + unit collision
 *   - Engagement range validation (1" = 12px)
 *   - Unit coherency check (2" = 24px)
 *   - Ghost circles + ruler lines during drag
 */

import { simState, PX_PER_INCH, callbacks } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion, getMousePos } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { center, getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { clearRangeRings } from '../../../shared/world/range-rings.js';

// ── Constants ──────────────────────────────────────────
const ACTIVE = 'imp';
const ENGAGEMENT_RANGE = 1 * PX_PER_INCH;   // 12px
const COHERENCY_RANGE  = 2 * PX_PER_INCH;   // 24px
const MAX_CHARGE_DECL  = 12 * PX_PER_INCH;  // 144px
const NS = 'http://www.w3.org/2000/svg';

// ── State ──────────────────────────────────────────────
const state = {
  phase: 'IDLE',           // IDLE | SELECT_CHARGER | SELECT_TARGETS | ROLLING | CHARGE_MOVE | RESOLVED
  chargerId: null,
  declaredTargets: [],     // array of unit IDs
  chargeRoll: 0,           // 2D6 result
  die1: 0,
  die2: 0,
  chargedUnits: new Set(),
  failedUnits: new Set(),
  turnStarts: {},          // modelId → {x, y}
  isDragging: false
};

// ── DOM helpers ────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function getUnit(uid) { return simState.units.find(u => u.id === uid); }
function isEnemy(uid) { const u = getUnit(uid); return u && u.faction !== ACTIVE; }
function isFriendly(uid) { const u = getUnit(uid); return u && u.faction === ACTIVE; }

function unitCenter(uid) {
  const u = getUnit(uid);
  return u ? center(u) : { x: 0, y: 0 };
}

function distBetweenUnits(uid1, uid2) {
  // Closest model-to-model edge distance
  const u1 = getUnit(uid1), u2 = getUnit(uid2);
  if (!u1 || !u2) return Infinity;
  let minDist = Infinity;
  u1.models.forEach(m1 => {
    u2.models.forEach(m2 => {
      const d = Math.hypot(m1.x - m2.x, m1.y - m2.y) - getModelRadius(m1) - getModelRadius(m2);
      if (d < minDist) minDist = d;
    });
  });
  return minDist;
}

function distCenterToCenter(uid1, uid2) {
  const c1 = unitCenter(uid1), c2 = unitCenter(uid2);
  return Math.hypot(c1.x - c2.x, c1.y - c2.y);
}

function setStatus(msg, cls) {
  const el = $('#charge-status-label');
  if (el) {
    el.textContent = msg || '';
    el.className = cls || '';
  }
}

function doTerrainCollision(cx, cy, r) {
  return resolveTerrainCollision(cx, cy, r, window._terrainAABBs || []);
}

// ── Eligibility checks ────────────────────────────────
function isInEngagementRange(uid) {
  const u = getUnit(uid);
  if (!u) return false;
  return simState.units.some(other => {
    if (other.faction === u.faction) return false;
    return other.models.some(om =>
      u.models.some(m => {
        const d = Math.hypot(m.x - om.x, m.y - om.y) - getModelRadius(m) - getModelRadius(om);
        return d <= ENGAGEMENT_RANGE;
      })
    );
  });
}

function isEligibleCharger(uid) {
  if (state.chargedUnits.has(uid)) return false;
  if (state.failedUnits.has(uid)) return false;
  if (isInEngagementRange(uid)) return false;
  const u = getUnit(uid);
  if (!u || u.faction !== ACTIVE) return false;
  if (u.models.length === 0) return false;
  return true;
}

function getValidTargets(chargerId) {
  const charger = getUnit(chargerId);
  if (!charger) return [];
  const cc = unitCenter(chargerId);
  return simState.units
    .filter(u => u.faction !== ACTIVE && u.models.length > 0)
    .filter(u => {
      // Check if closest model-to-model distance is within 12"
      let minDist = Infinity;
      charger.models.forEach(cm => {
        u.models.forEach(tm => {
          const d = Math.hypot(cm.x - tm.x, cm.y - tm.y) - getModelRadius(cm) - getModelRadius(tm);
          if (d < minDist) minDist = d;
        });
      });
      return minDist <= MAX_CHARGE_DECL;
    })
    .map(u => u.id);
}

// ── Dice animation ────────────────────────────────────
function rollChargeDice() {
  return new Promise(resolve => {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;

    const overlay = $('#charge-dice-overlay');
    const face1 = $('#charge-die-1');
    const face2 = $('#charge-die-2');
    const totalEl = $('#charge-dice-total');
    const resultEl = $('#charge-dice-result');

    // Determine success/fail based on farthest declared target
    let maxDist = 0;
    const charger = getUnit(state.chargerId);
    state.declaredTargets.forEach(tid => {
      const target = getUnit(tid);
      if (!charger || !target) return;
      charger.models.forEach(cm => {
        target.models.forEach(tm => {
          const d = Math.hypot(cm.x - tm.x, cm.y - tm.y) - getModelRadius(cm) - getModelRadius(tm);
          if (d > maxDist) maxDist = d;
        });
      });
    });
    const neededInches = maxDist / PX_PER_INCH;
    const success = total >= Math.ceil(neededInches);

    // Reset
    face1.textContent = '–';
    face2.textContent = '–';
    face1.classList.remove('rolling');
    face2.classList.remove('rolling');
    totalEl.textContent = '';
    resultEl.textContent = '';
    resultEl.className = 'charge-dice-result';

    overlay.classList.add('visible');

    // Animate die 1
    setTimeout(() => {
      face1.classList.add('rolling');
      face1.textContent = die1;
    }, 200);

    // Animate die 2
    setTimeout(() => {
      face2.classList.add('rolling');
      face2.textContent = die2;
    }, 400);

    // Show total
    setTimeout(() => {
      totalEl.textContent = total + '"';
      resultEl.textContent = success
        ? `CHARGE! (needed ${neededInches.toFixed(1)}")`
        : `FAILED (needed ${neededInches.toFixed(1)}", rolled ${total}")`;
      resultEl.classList.add(success ? 'success' : 'fail');
    }, 700);

    // Dismiss
    setTimeout(() => {
      overlay.classList.remove('visible');
      resolve({ die1, die2, total, success });
    }, 2200);
  });
}

// ── Engagement range check ────────────────────────────
function checkEngagementReached(chargerId, targetIds) {
  const charger = getUnit(chargerId);
  if (!charger) return { allReached: false, perTarget: {} };
  const perTarget = {};
  let allReached = true;

  targetIds.forEach(tid => {
    const target = getUnit(tid);
    if (!target) { perTarget[tid] = false; allReached = false; return; }
    let reached = false;
    charger.models.forEach(cm => {
      target.models.forEach(tm => {
        const d = Math.hypot(cm.x - tm.x, cm.y - tm.y) - getModelRadius(cm) - getModelRadius(tm);
        if (d <= ENGAGEMENT_RANGE) reached = true;
      });
    });
    perTarget[tid] = reached;
    if (!reached) allReached = false;
  });

  return { allReached, perTarget };
}

// ── Coherency check ───────────────────────────────────
function isCoherent(uid) {
  const unit = getUnit(uid);
  if (!unit || unit.models.length <= 1) return true;
  return unit.models.every(m1 =>
    unit.models.some(m2 => {
      if (m1 === m2) return false;
      const d = Math.hypot(m1.x - m2.x, m1.y - m2.y) - getModelRadius(m1) - getModelRadius(m2);
      return d <= COHERENCY_RANGE;
    })
  );
}

// ── Capture turn starts ───────────────────────────────
function captureTurnStarts(uid) {
  const unit = getUnit(uid);
  if (!unit) return;
  unit.models.forEach(m => {
    state.turnStarts[m.id] = { x: m.x, y: m.y };
  });
}

// ── SVG overlays ──────────────────────────────────────
function clearChargeOverlays() {
  const lines = $('#layer-target-lines'); if (lines) lines.innerHTML = '';
  const zones = $('#layer-charge-zones'); if (zones) zones.innerHTML = '';
  const ghosts = $('#layer-move-ghosts'); if (ghosts) ghosts.innerHTML = '';
  const rulers = $('#layer-move-rulers'); if (rulers) rulers.innerHTML = '';
  const engRings = $('#layer-engagement-rings'); if (engRings) engRings.innerHTML = '';
}

function drawTargetLines() {
  const g = $('#layer-target-lines');
  if (!g) return;
  g.innerHTML = '';
  if (!state.chargerId) return;

  const charger = getUnit(state.chargerId);
  if (!charger) return;
  const cc = unitCenter(state.chargerId);

  // Draw lines to all valid targets
  const validTargets = getValidTargets(state.chargerId);
  validTargets.forEach(tid => {
    const tc = unitCenter(tid);
    const isDeclared = state.declaredTargets.includes(tid);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', cc.x);
    line.setAttribute('y1', cc.y);
    line.setAttribute('x2', tc.x);
    line.setAttribute('y2', tc.y);
    line.setAttribute('class', 'charge-range-line' + (isDeclared ? ' declared' : ''));
    g.appendChild(line);
  });
}

function drawChargeZones() {
  const layer = $('#layer-charge-zones');
  if (!layer) return;
  layer.innerHTML = '';
  if (!state.chargerId || state.chargeRoll <= 0) return;

  const unit = getUnit(state.chargerId);
  if (!unit) return;
  const radiusPx = state.chargeRoll * PX_PER_INCH;

  unit.models.forEach(m => {
    const start = state.turnStarts[m.id];
    if (!start) return;
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', start.x);
    circle.setAttribute('cy', start.y);
    circle.setAttribute('r', radiusPx);
    circle.setAttribute('class', 'charge-zone-ring');
    layer.appendChild(circle);
  });
}

function drawEngagementRings() {
  const layer = $('#layer-engagement-rings');
  if (!layer) return;
  layer.innerHTML = '';
  if (!state.chargerId || state.declaredTargets.length === 0) return;

  const charger = getUnit(state.chargerId);
  const engagement = checkEngagementReached(state.chargerId, state.declaredTargets);

  state.declaredTargets.forEach(tid => {
    const target = getUnit(tid);
    if (!target) return;
    const reached = engagement.perTarget[tid];

    target.models.forEach(tm => {
      const r = getModelRadius(tm) + ENGAGEMENT_RANGE;
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', tm.x);
      circle.setAttribute('cy', tm.y);
      circle.setAttribute('r', r);
      circle.setAttribute('class', 'engagement-ring' + (reached ? ' reached' : ''));
      layer.appendChild(circle);
    });
  });
}

function drawGhostsAndRulers() {
  const ghosts = $('#layer-move-ghosts');
  const rulers = $('#layer-move-rulers');
  if (!ghosts || !rulers) return;
  ghosts.innerHTML = '';
  rulers.innerHTML = '';
  if (!state.chargerId || state.phase !== 'CHARGE_MOVE') return;

  const unit = getUnit(state.chargerId);
  if (!unit) return;
  const rangePx = state.chargeRoll * PX_PER_INCH;

  unit.models.forEach(m => {
    const start = state.turnStarts[m.id];
    if (!start) return;

    // Ghost at start
    if (m.shape === 'rect') {
      const ghost = document.createElementNS(NS, 'rect');
      ghost.setAttribute('x', start.x - m.w / 2);
      ghost.setAttribute('y', start.y - m.h / 2);
      ghost.setAttribute('width', m.w);
      ghost.setAttribute('height', m.h);
      ghost.setAttribute('rx', '5');
      ghost.setAttribute('class', 'charge-ghost');
      ghosts.appendChild(ghost);
    } else {
      const ghost = document.createElementNS(NS, 'circle');
      ghost.setAttribute('cx', start.x);
      ghost.setAttribute('cy', start.y);
      ghost.setAttribute('r', m.r);
      ghost.setAttribute('class', 'charge-ghost');
      ghosts.appendChild(ghost);
    }

    // Ruler line
    const dx = m.x - start.x, dy = m.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const overRange = dist > rangePx + 0.5;

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', m.x);
    line.setAttribute('y2', m.y);
    line.setAttribute('class', 'charge-ruler' + (overRange ? ' over-range' : ''));
    rulers.appendChild(line);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', (start.x + m.x) / 2);
    label.setAttribute('y', (start.y + m.y) / 2 - 4);
    label.setAttribute('class', 'charge-ruler-label' + (overRange ? ' over-range' : ''));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = (dist / PX_PER_INCH).toFixed(1) + '"';
    rulers.appendChild(label);
  });
}

// ── Result banner ─────────────────────────────────────
function showBanner(text, type) {
  const banner = $('#charge-result-banner');
  if (!banner) return;
  banner.textContent = text;
  banner.className = 'charge-result-banner visible ' + type;
  setTimeout(() => {
    banner.classList.remove('visible');
  }, 1800);
}

// ── Roster + badge sync ───────────────────────────────
function syncRosterUI() {
  $$('.rail-unit').forEach(row => {
    const uid = row.dataset.unit;
    row.classList.remove('charged', 'charge-failed');
    if (state.chargedUnits.has(uid)) row.classList.add('charged');
    if (state.failedUnits.has(uid)) row.classList.add('charge-failed');
  });

  const badge = $('#unit-state-badge');
  if (badge && state.chargerId) {
    badge.className = 'unit-state-badge';
    if (state.chargedUnits.has(state.chargerId)) {
      badge.textContent = 'CHARGED';
      badge.classList.add('charged');
    } else if (state.failedUnits.has(state.chargerId)) {
      badge.textContent = 'CHARGE FAILED';
      badge.classList.add('charge-failed');
    }
  }
}

// ── Hull painting ─────────────────────────────────────
function paintHulls() {
  $$('#layer-hulls .unit-hull').forEach(h => {
    const uid = h.dataset.unitId;
    h.classList.remove('charge-valid', 'charge-declared', 'charge-invalid', 'charge-attacker');

    if (uid === state.chargerId) {
      h.classList.add('charge-attacker');
      return;
    }

    if (state.phase === 'SELECT_TARGETS' && isEnemy(uid)) {
      const validTargets = getValidTargets(state.chargerId);
      if (state.declaredTargets.includes(uid)) {
        h.classList.add('charge-declared');
      } else if (validTargets.includes(uid)) {
        h.classList.add('charge-valid');
      } else {
        h.classList.add('charge-invalid');
      }
    }
  });
  syncRosterUI();
}

// ── Button state ──────────────────────────────────────
function updateButtons() {
  const declareBtn = $('#btn-declare-charge');
  const confirmBtn = $('#btn-confirm-charge');

  if (declareBtn) {
    declareBtn.style.display = (state.phase === 'SELECT_TARGETS') ? '' : 'none';
    declareBtn.disabled = state.declaredTargets.length === 0;
  }
  if (confirmBtn) {
    confirmBtn.style.display = (state.phase === 'CHARGE_MOVE') ? '' : 'none';
    confirmBtn.disabled = false;
  }

  // Status label
  switch (state.phase) {
    case 'IDLE':
    case 'SELECT_CHARGER':
      setStatus('SELECT A UNIT TO CHARGE', '');
      break;
    case 'SELECT_TARGETS':
      setStatus(`${state.declaredTargets.length} TARGET${state.declaredTargets.length !== 1 ? 'S' : ''} DECLARED`, 'active-charge');
      break;
    case 'ROLLING':
      setStatus('ROLLING 2D6…', 'active-charge');
      break;
    case 'CHARGE_MOVE':
      setStatus(`MOVE CHARGER (${state.chargeRoll}")`, 'active-charge');
      break;
    case 'RESOLVED':
      setStatus('SELECT NEXT CHARGER', '');
      break;
  }
}

// ── Phase transitions ─────────────────────────────────
function enterSelectCharger() {
  state.phase = 'SELECT_CHARGER';
  state.chargerId = null;
  state.declaredTargets = [];
  state.chargeRoll = 0;
  clearChargeOverlays();
  clearRangeRings();
  paintHulls();
  updateButtons();
}

function selectCharger(uid) {
  if (!isEligibleCharger(uid)) return;
  state.chargerId = uid;
  state.declaredTargets = [];
  state.phase = 'SELECT_TARGETS';
  captureTurnStarts(uid);
  baseSelectUnit(uid);
  drawTargetLines();
  paintHulls();
  updateButtons();
}

function toggleTarget(uid) {
  if (state.phase !== 'SELECT_TARGETS') return;
  if (!isEnemy(uid)) return;
  const validTargets = getValidTargets(state.chargerId);
  if (!validTargets.includes(uid)) return;

  const idx = state.declaredTargets.indexOf(uid);
  if (idx >= 0) {
    state.declaredTargets.splice(idx, 1);
  } else {
    state.declaredTargets.push(uid);
  }
  drawTargetLines();
  drawEngagementRings();
  paintHulls();
  updateButtons();
}

async function declareCharge() {
  if (state.phase !== 'SELECT_TARGETS' || state.declaredTargets.length === 0) return;
  state.phase = 'ROLLING';
  updateButtons();

  const result = await rollChargeDice();
  state.die1 = result.die1;
  state.die2 = result.die2;
  state.chargeRoll = result.total;

  if (result.success) {
    // Transition to charge move
    state.phase = 'CHARGE_MOVE';
    drawChargeZones();
    drawEngagementRings();
    drawGhostsAndRulers();
    updateButtons();
    showBanner('CHARGE!', 'success');
  } else {
    // Failed charge
    state.failedUnits.add(state.chargerId);
    showBanner('CHARGE FAILED', 'fail');
    state.phase = 'RESOLVED';
    clearChargeOverlays();
    paintHulls();
    updateButtons();
    // Auto-transition back to select next charger after delay
    setTimeout(() => {
      baseSelectUnit(null);
      enterSelectCharger();
    }, 2000);
  }
}

function confirmCharge() {
  if (state.phase !== 'CHARGE_MOVE') return;

  // Check engagement reached
  const engagement = checkEngagementReached(state.chargerId, state.declaredTargets);
  if (!engagement.allReached) {
    const missing = state.declaredTargets.filter(tid => !engagement.perTarget[tid]);
    const names = missing.map(tid => UNITS[tid]?.name || tid).join(', ');
    showBanner('MUST REACH: ' + names, 'fail');
    return;
  }

  // Check coherency
  const charger = getUnit(state.chargerId);
  if (charger && !isCoherent(state.chargerId)) {
    showBanner('COHERENCY BROKEN', 'fail');
    return;
  }

  // Check no model moved further than charge roll
  const rangePx = state.chargeRoll * PX_PER_INCH;
  let overMoved = false;
  if (charger) {
    charger.models.forEach(m => {
      const start = state.turnStarts[m.id];
      if (!start) return;
      const dist = Math.hypot(m.x - start.x, m.y - start.y);
      if (dist > rangePx + 1) overMoved = true;
    });
  }
  if (overMoved) {
    showBanner('MODEL OVER RANGE', 'fail');
    return;
  }

  // Success!
  state.chargedUnits.add(state.chargerId);
  showBanner('CHARGE SUCCESSFUL', 'success');
  state.phase = 'RESOLVED';
  clearChargeOverlays();
  renderModels();
  paintHulls();
  updateButtons();

  // Auto-transition
  setTimeout(() => {
    baseSelectUnit(null);
    enterSelectCharger();
  }, 2000);
}

function cancelChargeMove() {
  if (state.phase !== 'CHARGE_MOVE') return;
  // Snap models back
  const unit = getUnit(state.chargerId);
  if (unit) {
    unit.models.forEach(m => {
      const ts = state.turnStarts[m.id];
      if (ts) { m.x = ts.x; m.y = ts.y; }
    });
  }
  // Treat as failed
  state.failedUnits.add(state.chargerId);
  showBanner('CHARGE CANCELLED', 'fail');
  state.phase = 'RESOLVED';
  clearChargeOverlays();
  renderModels();
  paintHulls();
  updateButtons();
  setTimeout(() => {
    baseSelectUnit(null);
    enterSelectCharger();
  }, 2000);
}

// ── Drag interceptor ──────────────────────────────────
function installDragInterceptor() {
  let _drag = null;
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get() { return _drag; },
    set(value) {
      if (value !== null) {
        let unit = null;
        if (value.type === 'unit') unit = value.unit;
        else if (value.type === 'model') unit = simState.units.find(u => u.models.includes(value.model));

        if (unit) {
          // Only allow dragging the charging unit during CHARGE_MOVE
          if (state.phase === 'CHARGE_MOVE') {
            if (unit.id !== state.chargerId) return; // block other drags
          } else {
            // Outside CHARGE_MOVE, clicking sets selection but no drag allowed
            return;
          }
        }
      }
      _drag = value;
    }
  });
}

// ── Drag enforcement ──────────────────────────────────
function installDragEnforcement() {
  window.addEventListener('mousemove', () => {
    const drag = simState.drag;
    if (!drag || state.phase !== 'CHARGE_MOVE') return;
    if (!state.chargerId) return;

    const rangePx = state.chargeRoll * PX_PER_INCH;

    if (drag.type === 'model') {
      const m = drag.model;
      const ts = state.turnStarts[m.id];
      if (ts) {
        // Clamp to charge range from start position
        const dx = m.x - ts.x, dy = m.y - ts.y;
        const dist = Math.hypot(dx, dy);
        if (dist > rangePx) {
          const sc = rangePx / dist;
          m.x = ts.x + dx * sc;
          m.y = ts.y + dy * sc;
          const reRes = resolveOverlaps(m, m.x, m.y);
          m.x = reRes.x; m.y = reRes.y;
        }
        // Terrain collision
        const tr = doTerrainCollision(m.x, m.y, m.r);
        m.x = tr.x; m.y = tr.y;
      }
    } else if (drag.type === 'unit') {
      const unit = drag.unit;
      // Unit-unit collision
      resolveUnitDragCollisions(unit, simState.units);
      // Clamp per model
      unit.models.forEach(m => {
        const ts = state.turnStarts[m.id];
        if (!ts) return;
        const dx = m.x - ts.x, dy = m.y - ts.y;
        const dist = Math.hypot(dx, dy);
        if (dist > rangePx) {
          const sc = rangePx / dist;
          m.x = ts.x + dx * sc;
          m.y = ts.y + dy * sc;
        }
      });
      // Terrain collision: push entire unit
      let maxPX = 0, maxPY = 0;
      unit.models.forEach(m => {
        const tr = doTerrainCollision(m.x, m.y, m.r);
        const px = tr.x - m.x, py = tr.y - m.y;
        if (Math.abs(px) > Math.abs(maxPX)) maxPX = px;
        if (Math.abs(py) > Math.abs(maxPY)) maxPY = py;
      });
      if (maxPX !== 0 || maxPY !== 0) {
        unit.models.forEach(m => { m.x += maxPX; m.y += maxPY; });
      }
      resolveUnitDragCollisions(unit, simState.units);
    }

    renderModels();
    drawGhostsAndRulers();
    drawEngagementRings();
    paintHulls();

    // Lift dragged unit to z-top
    const dragUnitId = state.chargerId;
    if (dragUnitId) {
      ['layer-hulls', 'layer-models'].forEach(layerId => {
        const layer = document.getElementById(layerId);
        if (!layer) return;
        Array.from(layer.children).forEach(el => {
          if (el.dataset && el.dataset.unitId === dragUnitId) layer.appendChild(el);
        });
      });
    }
  });
}

// ── Click handling ────────────────────────────────────
function handleSvgClick(e) {
  let node = e.target;
  while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) {
    node = node.parentElement;
  }
  if (!node) return;

  const uid = node.dataset.unitId;
  if (!uid) return;

  if (state.phase === 'IDLE' || state.phase === 'SELECT_CHARGER' || state.phase === 'RESOLVED') {
    if (isFriendly(uid) && isEligibleCharger(uid)) {
      e.preventDefault();
      e.stopPropagation();
      selectCharger(uid);
    } else if (isFriendly(uid)) {
      // Select but show they're ineligible
      baseSelectUnit(uid);
      if (state.chargedUnits.has(uid)) setStatus('ALREADY CHARGED', '');
      else if (state.failedUnits.has(uid)) setStatus('CHARGE FAILED', '');
      else if (isInEngagementRange(uid)) setStatus('ALREADY IN ENGAGEMENT', '');
    } else {
      baseSelectUnit(uid);
    }
    return;
  }

  if (state.phase === 'SELECT_TARGETS') {
    if (isEnemy(uid)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toggleTarget(uid);
    } else if (isFriendly(uid) && uid !== state.chargerId) {
      // Switch charger
      if (isEligibleCharger(uid)) {
        clearChargeOverlays();
        selectCharger(uid);
      }
    }
    return;
  }
}

function handleSvgMousedown(e) {
  let node = e.target;
  while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) {
    node = node.parentElement;
  }
  if (!node) return;

  const uid = node.dataset.unitId;
  if (state.phase === 'SELECT_TARGETS' && isEnemy(uid)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
}

// ── selectUnit wrapper ────────────────────────────────
function chargeSelectUnit(uid) {
  clearRangeRings();
  baseSelectUnit(uid);

  if (!uid) {
    if (state.phase === 'SELECT_TARGETS') {
      // Deselect during target selection — cancel charge declaration
      clearChargeOverlays();
      enterSelectCharger();
    }
    return;
  }

  // When clicking friendly unit in non-drag states, auto-enter charger selection
  const u = getUnit(uid);
  if (u && u.faction === ACTIVE) {
    if ((state.phase === 'IDLE' || state.phase === 'SELECT_CHARGER' || state.phase === 'RESOLVED') && isEligibleCharger(uid)) {
      selectCharger(uid);
    }
  }
}

// ── Init ───────────────────────────────────────────────
export function initCharge() {
  // Register callback wrapper
  callbacks.selectUnit = chargeSelectUnit;
  window.selectUnit = chargeSelectUnit;

  // Drag interceptor + enforcement
  installDragInterceptor();
  installDragEnforcement();

  // Button wiring
  $('#btn-declare-charge')?.addEventListener('click', declareCharge);
  $('#btn-confirm-charge')?.addEventListener('click', confirmCharge);
  $('#btn-end-charge')?.addEventListener('click', () => {
    setStatus('END CHARGE PHASE — MOCKUP ONLY', '');
  });

  // SVG click/mousedown interception
  const svg = $('#bf-svg');
  if (svg) {
    svg.addEventListener('click', handleSvgClick, true);
    svg.addEventListener('mousedown', handleSvgMousedown, true);
  }

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.phase === 'CHARGE_MOVE') {
        cancelChargeMove();
      } else if (state.phase === 'SELECT_TARGETS') {
        clearChargeOverlays();
        enterSelectCharger();
        baseSelectUnit(null);
      } else {
        baseSelectUnit(null);
      }
    }
  });

  // Start
  enterSelectCharger();
  renderModels();

  // Debug
  window.__chargeDebug = { state, getValidTargets, checkEngagementReached, isEligibleCharger };
}
