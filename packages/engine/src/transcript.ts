/**
 * Append-only typed transcript log.
 * Every roll, action, phase change, and derived event is recorded here.
 * The hash of the transcript is used for determinism testing and replay verification.
 */
// No external crypto import — use a portable pure-JS hash for browser + Node compatibility
import type { Action } from './actions.js';
import type { Phase } from './state.js';

export type TranscriptEvent =
  | { type: 'GAME_START'; rngState: number; players: string[]; turn: number }
  | { type: 'ROLL'; rollType: string; value: number; sides: number; context?: string }
  | { type: 'ACTION'; action: Action; playerId: string }
  | { type: 'PHASE_CHANGE'; from: Phase; to: Phase; turn: number }
  | { type: 'TURN_START'; turn: number; activePlayer: string }
  | { type: 'UNIT_DESTROYED'; unitId: string; destroyedBy: string }
  | { type: 'DAMAGE_APPLIED'; unitId: string; amount: number; remaining: number }
  | { type: 'HIT_ROLL'; attackerId: string; targetId: string; roll: number; needed: number; success: boolean }
  | { type: 'WOUND_ROLL'; attackerId: string; targetId: string; roll: number; needed: number; success: boolean }
  | { type: 'SAVE_ROLL'; unitId: string; roll: number; needed: number; success: boolean; isInvuln: boolean }
  | { type: 'CHARGE_ROLL'; attackerId: string; targetId: string; roll: number; distance: number; success: boolean }
  | { type: 'GAME_END'; winner: string | null; reason: string };

export class TranscriptLog {
  private events: TranscriptEvent[] = [];

  append(event: TranscriptEvent): void {
    this.events.push(event);
  }

  getEvents(): readonly TranscriptEvent[] {
    return this.events;
  }

  /**
   * FNV-1a 64-bit hash of the transcript (as two 32-bit words) — portable, deterministic.
   * Used for determinism golden tests. Not cryptographic.
   */
  hash(): string {
    const str = JSON.stringify(this.events);
    // FNV-1a with two interleaved 32-bit accumulators (simulates 64-bit)
    let h1 = 0x811c9dc5;
    let h2 = 0xdeadbeef;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 13);
      h1 = h1 >>> 0;
      h2 = h2 >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  serialize(): string {
    return JSON.stringify(this.events);
  }

  static deserialize(json: string): TranscriptLog {
    const log = new TranscriptLog();
    const events = JSON.parse(json) as TranscriptEvent[];
    log.events = events;
    return log;
  }

  /** Filter events by type */
  getByType<T extends TranscriptEvent['type']>(
    type: T
  ): Extract<TranscriptEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<TranscriptEvent, { type: T }>[];
  }

  /** Count of events by type */
  countByType(type: TranscriptEvent['type']): number {
    return this.events.filter((e) => e.type === type).length;
  }

  /** Get roll summary: { total, hits, wounds, saves } */
  getRollSummary(): { total: number; hits: number; wounds: number; saves: number; damageTotal: number } {
    const damages = this.getByType('DAMAGE_APPLIED');
    return {
      total: this.events.filter((e) => e.type === 'ROLL' || e.type.endsWith('_ROLL')).length,
      hits: this.getByType('HIT_ROLL').filter((e) => e.success).length,
      wounds: this.getByType('WOUND_ROLL').filter((e) => e.success).length,
      saves: this.getByType('SAVE_ROLL').filter((e) => e.success).length,
      damageTotal: damages.reduce((sum, e) => sum + e.amount, 0),
    };
  }
}
