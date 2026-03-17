/**
 * charge-resolve.js — Dice roll UI, charge zone rendering, overlay management,
 * confirm/cancel logic, and hull painting for the Charge phase.
 */
import { PX_PER_INCH } from '../../../shared/state/store.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';
import { clearRangeRings } from '../../../shared/world/range-rings.js';
import { getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { playDiceRoll } from '../../../shared/audio/sfx.js';

import {
  state, $, $$, NS,
  ENGAGEMENT_RANGE,
  getUnit, isEnemy,
  getValidTargets, closestModelDist,
  checkEngagementReached, isPlacementValid,
  setModeLabel, updateButtons
} from './charge-helpers.js';

// ── Hull painting (uses shared shoot-* classes) ───────
export function paintHulls() {
  const validTargets = (state.phase === 'SELECT_TARGET' && state.chargerId)
    ? getValidTargets(state.chargerId) : [];

  $$('#layer-hulls .unit-hull').forEach(h => {
    const uid = h.dataset.unitId;
    h.classList.remove('shoot-valid', 'shoot-invalid', 'shoot-target', 'shoot-attacker');
    if (uid === state.chargerId) { h.classList.add('shoot-attacker'); return; }
    if (state.phase === 'SELECT_TARGET' && isEnemy(uid)) {
      if (uid === state.chargeTargetId || uid === state.hoveredTargetId) {
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
      badge.textContent = 'CHARGED'; badge.classList.add('charged');
    } else if (state.failedUnits.has(state.chargerId)) {
      badge.textContent = 'CHARGE FAILED'; badge.classList.add('charge-failed');
    }
  }
}

// ── Overlay pin loop ──────────────────────────────────
function ensureOverlayPinLoop() {
  if (state.overlayRaf) return;
  const tick = () => {
    const roll = $('#roll-overlay');
    if (roll && !roll.classList.contains('hidden')) {
      roll.style.left = '50%'; roll.style.top = 'auto'; roll.style.bottom = '68px';
    }
    if (roll && !roll.classList.contains('hidden'))
      state.overlayRaf = requestAnimationFrame(tick);
    else state.overlayRaf = null;
  };
  state.overlayRaf = requestAnimationFrame(tick);
}

// ── Compact dice roll in overlay panel ────────────────
export function rollChargeDice(targetId) {
  return new Promise(resolve => {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;
    const distPx = closestModelDist(state.chargerId, targetId);
    const neededInches = distPx / PX_PER_INCH;
    const neededRoll = Math.ceil(neededInches);
    const success = total >= neededRoll;

    const overlay = $('#roll-overlay');
    if (!overlay) return resolve({ die1, die2, total, success, neededInches });

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
      playDiceRoll();
      const chips = $$('#roll-overlay .die');

      setTimeout(() => {
        if (chips[0]) {
          chips[0].classList.remove('pre-roll'); chips[0].classList.add('rolling');
          setTimeout(() => { chips[0].classList.remove('rolling'); chips[0].textContent = die1; chips[0].classList.add('success'); }, 80);
        }
      }, 100);
      setTimeout(() => {
        if (chips[1]) {
          chips[1].classList.remove('pre-roll'); chips[1].classList.add('rolling');
          setTimeout(() => { chips[1].classList.remove('rolling'); chips[1].textContent = die2; chips[1].classList.add('success'); }, 80);
        }
      }, 200);

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
        cta.onclick = () => { overlay.classList.add('hidden'); resolve({ die1, die2, total, success, neededInches }); };
      }, 600);
    }, { once: true });
  });
}

// ── SVG overlays ──────────────────────────────────────
export function clearChargeOverlays() {
  const lines = $('#layer-target-lines'); if (lines) lines.innerHTML = '';
  const zones = $('#layer-charge-zones'); if (zones) zones.innerHTML = '';
  const ghosts = $('#layer-move-ghosts'); if (ghosts) ghosts.innerHTML = '';
  const rulers = $('#layer-move-rulers'); if (rulers) rulers.innerHTML = '';
  const engRings = $('#layer-engagement-rings'); if (engRings) engRings.innerHTML = '';
}

export function drawChargeZones() {
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
    circle.setAttribute('cx', start.x); circle.setAttribute('cy', start.y);
    circle.setAttribute('r', radiusPx); circle.setAttribute('class', 'charge-zone-ring');
    layer.appendChild(circle);
  });
}

export function drawEngagementRings() {
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
    circle.setAttribute('cx', tm.x); circle.setAttribute('cy', tm.y);
    circle.setAttribute('r', r);
    circle.setAttribute('class', 'engagement-ring' + (reached ? ' reached' : ''));
    layer.appendChild(circle);
  });
}

export function drawGhostsAndRulers() {
  const ghosts = $('#layer-move-ghosts');
  const rulers = $('#layer-move-rulers');
  if (!ghosts || !rulers) return;
  ghosts.innerHTML = ''; rulers.innerHTML = '';
  if (!state.chargerId || state.phase !== 'CHARGE_MOVE') return;
  const unit = getUnit(state.chargerId);
  if (!unit) return;
  const rangePx = state.chargeRoll * PX_PER_INCH;

  unit.models.forEach(m => {
    const start = state.turnStarts[m.id];
    if (!start) return;
    if (m.shape === 'rect') {
      const ghost = document.createElementNS(NS, 'rect');
      ghost.setAttribute('x', start.x - m.w / 2); ghost.setAttribute('y', start.y - m.h / 2);
      ghost.setAttribute('width', m.w); ghost.setAttribute('height', m.h);
      ghost.setAttribute('rx', '5'); ghost.setAttribute('class', 'charge-ghost');
      ghosts.appendChild(ghost);
    } else {
      const ghost = document.createElementNS(NS, 'circle');
      ghost.setAttribute('cx', start.x); ghost.setAttribute('cy', start.y);
      ghost.setAttribute('r', m.r); ghost.setAttribute('class', 'charge-ghost');
      ghosts.appendChild(ghost);
    }
    const dx = m.x - start.x, dy = m.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const overRange = dist > rangePx + 0.5;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', start.x); line.setAttribute('y1', start.y);
    line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
    line.setAttribute('class', 'charge-ruler' + (overRange ? ' over-range' : ''));
    rulers.appendChild(line);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', (start.x + m.x) / 2); label.setAttribute('y', (start.y + m.y) / 2 - 4);
    label.setAttribute('class', 'charge-ruler-label' + (overRange ? ' over-range' : ''));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = (dist / PX_PER_INCH).toFixed(1) + '"';
    rulers.appendChild(label);
  });
}

// ── Confirm / Cancel ──────────────────────────────────
export function confirmCharge(enterSelectChargerFn) {
  if (!isPlacementValid()) return;
  state.chargedUnits.add(state.chargerId);
  setModeLabel('✓ CHARGE SUCCESSFUL');
  state.phase = 'RESOLVED';
  clearChargeOverlays(); clearRangeRings(); renderModels();
  paintHulls(); updateButtons();
  if (state._resetTimer) clearTimeout(state._resetTimer);
  state._resetTimer = setTimeout(() => {
    state._resetTimer = null;
    if (state.phase === 'RESOLVED') { baseSelectUnit(null); enterSelectChargerFn(); }
  }, 2000);
}

export function cancelChargeMove(enterSelectChargerFn) {
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
  clearChargeOverlays(); clearRangeRings(); renderModels();
  paintHulls(); updateButtons();
  setTimeout(() => { baseSelectUnit(null); enterSelectChargerFn(); }, 2000);
}
