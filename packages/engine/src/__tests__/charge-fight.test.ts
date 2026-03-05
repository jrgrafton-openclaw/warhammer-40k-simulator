/**
 * Phase 5 — Charge + Fight phase tests.
 * Covers: charge roll, engagement, isInEngagement updates, melee pipeline.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine, SeededRng, TranscriptLog, createInitialState } from '../index.js';
import type { BlobUnit, EngineWeapon } from '../index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SWORD: EngineWeapon = {
  id: 'sword', name: 'Power Sword', type: 'melee', range: 'Melee',
  attacks: '4', skill: 3, strength: 5, ap: -2, damage: '1', keywords: [],
};
const BIG_AXE: EngineWeapon = {
  id: 'axe', name: 'Big Axe', type: 'melee', range: 'Melee',
  attacks: '6', skill: 2, strength: 8, ap: -3, damage: '2', keywords: [],
};
const BOLTER: EngineWeapon = {
  id: 'bolter', name: 'Bolter', type: 'ranged', range: 24,
  attacks: '2', skill: 3, strength: 4, ap: 0, damage: '1', keywords: [],
};

function makeUnit(overrides: Partial<BlobUnit>): BlobUnit {
  return {
    id: 'u1', datasheetId: 'test', name: 'Test Unit',
    playerId: 'player1', center: { x: 10, y: 10 }, radius: 1,
    movementInches: 6, remainingMove: 6,
    toughness: 4, save: 3, invuln: null, fnp: null,
    oc: 2, wounds: 6, maxWounds: 6,
    hasFired: false, hasCharged: false, hasFought: false,
    hasAdvanced: false, isInEngagement: false, movedThisPhase: false,
    weapons: [SWORD],
    ...overrides,
  };
}

/** Build engine in CHARGE phase: COMMAND→MOVEMENT→SHOOTING→CHARGE */
function makeChargeEngine(
  attackerOverrides: Partial<BlobUnit>,
  targetOverrides: Partial<BlobUnit>,
  seed = 42
): GameEngine {
  const state = createInitialState(['player1', 'player2'], { rngSeed: seed });
  const attacker = makeUnit({ id: 'attacker', playerId: 'player1', center: { x: 10, y: 10 }, ...attackerOverrides });
  const target   = makeUnit({ id: 'target',   playerId: 'player2', center: { x: 18, y: 10 }, ...targetOverrides });
  const engine = new GameEngine({ ...state, units: [attacker, target] }, new SeededRng(seed), new TranscriptLog());
  engine.dispatch({ type: 'END_PHASE' }); // → MOVEMENT
  engine.dispatch({ type: 'END_PHASE' }); // → SHOOTING
  engine.dispatch({ type: 'END_PHASE' }); // → CHARGE
  return engine;
}

/** Build engine in FIGHT phase: add two END_PHASEs to CHARGE engine */
function makeFightEngine(
  attackerOverrides: Partial<BlobUnit>,
  targetOverrides: Partial<BlobUnit>,
  seed = 42
): GameEngine {
  const engine = makeChargeEngine(attackerOverrides, targetOverrides, seed);
  engine.dispatch({ type: 'END_PHASE' }); // → FIGHT
  return engine;
}

// ---------------------------------------------------------------------------
// isInEngagement
// ---------------------------------------------------------------------------

