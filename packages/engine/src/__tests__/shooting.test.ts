/**
 * Phase 4 — Shooting phase tests.
 * Covers SHOOT action validation, hit/wound/save/damage pipeline, and wound roll table.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine, SeededRng, TranscriptLog, createInitialState } from '../index.js';
import type { BlobUnit, EngineWeapon } from '../index.js';

// ---------------------------------------------------------------------------
// Test weapon fixtures
// ---------------------------------------------------------------------------

const BOLTER: EngineWeapon = {
  id: 'bolter', name: 'Bolter', type: 'ranged', range: 24,
  attacks: '2', skill: 3, strength: 4, ap: 0, damage: '1', keywords: [],
};
const MELTA: EngineWeapon = {
  id: 'melta', name: 'Meltagun', type: 'ranged', range: 12,
  attacks: '1', skill: 3, strength: 9, ap: -4, damage: 'D6', keywords: [],
};
const PISTOL: EngineWeapon = {
  id: 'pistol', name: 'Bolt Pistol', type: 'ranged', range: 12,
  attacks: '1', skill: 3, strength: 4, ap: 0, damage: '1', keywords: ['PISTOL'],
};
const SWORD: EngineWeapon = {
  id: 'sword', name: 'Power Sword', type: 'melee', range: 'Melee',
  attacks: '4', skill: 3, strength: 5, ap: -2, damage: '1', keywords: [],
};
const HEAVY_CANNON: EngineWeapon = {
  id: 'cannon', name: 'Heavy Cannon', type: 'ranged', range: 36,
  attacks: '6', skill: 2, strength: 7, ap: -2, damage: '2', keywords: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnit(overrides: Partial<BlobUnit>): BlobUnit {
  return {
    id: 'u1',
    datasheetId: 'test',
    name: 'Test Unit',
    playerId: 'player1',
    center: { x: 10, y: 10 },
    radius: 1,
    movementInches: 6,
    toughness: 4,
    save: 3,
    invuln: null,
    fnp: null,
    oc: 2,
    wounds: 6,
    maxWounds: 6,
    remainingMove: 6,
    hasFired: false,
    hasCharged: false,
    hasFought: false,
    hasAdvanced: false,
    isInEngagement: false,
    movedThisPhase: false,
    weapons: [BOLTER],
    ...overrides,
  };
}

/**
 * Build a SHOOTING-phase engine with attacker (player1) and target (player2).
 * Advance two phases (COMMAND → MOVEMENT → SHOOTING).
 */
