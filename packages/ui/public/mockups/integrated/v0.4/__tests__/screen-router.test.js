/**
 * screen-router.test.js — Tests for the screen router module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerScreen,
  showScreen,
  getCurrentScreen,
  onScreenShow,
  onScreenHide,
} from '../screen-router.js';

function makeScreenEl(id) {
  var el = document.createElement('div');
  el.id = id;
  el.className = 'screen';
  document.body.appendChild(el);
  return el;
}

describe('screen-router', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Re-import fresh module state — reset by clearing internal state
    // Since ES modules are cached, we test with the shared state
  });

  it('showScreen switches active screen', () => {
    var s1 = makeScreenEl('s1');
    var s2 = makeScreenEl('s2');
    registerScreen('s1', s1);
    registerScreen('s2', s2);

    showScreen('s1');
    expect(s1.classList.contains('screen-active')).toBe(true);
    expect(s2.classList.contains('screen-active')).toBe(false);

    showScreen('s2');
    expect(s1.classList.contains('screen-active')).toBe(false);
    expect(s2.classList.contains('screen-active')).toBe(true);
  });

  it('getCurrentScreen returns correct value', () => {
    var s1 = makeScreenEl('test-s1');
    var s2 = makeScreenEl('test-s2');
    registerScreen('test-s1', s1);
    registerScreen('test-s2', s2);

    showScreen('test-s1');
    expect(getCurrentScreen()).toBe('test-s1');

    showScreen('test-s2');
    expect(getCurrentScreen()).toBe('test-s2');
  });

  it('screen transitions trigger callbacks', () => {
    var s1 = makeScreenEl('cb-s1');
    var s2 = makeScreenEl('cb-s2');
    registerScreen('cb-s1', s1);
    registerScreen('cb-s2', s2);

    var showCb = vi.fn();
    var hideCb = vi.fn();

    onScreenShow('cb-s2', showCb);
    onScreenHide('cb-s1', hideCb);

    showScreen('cb-s1');
    expect(showCb).not.toHaveBeenCalled();

    showScreen('cb-s2');
    expect(hideCb).toHaveBeenCalledTimes(1);
    expect(showCb).toHaveBeenCalledTimes(1);
  });

  it('showScreen warns on unknown screen', () => {
    var spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    showScreen('nonexistent-screen');
    expect(spy).toHaveBeenCalledWith('[screen-router] Unknown screen:', 'nonexistent-screen');
    spy.mockRestore();
  });
});
