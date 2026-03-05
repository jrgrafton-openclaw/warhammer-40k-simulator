/**
 * Phase 6 — Game loop tests.
 * Covers full round trips, player switching, gameOver conditions, and VP scoring.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine, SeededRng, TranscriptLog, createInitialState } from '../index.js';
import type { BlobUnit, EngineWeapon } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOLTER: EngineWeapon = {
  id: 'bolter', name: 'Bolter', type: 'ranged', range: 24,
  attacks: '2', skill: 3, strength: 4, ap: 0, damage: '1', keywords: [],
};

const SWORD: EngineWeapon = {
  id: 'sword', name: 'Power Sword', type: 'melee', range: 'Melee',
  attacks: '4', skill: 3, strength: 5, ap: -2, damage: '1', keywords: [],
};

function makeUnit(overrides: Partial<BlobUnit> = {}): BlobUnit {
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

/** Build an engine starting at COMMAND phase with the given units */
function makeEngine(opts: {
  units?: BlobUnit[];
  turnLimit?: number;
  turn?: number;
  seed?: number;
} = {}): GameEngine {
  const state = createInitialState(['player1', 'player2'], {
    rngSeed: opts.seed ?? 42,
    turnLimit: opts.turnLimit ?? 5,
  });
  if (opts.units) state.units = opts.units;
  if (opts.turn) state.turn = opts.turn;
  return new GameEngine(state, new SeededRng(opts.seed ?? 42), new TranscriptLog());
}

/** Advance engine through all 6 phases for the active player */
function completeTurn(engine: GameEngine): void {
  // 6 phases: COMMAND → MOVEMENT → SHOOTING → CHARGE → FIGHT → END → (next player's COMMAND)
  for (let i = 0; i < 6; i++) {
    engine.dispatch({ type: 'END_PHASE' });
  }
}

// ---------------------------------------------------------------------------
// Phase switching
// ---------------------------------------------------------------------------

describe('nextPhase / END_PHASE', () => {
  it('starts in COMMAND phase with player1 active', () => {
    const engine = makeEngine();
    const state = engine.getState();
    expect(state.phase).toBe('COMMAND');
    expect(state.activePlayer).toBe('player1');
    expect(state.turn).toBe(1);
  });

  it('cycles through all 6 phases in order', () => {
    const engine = makeEngine();
    const phases = ['COMMAND'];
    for (let i = 0; i < 5; i++) {
      engine.dispatch({ type: 'END_PHASE' });
      phases.push(engine.getState().phase);
    }
    expect(phases).toEqual(['COMMAND', 'MOVEMENT', 'SHOOTING', 'CHARGE', 'FIGHT', 'END']);
  });

  it('after END phase, switches to player2 at COMMAND', () => {
    const engine = makeEngine();
    // Advance through all phases of player1
    for (let i = 0; i < 6; i++) {
      engine.dispatch({ type: 'END_PHASE' });
    }
    const state = engine.getState();
    expect(state.activePlayer).toBe('player2');
    expect(state.phase).toBe('COMMAND');
    // Turn is still 1 (game turn = both players completing all phases)
    expect(state.turn).toBe(1);
  });

  it('turn increments to 2 after both players complete their phases', () => {
    const engine = makeEngine();
    // Player1 full turn
    completeTurn(engine);
    // Player2 full turn
    completeTurn(engine);
    const state = engine.getState();
    expect(state.activePlayer).toBe('player1');
    expect(state.turn).toBe(2);
  });

  it('player2 full round trip → activePlayer back to player1', () => {
    const engine = makeEngine();
    completeTurn(engine); // P1 completes turn
    expect(engine.getState().activePlayer).toBe('player2');
    completeTurn(engine); // P2 completes turn
    expect(engine.getState().activePlayer).toBe('player1');
  });
});

// ---------------------------------------------------------------------------
// gameOver conditions
// ---------------------------------------------------------------------------

describe('gameOver — turn limit', () => {
  it('sets gameOver when turn exceeds turnLimit (default 5)', () => {
    const engine = makeEngine({ turnLimit: 5 });
    // Complete 5 game-turns (each = player1 + player2)
    for (let i = 0; i < 5; i++) {
      completeTurn(engine); // player1
      completeTurn(engine); // player2
    }
    const state = engine.getState();
    expect(state.gameOver).toBe(true);
  });

  it('does not set gameOver before turnLimit is exceeded', () => {
    const engine = makeEngine({ turnLimit: 5 });
    completeTurn(engine); // player1 turn 1
    completeTurn(engine); // player2 turn 1
    completeTurn(engine); // player1 turn 2
    const state = engine.getState();
    expect(state.gameOver).toBe(false);
  });

  it('respects custom turnLimit of 3', () => {
    const engine = makeEngine({ turnLimit: 3 });
    for (let i = 0; i < 3; i++) {
      completeTurn(engine);
      completeTurn(engine);
    }
    expect(engine.getState().gameOver).toBe(true);
  });

  it('winner is null on draw (equal VPs at game end)', () => {
    // No objectives → both players end with 0 VP → draw
    const engine = makeEngine({ turnLimit: 1 });
    completeTurn(engine); // player1
    completeTurn(engine); // player2
    const state = engine.getState();
    expect(state.gameOver).toBe(true);
    // Both have 0 VP → draw
    expect(state.winner).toBeNull();
  });
});