function makeShootEngine(
  attackerOverrides: Partial<BlobUnit>,
  targetOverrides: Partial<BlobUnit>,
  seed = 42
): GameEngine {
  const state = createInitialState(['player1', 'player2'], { rngSeed: seed });
  const attacker = makeUnit({ id: 'attacker', playerId: 'player1', center: { x: 10, y: 10 }, ...attackerOverrides });
  const target   = makeUnit({ id: 'target',   playerId: 'player2', center: { x: 15, y: 10 }, ...targetOverrides });
  const engine = new GameEngine({ ...state, units: [attacker, target] }, new SeededRng(seed), new TranscriptLog());
  engine.dispatch({ type: 'END_PHASE' }); // COMMAND → MOVEMENT
  engine.dispatch({ type: 'END_PHASE' }); // MOVEMENT → SHOOTING
  return engine;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('SHOOT validation', () => {
  it('fails outside SHOOTING phase (MOVEMENT)', () => {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const attacker = makeUnit({ id: 'att', playerId: 'player1', center: { x: 10, y: 10 } });
    const target   = makeUnit({ id: 'tgt', playerId: 'player2', center: { x: 15, y: 10 } });
    const engine = new GameEngine({ ...state, units: [attacker, target] }, new SeededRng(1), new TranscriptLog());
    engine.dispatch({ type: 'END_PHASE' }); // COMMAND → MOVEMENT (still in MOVEMENT)
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'att', targetId: 'tgt', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('MOVEMENT') });
  });

  it('fails if attacker not found', () => {
    const engine = makeShootEngine({}, {});
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'GHOST', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });

  it('fails if target not found', () => {
    const engine = makeShootEngine({}, {});
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'GHOST', weaponIndex: 0 });
    expect(res.success).toBe(false);
  });

  it('fails if shooting with opponent unit', () => {
    const engine = makeShootEngine({}, {});
    // player1 is active; try shooting with player2 unit
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'target', targetId: 'attacker', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('opponent') });
  });

  it('fails if targeting friendly unit', () => {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'a1', playerId: 'player1', center: { x: 10, y: 10 } });
    const a2 = makeUnit({ id: 'a2', playerId: 'player1', center: { x: 15, y: 10 } });
    const engine = new GameEngine({ ...state, units: [a, a2] }, new SeededRng(1), new TranscriptLog());
    engine.dispatch({ type: 'END_PHASE' }); engine.dispatch({ type: 'END_PHASE' }); // → SHOOTING
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'a1', targetId: 'a2', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('friendly') });
  });

  it('fails if unit has already fired', () => {
    const engine = makeShootEngine({}, {});
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('already fired') });
  });

  it('fails if weapon index out of bounds', () => {
    const engine = makeShootEngine({}, {});
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 99 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });

  it('fails if weapon is melee type', () => {
    const engine = makeShootEngine({ weapons: [SWORD] }, {});
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('Melee') });
  });

  it('fails if target is out of weapon range', () => {
    // Bolter range 24"; target is 30" away
    const engine = makeShootEngine(
      { center: { x: 0, y: 0 } },
      { center: { x: 30, y: 0 } }
    );
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('range') });
  });

  it('succeeds when target is within range', () => {
    // Bolter range 24"; target is 10" away
    const engine = makeShootEngine(
      { center: { x: 0, y: 0 } },
      { center: { x: 10, y: 0 } }
    );
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(true);
  });

  it('fails if attacker in engagement and weapon has no PISTOL keyword', () => {
    const engine = makeShootEngine({ isInEngagement: true }, {});
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('engagement') });
  });

  it('succeeds if attacker in engagement with PISTOL weapon', () => {
    const engine = makeShootEngine({ isInEngagement: true, weapons: [PISTOL] }, { center: { x: 15, y: 10 } });
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resolution — pipeline
// ---------------------------------------------------------------------------

describe('SHOOT resolution', () => {
  it('marks attacker hasFired = true after shooting', () => {
    const engine = makeShootEngine({}, {});
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const attacker = engine.getState().units.find((u) => u.id === 'attacker');
    expect(attacker?.hasFired).toBe(true);
  });

  it('logs HIT_ROLL events equal to number of attacks', () => {
    // HEAVY_CANNON: attacks 6, guaranteed hits with skill 2 (hard to verify exact count without knowing seed)
    // Instead verify hitRolls.length === attacks rolled
    const engine = makeShootEngine({ weapons: [HEAVY_CANNON], center: { x: 0, y: 0 } }, { center: { x: 10, y: 0 } });
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const transcript = engine.getTranscript();
    const hitRolls = transcript.getByType('HIT_ROLL');
    const attackRolls = transcript.getByType('ROLL').filter((r) => r.rollType === 'ATTACKS');
    // Number of HIT_ROLL events should equal the attack count rolled
    expect(attackRolls.length).toBe(1);
    const attackCount = attackRolls[0]!.value;
    expect(hitRolls.length).toBe(attackCount);
  });

  it('logs WOUND_ROLL events only for successful hits', () => {
    const engine = makeShootEngine({ weapons: [HEAVY_CANNON], center: { x: 0, y: 0 } }, { center: { x: 10, y: 0 } });
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const transcript = engine.getTranscript();
    const hitRolls = transcript.getByType('HIT_ROLL');
    const woundRolls = transcript.getByType('WOUND_ROLL');
    const hits = hitRolls.filter((r) => r.success).length;
    expect(woundRolls.length).toBe(hits);
  });

  it('logs SAVE_ROLL events only for successful wounds', () => {
    const engine = makeShootEngine({ weapons: [HEAVY_CANNON], center: { x: 0, y: 0 } }, { center: { x: 10, y: 0 } });
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const transcript = engine.getTranscript();
    const woundRolls = transcript.getByType('WOUND_ROLL');
    const saveRolls = transcript.getByType('SAVE_ROLL');
    const wounds = woundRolls.filter((r) => r.success).length;
    expect(saveRolls.length).toBe(wounds);
  });

  it('target wounds decrease after unsaved damage', () => {
    // Use seed 42 — with enough attacks we expect some damage
    const engine = makeShootEngine({ weapons: [HEAVY_CANNON], center: { x: 0, y: 0 } }, { toughness: 4, save: 5, wounds: 20, maxWounds: 20, center: { x: 10, y: 0 } });
    const before = engine.getState().units.find((u) => u.id === 'target')!.wounds;
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const state = engine.getState();
    const target = state.units.find((u) => u.id === 'target');
    // Target should still exist (high wound count) and wounds should have decreased
    expect(target).toBeDefined();
    const transcript = engine.getTranscript();
    const damage = transcript.getByType('DAMAGE_APPLIED').reduce((s, e) => s + e.amount, 0);
    if (damage > 0) {
      expect(target!.wounds).toBeLessThan(before);
    }
  });

  it('unit is removed from state when wounds reach 0', () => {
    // Melta vs T4 Sv5+ 1-wound unit — nearly guaranteed to kill with one hit
    const meltagun = { ...MELTA, attacks: '10' }; // boost attacks to ensure a kill
    const engine = makeShootEngine(
      { weapons: [meltagun], center: { x: 0, y: 0 } },
      { toughness: 4, save: 5, wounds: 1, maxWounds: 1, center: { x: 10, y: 0 } }
    );
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const transcript = engine.getTranscript();
    const destroyed = transcript.getByType('UNIT_DESTROYED');
    if (destroyed.length > 0) {
      expect(destroyed[0]!.unitId).toBe('target');
      expect(engine.getState().units.find((u) => u.id === 'target')).toBeUndefined();
    }
  });

  it('hasFired resets at start of next turn', () => {
    const engine = makeShootEngine({}, {});
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    // Advance through remaining phases to start a new turn
    engine.dispatch({ type: 'END_PHASE' }); // SHOOTING → CHARGE
    engine.dispatch({ type: 'END_PHASE' }); // CHARGE → FIGHT
    engine.dispatch({ type: 'END_PHASE' }); // FIGHT → END
    engine.dispatch({ type: 'END_PHASE' }); // END → COMMAND (new turn — state resets)
    const attacker = engine.getState().units.find((u) => u.id === 'attacker');
    expect(attacker?.hasFired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wound roll table
// ---------------------------------------------------------------------------

describe('Wound roll table (10th edition)', () => {
  /**
   * Helper: shoot once and return the `needed` value from the first WOUND_ROLL,
   * or null if there were no hits.
   * Uses a weapon with skill 1 (always hits, since D6 >= 1 is always true)
   * and 20 attacks to guarantee at least one hit.
   */
  function getWoundNeeded(strength: number, toughness: number): number | null {
    const weapon: EngineWeapon = {
      id: 'w', name: 'W', type: 'ranged', range: 48,
      attacks: '20', skill: 1, strength, ap: 0, damage: '1', keywords: [],
    };
    const engine = makeShootEngine(
      { weapons: [weapon], center: { x: 0, y: 0 } },
      { toughness, save: 7, center: { x: 10, y: 0 } } // save 7+ = no save possible
    );
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const woundRolls = engine.getTranscript().getByType('WOUND_ROLL');
    return woundRolls[0]?.needed ?? null;
  }

  it('S >= 2×T → wound on 2+', () => {
    expect(getWoundNeeded(8, 4)).toBe(2);  // 8 >= 8 = 2×4
    expect(getWoundNeeded(10, 4)).toBe(2); // 10 >= 8
    expect(getWoundNeeded(6, 3)).toBe(2);  // 6 >= 6
  });

  it('S > T (but < 2×T) → wound on 3+', () => {
    expect(getWoundNeeded(5, 4)).toBe(3);
    expect(getWoundNeeded(7, 5)).toBe(3);
  });

  it('S = T → wound on 4+', () => {
    expect(getWoundNeeded(4, 4)).toBe(4);
    expect(getWoundNeeded(6, 6)).toBe(4);
  });

  it('S < T (but > T/2) → wound on 5+', () => {
    expect(getWoundNeeded(3, 4)).toBe(5);
    expect(getWoundNeeded(4, 5)).toBe(5);
    expect(getWoundNeeded(5, 8)).toBe(5); // 5 < 8 but 5*2=10 > 8
  });

  it('S*2 <= T → wound on 6+', () => {
    expect(getWoundNeeded(2, 4)).toBe(6);  // 2*2 = 4 = T
    expect(getWoundNeeded(3, 7)).toBe(6);  // 3*2 = 6 < 7
    expect(getWoundNeeded(4, 9)).toBe(6);  // 4*2 = 8 < 9
  });
});

// ---------------------------------------------------------------------------
// Save mechanics
// ---------------------------------------------------------------------------

describe('Save mechanics', () => {
  it('invuln used when better than modified armour save', () => {
    // Weapon AP-3 vs T4 Sv3+ Invuln 4+ → modified save = 3+3 = 6, invuln = 4 → use invuln (4 < 6)
    const weapon: EngineWeapon = { ...BOLTER, ap: -3, attacks: '20', skill: 1 };
    const engine = makeShootEngine(
      { weapons: [weapon], center: { x: 0, y: 0 } },
      { toughness: 4, save: 3, invuln: 4, wounds: 100, maxWounds: 100, center: { x: 10, y: 0 } }
    );
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const saveRolls = engine.getTranscript().getByType('SAVE_ROLL');
    if (saveRolls.length > 0) {
      expect(saveRolls[0]!.isInvuln).toBe(true);
      expect(saveRolls[0]!.needed).toBe(4); // invuln 4+
    }
  });

  it('armour save used when better than invuln', () => {
    // Weapon AP0 vs T4 Sv2+ Invuln 4+ → modified save = 2+0 = 2, invuln = 4 → use armour (2 < 4)
    const weapon: EngineWeapon = { ...BOLTER, attacks: '20', skill: 1 };
    const engine = makeShootEngine(
      { weapons: [weapon], center: { x: 0, y: 0 } },
      { toughness: 4, save: 2, invuln: 4, wounds: 100, maxWounds: 100, center: { x: 10, y: 0 } }
    );
    engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    const saveRolls = engine.getTranscript().getByType('SAVE_ROLL');
    if (saveRolls.length > 0) {
      expect(saveRolls[0]!.isInvuln).toBe(false);
      expect(saveRolls[0]!.needed).toBe(2); // armour 2+
    }
  });
});
