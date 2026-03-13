/**
 * advance-dice.js — D6 advance roll animation (ES module).
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

  var overlay = document.getElementById('advance-dice-overlay');
  var face    = document.getElementById('advance-die-face');
  var num     = document.getElementById('advance-die-num');
  var lbl     = document.getElementById('advance-die-label');
  var tot     = document.getElementById('advance-die-total');

  num.textContent = result;
  lbl.textContent = '+' + result + '" ADVANCE BONUS';
  tot.textContent = u ? 'TOTAL MOVE: ' + (u.M + result) + '"' : '';

  // Trigger spring animation
  face.classList.remove('rolling');
  void face.offsetWidth; // reflow to restart animation
  face.classList.add('rolling');

  overlay.classList.add('visible');
  setTimeout(function() {
    overlay.classList.remove('visible');
    onComplete(result);
  }, 1600);
}