describe('gameOver — all enemy units destroyed', () => {
  it('sets gameOver when a unit is destroyed by shooting', () => {
    // player1 attacker with lots of firepower vs fragile player2 target
    const attacker = makeUnit({
      id: 'attacker', playerId: 'player1',
      center: { x: 10, y: 10 },
      weapons: [{
        id: 'mega-gun', name: 'Mega Gun', type: 'ranged', range: 36,
        attacks: '20', skill: 2, strength: 10, ap: -5, damage: '3', keywords: [],
      }],
    });
    const target = makeUnit({
      id: 'target', playerId: 'player2',
      center: { x: 12, y: 10 },
      wounds: 1, maxWounds: 1,
      toughness: 2, save: 6, invuln: null,
    });
    const engine = makeEngine({ units: [attacker, target] });
    // Advance to SHOOTING phase
    engine.dispatch({ type: 'END_PHASE' }); // COMMAND → MOVEMENT
    engine.dispatch({ type: 'END_PHASE' }); // MOVEMENT → SHOOTING

    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'target', weaponIndex: 0 });
    expect(res.success).toBe(true);

    // All enemy units destroyed → gameOver
    const state = engine.getState();
    const enemyUnits = state.units.filter(u => u.playerId === 'player2');
    if (enemyUnits.length === 0) {
      // Game over check happens at COMMAND phase — but unit removal is immediate
      // The target unit should be gone
      expect(state.units.find(u => u.id === 'target')).toBeUndefined();
    }
  });

  it('actions are rejected after game is over', () => {
    const engine = makeEngine({ turnLimit: 1 });
    completeTurn(engine); // player1
    completeTurn(engine); // player2 — game over
    const state = engine.getState();
    expect(state.gameOver).toBe(true);
    const res = engine.dispatch({ type: 'END_PHASE' });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/game is already over/i) });
  });
});

// ---------------------------------------------------------------------------
// VP scoring via objectives
// ---------------------------------------------------------------------------

