/**
 * Deterministic seeded RNG using mulberry32.
 * All randomness in the engine MUST flow through SeededRng.
 * Do NOT use Math.random() anywhere in the engine or AI packages.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Ensure we start with a non-zero state
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 1;
  }

  /** Returns a pseudo-random float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [1, sides] (inclusive) */
  roll(sides: number): number {
    return Math.floor(this.next() * sides) + 1;
  }

  /** Roll a D6 */
  d6(): number {
    return this.roll(6);
  }

  /** Roll a D3 */
  d3(): number {
    return this.roll(3);
  }

  /** Roll multiple dice and sum them */
  rollMultiple(count: number, sides: number): number {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += this.roll(sides);
    }
    return total;
  }

  /** Get current internal state (for serialization) */
  getState(): number {
    return this.state;
  }

  /** Create a clone at current state (for AI rollouts without affecting main game RNG) */
  clone(): SeededRng {
    const cloned = new SeededRng(1);
    cloned.state = this.state;
    return cloned;
  }

  /** Serialize for transcript/replay */
  serialize(): { seed: number; state: number } {
    return { seed: this.state, state: this.state };
  }

  static fromState(state: number): SeededRng {
    const rng = new SeededRng(1);
    rng.state = state;
    return rng;
  }
}
