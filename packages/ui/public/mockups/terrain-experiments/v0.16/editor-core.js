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

    // Populate thumbnail grids
    this.populateThumbs();

    // Init sub-modules
    Editor.Models.init();
    Editor.Objectives.init();
    Editor.Selection.init();
    Editor.Persistence.load();
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
      tRuinsFloor: ['layer-bottom-aligned.png','layer-bottom-v2.png','layer-bottom-v3.png','layer-bottom-v4.png','layer-bottom-v5.png','layer-bottom-v6.png','layer-bottom-v7.png','t10-layer-bottom.png','openai-ruin-2.png','openai-ruin-1.png','openai-ruin-ushape.png'],
      tRuinsTop: ['layer-top-aligned.png','layer-top-v2.png','layer-top-v3.png','layer-top-v4.png','layer-top-v5.png','layer-top-v6.png','layer-top-v7.png','t10-layer-top.png'],
      tScatter: ['scatter-layer.png','scatter-v2.png','scatter-v3.png','scatter-v4.png','scatter-v5.png','scatter-v6.png','openai-scatter.png']
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

  // ── Debug output ──
  updateDebug() {
    if (!this.debug) return;
    this.debug.value = JSON.stringify(this.allSprites.map(s => ({
      id: s.id, file: s.file, x: Math.round(s.x), y: Math.round(s.y),
      w: Math.round(s.w), h: Math.round(s.h), rot: s.rot, layer: s.layer
    })), null, 1);
  }
};
