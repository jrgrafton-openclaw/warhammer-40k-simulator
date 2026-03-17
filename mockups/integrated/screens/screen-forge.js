/**
 * screen-forge.js — Battle Forge army selection screen.
 * Simplified from battle-forge/v0.8 for the integrated prototype.
 * Shows faction cards (Imperium + Orks hardcoded) and a START BATTLE button.
 */

import { showScreen } from '../screen-router.js';

var _initialized = false;

/**
 * Initialize Battle Forge screen interactions.
 * Wires faction card selection and the BEGIN BATTLE button.
 */
export function initBattleForge() {
  if (_initialized) return;
  _initialized = true;

  var cardImp = document.getElementById('forge-card-imp');
  var cardOrk = document.getElementById('forge-card-ork');
  var beginBtn = document.getElementById('forge-begin-btn');

  // State: which factions are selected
  var selected = { imp: false, ork: false };

  function updateBeginBtn() {
    var ready = selected.imp && selected.ork;
    if (beginBtn) {
      beginBtn.classList.toggle('disabled', !ready);
      if (ready && !beginBtn.dataset.activated) {
        beginBtn.dataset.activated = '1';
        beginBtn.classList.add('btn-surge');
        beginBtn.addEventListener('animationend', function() {
          beginBtn.classList.remove('btn-surge');
        }, { once: true });
      }
    }
  }

  // Auto-select both factions (since we only have one army each)
  if (cardImp) {
    cardImp.addEventListener('click', function() {
      selected.imp = true;
      cardImp.classList.add('forge-card-selected');
      updateBeginBtn();
    });
    // Auto-select on load
    selected.imp = true;
    cardImp.classList.add('forge-card-selected');
  }

  if (cardOrk) {
    cardOrk.addEventListener('click', function() {
      selected.ork = true;
      cardOrk.classList.add('forge-card-selected');
      updateBeginBtn();
    });
    selected.ork = true;
    cardOrk.classList.add('forge-card-selected');
  }

  updateBeginBtn();

  // BEGIN BATTLE → transition to game
  if (beginBtn) {
    beginBtn.addEventListener('click', function() {
      if (beginBtn.classList.contains('disabled')) return;
      showScreen('game');
    });
  }

  // Back button
  var backBtn = document.getElementById('forge-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      showScreen('start');
    });
  }
}

export function cleanupBattleForge() {
  // No dynamic cleanup needed — static HTML content
}
