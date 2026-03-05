/**
 * Phase 3 — Movement tests
 * Covers DEPLOY_UNIT, MOVE_UNIT, ADVANCE_UNIT validation and resolution.
 */
import { describe, it, expect } from 'vitest';
import { fc } from '@fast-check/vitest';
import { GameEngine, SeededRng, TranscriptLog, createInitialState } from '../index.js';
import type { BlobUnit, Point } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnit(overrides: Partial<BlobUnit> = {}): BlobUnit {
  return {
    id: 'u1',
    datasheetId: 'custodian-guard',
    name: 'Custodian Guard',
    playerId: 'player1',
    center: { x: 10, y: 10 },
    radius: 2,
    movementInches: 6,
    toughness: 6,
    save: 2,
    invuln: 4,
    fnp: null,
    oc: 2,
    wounds: 3,
    maxWounds: 3,
    remainingMove: 6,
    hasFired: false,
    hasCharged: false,
    hasFought: false,
    hasAdvanced: false,
    isInEngagement: false,
    movedThisPhase: false,
    ...overrides,
  };
}

function makeEngine(opts: { phase?: string; units?: BlobUnit[] } = {}): GameEngine {
  const state = createInitialState(['player1', 'player2'], { rngSeed: 42 });
  state.units = opts.units ?? [makeUnit()];
  if (opts.phase) state.phase = opts.phase as never;
  const rng = new SeededRng(42);
  const transcript = new TranscriptLog();
  return new GameEngine(state, rng, transcript);
}

function advanceToMovement(engine: GameEngine): void {
  // COMMAND → MOVEMENT
  engine.dispatch({ type: 'END_PHASE' });
}

// ---------------------------------------------------------------------------
// DEPLOY_UNIT
// ---------------------------------------------------------------------------

describe('DEPLOY_UNIT', () => {
  it('places a unit at the given position', () => {
    const engine = makeEngine();
    const result = engine.dispatch({ type: 'DEPLOY_UNIT', unitId: 'u1', position: { x: 15, y: 20 } });
    expect(result.success).toBe(true);
    const unit = engine.getState().units.find((u) => u.id === 'u1')!;
    expect(unit.center).toEqual({ x: 15, y: 20 });
  });

  it('fails if unit not found', () => {
    const engine = makeEngine();
    const result = engine.dispatch({ type: 'DEPLOY_UNIT', unitId: 'nonexistent', position: { x: 5, y: 5 } });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MOVE_UNIT
// ---------------------------------------------------------------------------

describe('MOVE_UNIT', () => {
  it('fails in COMMAND phase', () => {
    const engine = makeEngine();
    const result = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 12, y: 10 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('COMMAND');
  });

  it('succeeds in MOVEMENT phase within range', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    const result = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 15, y: 10 } });
    expect(result.success).toBe(true);
    const unit = engine.getState().units.find((u) => u.id === 'u1')!;
    expect(unit.center).toEqual({ x: 15, y: 10 });
    expect(unit.movedThisPhase).toBe(true);
  });

  it('fails if distance exceeds M characteristic', () => {
    const engine = makeEngine(); // M = 6"
    advanceToMovement(engine);
    // Move 7" from (10,10) to (17,10) — exceeds 6"
    const result = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 17, y: 10 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('exceeds');
  });

  it('unit can move exactly M inches', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    // Move exactly 6" along x axis: (10,10) → (16,10)
    const result = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 16, y: 10 } });
    expect(result.success).toBe(true);
  });

  it('fails if unit already moved this phase', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 12, y: 10 } });
    const second = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 14, y: 10 } });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error).toContain('already moved');
  });

  it('fails if destination is off the board', () => {
    const engine = makeEngine({
      units: [makeUnit({ center: { x: 1, y: 10 } })],
    });
    advanceToMovement(engine);
    // Move off the left edge
    const result = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: -1, y: 10 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('off the board');
  });

  it('remainingMove decreases by move distance', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 13, y: 10 } });
    const unit = engine.getState().units.find((u) => u.id === 'u1')!;
    expect(unit.remainingMove).toBeCloseTo(3); // 6 - 3 = 3
  });

  it('fails to move opponent unit', () => {
    const engine = makeEngine({
      units: [makeUnit({ playerId: 'player2' })],
    });
    advanceToMovement(engine);
    const result = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 12, y: 10 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('opponent');
  });
});

