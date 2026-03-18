/**
 * scene-move.js — Thin wrapper around phases/move/v0.23/movement.js.
 * Exports initMove() and cleanupMove() for the integrated app.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { initMovement, cleanupMovement } from '../../phases/move/v0.23/movement.js';

export function initMove() {
  initMovement();
}

export function cleanupMove() {
  // 1. Run movement.js's own cleanup (auto-commits moves, clears overlays/rings)
  cleanupMovement();

  // 2. Remove the movement drag interceptor so the next phase can install its own
  delete simState.drag;
  simState.drag = null;

  // 3. Clear movement-specific callback overrides
  callbacks.selectUnit = null;
  callbacks.afterRender = null;
}
