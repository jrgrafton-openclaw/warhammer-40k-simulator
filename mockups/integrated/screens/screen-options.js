/**
 * screen-options.js — Options modal overlay.
 * Can be opened from any screen. Based on options/v0.2.
 * Volume sliders, controls, game actions.
 */

var _open = false;
var _initialized = false;

/**
 * Show the options modal.
 */
export function openOptions() {
  var backdrop = document.getElementById('options-backdrop');
  var modal = document.getElementById('options-modal');
  if (!backdrop || !modal) return;
  if (_open) return;
  _open = true;
  backdrop.classList.add('visible');
  modal.classList.add('visible');
}

/**
 * Hide the options modal.
 */
export function closeOptions() {
  var backdrop = document.getElementById('options-backdrop');
  var modal = document.getElementById('options-modal');
  if (!backdrop || !modal) return;
  if (!_open) return;
  _open = false;
  backdrop.classList.remove('visible');
  modal.classList.remove('visible');
}

/**
 * Check if the options modal is open.
 */
export function isOptionsOpen() {
  return _open;
}

/**
 * Initialize options modal interactions (call once).
 */
export function initOptions() {
  if (_initialized) return;
  _initialized = true;

  var backdrop = document.getElementById('options-backdrop');
  var closeBtn = document.getElementById('options-close');
  var closeBtn2 = document.getElementById('btn-close-options');

  if (closeBtn) closeBtn.addEventListener('click', closeOptions);
  if (closeBtn2) closeBtn2.addEventListener('click', closeOptions);
  if (backdrop) backdrop.addEventListener('click', closeOptions);

  // ESC key handling
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (_open) {
        e.stopImmediatePropagation();
        closeOptions();
      }
    }
  });

  // Wire sliders
  document.querySelectorAll('.opt-slider').forEach(function(slider) {
    var displayId = slider.getAttribute('data-display');
    var display = document.getElementById(displayId);
    if (!display) return;
    slider.addEventListener('input', function() {
      if (slider.max === '10') {
        display.textContent = slider.value;
      } else {
        display.textContent = slider.value + '%';
      }
    });
  });

  // Wire restart button
  var btnRestart = document.getElementById('btn-restart');
  if (btnRestart) {
    btnRestart.addEventListener('click', function() {
      closeOptions();
      window.location.reload();
    });
  }

  // Wire quit button
  var btnQuit = document.getElementById('btn-quit');
  if (btnQuit) {
    btnQuit.addEventListener('click', function() {
      closeOptions();
      // Import dynamically to avoid circular dependency
      import('../screen-router.js').then(function(mod) {
        mod.showScreen('start');
      });
    });
  }
}