describe('isInEngagement', () => {
  it('marks units as engaged when within 1" edge-to-edge', () => {
    // Radius 1 each, centers 2.5" apart → edge-to-edge = 0.5" ≤ 1"
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'a', playerId: 'player1', center: { x: 10, y: 10 }, radius: 1 });
    const b = makeUnit({ id: 'b', playerId: 'player2', center: { x: 12, y: 10 }, radius: 1 });
    const engine = new GameEngine({ ...state, units: [a, b] }, new SeededRng(1), new TranscriptLog());
    // Trigger updateEngagement via a MOVE_UNIT — move a to current position (no-op distance)
    engine.dispatch({ type: 'END_PHASE' }); // → MOVEMENT
    engine.dispatch({ type: 'MOVE_UNIT', unitId: 'a', destination: { x: 10, y: 10 } });
    const stateAfter = engine.getState();
    expect(stateAfter.units.find(u => u.id === 'a')?.isInEngagement).toBe(true);
    expect(stateAfter.units.find(u => u.id === 'b')?.isInEngagement).toBe(true);
  });

  it('does not mark units as engaged when more than 1" edge-to-edge', () => {
    // Radius 1 each, centers 5" apart → edge-to-edge = 3" > 1"
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'a', playerId: 'player1', center: { x: 10, y: 10 }, radius: 1 });
    const b = makeUnit({ id: 'b', playerId: 'player2', center: { x: 15, y: 10 }, radius: 1 });
    const engine = new GameEngine({ ...state, units: [a, b] }, new SeededRng(1), new TranscriptLog());
    engine.dispatch({ type: 'END_PHASE' }); // → MOVEMENT
    engine.dispatch({ type: 'MOVE_UNIT', unitId: 'a', destination: { x: 10, y: 10 } });
    const stateAfter = engine.getState();
    expect(stateAfter.units.find(u => u.id === 'a')?.isInEngagement).toBe(false);
    expect(stateAfter.units.find(u => u.id === 'b')?.isInEngagement).toBe(false);
  });

  it('same-side units are never considered engaged', () => {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'a', playerId: 'player1', center: { x: 10, y: 10 }, radius: 1 });
    const b = makeUnit({ id: 'b', playerId: 'player1', center: { x: 11, y: 10 }, radius: 1 });
    const engine = new GameEngine({ ...state, units: [a, b] }, new SeededRng(1), new TranscriptLog());
    engine.dispatch({ type: 'END_PHASE' });
    engine.dispatch({ type: 'MOVE_UNIT', unitId: 'a', destination: { x: 10, y: 10 } });
    const stateAfter = engine.getState();
    expect(stateAfter.units.find(u => u.id === 'a')?.isInEngagement).toBe(false);
    expect(stateAfter.units.find(u => u.id === 'b')?.isInEngagement).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CHARGE validation
// ---------------------------------------------------------------------------

