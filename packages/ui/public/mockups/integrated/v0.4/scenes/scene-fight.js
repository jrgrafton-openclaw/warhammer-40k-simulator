/**
 * scene-fight.js — Fight phase for the integrated prototype.
 * Registers with scene-registry for declarative transitions.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { initFight, cleanupFight } from '../../phases/fight/v0.1/fight.js';
import { registerScene } from '../scene-registry.js';

function initFightScene() {
  initFight();
}

function cleanupFightScene() {
  cleanupFight();
}

registerScene('fight', {
  init: initFightScene,
  cleanup: cleanupFightScene,
  config: {
    title: 'FIGHT PHASE',
    subtitle: 'Imperium Active · Round 1',
    bodyClass: 'phase-fight',
    cta: { text: 'END FIGHT PHASE →', disabled: false, id: 'btn-end-fight' },
    modeButtons: [],
    modeLabel: '— SELECT UNIT —',
    confirmCancel: true,
    dotActive: 'FIGHT',
    dotsDone: ['MOVE', 'SHOOT', 'CHARGE'],
    nextPhase: 'game-end'
  }
});

export { initFightScene as initFight, cleanupFightScene as cleanupFight };
