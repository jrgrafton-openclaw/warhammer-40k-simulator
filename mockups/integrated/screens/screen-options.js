/**
 * screen-options.js — v0.3 Pause Menu + Options two-layer system.
 * ESC or hamburger button → pause menu → Options sub-item → options modal.
 */

import { showScreen } from '../screen-router.js';

var _initialized = false;
var _layer = 'none'; // 'none' | 'pause' | 'options'

function showPause() {
  _layer = 'pause';
  var bd = document.getElementById('pause-backdrop');
  var pm = document.getElementById('pause-menu');
  var om = document.getElementById('options-modal');
  if (bd) bd.classList.add('visible');
  if (pm) pm.classList.add('visible');
  if (om) om.classList.remove('visible');
}

function showOptionsModal() {
  _layer = 'options';
  var pm = document.getElementById('pause-menu');
  var om = document.getElementById('options-modal');
  if (pm) pm.classList.remove('visible');
  if (om) om.classList.add('visible');
}

function hideAll() {
  _layer = 'none';
  var bd = document.getElementById('pause-backdrop');
  var pm = document.getElementById('pause-menu');
  var om = document.getElementById('options-modal');
  if (bd) bd.classList.remove('visible');
  if (pm) pm.classList.remove('visible');
  if (om) om.classList.remove('visible');
}

function backToPause() {
  _layer = 'pause';
  var pm = document.getElementById('pause-menu');
  var om = document.getElementById('options-modal');
  if (om) om.classList.remove('visible');
  if (pm) pm.classList.add('visible');
}

export function getMenuLayer() { return _layer; }

/**
 * Open the pause menu from any screen context.
 */
export function openPauseMenu() {
  showPause();
}

/**
 * Open options directly (e.g. from start screen Settings button).
 */
export function openOptions() {
  showPause();
  showOptionsModal();
}

export function initOptions() {
  if (_initialized) return;
  _initialized = true;

  // Menu button in VP bar
  var menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', function() {
      if (_layer === 'none') showPause();
      else hideAll();
    });
  }

  // ESC key — game screen only
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    // Only handle if game screen is active
    var gameScreen = document.getElementById('screen-game');
    if (!gameScreen || !gameScreen.classList.contains('screen-active')) return;

    e.stopImmediatePropagation();
    if (_layer === 'options') backToPause();
    else if (_layer === 'pause') hideAll();
    else showPause();
  });

  // Backdrop click
  var bd = document.getElementById('pause-backdrop');
  if (bd) {
    bd.addEventListener('click', function() {
      if (_layer === 'options') backToPause();
      else hideAll();
    });
  }

  // Pause menu items
  var pmResume = document.getElementById('pm-resume');
  var pmOptions = document.getElementById('pm-options');
  var pmRestart = document.getElementById('pm-restart');
  var pmQuit = document.getElementById('pm-quit');
  var pmSave = document.getElementById('pm-save');
  var pmLoad = document.getElementById('pm-load');

  if (pmResume) pmResume.addEventListener('click', hideAll);
  if (pmOptions) pmOptions.addEventListener('click', showOptionsModal);
  if (pmRestart) pmRestart.addEventListener('click', function() {
    hideAll();
    // Dispatch restart event for app.js to handle
    window.dispatchEvent(new CustomEvent('wh40k:restart'));
  });
  if (pmQuit) pmQuit.addEventListener('click', function() {
    hideAll();
    showScreen('start');
  });
  if (pmSave) pmSave.addEventListener('click', function() { /* stub */ });
  if (pmLoad) pmLoad.addEventListener('click', function() { /* stub */ });

  // Options back/close
  var optBack = document.getElementById('options-back');
  var optClose = document.getElementById('btn-options-close');
  if (optBack) optBack.addEventListener('click', backToPause);
  if (optClose) optClose.addEventListener('click', backToPause);

  // Wire sliders
  document.querySelectorAll('.opt-slider').forEach(function(slider) {
    var displayId = slider.getAttribute('data-display');
    var display = document.getElementById(displayId);
    if (!display) return;
    slider.addEventListener('input', function() {
      display.textContent = slider.max === '10' ? slider.value : slider.value + '%';
    });
  });
}
