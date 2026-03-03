/**
 * GameEngine — the main entry point for state mutation.
 * All state changes go through dispatch(action).
 *
 * Dispatch pipeline:
 *   1. validate(action, state) — check legality, return error if invalid
 *   2. resolve(action, state, rng) — compute new state + events
 *   3. append events to transcript
 *   4. return new state
 *
 * The engine is IMMUTABLE from the outside — dispatch returns a new state.
 * Internal state is mutable for performance, but cloned on read.
 */
import { type Action, type ActionResult } from './actions.js';
import { SeededRng } from './rng.js';
import { TranscriptLog } from './transcript.js';
import {
  type GameState,
  type Phase,
  type BlobUnit,
  cloneState,
  getOpponent,
  PHASE_ORDER,
  nextPhase,
} from './state.js';

export class GameEngine {
  private state: GameState;
  private readonly rng: SeededRng;
  private readonly transcript: TranscriptLog;

  constructor(state: GameState, rng: SeededRng, transcript: TranscriptLog) {
    this.state = cloneState(state);
    this.rng = rng;
    this.transcript = transcript;
    // Record game start — includes RNG state so different seeds produce different transcripts
    // even before any dice are rolled.
    this.transcript.append({
      type: 'GAME_START',
      rngState: rng.getState(),
      players: state.players.map((p) => p.id),
      turn: state.turn,
    });
  }

  /** Read-only state snapshot */
  getState(): GameState {
    return cloneState(this.state);
  }

  /** Dispatch an action through the pipeline */
  dispatch(action: Action): ActionResult {
    // Validate
    const validation = this.validateAction(action);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Record action in transcript
    this.transcript.append({
      type: 'ACTION',
      action,
      playerId: this.state.activePlayer,
    });

    // Resolve
    this.resolveAction(action);

    return { success: true };
  }

  private validateAction(action: Action): { valid: boolean; reason?: string } {
    if (this.state.gameOver) {
      return { valid: false, reason: 'Game is already over' };
    }

    switch (action.type) {
      case 'END_PHASE':
        return { valid: true };

      case 'END_TURN':
        return {
          valid: this.state.phase === 'END',
          reason: this.state.phase !== 'END' ? `Cannot end turn in ${this.state.phase} phase` : undefined,
        };

      case 'CONCEDE':
        return {
          valid: action.playerId === this.state.activePlayer,
          reason: action.playerId !== this.state.activePlayer ? 'Only active player can concede' : undefined,
        };

      case 'DEPLOY_UNIT': {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (!unit) return { valid: false, reason: `Unit ${action.unitId} not found` };
        if (unit.playerId !== this.state.activePlayer)
          return { valid: false, reason: 'Cannot deploy opponent unit' };
        return { valid: true };
      }

      case 'MOVE_UNIT': {
        if (this.state.phase !== 'MOVEMENT')
          return { valid: false, reason: `Cannot move in ${this.state.phase} phase` };
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (!unit) return { valid: false, reason: `Unit ${action.unitId} not found` };
        if (unit.playerId !== this.state.activePlayer)
          return { valid: false, reason: 'Cannot move opponent unit' };
        if (unit.movedThisPhase)
          return { valid: false, reason: 'Unit has already moved this phase' };
        const dist = Math.sqrt(
          (action.destination.x - unit.center.x) ** 2 +
          (action.destination.y - unit.center.y) ** 2
        );
        if (dist > unit.remainingMove + 0.001)
          return { valid: false, reason: `Move distance ${dist.toFixed(2)}" exceeds remaining move ${unit.remainingMove.toFixed(2)}"` };
        if (action.destination.x < 0 || action.destination.x > this.state.boardWidth ||
            action.destination.y < 0 || action.destination.y > this.state.boardHeight)
          return { valid: false, reason: 'Destination is off the board' };
        return { valid: true };
      }

      case 'SHOOT': {
        if (this.state.phase !== 'SHOOTING')
          return { valid: false, reason: `Cannot shoot in ${this.state.phase} phase` };
        const attacker = this.state.units.find((u) => u.id === action.attackerId);
        const target = this.state.units.find((u) => u.id === action.targetId);
        if (!attacker) return { valid: false, reason: 'Attacker not found' };
        if (!target) return { valid: false, reason: 'Target not found' };
        if (attacker.playerId !== this.state.activePlayer)
          return { valid: false, reason: 'Cannot shoot with opponent unit' };
        if (target.playerId === this.state.activePlayer)
          return { valid: false, reason: 'Cannot shoot friendly unit' };
        if (attacker.hasFired)
          return { valid: false, reason: 'Unit has already fired this phase' };
        return { valid: true };
      }

      case 'CHARGE': {
        if (this.state.phase !== 'CHARGE')
          return { valid: false, reason: `Cannot charge in ${this.state.phase} phase` };
        const attacker = this.state.units.find((u) => u.id === action.attackerId);
        if (!attacker) return { valid: false, reason: 'Attacker not found' };
        if (attacker.playerId !== this.state.activePlayer)
          return { valid: false, reason: 'Cannot charge with opponent unit' };
        if (attacker.hasCharged)
          return { valid: false, reason: 'Unit has already charged this phase' };
        return { valid: true };
      }

      case 'FIGHT': {
        if (this.state.phase !== 'FIGHT')
          return { valid: false, reason: `Cannot fight in ${this.state.phase} phase` };
        const attacker = this.state.units.find((u) => u.id === action.attackerId);
        const target = this.state.units.find((u) => u.id === action.targetId);
        if (!attacker) return { valid: false, reason: 'Attacker not found' };
        if (!target) return { valid: false, reason: 'Target not found' };
        if (attacker.playerId !== this.state.activePlayer)
          return { valid: false, reason: 'Cannot fight with opponent unit' };
        if (attacker.hasFought)
          return { valid: false, reason: 'Unit has already fought this phase' };
        return { valid: true };
      }

      case 'USE_STRATAGEM':
        return { valid: true }; // Phase 2+ stubs full validation

      default:
        return { valid: false, reason: `Unknown action type: ${(action as Action).type}` };
    }
  }

