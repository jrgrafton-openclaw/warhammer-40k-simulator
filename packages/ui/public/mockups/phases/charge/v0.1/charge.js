/**
 * charge.js — Charge phase interaction logic (ES module).
 *
 * UX aligned with move v0.23 and shoot v0.9 patterns:
 *   - Shared shoot-valid / shoot-invalid / shoot-target hull classes
 *   - Single-click target → immediate 2D6 roll (no DECLARE step)
 *   - Compact roll-overlay panel (not full-screen overlay)
 *   - Action bar: phase pills → mode label → CONFIRM → USE STRATAGEM | END CHARGE PHASE
 *   - Unit card: single AVG CHRG toggle with per-model range rings
 *
 * State machine:
 *   IDLE → SELECT_CHARGER → SELECT_TARGET → ROLLING → CHARGE_MOVE → RESOLVED
 */

import { simState, PX_PER_INCH, callbacks } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion, getMousePos } from '../../../shared/world/svg-renderer.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { center, getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { drawPerModelRangeRings, clearRangeRings } from '../../../shared/world/range-rings.js';

// ── Constants ──────────────────────────────────────────
const ACTIVE = 'imp';
const ENGAGEMENT_RANGE = 1 * PX_PER_INCH;   // 12px
const COHERENCY_RANGE  = 2 * PX_PER_INCH;   // 24px
const MAX_CHARGE_DECL  = 12 * PX_PER_INCH;  // 144px
const NS = 'http://www.w3.org/2000/svg';

