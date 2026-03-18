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

  // ── Settings persistence + live application ──────────
  var STORAGE_KEY = 'wh40k-settings';

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) { return {}; }
  }

  function saveSettings(settings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  var settings = loadSettings();

  // Defaults
  var defaults = {
    'master-vol': 80,
    'music-vol': 60,
    'sfx-vol': 75,
    'cam-pan': 5,
    'zoom-sens': 5,
  };

  // Apply defaults for missing keys
  Object.keys(defaults).forEach(function(k) {
    if (settings[k] === undefined) settings[k] = defaults[k];
  });

  // Expose settings globally for other modules
  window.__wh40kSettings = settings;

  // Apply audio volumes via Web Audio API gain node
  function applyAudioSettings() {
    var gainNode = window.__wh40kAudioGain;
    var audioCtx = window.__wh40kAudioCtx;
    if (!gainNode || !audioCtx) {
      // Fallback: set audio.volume directly (before AudioContext is created)
      var audio = document.getElementById('ambient-audio');
      if (audio) {
        var master = settings['master-vol'] / 100;
        var music = settings['music-vol'] / 100;
        audio.volume = Math.min(1, master * music);
      }
      return;
    }
    var master = settings['master-vol'] / 100;
    var music = settings['music-vol'] / 100;
    var targetVol = master * music;
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(targetVol, audioCtx.currentTime + 0.1);
  }

  // Apply camera settings to the SVG renderer
  function applyCameraSettings() {
    // Store on window for svg-renderer to read
    window.__camPanSpeed = settings['cam-pan'] || 5;
    window.__zoomSensitivity = settings['zoom-sens'] || 5;
  
  }

  // Wire sliders
  document.querySelectorAll('.opt-slider').forEach(function(slider) {
    var displayId = slider.getAttribute('data-display');
    var display = document.getElementById(displayId);
    if (!display) return;

    // Restore saved value
    if (settings[displayId] !== undefined) {
      slider.value = settings[displayId];
      display.textContent = slider.max === '10' ? slider.value : slider.value + '%';
    }

    slider.addEventListener('input', function() {
      var val = parseInt(slider.value, 10);
      display.textContent = slider.max === '10' ? val : val + '%';
      settings[displayId] = val;
      saveSettings(settings);
      window.__wh40kSettings = settings;
      applyAudioSettings();
      applyCameraSettings();
    });
  });

  // Apply on init
  applyAudioSettings();
  applyCameraSettings();
}
