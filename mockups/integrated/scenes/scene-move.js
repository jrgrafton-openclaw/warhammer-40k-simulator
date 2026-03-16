/**
 * scene-move.js — Thin wrapper around phases/move/v0.23/movement.js.
 * Exports initMove() and cleanupMove() for the integrated app.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { initMovement } from '../../phases/move/v0.23/movement.js';

export function initMove() {
  initMovement();
}

export function cleanupMove() {
  // Remove the movement drag interceptor
  delete simState.drag;
  simState.drag = null;

  // Clear movement-specific callback overrides
  callbacks.selectUnit = null;
  callbacks.afterRender = null;
}
