/* ══════════════════════════════════════════════════════════════
   EditorState — Single Source of Truth for all editor state.
   Phase 1 of refactor: centralize scattered state into one object.

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
    roofOpacity: 100,
  },

  // ── Effects ──
  effects: {
    shadow:  { on: true,  dx: 3, dy: 3, blur: 6, opacity: 0.55 },
    feather: { on: false, radius: 10 },
    grade:   { on: true,  brightness: 0.75, saturation: 0.7, sepia: 0.08 },
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
    return sp._clipWrap || sp.el;
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
      'modelLayer', 'lightLayer', 'objectiveRings', 'objectiveHexes',
      'svgRuins', 'svgScatter'
    ]);
    const skipIds = new Set([
      'selUI', 'dragRect', 'deployZones', 'bgImg',
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
    }
  }
};