// ---------------------------------------------------------------------------
// ADVANCE_UNIT
// ---------------------------------------------------------------------------

describe('ADVANCE_UNIT', () => {
  it('sets hasAdvanced flag', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    // Advance up to M+D6 — destination within safe range (≤ M+6)
    const result = engine.dispatch({ type: 'ADVANCE_UNIT', unitId: 'u1', destination: { x: 20, y: 10 } });
    expect(result.success).toBe(true);
    const unit = engine.getState().units.find((u) => u.id === 'u1')!;
    expect(unit.hasAdvanced).toBe(true);
    expect(unit.movedThisPhase).toBe(true);
  });

  it('fails in COMMAND phase', () => {
    const engine = makeEngine();
    const result = engine.dispatch({ type: 'ADVANCE_UNIT', unitId: 'u1', destination: { x: 12, y: 10 } });
    expect(result.success).toBe(false);
  });

  it('fails if unit already moved', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: { x: 12, y: 10 } });
    const second = engine.dispatch({ type: 'ADVANCE_UNIT', unitId: 'u1', destination: { x: 14, y: 10 } });
    expect(second.success).toBe(false);
  });

  it('cannot charge after advancing', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    engine.dispatch({ type: 'ADVANCE_UNIT', unitId: 'u1', destination: { x: 15, y: 10 } });
    // Advance through phases to CHARGE
    engine.dispatch({ type: 'END_PHASE' }); // MOVEMENT → SHOOTING
    engine.dispatch({ type: 'END_PHASE' }); // SHOOTING → CHARGE
    const result = engine.dispatch({ type: 'CHARGE', attackerId: 'u1', targetIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('advancing');
  });
});

// ---------------------------------------------------------------------------
// Phase reset
// ---------------------------------------------------------------------------

describe('Phase reset after full turn', () => {
  it('resets movedThisPhase and hasAdvanced after turn ends', () => {
    const engine = makeEngine();
    advanceToMovement(engine);
    engine.dispatch({ type: 'ADVANCE_UNIT', unitId: 'u1', destination: { x: 15, y: 10 } });

    // Complete the full turn: MOVEMENT → SHOOTING → CHARGE → FIGHT → END → (next COMMAND)
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'END_PHASE' });
    // Now in END phase — advance to next turn's COMMAND
    engine.dispatch({ type: 'END_PHASE' });

    const unit = engine.getState().units.find((u) => u.id === 'u1')!;
    expect(unit.movedThisPhase).toBe(false);
    expect(unit.hasAdvanced).toBe(false);
    expect(unit.remainingMove).toBe(unit.movementInches);
  });
});

// ---------------------------------------------------------------------------
// Property tests — movement never exceeds M
// ---------------------------------------------------------------------------

describe('Property: MOVE_UNIT distance never exceeds M', () => {
  it('any valid destination within M always succeeds', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 10, noNaN: true }),   // movementInches
        fc.float({ min: 1, max: 55, noNaN: true }),   // startX
        fc.float({ min: 1, max: 40, noNaN: true }),   // startY
        fc.float({ min: 0, max: Math.fround(6.28), noNaN: true }), // angle (2π as f32)
        fc.float({ min: 0, max: 1, noNaN: true }),    // fraction of max move
        (m, startX, startY, angle, fraction) => {
          const state = createInitialState(['player1', 'player2'], { rngSeed: 1 });
          state.units = [makeUnit({ center: { x: startX, y: startY }, movementInches: m, remainingMove: m })];
          state.phase = 'MOVEMENT' as never;

          const dist = fraction * m;
          const dest: Point = {
            x: Math.min(Math.max(startX + Math.cos(angle) * dist, 0), 60),
            y: Math.min(Math.max(startY + Math.sin(angle) * dist, 0), 44),
          };

          const rng = new SeededRng(1);
          const transcript = new TranscriptLog();
          const engine = new GameEngine(state, rng, transcript);

          const result = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'u1', destination: dest });
          // After clamping, this must always succeed
          return result.success === true;
        }
      ),
      { numRuns: 500 }
    );
  });
});
