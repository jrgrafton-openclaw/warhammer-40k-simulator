/**
 * scene-deploy.js — Thin wrapper around phases/deploy/v0.4/deployment.js.
 * Exports initDeploy() and cleanupDeploy() for the integrated app.
 */

import { simState, callbacks } from '../../shared/state/store.js';
import { initDeployment, cleanupDeployment } from '../../phases/deploy/v0.4/deployment.js';

export function initDeploy() {
  initDeployment();
}

export function cleanupDeploy() {
  // 1. Run deployment.js's own cleanup (removes listeners, resets state)
  cleanupDeployment();

  // 2. Remove the deploy drag interceptor so movement can install its own
  delete simState.drag;
  simState.drag = null;

  // 3. Clear deploy-specific callback overrides
  callbacks.selectUnit = null;
  callbacks.afterRender = null;
}
