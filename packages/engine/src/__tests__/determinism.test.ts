import { describe, it, expect } from 'vitest';
import { createInitialState, GameEngine, SeededRng, TranscriptLog } from '../index.js';

function runSimulation(seed: number): string {
  const state = createInitialState(['player1', 'player2'], { rngSeed: seed });
  const rng = new SeededRng(seed);
  const transcript = new TranscriptLog();
  const engine = new GameEngine(state, rng, transcript);

  // Cycle through all 6 phases: COMMAND → MOVEMENT → SHOOTING → CHARGE → FIGHT → END
  for (let i = 0; i < 6; i++) {
    engine.dispatch({ type: 'END_PHASE' });
  }

  return transcript.hash();
}

describe('Deterministic RNG + Transcript', () => {
  it('same seed produces identical transcript hash', () => {
    const hash1 = runSimulation(42);
    const hash2 = runSimulation(42);
    expect(hash1).toBe(hash2);
  });

  it('different seeds produce different transcript hashes', () => {
    const hash1 = runSimulation(42);
    const hash2 = runSimulation(99);
    expect(hash1).not.toBe(hash2);
  });

  it('transcript hash is a 16-char hex string (FNV-1a, browser-portable)', () => {
    const hash = runSimulation(1337);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('multiple runs with same seed are bit-identical', () => {
    const runs = Array.from({ length: 5 }, () => runSimulation(7));
    expect(new Set(runs).size).toBe(1);
  });

  it('SeededRng clone produces identical sequence', () => {
    const rng = new SeededRng(42);
    // Advance a bit
    rng.next(); rng.next(); rng.next();

    const clone = rng.clone();
    const original = rng;

    const cloneSeq = Array.from({ length: 10 }, () => clone.next());
    const origSeq = Array.from({ length: 10 }, () => original.next());

    expect(cloneSeq).toEqual(origSeq);
  });

  it('SeededRng roll produces values in [1, sides]', () => {
    const rng = new SeededRng(12345);
    for (let i = 0; i < 1000; i++) {
      const roll = rng.roll(6);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
  });

  it('SeededRng d6 produces fair distribution (approx)', () => {
    const rng = new SeededRng(99999);
    const counts = new Array(7).fill(0) as number[];
    const N = 12000;
    for (let i = 0; i < N; i++) {
      const roll = rng.d6();
      counts[roll] = (counts[roll] ?? 0) + 1;
    }
    // Each face should appear ~2000 times ± 200 (10% tolerance)
    for (let face = 1; face <= 6; face++) {
      const count = counts[face] ?? 0;
      expect(count).toBeGreaterThan(1700);
      expect(count).toBeLessThan(2300);
    }
  });
});
