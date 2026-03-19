/**
 * charge-card-ranges.test.js — Tests for updateCardRanges charge chip behaviour.
 *
 * Run with:
 *   npx vitest run --config packages/ui/public/mockups/integrated/__tests__/vitest.config.js charge-card-ranges
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stubs for DOM + dependencies ──────────────────────
let cardRangesEl;

function setupDOM() {
  document.body.innerHTML = `<div id="card-ranges"></div>`;
  cardRangesEl = document.getElementById('card-ranges');
}

// Stub modules before importing
vi.mock('../../../shared/state/store.js', () => ({
  simState: {
    units: [
      { id: 'u1', faction: 'imp', models: [{ id: 'm1', x: 100, y: 100, r: 10 }] },
    ],
  },
  PX_PER_INCH: 12,
}));

vi.mock('../../../shared/state/units.js', () => ({
  UNITS: {
    u1: { M: 6 },
  },
}));

vi.mock('../../../shared/world/collision.js', () => ({
  resolveTerrainCollision: (cx, cy) => ({ x: cx, y: cy }),
}));

vi.mock('../../../shared/lib/coord-helpers.js', () => ({
  center: (u) => ({ x: u.models[0].x, y: u.models[0].y }),
  getModelRadius: (m) => m.r || 10,
}));

vi.mock('../../../shared/world/range-rings.js', () => ({
  drawPerModelRangeRings: vi.fn(),
  clearRangeRings: vi.fn(),
}));

describe('updateCardRanges', () => {
  let updateCardRanges;
  let drawPerModelRangeRings;

  beforeEach(async () => {
    vi.resetModules();
    setupDOM();

    // Re-mock to get fresh fn refs
    vi.doMock('../../../shared/world/range-rings.js', () => ({
      drawPerModelRangeRings: vi.fn(),
      clearRangeRings: vi.fn(),
    }));

    const helpers = await import('../../../phases/charge/v0.1/charge-helpers.js');
    updateCardRanges = helpers.updateCardRanges;

    const rings = await import('../../../shared/world/range-rings.js');
    drawPerModelRangeRings = rings.drawPerModelRangeRings;
  });

  it('shows "AVG CHRG 7" when called without actualRoll', () => {
    updateCardRanges('u1');
    const btn = document.getElementById('rt-charge');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('AVG CHRG 7"');
    expect(btn.disabled).toBeFalsy();
    expect(btn.classList.contains('failed')).toBe(false);
  });

  it('shows "CHRG 9" when called with actualRoll=9', () => {
    updateCardRanges('u1', 9);
    const btn = document.getElementById('rt-charge');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('CHRG 9"');
    expect(btn.disabled).toBeFalsy();
    expect(btn.classList.contains('failed')).toBe(false);
  });

  it('shows "CHRG 4 ✕" disabled with failed class on failed charge', () => {
    updateCardRanges('u1', 4, true);
    const btn = document.getElementById('rt-charge');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('CHRG 4" ✕');
    expect(btn.disabled).toBe(true);
    expect(btn.classList.contains('failed')).toBe(true);
  });

  it('draws range ring with actual roll distance, not average', () => {
    updateCardRanges('u1', 10);
    expect(drawPerModelRangeRings).toHaveBeenCalledWith('u1', [
      expect.objectContaining({ radiusInches: 10 }),
    ]);
  });

  it('draws range ring with average 7 when no actualRoll', () => {
    updateCardRanges('u1');
    expect(drawPerModelRangeRings).toHaveBeenCalledWith('u1', [
      expect.objectContaining({ radiusInches: 7 }),
    ]);
  });
});
