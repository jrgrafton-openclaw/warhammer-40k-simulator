/**
 * advance-dice.js — D6 advance roll using compact roll-overlay panel (ES module).
 *
 * Matches the "click to roll" UX from charge v0.1:
 *   - Compact panel docked at bottom of battlefield
 *   - "Click to roll" CTA button
 *   - Animated die result
 *   - "OK" to dismiss
 *
 * WH40K 10th edition advance rules:
 *   - Declared BEFORE moving any models (click ADVANCE button)
 *   - One D6 rolled for the ENTIRE unit (not per model)
 *   - All models get M + D6" movement budget
 *   - Unit cannot charge that turn
 *   - Unit cannot shoot except ASSAULT weapons
 */

import { UNITS } from '../../../shared/state/units.js';

export function rollAdvanceDie(unitId, onComplete) {
  var u = UNITS[unitId];
  var result = Math.floor(Math.random() * 6) + 1;

  var overlay = document.getElementById('roll-overlay');
  if (!overlay) {
    // Fallback: immediate result if no overlay element
    onComplete(result);
    return;
  }

  var totalMove = u ? (u.M + result) : result;

  // Render compact dice panel (matching charge v0.1 pattern)
  overlay.innerHTML =
    '<div class="overlay-title">ADVANCE ROLL</div>' +
    '<div class="dice-row">' +
      '<span class="die pre-roll">\u2013</span>' +
    '</div>' +
    '<div class="dice-summary">Roll D6 for advance bonus</div>' +
    '<button class="roll-cta">Click to roll</button>';
  overlay.classList.remove('hidden');

  // Pin overlay position
  overlay.style.left = '50%';
  overlay.style.top = 'auto';
  overlay.style.bottom = '68px';

  var cta = overlay.querySelector('.roll-cta');
  cta.addEventListener('click', function() {
    cta.disabled = true;
    cta.textContent = 'Rolling\u2026';

    var chip = overlay.querySelector('.die');

    // Animate die
    setTimeout(function() {
      if (chip) {
        chip.classList.remove('pre-roll');
        chip.classList.add('rolling');
        setTimeout(function() {
          chip.classList.remove('rolling');
          chip.textContent = result;
          chip.classList.add('success');
        }, 80);
      }
    }, 100);

    // Show result
    setTimeout(function() {
      var summary = overlay.querySelector('.dice-summary');
      if (summary) {
        summary.textContent = '+' + result + '" ADVANCE \u2014 TOTAL MOVE: ' + totalMove + '"';
        summary.style.color = '#00d4ff';
      }
      cta.textContent = 'OK';
      cta.disabled = false;
      cta.onclick = function() {
        overlay.classList.add('hidden');
        onComplete(result);
      };
    }, 500);
  }, { once: true });
}
