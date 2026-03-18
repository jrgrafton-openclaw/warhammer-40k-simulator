/**
 * scene-deploy.js — Deploy phase for the integrated prototype.
 * Registers with scene-registry for declarative transitions.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { initDeployment, cleanupDeployment } from '../../phases/deploy/v0.4/deployment.js';
import { setCamera } from '../../shared/world/svg-renderer.js';
import { registerScene, transitionTo } from '../scene-registry.js';

function initDeploy() {
  initDeployment();

  // Wire CONFIRM DEPLOYMENT → auto-transition to move
  var btnEnd = document.getElementById('btn-end');
  if (!btnEnd) return;
  var observer = new MutationObserver(function() {
    if (btnEnd.textContent.includes('LOCKED')) {
      observer.disconnect();
      setTimeout(function() { transitionTo('move'); }, 800);
    }
  });
  observer.observe(btnEnd, { childList: true, characterData: true, subtree: true });
}

function cleanupDeploy() {
  cleanupDeployment();
  delete simState.drag;
  simState.drag = null;
  callbacks.selectUnit = null;
  callbacks.afterRender = null;
}

registerScene('deploy', {
  init: initDeploy,
  cleanup: cleanupDeploy,
  config: {
    title: 'DEPLOYMENT PHASE',
    subtitle: 'Imperium Deploying · 0/6 units',
    bodyClass: null, // deploy has no body class
    cta: { text: 'CONFIRM DEPLOYMENT →', disabled: true },
    modeButtons: [],
    confirmCancel: false,
    dotActive: null,
    dotsDone: [],
    nextPhase: null // deploy transition is handled by MutationObserver
  }
});

export { initDeploy, cleanupDeploy };
