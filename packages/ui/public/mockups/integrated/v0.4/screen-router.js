/**
 * screen-router.js — Simple screen show/hide with CSS fade transitions.
 *
 * Screens are full-viewport divs. Only one is active at a time.
 * CSS handles the fade via .screen / .screen-active classes.
 *
 * Usage:
 *   import { registerScreen, showScreen, getCurrentScreen } from './screen-router.js';
 *   registerScreen('start', document.getElementById('screen-start'));
 *   showScreen('start');
 */

var screens = {};
var currentScreen = null;
var _onShow = {};
var _onHide = {};

/**
 * Register a screen element by name.
 */
export function registerScreen(name, element) {
  screens[name] = element;
}

/**
 * Register a callback for when a screen is shown.
 */
export function onScreenShow(name, fn) {
  _onShow[name] = fn;
}

/**
 * Register a callback for when a screen is hidden.
 */
export function onScreenHide(name, fn) {
  _onHide[name] = fn;
}

/**
 * Transition to a screen by name.
 * Fades out current screen, fades in the target.
 */
export function showScreen(name) {
  if (!screens[name]) {
    console.warn('[screen-router] Unknown screen:', name);
    return;
  }

  var prev = currentScreen;

  // Hide current screen
  if (prev && screens[prev]) {
    screens[prev].classList.remove('screen-active');
    if (_onHide[prev]) _onHide[prev]();
  }

  // Show new screen
  currentScreen = name;
  screens[name].classList.add('screen-active');
  if (_onShow[name]) _onShow[name]();
}

/**
 * Get the name of the currently active screen.
 */
export function getCurrentScreen() {
  return currentScreen;
}
