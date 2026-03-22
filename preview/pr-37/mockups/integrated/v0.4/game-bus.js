/**
 * game-bus.js — Global event bus for phase transitions and cross-system communication.
 * Replaces the single-slot callbacks pattern with proper EventTarget.
 *
 * Usage:
 *   import { bus } from './game-bus.js';
 *   const off = bus.on('phase:enter', (e) => console.log(e.detail.phase));
 *   bus.emit('phase:enter', { phase: 'shoot' });
 *   off(); // unsubscribe
 */

class GameBus extends EventTarget {
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  on(name, fn) {
    var handler = fn;
    this.addEventListener(name, handler);
    var self = this;
    return function() { self.removeEventListener(name, handler); };
  }

  // Subscribe for one event only
  once(name, fn) {
    this.addEventListener(name, fn, { once: true });
  }
}

export var bus = new GameBus();
