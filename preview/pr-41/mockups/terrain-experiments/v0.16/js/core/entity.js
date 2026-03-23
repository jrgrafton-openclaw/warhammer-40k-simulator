/* ══════════════════════════════════════════════════════════════
   Editor Entity — unified entity registry & protocol.
   Phase 1: Foundation for the unified entity system.
   All entity types (sprite, smoke, fire, light) register here.
══════════════════════════════════════════════════════════════ */

window.Editor = window.Editor || {};

Editor.Entity = {
  _nextId: 0,

  /**
   * Register an entity in the unified registry.
   * Generates an ID if the entity doesn't have one.
   * @param {Object} entity — must have at least { type, el }
   */
  register(entity) {
    if (!entity.id) {
      entity.id = '_e' + (this._nextId++);
    }
    const C = Editor.Core;
    if (!C.allEntities) C.allEntities = [];
    // Avoid double-registration
    if (C.allEntities.indexOf(entity) === -1) {
      C.allEntities.push(entity);
    }
  },

  /**
   * Remove an entity from the registry by ID.
   * @param {string} id
   */
  unregister(id) {
    const C = Editor.Core;
    if (!C.allEntities) return;
    C.allEntities = C.allEntities.filter(function(e) { return e.id !== id; });
  },

  /**
   * Find an entity by ID.
   * @param {string} id
   * @returns {Object|undefined}
   */
  find(id) {
    const C = Editor.Core;
    if (!C.allEntities) return undefined;
    return C.allEntities.find(function(e) { return e.id === id; });
  },

  /**
   * Find an entity by its SVG element (walks up parents to match).
   * @param {Element} el
   * @returns {Object|undefined}
   */
  findByEl(el) {
    const C = Editor.Core;
    if (!C.allEntities) return undefined;
    let cur = el;
    while (cur && cur !== C.svg) {
      for (let i = 0; i < C.allEntities.length; i++) {
        const e = C.allEntities[i];
        if (e.el === cur || (e.rootEl && e.rootEl === cur)) return e;
      }
      cur = cur.parentElement;
    }
    return undefined;
  },

  /**
   * Filter entities by type.
   * @param {string} type — 'sprite', 'smoke', 'fire', 'light', 'model'
   * @returns {Array}
   */
  ofType(type) {
    const C = Editor.Core;
    if (!C.allEntities) return [];
    return C.allEntities.filter(function(e) { return e.type === type; });
  },

  /**
   * Factory: create an entity from serialized data (for clipboard paste).
   * @param {Object} data — serialized entity with `type` field
   * @param {number} dx — x offset
   * @param {number} dy — y offset
   * @returns {Object|null} — the created entity, or null
   */
  createFromData(data, dx, dy) {
    if (!data || !data.type) return null;
    dx = dx || 0;
    dy = dy || 0;

    switch (data.type) {
      case 'sprite': {
        var sp = Editor.Sprites.addSprite(
          data.file, data.x + dx, data.y + dy,
          data.w, data.h, data.rot,
          data.layerType || 'floor', true
        );
        if (sp) {
          sp.flipX = data.flipX || false;
          sp.flipY = data.flipY || false;
          sp.shadowMul = data.shadowMul != null ? data.shadowMul : 1;
          sp.cropL = data.cropL || 0;
          sp.cropT = data.cropT || 0;
          sp.cropR = data.cropR || 0;
          sp.cropB = data.cropB || 0;
          if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
          if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) Editor.Crop._applyClip(sp);
        }
        return sp;
      }
      case 'smoke': {
        var opts = {};
        Object.keys(data).forEach(function(k) {
          if (k !== 'id' && k !== 'type' && k !== 'x' && k !== 'y') opts[k] = data[k];
        });
        return Editor.Smoke.addSmoke(data.x + dx, data.y + dy, opts, true);
      }
      case 'fire': {
        var opts2 = {};
        Object.keys(data).forEach(function(k) {
          if (k !== 'id' && k !== 'type' && k !== 'x' && k !== 'y') opts2[k] = data[k];
        });
        return Editor.Fire.addFire(data.x + dx, data.y + dy, opts2, true);
      }
      case 'light': {
        return Editor.Lights.addLight(
          data.x + dx, data.y + dy,
          data.color, data.radius, data.intensity, true
        );
      }
      default:
        return null;
    }
  }
};
