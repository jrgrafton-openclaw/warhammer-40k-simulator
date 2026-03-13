/* store.js — Shared mutable state + scale constants (ES module) */

// ── Scale constants ────────────────────────────────────
export const PX_PER_INCH = 12;
export function mmR(mm) { return Math.round(mm / 25.4 * PX_PER_INCH / 2); }
export const R32 = mmR(32); // 8px — standard infantry
export const R40 = mmR(40); // 9px — characters
export const COHESION_RANGE = 2 * PX_PER_INCH;

// ── Sim state ──────────────────────────────────────────
export const simState = {
  units: [],
  drag: null,
  anim: {
    liftUnitId: null, liftModelId: null,
    settleUnitId: null, settleModelId: null,
    settleUntil: 0, settleDuration: 280, raf: null
  }
};

// ── Selection / range state ────────────────────────────
export const activeRangeTypes = new Set();
export let currentUnit = null;
export function setCurrentUnit(uid) { currentUnit = uid; }

// ── Callback registry (allows shooting.js to wrap selectUnit) ──
export const callbacks = { selectUnit: null };
