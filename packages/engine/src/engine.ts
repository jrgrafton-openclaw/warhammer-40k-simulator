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
import { rollDiceExpr } from './dice.js';

/** Recalculate isInEngagement for all units (call after any position change). */
function updateEngagement(state: GameState): void {
  for (const u of state.units) u.isInEngagement = false;
  for (let i = 0; i < state.units.length; i++) {
    for (let j = i + 1; j < state.units.length; j++) {
      const a = state.units[i]!;
      const b = state.units[j]!;
      if (a.playerId === b.playerId) continue;
      const dist = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
      if (dist <= a.radius + b.radius + 1.01) {
        a.isInEngagement = true;
        b.isInEngagement = true;
      }
    }
  }
}

/** WH40K 10th ed wound roll table */
function woundRollNeeded(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness)      return 3;
  if (strength === toughness)    return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

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
      return { success: false, error: validation.reason ?? 'Action rejected' };
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
        if (this.state.phase !== 'END') {
          return { valid: false, reason: `Cannot end turn in ${this.state.phase} phase` };
        }
        return { valid: true };

      case 'CONCEDE':
        if (action.playerId !== this.state.activePlayer) {
          return { valid: false, reason: 'Only active player can concede' };
        }
        return { valid: true };

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

      case 'ADVANCE_UNIT': {
        if (this.state.phase !== 'MOVEMENT')
          return { valid: false, reason: `Cannot advance in ${this.state.phase} phase` };
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (!unit) return { valid: false, reason: `Unit ${action.unitId} not found` };
        if (unit.playerId !== this.state.activePlayer)
          return { valid: false, reason: 'Cannot advance opponent unit' };
        if (unit.movedThisPhase)
          return { valid: false, reason: 'Unit has already moved this phase' };
        // Advance distance limit is validated after rolling; just check board bounds here
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
        const shootWeapon = attacker.weapons[action.weaponIndex];
        if (!shootWeapon) return { valid: false, reason: `Weapon index ${action.weaponIndex} not found on ${attacker.name}` };
        if (shootWeapon.type === 'melee') return { valid: false, reason: 'Melee weapons cannot be used in Shooting phase' };
        const shootDist = Math.hypot(attacker.center.x - target.center.x, attacker.center.y - target.center.y);
        const shootRange = typeof shootWeapon.range === 'number' ? shootWeapon.range : 0;
        // WH40K measures range edge-to-edge (base-to-base), not centre-to-centre
        const shootEdgeDist = Math.max(0, shootDist - attacker.radius - target.radius);
        if (shootEdgeDist > shootRange + 0.001)
          return { valid: false, reason: `Target out of range (${shootEdgeDist.toFixed(1)}" > ${shootRange}")` };
        if (attacker.isInEngagement && !shootWeapon.keywords.includes('PISTOL'))
          return { valid: false, reason: 'Cannot shoot while in engagement range (no Pistol weapon)' };
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
        if (attacker.hasAdvanced)
          return { valid: false, reason: 'Unit cannot charge after advancing (unless special rule)' };
        return { valid: true };
      }

      case 'FIGHT': {
        if (this.state.phase !== 'FIGHT')
          return { valid: false, reason: `Cannot fight in ${this.state.phase} phase` };
        const fightAttacker = this.state.units.find((u) => u.id === action.attackerId);
        const fightTarget = this.state.units.find((u) => u.id === action.targetId);
        if (!fightAttacker) return { valid: false, reason: 'Attacker not found' };
        if (!fightTarget) return { valid: false, reason: 'Target not found' };
        if (fightAttacker.playerId !== this.state.activePlayer)
          return { valid: false, reason: 'Cannot fight with opponent unit' };
        if (fightTarget.playerId === fightAttacker.playerId)
          return { valid: false, reason: 'Cannot fight friendly unit' };
        if (fightAttacker.hasFought)
          return { valid: false, reason: 'Unit has already fought this phase' };
        if (!fightAttacker.isInEngagement)
          return { valid: false, reason: 'Unit is not in engagement range' };
        const fightDist = Math.hypot(fightAttacker.center.x - fightTarget.center.x, fightAttacker.center.y - fightTarget.center.y);
        if (fightDist > fightAttacker.radius + fightTarget.radius + 1.01)
          return { valid: false, reason: 'Target is not in engagement range' };
        if (!fightAttacker.weapons.some((w) => w.type === 'melee'))
          return { valid: false, reason: `${fightAttacker.name} has no melee weapons` };
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
          updateEngagement(this.state);
        }
        break;
      }

      case 'ADVANCE_UNIT': {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          // Roll advance dice BEFORE checking destination distance
          const advanceRoll = this.rng.d6();
          const advanceLimit = unit.movementInches + advanceRoll;

          this.transcript.append({
            type: 'ROLL',
            rollType: 'ADVANCE',
            value: advanceRoll,
            sides: 6,
            context: `${unit.name} advances (+${advanceRoll}")`,
          });

          const dist = Math.sqrt(
            (action.destination.x - unit.center.x) ** 2 +
            (action.destination.y - unit.center.y) ** 2
          );
          // Clamp to advance limit — if destination is too far, move to max allowed
          const clampedDist = Math.min(dist, advanceLimit);
          if (dist <= advanceLimit + 0.001) {
            unit.center = action.destination;
          } else {
            // Move along the vector to max advance distance
            const ratio = advanceLimit / dist;
            unit.center = {
              x: unit.center.x + (action.destination.x - unit.center.x) * ratio,
              y: unit.center.y + (action.destination.y - unit.center.y) * ratio,
            };
          }
          unit.remainingMove = advanceLimit - clampedDist;
          unit.movedThisPhase = true;
          unit.hasAdvanced = true;
          updateEngagement(this.state);
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
        unit.hasAdvanced = false;
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
    const attacker = this.state.units.find((u) => u.id === action.attackerId);
    const target = this.state.units.find((u) => u.id === action.targetId);
    if (!attacker || !target) return;

    const weapon = attacker.weapons[action.weaponIndex];
    if (!weapon) {
      attacker.hasFired = true;
      return;
    }

    // 1. Roll attacks
    const attackCount = rollDiceExpr(weapon.attacks, this.rng);
    this.transcript.append({
      type: 'ROLL', rollType: 'ATTACKS', value: attackCount, sides: 6,
      context: `${attacker.name} fires ${weapon.name} (${attackCount} attacks)`,
    });

    // 2. Hit rolls (D6 >= skill)
    let hits = 0;
    for (let i = 0; i < attackCount; i++) {
      const roll = this.rng.d6();
      const success = roll >= weapon.skill;
      if (success) hits++;
      this.transcript.append({
        type: 'HIT_ROLL', attackerId: attacker.id, targetId: target.id,
        roll, needed: weapon.skill, success,
      });
    }

    // 3. Wound rolls (S vs T table)
    const woundNeeded = woundRollNeeded(weapon.strength, target.toughness);
    let woundsScored = 0;
    for (let i = 0; i < hits; i++) {
      const roll = this.rng.d6();
      const success = roll >= woundNeeded;
      if (success) woundsScored++;
      this.transcript.append({
        type: 'WOUND_ROLL', attackerId: attacker.id, targetId: target.id,
        roll, needed: woundNeeded, success,
      });
    }

    // 4. Save rolls (best of armour+AP vs invuln)
    const modifiedSave = target.save - weapon.ap; // ap is 0 or negative, so this = save + |ap|
    const isInvulnBetter = target.invuln !== null && target.invuln < modifiedSave;
    const effectiveSave = isInvulnBetter ? target.invuln! : modifiedSave;
    let unsaved = 0;
    for (let i = 0; i < woundsScored; i++) {
      const roll = this.rng.d6();
      const success = roll >= effectiveSave;
      if (!success) unsaved++;
      this.transcript.append({
        type: 'SAVE_ROLL', unitId: target.id,
        roll, needed: effectiveSave, success, isInvuln: isInvulnBetter,
      });
    }

    // 5. Apply damage (with optional FNP)
    let totalDamage = 0;
    for (let i = 0; i < unsaved; i++) {
      const dmg = rollDiceExpr(weapon.damage, this.rng);
      let finalDmg = dmg;

      // Feel No Pain — roll per wound point
      if (target.fnp !== null) {
        let blocked = 0;
        for (let w = 0; w < dmg; w++) {
          if (this.rng.d6() >= target.fnp) blocked++;
        }
        finalDmg = dmg - blocked;
      }

      totalDamage += finalDmg;
      const remaining = Math.max(0, target.wounds - totalDamage);
      this.transcript.append({ type: 'DAMAGE_APPLIED', unitId: target.id, amount: finalDmg, remaining });
    }

    target.wounds = Math.max(0, target.wounds - totalDamage);
    attacker.hasFired = true;

    // Remove destroyed unit
    if (target.wounds <= 0) {
      this.state.units = this.state.units.filter((u) => u.id !== target.id);
      this.transcript.append({ type: 'UNIT_DESTROYED', unitId: target.id, destroyedBy: attacker.id });
    }
  }

  private resolveCharge(action: Extract<Action, { type: 'CHARGE' }>): void {
    const attacker = this.state.units.find((u) => u.id === action.attackerId);
    const primaryTarget = this.state.units.find((u) => u.id === action.targetIds[0]);
    if (!attacker) return;
    if (!primaryTarget) { attacker.hasCharged = true; return; }

    // Roll 2D6 charge distance
    const roll = this.rng.d6() + this.rng.d6();

    // Distance attacker needs to travel to reach engagement (1" edge-to-edge)
    const centerDist = Math.hypot(
      primaryTarget.center.x - attacker.center.x,
      primaryTarget.center.y - attacker.center.y
    );
    const needed = Math.max(0, centerDist - attacker.radius - primaryTarget.radius - 1);
    const success = roll >= needed;

    this.transcript.append({
      type: 'CHARGE_ROLL',
      attackerId: attacker.id,
      targetId: primaryTarget.id,
      roll,
      distance: needed,
      success,
    });

    if (success) {
      // Move attacker to engagement range (0.5" edge-to-edge from target)
      const engageCenterDist = attacker.radius + primaryTarget.radius + 0.5;
      if (centerDist > engageCenterDist) {
        const ratio = engageCenterDist / centerDist;
        attacker.center = {
          x: primaryTarget.center.x - (primaryTarget.center.x - attacker.center.x) * ratio,
          y: primaryTarget.center.y - (primaryTarget.center.y - attacker.center.y) * ratio,
        };
      }
      updateEngagement(this.state);
    }

    attacker.hasCharged = true;
  }

  private resolveFight(action: Extract<Action, { type: 'FIGHT' }>): void {
    const attacker = this.state.units.find((u) => u.id === action.attackerId);
    const target = this.state.units.find((u) => u.id === action.targetId);
    if (!attacker || !target) return;

    const weapon = attacker.weapons.find((w) => w.type === 'melee');
    if (!weapon) { attacker.hasFought = true; return; }

    // Hit rolls
    const attackCount = rollDiceExpr(weapon.attacks, this.rng);
    this.transcript.append({ type: 'ROLL', rollType: 'ATTACKS', value: attackCount, sides: 6,
      context: `${attacker.name} fights ${target.name} with ${weapon.name}` });

    let hits = 0;
    for (let i = 0; i < attackCount; i++) {
      const roll = this.rng.d6();
      const success = roll >= weapon.skill;
      if (success) hits++;
      this.transcript.append({ type: 'HIT_ROLL', attackerId: attacker.id, targetId: target.id, roll, needed: weapon.skill, success });
    }

    // Wound rolls
    const woundNeeded = woundRollNeeded(weapon.strength, target.toughness);
    let woundsScored = 0;
    for (let i = 0; i < hits; i++) {
      const roll = this.rng.d6();
      const success = roll >= woundNeeded;
      if (success) woundsScored++;
      this.transcript.append({ type: 'WOUND_ROLL', attackerId: attacker.id, targetId: target.id, roll, needed: woundNeeded, success });
    }

    // Save rolls
    const modifiedSave = target.save - weapon.ap;
    const isInvulnBetter = target.invuln !== null && target.invuln < modifiedSave;
    const effectiveSave = isInvulnBetter ? target.invuln! : modifiedSave;
    let unsaved = 0;
    for (let i = 0; i < woundsScored; i++) {
      const roll = this.rng.d6();
      const success = roll >= effectiveSave;
      if (!success) unsaved++;
      this.transcript.append({ type: 'SAVE_ROLL', unitId: target.id, roll, needed: effectiveSave, success, isInvuln: isInvulnBetter });
    }

    // Damage + FNP
    let totalDamage = 0;
    for (let i = 0; i < unsaved; i++) {
      const dmg = rollDiceExpr(weapon.damage, this.rng);
      let finalDmg = dmg;
      if (target.fnp !== null) {
        let blocked = 0;
        for (let w = 0; w < dmg; w++) { if (this.rng.d6() >= target.fnp) blocked++; }
        finalDmg = dmg - blocked;
      }
      totalDamage += finalDmg;
      this.transcript.append({ type: 'DAMAGE_APPLIED', unitId: target.id, amount: finalDmg, remaining: Math.max(0, target.wounds - totalDamage) });
    }

    target.wounds = Math.max(0, target.wounds - totalDamage);
    attacker.hasFought = true;

    if (target.wounds <= 0) {
      this.state.units = this.state.units.filter((u) => u.id !== target.id);
      this.transcript.append({ type: 'UNIT_DESTROYED', unitId: target.id, destroyedBy: attacker.id });
      updateEngagement(this.state);
    }
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
