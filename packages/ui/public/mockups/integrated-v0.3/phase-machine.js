/**
 * phase-machine.js — Phase enum + state machine with plain callback.
 * v0.1: Deploy → Move only. No EventTarget (deferred to v0.2+).
 */

const PHASES = ['deploy', 'move', 'shoot', 'charge', 'fight', 'game-end'];

let currentIndex = 0;
let onTransition = null;

export function currentPhase() {
  return PHASES[currentIndex];
}

export function setTransitionCallback(fn) {
  onTransition = fn;
}

export function nextPhase() {
  if (currentIndex >= PHASES.length - 1) return null;
  const from = PHASES[currentIndex];
  currentIndex++;
  const to = PHASES[currentIndex];
  if (onTransition) onTransition({ from, to });
  return to;
}
