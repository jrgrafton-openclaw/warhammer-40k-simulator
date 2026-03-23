/**
 * charge-helpers.js — Shared state, constants, utilities, and validation for the Charge phase.
 */
import { simState, PX_PER_INCH } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { resolveTerrainCollision } from '../../../shared/world/collision.js';
import { center, getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { drawPerModelRangeRings, clearRangeRings } from '../../../shared/world/range-rings.js';

// ── Constants ──────────────────────────────────────────
export const ACTIVE = 'imp';
export const ENGAGEMENT_RANGE = 1 * PX_PER_INCH;   // 12px
export const COHERENCY_RANGE  = 2 * PX_PER_INCH;   // 24px
export const MAX_CHARGE_DECL  = 12 * PX_PER_INCH;  // 144px
export const NS = 'http://www.w3.org/2000/svg';

// ── State ──────────────────────────────────────────────
export const state = {
  phase: 'IDLE',
  chargerId: null,
  chargeTargetId: null,
  hoveredTargetId: null,
  chargeRoll: 0,
  die1: 0,
  die2: 0,
  chargedUnits: new Set(),
  failedUnits: new Set(),
  turnStarts: {},
  isDragging: false,
  overlayRaf: null
};

// ── DOM helpers ────────────────────────────────────────
export const $ = (s) => document.querySelector(s);
export const $$ = (s) => Array.from(document.querySelectorAll(s));

export function getUnit(uid) { return simState.units.find(u => u.id === uid); }
export function isEnemy(uid) { const u = getUnit(uid); return u && u.faction !== ACTIVE; }
export function isFriendly(uid) { const u = getUnit(uid); return u && u.faction === ACTIVE; }

export function unitCenter(uid) {
  const u = getUnit(uid);
  return u ? center(u) : { x: 0, y: 0 };
}

export function doTerrainCollision(cx, cy, r) {
  return resolveTerrainCollision(cx, cy, r, window._terrainAABBs || []);
}

// ── Mode label ─────────────────────────────────────────
export function setModeLabel(text) {
  const el = $('#move-mode-label');
  if (el) el.textContent = text;
}

// ── Eligibility checks ────────────────────────────────
export function isInEngagementRange(uid) {
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

export function isEligibleCharger(uid) {
  if (state.chargedUnits.has(uid)) return false;
  if (state.failedUnits.has(uid)) return false;
  if (isInEngagementRange(uid)) return false;
  const u = getUnit(uid);
  if (!u || u.faction !== ACTIVE) return false;
  if (u.models.length === 0) return false;
  return true;
}

export function getValidTargets(chargerId) {
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

export function closestModelDist(uid1, uid2) {
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

// ── Engagement range check ────────────────────────────
export function checkEngagementReached(chargerId, targetIds) {
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
export function isCoherent(uid) {
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
export function captureTurnStarts(uid) {
  const unit = getUnit(uid);
  if (!unit) return;
  unit.models.forEach(m => {
    state.turnStarts[m.id] = { x: m.x, y: m.y };
  });
}

// ── Placement validation ──────────────────────────────
export function isPlacementValid() {
  if (state.phase !== 'CHARGE_MOVE') return false;
  const engagement = checkEngagementReached(state.chargerId, [state.chargeTargetId]);
  if (!engagement.allReached) return false;
  if (!isCoherent(state.chargerId)) return false;
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

// ── Button state ──────────────────────────────────────
export function updateButtons() {
  const confirmBtn = $('#btn-confirm-charge');
  if (confirmBtn) confirmBtn.disabled = !isPlacementValid();
  switch (state.phase) {
    case 'IDLE':
    case 'SELECT_CHARGER':
      setModeLabel('— SELECT UNIT —'); break;
    case 'SELECT_TARGET':
      setModeLabel('CHARGING → select target'); break;
    case 'ROLLING':
      setModeLabel('ROLLING 2D6…'); break;
    case 'CHARGE_MOVE':
      setModeLabel(`⚡ CHARGE ${state.chargeRoll}" — place models`); break;
    case 'RESOLVED':
      setModeLabel('— SELECT UNIT —'); break;
  }
}

// ── Unit card — AVG CHRG toggle ───────────────────────
export function updateCardRanges(uid, actualRoll, failed) {
  const cardRanges = $('#card-ranges');
  if (!cardRanges) return;
  const unit = getUnit(uid);
  if (!unit) return;
  const unitData = UNITS[uid];
  const mStat = unitData?.M || 6;
  const avgCharge = 7;

  const hasActual = actualRoll != null;
  const rangeInches = hasActual ? actualRoll : avgCharge;
  const label = hasActual
    ? (failed ? `CHRG ${actualRoll}" ✕` : `CHRG ${actualRoll}"`)
    : `AVG CHRG ${avgCharge}"`;
  const extraClass = failed ? ' failed' : '';

  cardRanges.innerHTML = `<button class="range-toggle charge active${extraClass}" id="rt-charge" data-range-type="charge"${failed ? ' disabled' : ''}>${label}</button>`;
  const btn = $('#rt-charge');
  if (btn) {
    if (!failed) {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        if (btn.classList.contains('active')) {
          drawPerModelRangeRings(uid, [{ radiusInches: rangeInches, fill: 'rgba(255,140,0,0.04)', stroke: 'rgba(255,140,0,0.25)' }]);
        } else {
          clearRangeRings();
        }
      });
    }
    drawPerModelRangeRings(uid, [{ radiusInches: rangeInches, fill: 'rgba(255,140,0,0.04)', stroke: 'rgba(255,140,0,0.25)' }]);
  }
}
