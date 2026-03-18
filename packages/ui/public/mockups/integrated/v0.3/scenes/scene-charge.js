/**
 * scene-charge.js — Charge phase for the integrated prototype.
 * Registers with scene-registry for declarative transitions.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { initCharge, cleanupCharge } from '../../phases/charge/v0.1/charge.js';
import { registerScene } from '../scene-registry.js';

function initChargeScene() {
  initCharge();
}

function cleanupChargeScene() {
  cleanupCharge();
}

registerScene('charge', {
  init: initChargeScene,
  cleanup: cleanupChargeScene,
  config: {
    title: 'CHARGE PHASE',
    subtitle: 'Imperium Active · Round 1',
    bodyClass: 'phase-charge',
    cta: { text: 'END CHARGE PHASE →', disabled: false, id: 'btn-end-charge' },
    modeButtons: [],
    modeLabel: '— SELECT UNIT —',
    confirmCancel: true,
    dotActive: 'CHARGE',
    dotsDone: ['MOVE', 'SHOOT'],
    nextPhase: 'fight'
  }
});

export { initChargeScene as initCharge, cleanupChargeScene as cleanupCharge };
