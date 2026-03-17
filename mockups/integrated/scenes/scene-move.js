/**
 * scene-move.js — Movement phase for the integrated prototype.
 * Registers with scene-registry for declarative transitions.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { initMovement, cleanupMovement } from '../../phases/move/v0.23/movement.js';
import { registerScene } from '../scene-registry.js';

function initMove() {
  initMovement();
}

function cleanupMove() {
  cleanupMovement();
  delete simState.drag;
  simState.drag = null;
  callbacks.selectUnit = null;
  callbacks.afterRender = null;
}

registerScene('move', {
  init: initMove,
  cleanup: cleanupMove,
  config: {
    title: 'MOVEMENT PHASE',
    subtitle: 'Imperium Active · Round 1',
    bodyClass: 'phase-move',
    cta: { text: 'END MOVEMENT →', disabled: false },
    modeButtons: [
      { id: 'btn-move', text: 'NORMAL MOVE', shortcut: 'M' },
      { id: 'btn-advance', text: 'ADVANCE', shortcut: 'A' }
    ],
    modeLabel: '— NO UNIT —',
    confirmCancel: true,
    dotActive: 'MOVE',
    dotsDone: [],
    nextPhase: 'shoot'
  }
});

export { initMove, cleanupMove };
