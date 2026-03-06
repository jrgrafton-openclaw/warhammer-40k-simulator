/**
 * Phase 7 — Wound Profile Degradation tests.
 * Covers: Caladius-style multi-row datasheets, movement stat changes by wound bracket.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine, SeededRng, TranscriptLog, createInitialState, getEffectiveMovement } from '../index.js';
import type { BlobUnit, EngineWeapon, WoundProfile } from '../index.js';

// ---------------------------------------------------------------------------
// Caladius wound profiles (mirroring the UI definition)
// ---------------------------------------------------------------------------

const CALADIUS_WOUND_PROFILES: WoundProfile[] = [
  { minWounds: 8, movement: 14 }, // Full health: M14"
  { minWounds: 5, movement: 10 }, // Damaged: M10"
  { minWounds: 1, movement: 6  }, // Crippled: M6"
];

const ARMOURED_HULL: EngineWeapon = {
  id: 'hull', name: 'Armoured Hull', type: 'melee', range: 'Melee',
  attacks: '3', skill: 4, strength: 6, ap: 0, damage: '1', keywords: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCaladius(wounds: number): BlobUnit {
  return {
    id: 'caladius', datasheetId: 'caladius-grav-tank', name: 'Caladius',
    playerId: 'player1', center: { x: 20, y: 22 }, radius: 2.5,
    movementInches: 14, remainingMove: 14,
    toughness: 11, save: 2, invuln: 5, fnp: null, oc: 4,
    wounds, maxWounds: 14,
    hasFired: false, hasCharged: false, hasFought: false,
    hasAdvanced: false, isInEngagement: false, movedThisPhase: false,
    weapons: [ARMOURED_HULL],
    woundProfiles: CALADIUS_WOUND_PROFILES,
  };
}

// ---------------------------------------------------------------------------
// getEffectiveMovement unit tests
// ---------------------------------------------------------------------------

describe('getEffectiveMovement', () => {
  it('returns M14 at full health (14 wounds)', () => {
    const unit = makeCaladius(14);
    expect(getEffectiveMovement(unit)).toBe(14);
  });

  it('returns M14 at exactly 8 wounds (top bracket threshold)', () => {
    const unit = makeCaladius(8);
    expect(getEffectiveMovement(unit)).toBe(14);
  });

  it('returns M10 at 7 wounds (just below 8-wound bracket)', () => {
    const unit = makeCaladius(7);
    expect(getEffectiveMovement(unit)).toBe(10);
  });

  it('returns M10 at exactly 5 wounds (middle bracket threshold)', () => {
    const unit = makeCaladius(5);
    expect(getEffectiveMovement(unit)).toBe(10);
  });

  it('returns M6 at 4 wounds (just below 5-wound bracket)', () => {
    const unit = makeCaladius(4);
    expect(getEffectiveMovement(unit)).toBe(6);
  });

  it('returns M6 at 1 wound (minimum crippled state)', () => {
    const unit = makeCaladius(1);
    expect(getEffectiveMovement(unit)).toBe(6);
  });

  it('returns base movementInches for unit with no woundProfiles', () => {
    const unit: BlobUnit = {
      id: 'infantry', datasheetId: 'test', name: 'Marine',
      playerId: 'player1', center: { x: 10, y: 10 }, radius: 1,
      movementInches: 6, remainingMove: 6,
      toughness: 4, save: 3, invuln: null, fnp: null, oc: 2,
      wounds: 2, maxWounds: 2,
      hasFired: false, hasCharged: false, hasFought: false,
      hasAdvanced: false, isInEngagement: false, movedThisPhase: false,
      weapons: [],
    };
    expect(getEffectiveMovement(unit)).toBe(6);
  });

  it('returns base movementInches for unit with empty woundProfiles array', () => {
    const unit = { ...makeCaladius(14), woundProfiles: [] };
    expect(getEffectiveMovement(unit)).toBe(14); // falls back to movementInches
  });
});

// ---------------------------------------------------------------------------
// Engine integration — remainingMove resets with degraded movement
// ---------------------------------------------------------------------------

describe('Wound profile degradation — engine integration', () => {
  function makeEngineWithCaladius(wounds: number): GameEngine {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const caladius = makeCaladius(wounds);
    const opponent: BlobUnit = {
      id: 'opp', datasheetId: 'opp', name: 'Opponent',
      playerId: 'player2', center: { x: 30, y: 22 }, radius: 1,
      movementInches: 6, remainingMove: 6,
      toughness: 4, save: 3, invuln: null, fnp: null, oc: 2,
      wounds: 5, maxWounds: 5,
      hasFired: false, hasCharged: false, hasFought: false,
      hasAdvanced: false, isInEngagement: false, movedThisPhase: false,
      weapons: [],
    };
    return new GameEngine({ ...state, units: [caladius, opponent] }, new SeededRng(1), new TranscriptLog());
  }

  it('Caladius remainingMove is 14 at full health after turn reset', () => {
    const eng = makeEngineWithCaladius(14);
    // Complete a full round to trigger the turn reset
    for (let i = 0; i < 6; i++) eng.dispatch({ type: 'END_PHASE' }); // turn 1 player1 done
    for (let i = 0; i < 6; i++) eng.dispatch({ type: 'END_PHASE' }); // turn 1 player2 done → turn 2 starts

    const caladius = eng.getState().units.find((u) => u.id === 'caladius');
    expect(caladius?.remainingMove).toBe(14);
  });

  it('Caladius remainingMove is 6 at 1 wound after turn reset', () => {
    const eng = makeEngineWithCaladius(1);
    // Complete a full round
    for (let i = 0; i < 12; i++) eng.dispatch({ type: 'END_PHASE' });

    const caladius = eng.getState().units.find((u) => u.id === 'caladius');
    expect(caladius?.remainingMove).toBe(6);
  });

  it('Caladius remainingMove is 10 at 5 wounds after turn reset', () => {
    const eng = makeEngineWithCaladius(5);
    // Complete a full round
    for (let i = 0; i < 12; i++) eng.dispatch({ type: 'END_PHASE' });

    const caladius = eng.getState().units.find((u) => u.id === 'caladius');
    expect(caladius?.remainingMove).toBe(10);
  });
});
