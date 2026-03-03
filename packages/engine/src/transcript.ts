/**
 * Append-only typed transcript log.
 * Every roll, action, phase change, and derived event is recorded here.
 * The hash of the transcript is used for determinism testing and replay verification.
 */
import { createHash } from 'crypto';
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

  /** SHA-256 hash of the transcript — used for determinism golden tests */
  hash(): string {
    const serialized = JSON.stringify(this.events);
    return createHash('sha256').update(serialized, 'utf8').digest('hex');
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
