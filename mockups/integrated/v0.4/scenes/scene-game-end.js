/**
 * scene-game-end.js — Game End phase for the integrated prototype.
 * Registers with scene-registry for declarative transitions.
 */

import { simState, callbacks } from '../../../shared/state/store.js';
import { selectUnit as baseSelectUnit } from '../../../shared/world/svg-renderer.js';
import { initGameEnd, cleanupGameEnd } from '../../../phases/game-end/v0.2/game-end.js';
import { registerScene } from '../scene-registry.js';
import { showScreen } from '../screen-router.js';

function initGameEndScene() {
  initGameEnd();

  // Override "PLAY AGAIN" to return to start screen instead of reloading
  var btn = document.getElementById('btn-play-again');
  if (btn) {
    // Remove old listeners by cloning
    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', function() {
      // Dispatch restart event — app.js handles state reset + transition to deploy
      window.dispatchEvent(new CustomEvent('wh40k:restart'));
    });
  }
}

function cleanupGameEndScene() {
  cleanupGameEnd();
  callbacks.selectUnit = null;
  callbacks.afterRender = null;
  baseSelectUnit(null);
}

registerScene('game-end', {
  init: initGameEndScene,
  cleanup: cleanupGameEndScene,
  config: {
    title: 'GAME COMPLETE',
    subtitle: 'Final Results',
    bodyClass: 'phase-game-end',
    cta: null,
    modeButtons: [],
    confirmCancel: false,
    dotActive: null,
    dotsDone: ['MOVE', 'SHOOT', 'CHARGE', 'FIGHT'],
    nextPhase: null
  }
});

export { initGameEndScene as initGameEnd, cleanupGameEndScene as cleanupGameEnd };