  private resolveAction(action: Action): void {
    switch (action.type) {
      case 'END_PHASE':
        this.resolveEndPhase();
        break;

      case 'END_TURN':
        this.resolveEndTurn();
        break;

      case 'CONCEDE':
        this.state.gameOver = true;
        this.state.winner = getOpponent(this.state, action.playerId);
        this.transcript.append({ type: 'GAME_END', winner: this.state.winner, reason: 'concede' });
        break;

      case 'DEPLOY_UNIT': {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          unit.center = action.position;
        }
        break;
      }

      case 'MOVE_UNIT': {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          const dist = Math.sqrt(
            (action.destination.x - unit.center.x) ** 2 +
            (action.destination.y - unit.center.y) ** 2
          );
          unit.center = action.destination;
          unit.remainingMove -= dist;
          unit.movedThisPhase = true;
        }
        break;
      }

      case 'SHOOT':
        this.resolveShoot(action);
        break;

      case 'CHARGE':
        this.resolveCharge(action);
        break;

      case 'FIGHT':
        this.resolveFight(action);
        break;

      case 'USE_STRATAGEM':
        // Phase 2+ implementation
        break;
    }
  }

  private resolveEndPhase(): void {
    const { phase, turn, activePlayer } = nextPhase(this.state);

    this.transcript.append({
      type: 'PHASE_CHANGE',
      from: this.state.phase,
      to: phase,
      turn,
    });

    // On COMMAND phase start: score objectives, reset per-phase unit state
    if (phase === 'COMMAND') {
      this.scoreObjectives();
      this.state.turn = turn;
      this.state.activePlayer = activePlayer;

      // Reset per-activation state
      for (const unit of this.state.units) {
        unit.remainingMove = unit.movementInches;
        unit.hasFired = false;
        unit.hasCharged = false;
        unit.hasFought = false;
        unit.movedThisPhase = false;
      }

      // Check win condition
      if (this.state.turn > this.state.turnLimit) {
        this.resolveGameEnd();
        return;
      }

      this.transcript.append({
        type: 'TURN_START',
        turn: this.state.turn,
        activePlayer: this.state.activePlayer,
      });
    } else {
      this.state.activePlayer = activePlayer;
    }

    this.state.phase = phase;
  }

  private resolveEndTurn(): void {
    this.resolveEndPhase(); // END_TURN advances from END phase
  }

  private scoreObjectives(): void {
    // Determine objective control based on OC values
    for (const obj of this.state.objectives) {
      const ocPerPlayer: Record<string, number> = {};
      for (const unit of this.state.units) {
        const dist = Math.sqrt(
          (unit.center.x - obj.position.x) ** 2 +
          (unit.center.y - obj.position.y) ** 2
        ) - unit.radius;
        if (dist <= obj.radius) {
          ocPerPlayer[unit.playerId] = (ocPerPlayer[unit.playerId] ?? 0) + unit.oc;
        }
      }
      obj.contestedOcPerPlayer = ocPerPlayer;

      // Controller is player with highest OC (contested = no change if tied)
      const [p1, p2] = this.state.players;
      const oc1 = ocPerPlayer[p1?.id ?? ''] ?? 0;
      const oc2 = ocPerPlayer[p2?.id ?? ''] ?? 0;

      if (oc1 > oc2) {
        obj.controlledBy = p1?.id ?? null;
        if (p1) p1.victoryPoints += 1;
      } else if (oc2 > oc1) {
        obj.controlledBy = p2?.id ?? null;
        if (p2) p2.victoryPoints += 1;
      }
      // Tied = no change to controlledBy, no VP
    }
  }

  private resolveShoot(action: Extract<Action, { type: 'SHOOT' }>): void {
    // Phase 4 will implement full shooting pipeline
    // Stub: mark unit as fired
    const attacker = this.state.units.find((u) => u.id === action.attackerId);
    if (attacker) attacker.hasFired = true;
  }

  private resolveCharge(action: Extract<Action, { type: 'CHARGE' }>): void {
    // Phase 5 will implement full charge resolution
    // Stub: roll 2D6, log it
    const roll = this.rng.d6() + this.rng.d6();
    this.transcript.append({
      type: 'ROLL',
      rollType: 'CHARGE',
      value: roll,
      sides: 6,
      context: `${action.attackerId} charges`,
    });

    const attacker = this.state.units.find((u) => u.id === action.attackerId);
    if (attacker) attacker.hasCharged = true;
  }

  private resolveFight(action: Extract<Action, { type: 'FIGHT' }>): void {
    // Phase 5 will implement full fight resolution
    const attacker = this.state.units.find((u) => u.id === action.attackerId);
    if (attacker) attacker.hasFought = true;
  }

  private resolveGameEnd(): void {
    this.state.gameOver = true;
    const [p1, p2] = this.state.players;
    const vp1 = p1?.victoryPoints ?? 0;
    const vp2 = p2?.victoryPoints ?? 0;
    let winner: string | null = null;
    if (vp1 > vp2) winner = p1?.id ?? null;
    else if (vp2 > vp1) winner = p2?.id ?? null;
    this.state.winner = winner;
    this.transcript.append({
      type: 'GAME_END',
      winner,
      reason: vp1 === vp2 ? 'draw' : 'most_victory_points',
    });
  }

  /** Get a copy of the transcript */
  getTranscript(): TranscriptLog {
    return this.transcript;
  }
}