// ── State ──────────────────────────────────────────────
const state = {
  phase: 'IDLE',           // IDLE | SELECT_CHARGER | SELECT_TARGET | ROLLING | CHARGE_MOVE | RESOLVED
  chargerId: null,
  chargeTargetId: null,    // single target for v0.1
  chargeRoll: 0,           // 2D6 result
  die1: 0,
  die2: 0,
  chargedUnits: new Set(),
  failedUnits: new Set(),
  turnStarts: {},          // modelId → {x, y}
  isDragging: false,
  overlayRaf: null
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

function doTerrainCollision(cx, cy, r) {
  return resolveTerrainCollision(cx, cy, r, window._terrainAABBs || []);
}

// ── Mode label ─────────────────────────────────────────
function setModeLabel(text) {
  const el = $('#move-mode-label');
  if (el) el.textContent = text;
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
  return simState.units
    .filter(u => u.faction !== ACTIVE && u.models.length > 0)
    .filter(u => {
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

function closestModelDist(uid1, uid2) {
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

// ── Hull painting (uses shared shoot-* classes) ───────
function paintHulls() {
  const validTargets = (state.phase === 'SELECT_TARGET' && state.chargerId)
    ? getValidTargets(state.chargerId) : [];

  $$('#layer-hulls .unit-hull').forEach(h => {
    const uid = h.dataset.unitId;
    h.classList.remove('shoot-valid', 'shoot-invalid', 'shoot-target', 'shoot-attacker');

    if (uid === state.chargerId) {
      h.classList.add('shoot-attacker');
      return;
    }

    if (state.phase === 'SELECT_TARGET' && isEnemy(uid)) {
      if (uid === state.chargeTargetId) {
        h.classList.add('shoot-target');
      } else if (validTargets.includes(uid)) {
        h.classList.add('shoot-valid');
      } else {
        h.classList.add('shoot-invalid');
      }
    }
  });
  syncRosterUI();
}

// ── Overlay pin loop (matches shooting.js pattern) ────
function ensureOverlayPinLoop() {
  if (state.overlayRaf) return;
  const tick = () => {
    const roll = $('#roll-overlay');
    if (roll && !roll.classList.contains('hidden')) {
      roll.style.left = '50%';
      roll.style.top = 'auto';
      roll.style.bottom = '68px';
    }
    if (roll && !roll.classList.contains('hidden'))
      state.overlayRaf = requestAnimationFrame(tick);
    else state.overlayRaf = null;
  };
  state.overlayRaf = requestAnimationFrame(tick);
}

// ── Compact dice roll in overlay panel ────────────────
function rollChargeDice(targetId) {
  return new Promise(resolve => {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;

    // Determine needed distance
    const distPx = closestModelDist(state.chargerId, targetId);
    const neededInches = distPx / PX_PER_INCH;
    const neededRoll = Math.ceil(neededInches);
    const success = total >= neededRoll;

    const overlay = $('#roll-overlay');
    if (!overlay) return resolve({ die1, die2, total, success, neededInches });

    // Render compact dice panel
    overlay.innerHTML = `
      <div class="overlay-title">CHARGE ROLL</div>
      <div class="dice-row">
        <span class="die pre-roll">–</span>
        <span class="die pre-roll">–</span>
      </div>
      <div class="dice-summary">Need ${neededRoll}+</div>
      <button class="roll-cta">Click to roll</button>`;
    overlay.classList.remove('hidden');
    ensureOverlayPinLoop();

    const cta = overlay.querySelector('.roll-cta');
    cta.addEventListener('click', () => {
      cta.disabled = true;
      cta.textContent = 'Rolling…';

      const chips = $$('#roll-overlay .die');

      // Animate die 1
      setTimeout(() => {
        if (chips[0]) {
          chips[0].classList.remove('pre-roll');
          chips[0].classList.add('rolling');
          setTimeout(() => {
            chips[0].classList.remove('rolling');
            chips[0].textContent = die1;
            chips[0].classList.add('success'); // charge dice are always neutral — no per-die pass/fail
          }, 80);
        }
      }, 100);

      // Animate die 2
      setTimeout(() => {
        if (chips[1]) {
          chips[1].classList.remove('pre-roll');
          chips[1].classList.add('rolling');
          setTimeout(() => {
            chips[1].classList.remove('rolling');
            chips[1].textContent = die2;
            chips[1].classList.add('success'); // charge dice are always neutral — no per-die pass/fail
          }, 80);
        }
      }, 200);

      // Show result
      setTimeout(() => {
        const summary = overlay.querySelector('.dice-summary');
        if (summary) {
          summary.textContent = success
            ? `CHARGE! ${total}" (needed ${neededRoll}+)`
            : `FAILED — ${total}" (needed ${neededRoll}+)`;
          summary.style.color = success ? '#44d17a' : '#cc2020';
        }
        cta.textContent = success ? 'Place models' : 'OK';
        cta.disabled = false;
        cta.onclick = () => {
          overlay.classList.add('hidden');
          resolve({ die1, die2, total, success, neededInches });
        };
      }, 600);
    }, { once: true });
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
  if (!state.chargerId || !state.chargeTargetId) return;

  const engagement = checkEngagementReached(state.chargerId, [state.chargeTargetId]);

  const target = getUnit(state.chargeTargetId);
  if (!target) return;
  const reached = engagement.perTarget[state.chargeTargetId];

  target.models.forEach(tm => {
    const r = getModelRadius(tm) + ENGAGEMENT_RANGE;
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', tm.x);
    circle.setAttribute('cy', tm.y);
    circle.setAttribute('r', r);
    circle.setAttribute('class', 'engagement-ring' + (reached ? ' reached' : ''));
    layer.appendChild(circle);
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

// ── Unit card — AVG CHRG toggle ───────────────────────
function updateCardRanges(uid) {
  const cardRanges = $('#card-ranges');
  if (!cardRanges) return;

  const unit = getUnit(uid);
  if (!unit) return;

  // Get M stat: look in UNITS data
  const unitData = UNITS[uid];
  const mStat = unitData?.M || 6;
  const avgCharge = 7; // avg 2D6 charge roll (not M+7)

  cardRanges.innerHTML = `<button class="range-toggle charge active" id="rt-charge" data-range-type="charge">AVG CHRG ${avgCharge}"</button>`;

  // Wire toggle
  const btn = $('#rt-charge');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      if (btn.classList.contains('active')) {
        drawPerModelRangeRings(uid, [{
          radiusInches: avgCharge,
          fill: 'rgba(255,140,0,0.04)',
          stroke: 'rgba(255,140,0,0.25)'
        }]);
      } else {
        clearRangeRings();
      }
    });
    // Draw rings by default
    drawPerModelRangeRings(uid, [{
      radiusInches: avgCharge,
      fill: 'rgba(255,140,0,0.04)',
      stroke: 'rgba(255,140,0,0.25)'
    }]);
  }
}

// ── Button state ──────────────────────────────────────
function isPlacementValid() {
  if (state.phase !== 'CHARGE_MOVE') return false;
  // 1. Engagement reached?
  const engagement = checkEngagementReached(state.chargerId, [state.chargeTargetId]);
  if (!engagement.allReached) return false;
  // 2. Coherency?
  if (!isCoherent(state.chargerId)) return false;
  // 3. No model over charge roll distance?
  const rangePx = state.chargeRoll * PX_PER_INCH;
  const charger = getUnit(state.chargerId);
  if (charger) {
    for (const m of charger.models) {
      const start = state.turnStarts[m.id];
      if (!start) continue;
      if (Math.hypot(m.x - start.x, m.y - start.y) > rangePx + 1) return false;
    }
  }
  return true;
}

function updateButtons() {
  const confirmBtn = $('#btn-confirm-charge');

  if (confirmBtn) {
    confirmBtn.disabled = !isPlacementValid();
  }

  // Mode label
  switch (state.phase) {
    case 'IDLE':
    case 'SELECT_CHARGER':
      setModeLabel('— SELECT UNIT —');
      break;
    case 'SELECT_TARGET':
      setModeLabel('CHARGING → select target');
      break;
    case 'ROLLING':
      setModeLabel('ROLLING 2D6…');
      break;
    case 'CHARGE_MOVE':
      setModeLabel(`⚡ CHARGE ${state.chargeRoll}" — place models`);
      break;
    case 'RESOLVED':
      setModeLabel('— SELECT UNIT —');
      break;
  }
}

// ── Phase transitions ─────────────────────────────────
function enterSelectCharger() {
  if (state._resetTimer) { clearTimeout(state._resetTimer); state._resetTimer = null; }
  state.phase = 'SELECT_CHARGER';
  state.chargerId = null;
  state.chargeTargetId = null;
  state.chargeRoll = 0;
  clearChargeOverlays();
  clearRangeRings();
  paintHulls();
  updateButtons();
}

function selectCharger(uid) {
  if (!isEligibleCharger(uid)) return;
  state.chargerId = uid;
  state.chargeTargetId = null;
  state.phase = 'SELECT_TARGET';
  captureTurnStarts(uid);
  baseSelectUnit(uid);
  updateCardRanges(uid);
  paintHulls();
  updateButtons();
}

// Single-click target → immediate dice roll (Fix 3)
async function clickTarget(uid) {
  if (state.phase !== 'SELECT_TARGET') return;
  if (!isEnemy(uid)) return;
  const validTargets = getValidTargets(state.chargerId);
  if (!validTargets.includes(uid)) return;

  state.chargeTargetId = uid;
  paintHulls();

  state.phase = 'ROLLING';
  updateButtons();

  const result = await rollChargeDice(uid);
  state.die1 = result.die1;
  state.die2 = result.die2;
  state.chargeRoll = result.total;

  if (result.success) {
    state.phase = 'CHARGE_MOVE';
    setModeLabel(`⚡ CHARGE ${result.total}" — place models`);
    clearRangeRings(); // turn off AVG CHRG rings to avoid doubling up with charge zones
    drawChargeZones();
    drawEngagementRings();
    drawGhostsAndRulers();
    updateButtons();
  } else {
    state.failedUnits.add(state.chargerId);
    setModeLabel(`✕ CHARGE FAILED (${result.total})`);
    state.phase = 'RESOLVED';
    clearChargeOverlays();
    clearRangeRings();
    paintHulls();
    updateButtons();
    setTimeout(() => {
      baseSelectUnit(null);
      enterSelectCharger();
    }, 2000);
  }
}

function confirmCharge() {
  if (!isPlacementValid()) return;

  // Success!
  state.chargedUnits.add(state.chargerId);
  setModeLabel('✓ CHARGE SUCCESSFUL');
  state.phase = 'RESOLVED';
  clearChargeOverlays();
  clearRangeRings();
  renderModels();
  paintHulls();
  updateButtons();

  if (state._resetTimer) clearTimeout(state._resetTimer);
  state._resetTimer = setTimeout(() => {
    state._resetTimer = null;
    if (state.phase === 'RESOLVED') {
      baseSelectUnit(null);
      enterSelectCharger();
    }
  }, 2000);
}

function cancelChargeMove() {
  if (state.phase !== 'CHARGE_MOVE') return;
  const unit = getUnit(state.chargerId);
  if (unit) {
    unit.models.forEach(m => {
      const ts = state.turnStarts[m.id];
      if (ts) { m.x = ts.x; m.y = ts.y; }
    });
  }
  state.failedUnits.add(state.chargerId);
  setModeLabel('✕ CHARGE CANCELLED');
  state.phase = 'RESOLVED';
  clearChargeOverlays();
  clearRangeRings();
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
          if (state.phase === 'CHARGE_MOVE') {
            if (unit.id !== state.chargerId) return;
          } else {
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
        const dx = m.x - ts.x, dy = m.y - ts.y;
        const dist = Math.hypot(dx, dy);
        if (dist > rangePx) {
          const sc = rangePx / dist;
          m.x = ts.x + dx * sc;
          m.y = ts.y + dy * sc;
          const reRes = resolveOverlaps(m, m.x, m.y);
          m.x = reRes.x; m.y = reRes.y;
        }
        const tr = doTerrainCollision(m.x, m.y, m.r);
        m.x = tr.x; m.y = tr.y;
      }
    } else if (drag.type === 'unit') {
      const unit = drag.unit;
      resolveUnitDragCollisions(unit, simState.units);
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
    updateButtons(); // continuously validate CONFIRM button during drag

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

  // Stop shared svg-renderer handlers from firing after us (they call renderModels which wipes hull classes)
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (state.phase === 'IDLE' || state.phase === 'SELECT_CHARGER' || state.phase === 'RESOLVED') {
    if (isFriendly(uid) && isEligibleCharger(uid)) {
      selectCharger(uid);
    } else if (isFriendly(uid)) {
      baseSelectUnit(uid);
      if (state.chargedUnits.has(uid)) setModeLabel('ALREADY CHARGED');
      else if (state.failedUnits.has(uid)) setModeLabel('CHARGE FAILED');
      else if (isInEngagementRange(uid)) setModeLabel('ALREADY IN ENGAGEMENT');
    } else {
      baseSelectUnit(uid);
    }
    return;
  }

  if (state.phase === 'SELECT_TARGET') {
    if (isEnemy(uid)) {
      clickTarget(uid);
    } else if (isFriendly(uid) && uid !== state.chargerId) {
      if (isEligibleCharger(uid)) {
        clearChargeOverlays();
        clearRangeRings();
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

  // Block shared svg-renderer mousedown from calling dispatchSelectUnit + renderModels
  // during target selection (it would wipe hull classes). In CHARGE_MOVE the shared
  // drag handlers are needed so we only block SELECT_CHARGER and SELECT_TARGET.
  const uid = node.dataset.unitId;
  if (state.phase === 'SELECT_CHARGER' || state.phase === 'SELECT_TARGET') {
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
    if (state.phase === 'SELECT_TARGET') {
      clearChargeOverlays();
      enterSelectCharger();
    }
    return;
  }

  const u = getUnit(uid);
  if (u && u.faction === ACTIVE) {
    if ((state.phase === 'IDLE' || state.phase === 'SELECT_CHARGER' || state.phase === 'RESOLVED') && isEligibleCharger(uid)) {
      selectCharger(uid);
    }
  }
}

// ── Stratagem modal wiring ────────────────────────────
function wireStratModal() {
  const btn = $('#btn-strat');
  const modalBg = $('#modal-bg');
  const modalClose = $('#modal-close');

  if (btn && modalBg) {
    btn.addEventListener('click', () => {
      modalBg.classList.add('visible');
    });
  }
  if (modalClose && modalBg) {
    modalClose.addEventListener('click', () => {
      modalBg.classList.remove('visible');
    });
  }
  if (modalBg) {
    modalBg.addEventListener('click', (e) => {
      if (e.target === modalBg) modalBg.classList.remove('visible');
    });
  }
}

// ── Init ───────────────────────────────────────────────
export function initCharge() {
  callbacks.selectUnit = chargeSelectUnit;
  window.selectUnit = chargeSelectUnit;

  installDragInterceptor();
  installDragEnforcement();

  // Button wiring
  $('#btn-confirm-charge')?.addEventListener('click', confirmCharge);
  $('#btn-end-charge')?.addEventListener('click', () => {
    setModeLabel('END CHARGE PHASE — MOCKUP ONLY');
  });

  // Stratagem modal
  wireStratModal();

  // SVG click/mousedown interception
  const svg = $('#bf-svg');
  if (svg) {
    svg.addEventListener('click', handleSvgClick, true);
    svg.addEventListener('mousedown', handleSvgMousedown, true);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.phase === 'CHARGE_MOVE') {
        cancelChargeMove();
      } else if (state.phase === 'SELECT_TARGET') {
        clearChargeOverlays();
        clearRangeRings();
        enterSelectCharger();
        baseSelectUnit(null);
      } else {
        baseSelectUnit(null);
      }
    }
    // S = stratagem shortcut
    if (e.key === 's' || e.key === 'S') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT') {
        $('#btn-strat')?.click();
      }
    }
    // E = end phase shortcut
    if (e.key === 'e' || e.key === 'E') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT') {
        $('#btn-end-charge')?.click();
      }
    }
  });

  // Start
  enterSelectCharger();
  renderModels();

  // Debug
  window.__chargeDebug = { state, getValidTargets, checkEngagementReached, isEligibleCharger };
}
