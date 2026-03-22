/* ══════════════════════════════════════════════════════════════
   Editor Core — shared state, SVG helpers, toggles, background
══════════════════════════════════════════════════════════════ */

window.Editor = window.Editor || {};

Editor.Core = {
  NS: 'http://www.w3.org/2000/svg',
  svg: null,
  selUI: null,
  debug: null,

  // Shared state arrays — single source of truth
  allSprites: [],
  allModels: [],
  allLights: [],
  allObjectives: [],
  selected: null,
  multiSel: [],
  sid: 0,  // sprite id counter
  clipboardSprites: [],
  clipboardLights: [],

  // Image paths resolve to img/ subdirectory
  spriteBasePath: 'img/',

  init() {
    this.svg = document.getElementById('battlefield');
    this.selUI = document.getElementById('selUI');
    this.debug = document.getElementById('debug');
    this.groups = [];

    // Populate thumbnail grids
    this.populateThumbs();

    // Init sub-modules
    Editor.Groups.init();
    Editor.Models.init();
    Editor.Objectives.init();
    Editor.Selection.init();
    Editor.Sprites.initFileDrop();
    Editor.Persistence.load();
    Editor.Layers._loadUIState();
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    Editor.Layers.rebuild();
    this.updateDebug();
  },

  // ── SVG coordinate transform ──
  svgPt(ex, ey) {
    const p = this.svg.createSVGPoint();
    p.x = ex; p.y = ey;
    return p.matrixTransform(this.svg.getScreenCTM().inverse());
  },

  // ── Toggle visibility ──
  tgl(btn, id) {
    btn.classList.toggle('on');
    const el = document.getElementById(id);
    if (el) el.style.display = btn.classList.contains('on') ? '' : 'none';
    Editor.State.dispatch('toggle');
  },

  tglMulti(btn, ids) {
    btn.classList.toggle('on');
    const show = btn.classList.contains('on');
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; });
    Editor.State.dispatch('toggle');
  },

  // ── Background switcher ──
  setBg(v) {
    const img = document.getElementById('bgImg');
    ['svgGroundGradient','svgGroundWarm','svgGroundDual','svgGroundHaze','svgGroundConcrete','svgGroundTactical']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (v.startsWith('svg-')) {
      img.style.display = 'none';
      const map = {
        'svg-gradient':'svgGroundGradient','svg-warm':'svgGroundWarm','svg-dual':'svgGroundDual',
        'svg-haze':'svgGroundHaze','svg-concrete':'svgGroundConcrete','svg-tactical':'svgGroundTactical'
      };
      if (map[v]) document.getElementById(map[v]).style.display = '';
    } else {
      img.style.display = '';
      img.setAttribute('href', this.spriteBasePath + v);
    }
  },

  // ── Thumbnail grid population ──
  populateThumbs() {
    const thumbs = {
      tRuinsFloor: ['layer-bottom-aligned.png','layer-bottom-v2.png','layer-bottom-v3.png','layer-bottom-v4.png','layer-bottom-v5.png','layer-bottom-v6.png','layer-bottom-v7.png','t10-layer-bottom.png','layer-bottom-aligned-2x.png','layer-bottom-v2-2x.png','layer-bottom-v3-2x.png','layer-bottom-v4-2x.png','layer-bottom-v5-2x.png','layer-bottom-v6-2x.png','layer-bottom-v7-2x.png','t10-layer-bottom-2x.png','layer-bottom-aligned-2x1.png','layer-bottom-aligned-4x3.png','layer-bottom-aligned-1x1.png','layer-bottom-v2-2x1.png','layer-bottom-v2-4x3.png','layer-bottom-v2-1x1.png','layer-bottom-v3-2x1.png','layer-bottom-v3-4x3.png','layer-bottom-v3-1x1.png','openai-ruin-2.png','openai-ruin-1.png','openai-ruin-ushape.png'],
      tRuinsTop: ['layer-top-aligned.png','layer-top-v2.png','layer-top-v3.png','layer-top-v4.png','layer-top-v5.png','layer-top-v6.png','layer-top-v7.png','t10-layer-top.png'],
      tScatter: ['scatter-layer.png','scatter-v2.png','scatter-v3.png','scatter-v4.png','scatter-v5.png','scatter-v6.png','openai-scatter.png','rubble-edge-1.png','rubble-edge-2.png','rubble-edge-3.png','rubble-edge-4.png']
    };
    const base = this.spriteBasePath;
    Object.entries(thumbs).forEach(([id, files]) => {
      const c = document.getElementById(id);
      files.forEach(f => {
        const img = document.createElement('img');
        img.className = 'thumb'; img.src = base + f; img.dataset.file = f; img.dataset.cat = id; img.draggable = false;
        c.appendChild(img);
        img.onmousedown = e => Editor.Sprites.startThumbDrag(e, f, id);
      });
    });
  },

  // ── Layer name → z-index mapping ──
  layerIndex(layerName) {
    const order = ['lightLayer','spriteFloor','spriteTop','svgRuins','svgScatter','objectiveRings','objectiveHexes','modelLayer'];
    const idx = order.indexOf(layerName);
    return idx >= 0 ? idx : -1;
  },

  // ── Debug output — full scene config ──
  updateDebug() {
    if (!this.debug) return;
    const config = {
      sprites: this.allSprites.map(s => ({
        id: s.id, file: s.file, x: Math.round(s.x), y: Math.round(s.y),
        w: Math.round(s.w), h: Math.round(s.h), rot: s.rot,
        layerType: s.layerType || 'floor',
        hidden: s.hidden || false, flipX: s.flipX || false, flipY: s.flipY || false,
        groupId: s.groupId || null,
        shadowMul: s.shadowMul != null ? +s.shadowMul.toFixed(2) : 1.0,
        crop: (s.cropL || s.cropT || s.cropR || s.cropB) ? { l: +(s.cropL||0).toFixed(3), t: +(s.cropT||0).toFixed(3), r: +(s.cropR||0).toFixed(3), b: +(s.cropB||0).toFixed(3) } : null
      })),
      models: this.allModels.map(m => m.kind === 'circle'
        ? { kind: m.kind, x: Math.round(m.x), y: Math.round(m.y), r: m.r, stroke: m.s, icon: m.iconType }
        : { kind: m.kind, x: Math.round(m.x), y: Math.round(m.y), w: m.w, h: m.h, stroke: m.s }),
      lights: this.allLights.map(l => ({
        id: l.id, x: Math.round(l.x), y: Math.round(l.y),
        color: l.color, radius: l.radius, intensity: l.intensity
      })),
      groups: (this.groups || []).map(g => ({
        id: g.id, name: g.name, opacity: g.opacity,
        spriteIds: this.allSprites.filter(s => s.groupId === g.id).map(s => s.id)
      })),
      objectives: (this.allObjectives || []).map(o => ({
        idx: o.idx, leftPct: +o.leftPct.toFixed(2), topPct: +o.topPct.toFixed(2)
      })),
      settings: {
        bg: document.getElementById('bgSel')?.value,
        ruinsOpacity: parseInt(document.getElementById('ruinsOpacitySlider')?.value || 92)
      }
    };
    this.debug.value = JSON.stringify(config, null, 1);
  }
};
