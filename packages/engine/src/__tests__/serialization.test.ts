import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  serializeState,
  deserializeState,
  GameEngine,
  SeededRng,
  TranscriptLog,
  cloneState,
} from '../index.js';

describe('GameState serialization', () => {
  it('round-trip preserves all fields', () => {
    const state = createInitialState(['alice', 'bob'], {
      boardWidth: 60,
      boardHeight: 44,
      turnLimit: 5,
      rngSeed: 42,
    });
    const json = serializeState(state);
    const restored = deserializeState(json);
    expect(restored).toEqual(state);
  });

  it('produces valid JSON', () => {
    const state = createInitialState(['p1', 'p2']);
    const json = serializeState(state);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('version field is preserved', () => {
    const state = createInitialState(['p1', 'p2']);
    const restored = deserializeState(serializeState(state));
    expect(restored.version).toBe(1);
  });

  it('throws on unsupported version', () => {
    const state = createInitialState(['p1', 'p2']);
    const json = serializeState(state).replace('"version":1', '"version":99');
    expect(() => deserializeState(json)).toThrow(/Unsupported GameState version/);
  });

  it('cloneState produces deep copy (not reference)', () => {
    const state = createInitialState(['p1', 'p2']);
    const clone = cloneState(state);
    clone.turn = 99;
    expect(state.turn).toBe(1);
  });

  it('TranscriptLog round-trip preserves events', () => {
    const transcript = new TranscriptLog();
    transcript.append({ type: 'PHASE_CHANGE', from: 'COMMAND', to: 'MOVEMENT', turn: 1 });
    transcript.append({ type: 'ROLL', rollType: 'd6', value: 4, sides: 6 });

    const json = transcript.serialize();
    const restored = TranscriptLog.deserialize(json);

    expect(restored.getEvents()).toEqual(transcript.getEvents());
    expect(restored.hash()).toBe(transcript.hash());
  });

  it('phase progression serializes and restores correctly', () => {
    const state = createInitialState(['p1', 'p2'], { rngSeed: 1 });
    const rng = new SeededRng(1);
    const transcript = new TranscriptLog();
    const engine = new GameEngine(state, rng, transcript);

    // Advance through 3 phases
    for (let i = 0; i < 3; i++) engine.dispatch({ type: 'END_PHASE' });

    const midState = engine.getState();
    const json = serializeState(midState);
    const restored = deserializeState(json);

    expect(restored.phase).toBe(midState.phase);
    expect(restored.turn).toBe(midState.turn);
    expect(restored.activePlayer).toBe(midState.activePlayer);
  });
});
