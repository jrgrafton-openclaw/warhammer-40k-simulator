/* ══════════════════════════════════════════════════════════════
   EditorState — Single Source of Truth for all editor state.
   Phase 1: centralize scattered state into one object.
   Phase 2: dispatch() mutation API with debounced auto-save.

   All state arrays (sprites, models, lights, objectives, groups)
   and settings/effects/counters live here. DOM is a derived view.
   zOrder[] is an explicit ordered array — no more DOM-walking.
══════════════════════════════════════════════════════════════ */

window.Editor = window.Editor || {};

Editor.State = {
  // ── Data arrays ──
  sprites: [],
  models: [],
  lights: [],
  objectives: [],
  groups: [],

  // ── Explicit z-order: ordered array of { type, id } bottom-to-top ──
  // type: 'sprite' | 'group' | 'builtin'
  // For sprites: id = sprite.id (e.g. 's0')
  // For custom groups: id = group.id (e.g. 'group-g0')
  // For builtins: id = element id (e.g. 'modelLayer', 'lightLayer', etc.)
  zOrder: [],

  // ── Settings ──
  settings: {
    bg: 'svg-gradient',
    ruinsOpacity: 100,
  },

  // ── Effects ──
  effects: {
    shadow:  { on: true,  dx: 3, dy: 3, blur: 6, opacity: 0.55 },
    feather: { on: false, radius: 10 },
    grade:   { on: true,  brightness: 0.75, saturation: 0.7, sepia: 0.08 },
    modelShadow: { on: true, dx: 1, dy: 2, blur: 1.5, opacity: 0.35 },
  },

  // ── Counters ──
  counters: { sid: 0, gid: 0, lid: 0, clipId: 0 },

  // ═══════════════════════════════════════════════════════════
  // Accessors
  // ═══════════════════════════════════════════════════════════

  /**
   * Returns the "root" SVG element for a sprite — the crop wrapper if it
   * exists, otherwise the image element itself.
   * This is THE single place for the crop wrapper duality.
   */
  getSpriteRootEl(sp) {
    return sp.rootEl;
  },

  /** Find a sprite by id. */
  findSprite(id) {
    return this.sprites.find(s => s.id === id) || null;
  },

  /** Find a group by id. */
  findGroup(id) {
    return this.groups.find(g => g.id === id) || null;
  },

  /** Find a light by id. */
  findLight(id) {
    return this.lights.find(l => l.id === id) || null;
  },

  /**
   * Returns SVG elements in z-order (bottom to top) by reading the
   * explicit zOrder array. Falls back to DOM-walking if zOrder is empty
   * (backward compat during migration).
   */
  getZOrderedElements() {
    if (this.zOrder.length === 0) return [];
    const result = [];
    for (const entry of this.zOrder) {
      if (entry.type === 'sprite') {
        const sp = this.findSprite(entry.id);
        if (sp) result.push({ type: 'sprite', ref: sp, svgEl: this.getSpriteRootEl(sp) });
      } else if (entry.type === 'group') {
        const el = document.getElementById(entry.id);
        if (el) result.push({ type: 'custom-group', groupId: entry.id, svgEl: el });
      } else if (entry.type === 'builtin') {
        const el = document.getElementById(entry.id);
        if (el) result.push({ type: 'group', groupId: entry.id, svgEl: el });
      }
    }
    return result;
  },

  // ═══════════════════════════════════════════════════════════
  // Z-order management
  // ═══════════════════════════════════════════════════════════

  /**
   * Build the zOrder array from the current SVG DOM state.
   * Called after any DOM-based reordering to keep zOrder in sync.
   */
  syncZOrderFromDOM() {
    const svg = document.getElementById('battlefield');
    if (!svg) return;
    const newOrder = [];

    const builtinIds = new Set([
      'deployZones', 'modelLayer', 'lightLayer', 'objectiveRings', 'objectiveHexes',
      'svgRuins', 'svgScatter'
    ]);
    const skipIds = new Set([
      'selUI', 'dragRect', 'bgImg',
      'svgGroundGradient', 'svgGroundWarm', 'svgGroundDual', 'svgGroundHaze',
      'svgGroundConcrete', 'svgGroundTactical', 'cropOverlay',
      'spriteFloor', 'spriteTop'
    ]);

    Array.from(svg.children).forEach(el => {
      if (!el.id && el.tagName === 'rect' && !el.classList.contains('sel-rect')) return;
      if (!el.id && el.tagName === 'defs') return;
      if (skipIds.has(el.id)) return;

      if (builtinIds.has(el.id)) {
        newOrder.push({ type: 'builtin', id: el.id });
      } else if (el.id && el.id.startsWith('group-')) {
        newOrder.push({ type: 'group', id: el.id });
        // Group children are tracked implicitly — their order within the
        // group <g> is preserved by the DOM, and we don't need separate
        // zOrder entries for grouped sprites.
      } else if (el.classList && el.classList.contains('smokefx-entity')) {
        // Per-entity smoke/fire FX group
        newOrder.push({ type: 'smokefx', id: el.id });
      } else {
        // Direct sprite (image element or crop wrapper <g>)
        let sp = this.sprites.find(s => s.el === el);
        if (!sp && el.tagName === 'g' && el.id && el.id.endsWith('-wrap')) {
          sp = this.sprites.find(s => s._clipWrap === el);
        }
        if (sp && !sp.groupId) {
          newOrder.push({ type: 'sprite', id: sp.id });
        }
      }
    });

    this.zOrder = newOrder;
  },

  /**
   * Remove an entry from zOrder by id.
   */
  removeFromZOrder(id) {
    this.zOrder = this.zOrder.filter(e => e.id !== id);
  },

  /**
   * Add a sprite to the end of zOrder (just before selUI, i.e. on top).
   */
  addSpriteToZOrder(spriteId) {
    // Don't add duplicates
    if (this.zOrder.some(e => e.id === spriteId)) return;
    this.zOrder.push({ type: 'sprite', id: spriteId });
  },

  /**
   * Add a custom group to zOrder.
   */
  addGroupToZOrder(groupId, beforeId) {
    if (this.zOrder.some(e => e.id === groupId)) return;
    if (beforeId) {
      const idx = this.zOrder.findIndex(e => e.id === beforeId);
      if (idx >= 0) {
        this.zOrder.splice(idx, 0, { type: 'group', id: groupId });
        return;
      }
    }
    this.zOrder.push({ type: 'group', id: groupId });
  },

  // ═══════════════════════════════════════════════════════════
  // Sync helpers — keep EditorState in sync with Editor.Core
  // ═══════════════════════════════════════════════════════════

  /**
   * Sync EditorState arrays from Editor.Core (for backward compat
   * during Phase 1 migration — Core arrays are still the primary
   * mutation target, and we sync before save).
   */
  syncFromCore() {
    var C = Editor.Core;
    this.sprites = C.allSprites;
    this.models = C.allModels;
    this.lights = C.allLights;
    this.objectives = C.allObjectives;
    this.groups = C.groups || [];
    this.counters.sid = C.sid;
    this.counters.gid = Editor.Groups ? Editor.Groups.gid : 0;
    this.counters.lid = Editor.Lights ? Editor.Lights.lid : 0;
    this.counters.clipId = Editor.Crop ? Editor.Crop.clipId : 0;
    // Sync effects from Editor.Effects
    if (Editor.Effects) {
      this.effects.shadow = Editor.Effects.shadow;
      this.effects.feather = Editor.Effects.feather;
      this.effects.grade = Editor.Effects.grade;
      this.effects.modelShadow = Editor.Effects.modelShadow;
    }
  },

  /**
   * Push EditorState back to Editor.Core (after load).
   */
  syncToCore() {
    var C = Editor.Core;
    C.allSprites = this.sprites;
    C.allModels = this.models;
    C.allLights = this.lights;
    C.allObjectives = this.objectives;
    C.groups = this.groups;
    C.sid = this.counters.sid;
    if (Editor.Groups) Editor.Groups.gid = this.counters.gid;
    if (Editor.Lights) Editor.Lights.lid = this.counters.lid;
    if (Editor.Crop) Editor.Crop.clipId = this.counters.clipId;
    if (Editor.Effects) {
      Editor.Effects.shadow = this.effects.shadow;
      Editor.Effects.feather = this.effects.feather;
      Editor.Effects.grade = this.effects.grade;
      Editor.Effects.modelShadow = this.effects.modelShadow;
    }
  },

  // ═══════════════════════════════════════════════════════════
  // Phase 2: Dispatch API — central mutation notification
  // ═══════════════════════════════════════════════════════════

  _dirty: false,
  _saveTimer: null,
  _SAVE_DELAY: 300,

  /**
   * Notify that state has changed. Marks dirty and schedules
   * debounced auto-save. All modules call this instead of
   * Editor.Persistence.save() directly.
   *
   * @param {Object} action - { type: string, ... } describing what changed.
   *   Action types: MOVE_SPRITE, RESIZE_SPRITE, ROTATE_SPRITE, ADD_SPRITE,
   *   DELETE_SPRITE, FLIP_SPRITE, SET_SETTING, SET_EFFECT, CROP, RESET_CROP,
   *   GROUP, UNGROUP, DELETE_GROUP, ADD_TO_GROUP, RENAME_GROUP,
   *   SET_GROUP_OPACITY, REORDER, ADD_LIGHT, MOVE_LIGHT, DELETE_LIGHT,
   *   UPDATE_LIGHT, TOGGLE_LIGHT_VIS, TOGGLE_SPRITE_VIS, SET_PROPERTY,
   *   ADD_MODEL, DELETE_MODEL, MOVE_MODEL, PASTE, UNDO, IMPORT
   */
  dispatch(action) {
    // During persistence load, skip sync — we'll do it once at the end
    if (this._loading) return;
    // Sync state immediately so zOrder/arrays are always current.
    // Only the localStorage write is debounced.
    this.syncFromCore();
    this.syncZOrderFromDOM();
    this._dirty = true;
    this._scheduleSave();
    // Emit event for cross-module subscribers
    if (Editor.Bus) {
      var type = action && action.type ? action.type : 'UNKNOWN';
      Editor.Bus.emit('state:dispatched', action);
      // Map dispatch types to semantic events
      if (type === 'ADD_SPRITE') Editor.Bus.emit('sprite:added', action);
      else if (type === 'DELETE_SPRITE') Editor.Bus.emit('sprite:removed', action);
      else if (type === 'MOVE_SPRITE') Editor.Bus.emit('sprite:moved', action);
      else if (type === 'RESIZE_SPRITE') Editor.Bus.emit('sprite:resized', action);
      else if (type === 'ROTATE_SPRITE') Editor.Bus.emit('sprite:rotated', action);
      else if (type === 'SET_PROPERTY' || type === 'TOGGLE_SPRITE_VIS') Editor.Bus.emit('sprite:property-changed', action);
      else if (type === 'CROP' || type === 'RESET_CROP') Editor.Bus.emit('sprite:property-changed', action);
      else if (type === 'GROUP') Editor.Bus.emit('group:created', action);
      else if (type === 'UNGROUP' || type === 'DELETE_GROUP') Editor.Bus.emit('group:removed', action);
      else if (type === 'ADD_TO_GROUP') Editor.Bus.emit('group:sprite-added', action);
      else if (type === 'ADD_LIGHT' || type === 'DELETE_LIGHT' || type === 'MOVE_LIGHT' || type === 'UPDATE_LIGHT') Editor.Bus.emit('light:changed', action);
      else if (type === 'REORDER') Editor.Bus.emit('zorder:changed', action);
      else if (type === 'SET_EFFECT') Editor.Bus.emit('effect:changed', action);
      else if (type === 'IMPORT') Editor.Bus.emit('state:loaded', action);
      else if (type === 'UNDO') Editor.Bus.emit('state:undone', action);
    }
  },

  /** Schedule a debounced save. Resets timer on each call. */
  _scheduleSave() {
    var self = this;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function() {
      self._saveTimer = null;
      if (self._dirty) {
        Editor.Persistence.save();
        self._dirty = false;
      }
    }, this._SAVE_DELAY);
  },

  /** Flush pending save immediately (e.g. before unload). */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._dirty) {
      Editor.Persistence.save();
      this._dirty = false;
    }
  }
};