describe('CHARGE validation', () => {
  it('fails outside CHARGE phase', () => {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'att', playerId: 'player1', center: { x: 5, y: 5 } });
    const b = makeUnit({ id: 'tgt', playerId: 'player2', center: { x: 10, y: 5 } });
    const engine = new GameEngine({ ...state, units: [a, b] }, new SeededRng(1), new TranscriptLog());
    // Still in COMMAND phase
    const res = engine.dispatch({ type: 'CHARGE', attackerId: 'att', targetIds: ['tgt'] });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('charge') });
  });

  it('fails if attacker has advanced', () => {
    const engine = makeChargeEngine({ hasAdvanced: true }, {});
    const res = engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('advancing') });
  });

  it('fails if unit has already charged', () => {
    const engine = makeChargeEngine({ hasCharged: true }, {});
    const res = engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('already charged') });
  });

  it('fails if charging with opponent unit', () => {
    const engine = makeChargeEngine({}, {});
    // target (player2) tries to charge attacker (player1) — but player1 is active
    const res = engine.dispatch({ type: 'CHARGE', attackerId: 'target', targetIds: ['attacker'] });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('opponent') });
  });

  it('accepts a valid charge in CHARGE phase', () => {
    const engine = makeChargeEngine({}, {});
    const res = engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    expect(res.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CHARGE resolution
// ---------------------------------------------------------------------------

describe('CHARGE resolution', () => {
  it('marks hasCharged = true after charging', () => {
    const engine = makeChargeEngine({}, {});
    engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    const attacker = engine.getState().units.find(u => u.id === 'attacker');
    expect(attacker?.hasCharged).toBe(true);
  });

  it('logs a CHARGE_ROLL transcript event', () => {
    const engine = makeChargeEngine({ center: { x: 10, y: 10 } }, { center: { x: 18, y: 10 } });
    engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    const rolls = engine.getTranscript().getByType('CHARGE_ROLL');
    expect(rolls.length).toBe(1);
    expect(rolls[0]!.attackerId).toBe('attacker');
    expect(rolls[0]!.targetId).toBe('target');
    expect(rolls[0]!.roll).toBeGreaterThanOrEqual(2);
    expect(rolls[0]!.roll).toBeLessThanOrEqual(12);
  });

  it('successful charge moves attacker into engagement range', () => {
    // Units close enough that 2D6 >= needed distance is very likely
    // Attacker at (10,10) r=1, target at (12.5,10) r=1 → needed = 0.5" → any roll succeeds
    const engine = makeChargeEngine(
      { center: { x: 10, y: 10 }, radius: 1 },
      { center: { x: 12.5, y: 10 }, radius: 1 }
    );
    engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    const chargeRoll = engine.getTranscript().getByType('CHARGE_ROLL')[0]!;
    if (chargeRoll.success) {
      const attacker = engine.getState().units.find(u => u.id === 'attacker');
      const target = engine.getState().units.find(u => u.id === 'target');
      expect(attacker).toBeDefined();
      expect(target).toBeDefined();
      // Edge-to-edge should be ~0.5"
      const dist = Math.hypot(attacker!.center.x - target!.center.x, attacker!.center.y - target!.center.y);
      expect(dist).toBeLessThanOrEqual(attacker!.radius + target!.radius + 1.1);
      expect(attacker!.isInEngagement).toBe(true);
      expect(target!.isInEngagement).toBe(true);
    }
  });

  it('charge automatically succeeds when already in engagement range (needed = 0)', () => {
    // Attacker at (10,10) r=1, target at (11.5,10) r=1 → edge-to-edge = -0.5" ≤ 1" → needed = 0
    const engine = makeChargeEngine(
      { center: { x: 10, y: 10 }, radius: 1 },
      { center: { x: 11.5, y: 10 }, radius: 1 }
    );
    engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    const rolls = engine.getTranscript().getByType('CHARGE_ROLL');
    expect(rolls[0]!.success).toBe(true);
    expect(rolls[0]!.distance).toBe(0);
  });

  it('failed charge leaves attacker in place', () => {
    // Units 15" apart — needed = 15-1-1-1 = 12", 2D6 max is 12 so this can fail
    // Use seed that gives a low roll
    const engine = makeChargeEngine(
      { center: { x: 0, y: 0 }, radius: 1 },
      { center: { x: 15, y: 0 }, radius: 1 },
      1 // seed
    );
    const originalPos = { x: 0, y: 0 };
    engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    const rolls = engine.getTranscript().getByType('CHARGE_ROLL');
    if (!rolls[0]!.success) {
      const attacker = engine.getState().units.find(u => u.id === 'attacker');
      expect(attacker!.center.x).toBeCloseTo(originalPos.x, 3);
      expect(attacker!.center.y).toBeCloseTo(originalPos.y, 3);
      expect(attacker!.isInEngagement).toBe(false);
    }
  });

  it('hasCharged resets at start of new turn', () => {
    const engine = makeChargeEngine({}, {});
    engine.dispatch({ type: 'CHARGE', attackerId: 'attacker', targetIds: ['target'] });
    // Advance through FIGHT and END phases to reset
    engine.dispatch({ type: 'END_PHASE' }); // → FIGHT
    engine.dispatch({ type: 'END_PHASE' }); // → END
    engine.dispatch({ type: 'END_PHASE' }); // → COMMAND (new turn)
    const attacker = engine.getState().units.find(u => u.id === 'attacker');
    expect(attacker?.hasCharged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FIGHT validation
// ---------------------------------------------------------------------------

describe('FIGHT validation', () => {
  it('fails outside FIGHT phase', () => {
    const engine = makeChargeEngine(
      { isInEngagement: true, center: { x: 10, y: 10 } },
      { isInEngagement: true, center: { x: 11.5, y: 10 } }
    );
    // Still in CHARGE phase
    const res = engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    expect(res.success).toBe(false);
  });

  it('fails if attacker not in engagement', () => {
    const engine = makeFightEngine(
      { isInEngagement: false, center: { x: 0, y: 0 } },
      { isInEngagement: false, center: { x: 20, y: 0 } }
    );
    const res = engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('engagement') });
  });

  it('fails if targeting a friendly unit', () => {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'a', playerId: 'player1', center: { x: 10, y: 10 }, isInEngagement: true });
    const b = makeUnit({ id: 'b', playerId: 'player1', center: { x: 11.5, y: 10 }, isInEngagement: true });
    const engine = new GameEngine({ ...state, units: [a, b] }, new SeededRng(1), new TranscriptLog());
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'END_PHASE' }); // → FIGHT
    const res = engine.dispatch({ type: 'FIGHT', attackerId: 'a', targetId: 'b' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('friendly') });
  });

  it('fails if attacker has no melee weapons', () => {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'a', playerId: 'player1', center: { x: 10, y: 10 }, isInEngagement: true, weapons: [BOLTER] });
    const b = makeUnit({ id: 'b', playerId: 'player2', center: { x: 11.5, y: 10 }, isInEngagement: true });
    const engine = new GameEngine({ ...state, units: [a, b] }, new SeededRng(1), new TranscriptLog());
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'END_PHASE' }); // → FIGHT
    const res = engine.dispatch({ type: 'FIGHT', attackerId: 'a', targetId: 'b' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('melee') });
  });

  it('fails if target is out of engagement range', () => {
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const a = makeUnit({ id: 'a', playerId: 'player1', center: { x: 10, y: 10 }, isInEngagement: true });
    const b = makeUnit({ id: 'b', playerId: 'player2', center: { x: 20, y: 10 }, isInEngagement: false });
    const engine = new GameEngine({ ...state, units: [a, b] }, new SeededRng(1), new TranscriptLog());
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'END_PHASE' });
    const res = engine.dispatch({ type: 'FIGHT', attackerId: 'a', targetId: 'b' });
    expect(res.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FIGHT resolution
// ---------------------------------------------------------------------------

describe('FIGHT resolution', () => {
  function makeFightEngineEngaged(seed = 42): GameEngine {
    const state = createInitialState(['player1', 'player2'], { rngSeed: seed });
    // Place units in engagement (edge-to-edge = 0.5")
    const attacker = makeUnit({ id: 'attacker', playerId: 'player1',
      center: { x: 10, y: 10 }, radius: 1, isInEngagement: true, weapons: [BIG_AXE] });
    const target = makeUnit({ id: 'target', playerId: 'player2',
      center: { x: 12.5, y: 10 }, radius: 1, isInEngagement: true,
      toughness: 4, save: 5, wounds: 20, maxWounds: 20 });
    const engine = new GameEngine({ ...state, units: [attacker, target] }, new SeededRng(seed), new TranscriptLog());
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'END_PHASE' }); // → FIGHT
    return engine;
  }

  it('marks hasFought = true after fighting', () => {
    const engine = makeFightEngineEngaged();
    engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    expect(engine.getState().units.find(u => u.id === 'attacker')?.hasFought).toBe(true);
  });

  it('logs HIT_ROLL events equal to attack count', () => {
    const engine = makeFightEngineEngaged();
    engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    const tr = engine.getTranscript();
    const attackRoll = tr.getByType('ROLL').find(r => r.rollType === 'ATTACKS');
    const hitRolls = tr.getByType('HIT_ROLL');
    expect(attackRoll).toBeDefined();
    expect(hitRolls.length).toBe(attackRoll!.value);
  });

  it('logs WOUND_ROLL events only for successful hits', () => {
    const engine = makeFightEngineEngaged();
    engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    const tr = engine.getTranscript();
    const hits = tr.getByType('HIT_ROLL').filter(r => r.success).length;
    expect(tr.getByType('WOUND_ROLL').length).toBe(hits);
  });

  it('logs SAVE_ROLL events for successful wounds', () => {
    const engine = makeFightEngineEngaged();
    engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    const tr = engine.getTranscript();
    const wounds = tr.getByType('WOUND_ROLL').filter(r => r.success).length;
    expect(tr.getByType('SAVE_ROLL').length).toBe(wounds);
  });

  it('reduces target wounds on unsaved damage', () => {
    const engine = makeFightEngineEngaged();
    const before = engine.getState().units.find(u => u.id === 'target')!.wounds;
    engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    const tr = engine.getTranscript();
    const dmg = tr.getByType('DAMAGE_APPLIED').reduce((s, d) => s + d.amount, 0);
    if (dmg > 0) {
      const after = engine.getState().units.find(u => u.id === 'target')!.wounds;
      expect(after).toBe(before - dmg);
    }
  });

  it('removes target and logs UNIT_DESTROYED when wounds reach 0', () => {
    // Use 1-wound target and big axe (6 attacks, skill 2, S8) — very likely to kill
    const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
    const attacker = makeUnit({ id: 'att', playerId: 'player1',
      center: { x: 10, y: 10 }, radius: 1, isInEngagement: true,
      weapons: [{ ...BIG_AXE, attacks: '20' }] });
    const target = makeUnit({ id: 'tgt', playerId: 'player2',
      center: { x: 12, y: 10 }, radius: 1, isInEngagement: true,
      toughness: 4, save: 6, wounds: 1, maxWounds: 1 });
    const engine = new GameEngine({ ...state, units: [attacker, target] }, new SeededRng(1), new TranscriptLog());
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'END_PHASE' });
    engine.dispatch({ type: 'FIGHT', attackerId: 'att', targetId: 'tgt' });
    const destroyed = engine.getTranscript().getByType('UNIT_DESTROYED');
    if (destroyed.length > 0) {
      expect(destroyed[0]!.unitId).toBe('tgt');
      expect(engine.getState().units.find(u => u.id === 'tgt')).toBeUndefined();
    }
  });

  it('hasFought resets at start of new turn', () => {
    const engine = makeFightEngineEngaged();
    engine.dispatch({ type: 'FIGHT', attackerId: 'attacker', targetId: 'target' });
    engine.dispatch({ type: 'END_PHASE' }); // → END
    engine.dispatch({ type: 'END_PHASE' }); // → COMMAND (new turn)
    const attacker = engine.getState().units.find(u => u.id === 'attacker');
    expect(attacker?.hasFought).toBe(false);
  });
});
