/**
 * Action types — the ONLY way to mutate GameState.
 * Dispatch pipeline: validate(action, state) → resolve(action, state, rng) → events → newState
 *
 * Adding a new action:
 * 1. Add type here
 * 2. Add validator in resolvers/validate-*.ts
 * 3. Add resolver in resolvers/resolve-*.ts
 * 4. Register in engine.ts dispatch()
 */

import type { Point } from './state.js';

export type Action =
  | { type: 'DEPLOY_UNIT'; unitId: string; position: Point }
  | { type: 'MOVE_UNIT'; unitId: string; destination: Point }
  | { type: 'SHOOT'; attackerId: string; targetId: string; weaponIndex: number }
  | { type: 'CHARGE'; attackerId: string; targetIds: string[] }
  | { type: 'FIGHT'; attackerId: string; targetId: string }
  | { type: 'USE_STRATAGEM'; stratagemId: string; targetUnitId?: string }
  | { type: 'END_PHASE' }
  | { type: 'END_TURN' }
  | { type: 'CONCEDE'; playerId: string };

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}
