/**
 * GameState — the single source of truth for the game.
 * All state mutations happen through the action dispatch pipeline.
 * State is versioned for serialization/migration.
 *
 * BLOB UNIT DESIGN:
 * Units are represented as circles (center + radius) for Phase 0-7.
 * This is the "blob unit" abstraction. The upgrade path to per-model positions:
 * - Keep BlobUnit as a valid representation
 * - Add `models?: ModelPosition[]` as an optional field
 * - Engine checks: if models present, use model-level geometry; else use blob geometry
 * - Public APIs (MoveUnit, Shoot, etc.) accept unit IDs — geometry is internal
 */

export type Phase = 'COMMAND' | 'MOVEMENT' | 'SHOOTING' | 'CHARGE' | 'FIGHT' | 'END';
export const PHASE_ORDER: Phase[] = ['COMMAND', 'MOVEMENT', 'SHOOTING', 'CHARGE', 'FIGHT', 'END'];

export interface Point {
  x: number; // inches from left edge
  y: number; // inches from bottom edge
}

/**
 * EngineWeapon — minimal weapon profile for combat resolution.
 * Intentionally engine-internal; the content package maps WeaponProfile → EngineWeapon.
 */
export interface EngineWeapon {
  id: string;
  name: string;
  type: 'melee' | 'ranged';
  /** Range in inches for ranged weapons, or 'Melee' */
  range: number | 'Melee';
  /** Attacks characteristic — DiceExpr string e.g. "3", "D6", "2D3" */
  attacks: string;
  /** Weapon Skill or Ballistic Skill (e.g. 2 = "2+") */
  skill: number;
  strength: number;
  /** Armour Penetration — 0 or negative (e.g. -2 = AP-2) */
  ap: number;
  /** Damage characteristic — DiceExpr string e.g. "1", "D3", "D6" */
  damage: string;
  keywords: string[];
}

/**
 * BlobUnit — a unit represented as a circle footprint.
 * Upgrade path: add optional `models: ModelPosition[]` — if present, geometry uses per-model positions.
 */
export interface BlobUnit {
  id: string;
  datasheetId: string;
  name: string;
  playerId: string;

  // Geometry (blob model)
  center: Point;
  radius: number; // footprint radius in inches

  // Stats (denormalized from datasheet for fast access)
  movementInches: number;
  toughness: number;
  save: number;
  invuln: number | null;
  fnp: number | null;
  oc: number; // Objective Control value

  // Wound tracking
  wounds: number;
  maxWounds: number;

  // Per-activation state (reset each phase)
  remainingMove: number;
  hasFired: boolean;
  hasCharged: boolean;
  hasFought: boolean;
  hasAdvanced: boolean;       // Rolled advance this phase (can't charge; can still use ASSAULT weapons)
  isInEngagement: boolean;
  movedThisPhase: boolean;

  /** Weapons available to this unit for shooting/fighting */
  weapons: EngineWeapon[];
}

export interface Objective {
  id: string;
  position: Point;
  radius: number; // typically 3"
  controlledBy: string | null; // playerId or null
  contestedOcPerPlayer: Record<string, number>;
}

export interface PlayerState {
  id: string;
  victoryPoints: number;
  commandPoints: number;
  armyName: string;
}

/**
 * GameState v1 — serializable, versioned.
 * Version bumps require a migration function in state-migration.ts.
 */
export interface GameState {
  readonly version: 1;
  turn: number; // 1-5 for standard matched play
  phase: Phase;
  activePlayer: string; // playerId
  players: [PlayerState, PlayerState];
  units: BlobUnit[];
  objectives: Objective[];
  boardWidth: number; // inches, typically 60
  boardHeight: number; // inches, typically 44
  rngState: number; // mulberry32 state at start of this state
  turnLimit: number; // default 5
  gameOver: boolean;
  winner: string | null;
}

export function createInitialState(
  playerIds: [string, string],
  opts: { boardWidth?: number; boardHeight?: number; turnLimit?: number; rngSeed?: number } = {}
): GameState {
  const {
    boardWidth = 60,
    boardHeight = 44,
    turnLimit = 5,
    rngSeed = Date.now(),
  } = opts;

  return {
    version: 1,
    turn: 1,
    phase: 'COMMAND',
    activePlayer: playerIds[0] ?? 'player1',
    players: [
      { id: playerIds[0] ?? 'player1', victoryPoints: 0, commandPoints: 0, armyName: 'Army 1' },
      { id: playerIds[1] ?? 'player2', victoryPoints: 0, commandPoints: 1, armyName: 'Army 2' },
    ],
    units: [],
    objectives: [],
    boardWidth,
    boardHeight,
    rngState: rngSeed,
    turnLimit,
    gameOver: false,
    winner: null,
  };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): GameState {
  const parsed = JSON.parse(json) as GameState;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported GameState version: ${String(parsed.version)}. Use state-migration.ts.`);
  }
  return parsed;
}

/** Deep clone state for AI lookahead — avoids mutating game state */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** Get a unit by ID — throws if not found */
export function getUnit(state: GameState, unitId: string): BlobUnit {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`Unit not found: ${unitId}`);
  return unit;
}

/** Get units belonging to a player */
export function getPlayerUnits(state: GameState, playerId: string): BlobUnit[] {
  return state.units.filter((u) => u.playerId === playerId);
}

/** Get opponent player ID */
export function getOpponent(state: GameState, playerId: string): string {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) throw new Error(`Cannot find opponent of: ${playerId}`);
  return opponent.id;
}

/** Advance to next phase (and next turn/player as needed) */
export function nextPhase(state: GameState): { phase: Phase; turn: number; activePlayer: string } {
  const currentIdx = PHASE_ORDER.indexOf(state.phase);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= PHASE_ORDER.length) {
    // End of phase list — next turn
    const nextTurn = state.turn + 1;
    const opponent = getOpponent(state, state.activePlayer);
    return { phase: 'COMMAND', turn: nextTurn, activePlayer: opponent };
  }

  const nextPhaseVal = PHASE_ORDER[nextIdx];
  if (!nextPhaseVal) throw new Error('Phase order corrupted');
  return { phase: nextPhaseVal, turn: state.turn, activePlayer: state.activePlayer };
}
