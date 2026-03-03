// Public API for @wh40k/engine
// All consumers should import from here — internal modules may change

export { SeededRng } from './rng.js';
export { TranscriptLog, type TranscriptEvent } from './transcript.js';
export {
  createInitialState,
  serializeState,
  deserializeState,
  cloneState,
  getUnit,
  getPlayerUnits,
  getOpponent,
  nextPhase,
  PHASE_ORDER,
  type Phase,
  type Point,
  type BlobUnit,
  type Objective,
  type PlayerState,
  type GameState,
} from './state.js';
export { type Action, type ValidationResult, type ActionResult } from './actions.js';
export { GameEngine } from './engine.js';
export {
  pointDistance,
  blobToBlob,
  blobToPoint,
  isInEngagement,
  isWithinRange,
  isLegalMove,
  getLegalMoveRadius,
  lineSegmentsIntersect,
  ENGAGEMENT_RANGE,
} from './geometry.js';
