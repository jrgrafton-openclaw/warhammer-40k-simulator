/**
 * game-end.js — Game End overlay for the integrated prototype.
 * Creates a summary modal on top of the battlefield showing:
 *   - Game Complete title
 *   - Round indicator
 *   - Faction scores (hardcoded 0 vs 0)
 *   - Model counts (remaining / destroyed per side)
 *   - Play Again button
 *
 * Exports initGameEnd() and cleanupGameEnd().
 */

import { simState } from '../../../shared/state/store.js';

// ── Initial model counts per faction (from army definition in app.js) ──
var INITIAL_MODELS = { imp: 22, ork: 12 };

var _dragDescriptor = null;

/**
 * Count surviving models for a faction from simState.units.
 */
export function countModels(faction) {
  var count = 0;
  simState.units.forEach(function(u) {
    if (u.faction === faction) count += u.models.length;
  });
  return count;
}

/**
 * Build and show the game-end overlay.
 */
export function initGameEnd() {
  // ── Block all unit dragging ──
  var _drag = null;
  _dragDescriptor = Object.getOwnPropertyDescriptor(simState, 'drag');
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get: function() { return _drag; },
    set: function(value) {
      if (value !== null) return;
      _drag = value;
    }
  });

  // ── Count models ──
  var impRemaining = countModels('imp');
  var orkRemaining = countModels('ork');
  var impDestroyed = INITIAL_MODELS.imp - impRemaining;
  var orkDestroyed = INITIAL_MODELS.ork - orkRemaining;

  // ── Build backdrop ──
  var backdrop = document.createElement('div');
  backdrop.className = 'game-end-backdrop';
  backdrop.id = 'game-end-backdrop';

  // ── Build content ──
  var content = document.createElement('div');
  content.className = 'game-end-content';
  content.id = 'game-end-content';

  content.innerHTML =
    '<div class="victory-title">GAME COMPLETE</div>' +
    '<div class="victory-tagline">ROUND 1 / 5</div>' +
    '<div class="score-pillars">' +
      '<div class="score-pillar score-pillar--imp">' +
        '<div class="pillar-faction-name imp">IMPERIUM</div>' +
        '<div class="pillar-score imp">0</div>' +
        '<div class="pillar-stat pillar-stat--sec">' + impRemaining + ' models remaining</div>' +
        '<div class="pillar-stat pillar-stat--muted">' + impDestroyed + ' models destroyed</div>' +
      '</div>' +
      '<div class="pillar-divider">' +
        '<div class="pillar-divider-line"></div>' +
        '<div class="pillar-divider-vs">VS</div>' +
        '<div class="pillar-divider-line"></div>' +
      '</div>' +
      '<div class="score-pillar score-pillar--ork">' +
        '<div class="pillar-faction-name ork">ORKS</div>' +
        '<div class="pillar-score ork">0</div>' +
        '<div class="pillar-stat pillar-stat--sec">' + orkRemaining + ' models remaining</div>' +
        '<div class="pillar-stat pillar-stat--muted">' + orkDestroyed + ' models destroyed</div>' +
      '</div>' +
    '</div>' +
    '<div class="victory-actions">' +
      '<button class="victory-btn primary" id="btn-play-again">PLAY AGAIN</button>' +
    '</div>';

  document.body.appendChild(backdrop);
  document.body.appendChild(content);

  // ── Wire Play Again ──
  var btn = document.getElementById('btn-play-again');
  if (btn) {
    btn.addEventListener('click', function() {
      window.location.reload();
    });
  }
}

/**
 * Remove the overlay and restore dragging.
 */
export function cleanupGameEnd() {
  var backdrop = document.getElementById('game-end-backdrop');
  var content = document.getElementById('game-end-content');
  if (backdrop) backdrop.remove();
  if (content) content.remove();

  // Restore drag
  if (_dragDescriptor) {
    Object.defineProperty(simState, 'drag', _dragDescriptor);
    _dragDescriptor = null;
  } else {
    delete simState.drag;
    simState.drag = null;
  }
}
