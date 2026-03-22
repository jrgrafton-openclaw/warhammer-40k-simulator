/* ══════════════════════════════════════════════════════════════
   Editor Bus — lightweight event emitter for cross-module decoupling.
   Phase 5: modules communicate through events, not direct calls.

   API:
     Editor.Bus.on(event, handler)   — subscribe
     Editor.Bus.off(event, handler)  — unsubscribe
     Editor.Bus.emit(event, data)    — fire event
     Editor.Bus.once(event, handler) — subscribe for one firing
     Editor.Bus.clear()              — remove all listeners
══════════════════════════════════════════════════════════════ */

window.Editor = window.Editor || {};

Editor.Bus = {
  _listeners: {},

  on: function(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return this; // chainable
  },

  off: function(event, handler) {
    var list = this._listeners[event];
    if (!list) return this;
    this._listeners[event] = list.filter(function(h) { return h !== handler; });
    return this;
  },

  once: function(event, handler) {
    var self = this;
    function wrapper(data) {
      self.off(event, wrapper);
      handler(data);
    }
    return this.on(event, wrapper);
  },

  emit: function(event, data) {
    var list = this._listeners[event];
    if (!list) return;
    // Slice to allow listeners to remove themselves during iteration
    list.slice().forEach(function(handler) {
      handler(data);
    });
  },

  clear: function() {
    this._listeners = {};
  }
};