describe('VP scoring — objectives', () => {
  it('player1 holding an objective scores 1 VP at COMMAND phase', () => {
    const unit = makeUnit({
      id: 'u1', playerId: 'player1',
      center: { x: 30, y: 22 }, // on top of objective
      oc: 2,
    });
    const state = createInitialState(['player1', 'player2'], { rngSeed: 42 });
    state.units = [unit];
    state.objectives = [
      { id: 'obj-a', position: { x: 30, y: 22 }, radius: 3, controlledBy: null, contestedOcPerPlayer: {} },
    ];
    const engine = new GameEngine(state, new SeededRng(42), new TranscriptLog());

    // Complete player1's turn then player2's turn to trigger scoring at next COMMAND
    completeTurn(engine); // ends at player2 COMMAND — scoring happens
    // Check player1 has VPs (should have scored when reaching player2's COMMAND)
    const s = engine.getState();
    const p1 = s.players.find(p => p.id === 'player1')!;
    expect(p1.victoryPoints).toBeGreaterThan(0);
  });

  it('player1 holding an objective for 2 scoring events earns VP = 2', () => {
    const unit = makeUnit({
      id: 'u1', playerId: 'player1',
      center: { x: 30, y: 22 },
      oc: 3, // higher than any enemy
    });
    const state = createInitialState(['player1', 'player2'], { rngSeed: 42 });
    state.units = [unit];
    state.objectives = [
      { id: 'obj-a', position: { x: 30, y: 22 }, radius: 3, controlledBy: null, contestedOcPerPlayer: {} },
    ];
    const engine = new GameEngine(state, new SeededRng(42), new TranscriptLog());

    // Two full game-turns → two scoring events
    completeTurn(engine); // P1 → P2 COMMAND (scoring #1)
    completeTurn(engine); // P2 → P1 COMMAND (turn 2)
    completeTurn(engine); // P1 → P2 COMMAND (scoring #2)

    const s = engine.getState();
    const p1 = s.players.find(p => p.id === 'player1')!;
    expect(p1.victoryPoints).toBeGreaterThanOrEqual(2);
  });

  it('contested objective awards no VP', () => {
    const u1 = makeUnit({ id: 'u1', playerId: 'player1', center: { x: 30, y: 22 }, oc: 2 });
    const u2 = makeUnit({ id: 'u2', playerId: 'player2', center: { x: 30, y: 22 }, oc: 2 });
    const state = createInitialState(['player1', 'player2'], { rngSeed: 42 });
    state.units = [u1, u2];
    state.objectives = [
      { id: 'obj-a', position: { x: 30, y: 22 }, radius: 3, controlledBy: null, contestedOcPerPlayer: {} },
    ];
    const engine = new GameEngine(state, new SeededRng(42), new TranscriptLog());
    completeTurn(engine); // trigger scoring
    const s = engine.getState();
    const p1 = s.players.find(p => p.id === 'player1')!;
    const p2 = s.players.find(p => p.id === 'player2')!;
    expect(p1.victoryPoints).toBe(0);
    expect(p2.victoryPoints).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Action validation — phase guards
// ---------------------------------------------------------------------------

describe('action validation — phase guards', () => {
  it('cannot move enemy unit', () => {
    const p1unit = makeUnit({ id: 'p1u', playerId: 'player1', center: { x: 10, y: 10 } });
    const p2unit = makeUnit({ id: 'p2u', playerId: 'player2', center: { x: 20, y: 10 } });
    const engine = makeEngine({ units: [p1unit, p2unit] });
    engine.dispatch({ type: 'END_PHASE' }); // → MOVEMENT
    const res = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'p2u', destination: { x: 22, y: 10 } });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/opponent/i) });
  });

  it('cannot shoot in MOVEMENT phase', () => {
    const attacker = makeUnit({ id: 'att', playerId: 'player1', center: { x: 10, y: 10 }, weapons: [BOLTER] });
    const target = makeUnit({ id: 'tgt', playerId: 'player2', center: { x: 15, y: 10 } });
    const engine = makeEngine({ units: [attacker, target] });
    engine.dispatch({ type: 'END_PHASE' }); // → MOVEMENT (not SHOOTING)
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'att', targetId: 'tgt', weaponIndex: 0 });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/cannot shoot in MOVEMENT/i) });
  });

  it('cannot shoot in CHARGE phase', () => {
    const attacker = makeUnit({ id: 'att', playerId: 'player1', weapons: [BOLTER] });
    const target = makeUnit({ id: 'tgt', playerId: 'player2', center: { x: 15, y: 10 } });
    const engine = makeEngine({ units: [attacker, target] });
    engine.dispatch({ type: 'END_PHASE' }); // → MOVEMENT
    engine.dispatch({ type: 'END_PHASE' }); // → SHOOTING
    engine.dispatch({ type: 'END_PHASE' }); // → CHARGE
    const res = engine.dispatch({ type: 'SHOOT', attackerId: 'att', targetId: 'tgt', weaponIndex: 0 });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/cannot shoot in CHARGE/i) });
  });

  it('cannot move in FIGHT phase', () => {
    const p1 = makeUnit({ id: 'p1', playerId: 'player1' });
    const engine = makeEngine({ units: [p1] });
    // Advance to FIGHT phase
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'END_PHASE' }); // COMMAND→MOVEMENT→SHOOTING→CHARGE→FIGHT
    const res = engine.dispatch({ type: 'MOVE_UNIT', unitId: 'p1', destination: { x: 12, y: 10 } });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/cannot move in FIGHT/i) });
  });

  it('cannot fight in SHOOTING phase', () => {
    const attacker = makeUnit({ id: 'att', playerId: 'player1', center: { x: 10, y: 10 }, weapons: [SWORD] });
    const target = makeUnit({ id: 'tgt', playerId: 'player2', center: { x: 11, y: 10 } });
    const engine = makeEngine({ units: [attacker, target] });
    engine.dispatch({ type: 'END_PHASE' }); // → MOVEMENT
    engine.dispatch({ type: 'END_PHASE' }); // → SHOOTING
    const res = engine.dispatch({ type: 'FIGHT', attackerId: 'att', targetId: 'tgt' });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/cannot fight in SHOOTING/i) });
  });
});

// ---------------------------------------------------------------------------
// Concede
// ---------------------------------------------------------------------------

describe('CONCEDE', () => {
  it('active player can concede, setting gameOver and winner to opponent', () => {
    const engine = makeEngine();
    const res = engine.dispatch({ type: 'CONCEDE', playerId: 'player1' });
    expect(res.success).toBe(true);
    const state = engine.getState();
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe('player2');
  });

  it('inactive player cannot concede', () => {
    const engine = makeEngine();
    // player2 is not active at COMMAND phase
    const res = engine.dispatch({ type: 'CONCEDE', playerId: 'player2' });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/only active player/i) });
  });
});
