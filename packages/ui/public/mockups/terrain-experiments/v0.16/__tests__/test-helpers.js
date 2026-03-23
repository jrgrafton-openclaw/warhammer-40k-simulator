/**
 * Shared test helpers for Terrain Editor v0.16 tests.
 * Provides loadEditor(), loadScene(), exportScene(), assertSceneEqual().
 */

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const EDITOR_DIR = path.resolve(__dirname, '..');

/**
 * Bootstrap a fresh editor instance in jsdom. Returns window.Editor.
 */
export function loadEditor() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="main">
      <div class="sidebar left"></div>
      <select id="bgSel"><option value="svg-gradient">SVG</option></select>
      <textarea id="debug"></textarea>
      <div id="tRuinsFloor"></div><div id="tRuinsTop"></div><div id="tScatter"></div>
      <input id="ruinsOpacitySlider" type="range" min="0" max="100" value="92"><span>92%</span>
      <div class="fx-controls" id="fxShadowControls">
        <label><span class="fx-lbl">Shadow Blur</span><input type="range" min="1" max="20" value="6"><span class="fx-val">6px</span></label>
        <label><span class="fx-lbl">Shadow Opacity</span><input type="range" min="0" max="100" value="55"><span class="fx-val">55%</span></label>
        <label><span class="fx-lbl">Offset X</span><input type="range" min="-10" max="10" value="3"><span class="fx-val">3px</span></label>
        <label><span class="fx-lbl">Offset Y</span><input type="range" min="-10" max="10" value="3"><span class="fx-val">3px</span></label>
        <label><span class="fx-lbl">Distance</span><input type="range" min="0" max="300" value="100"><span class="fx-val">100%</span></label>
      </div>
      <div class="fx-controls" id="fxFeatherControls" style="display:none">
        <label><span class="fx-lbl">Feather Radius</span><input type="range" min="1" max="30" value="10"><span class="fx-val">10px</span></label>
      </div>
      <div class="fx-controls" id="fxGradeControls">
        <label><span class="fx-lbl">Brightness</span><input type="range" min="20" max="120" value="75"><span class="fx-val">75%</span></label>
        <label><span class="fx-lbl">Saturation</span><input type="range" min="0" max="150" value="70"><span class="fx-val">70%</span></label>
        <label><span class="fx-lbl">Sepia</span><input type="range" min="0" max="50" value="8"><span class="fx-val">8%</span></label>
      </div>
      <div id="objectives"></div>
      <div id="layersList"></div>
      <div class="map-wrapper" id="mapWrap">
        <svg id="battlefield" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 528">
          <defs></defs>
          <rect width="720" height="528" fill="#0c1218"/>
          <image id="bgImg" href="" x="0" y="0" width="720" height="528"/>
          <g id="deployZones">
            <g id="deploy-imperium">
              <rect x="0" y="0" width="240" height="528" fill="rgba(0,140,200,0.06)"/>
              <line x1="240" y1="0" x2="240" y2="528" stroke="rgba(0,212,255,0.3)"/>
              <text x="120" y="15" fill="rgba(0,212,255,0.15)">IMPERIUM DEPLOY</text>
            </g>
            <g id="deploy-ork">
              <rect x="480" y="0" width="240" height="528" fill="rgba(255,64,32,0.06)"/>
              <line x1="480" y1="0" x2="480" y2="528" stroke="rgba(255,64,32,0.3)"/>
              <text x="600" y="15" fill="rgba(255,64,32,0.15)">ORK DEPLOY</text>
            </g>
          </g>
          <g id="lightLayer"></g>
          <g id="spriteFloor"></g>
          <g id="spriteTop"></g>
          <g id="svgGroundGradient" style="display:none"></g>
          <g id="svgGroundWarm" style="display:none"></g>
          <g id="svgGroundDual" style="display:none"></g>
          <g id="svgGroundHaze" style="display:none"></g>
          <g id="svgGroundConcrete" style="display:none"></g>
          <g id="svgGroundTactical" style="display:none"></g>
          <g id="svgRuins" style="pointer-events:none"></g>
          <g id="svgScatter" style="pointer-events:none"></g>
          <g id="objectiveRings"></g>
          <g id="objectiveHexes"></g>
          <g id="modelLayer"></g>
          <g id="selUI" style="display:none"></g>
          <rect id="dragRect" class="sel-rect" style="display:none"/>
        </svg>
      </div>
    </div>
  </body></html>`, {
    url: 'http://localhost',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const { document } = window;

  global.window = window;
  global.document = document;
  try { global.navigator = window.navigator; } catch (_) {}

  // Polyfill animation frame for smoke/fire FX
  if (!window.requestAnimationFrame) {
    let _rafId = 0;
    window.requestAnimationFrame = function(cb) { return ++_rafId; };
    window.cancelAnimationFrame = function(id) {};
  }
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.cancelAnimationFrame = window.cancelAnimationFrame;
  global.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  };

  const svg = document.getElementById('battlefield');
  if (!svg.createSVGPoint) {
    svg.createSVGPoint = () => ({
      x: 0, y: 0,
      matrixTransform() { return { x: this.x, y: this.y }; }
    });
  }
  if (!svg.getScreenCTM) {
    svg.getScreenCTM = () => ({
      inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
    });
  }

  const modules = [
    'js/core/state.js',
    'js/core/bus.js', 'js/entities/core.js', 'js/core/undo.js', 'js/core/commands.js', 'js/entities/models.js', 'js/entities/sprites.js',
    'js/entities/objectives.js', 'js/entities/lights.js', 'js/entities/fire.js', 'js/entities/smoke.js',
    'js/tools/groups.js', 'js/tools/crop.js',
    'js/ui/zoom.js', 'js/ui/shortcuts.js', 'js/tools/selection.js', 'js/ui/layers.js',
    'js/tools/effects.js', 'js/persistence.js'
  ];

  window.Editor = {};
  modules.forEach(mod => {
    const code = fs.readFileSync(path.join(EDITOR_DIR, mod), 'utf8');
    const wrapped = `var Editor = window.Editor;\n${code}`;
    const fn = new window.Function(wrapped);
    fn.call(window);
  });

  window.Editor.Core.populateThumbs = () => {};
  window.confirm = () => true;
  if (!window.Editor.Shortcuts) window.Editor.Shortcuts = { init() {} };
  window.Editor.Shortcuts.init();
  window.Editor.Core.init();
  if (window.Editor.Effects) window.Editor.Effects.init();
  if (window.Editor.Zoom) window.Editor.Zoom.init();

  return window.Editor;
}

/**
 * Load the test fixture into a fresh editor. Returns Editor.
 * Accepts the output-format JSON (crop: {l,t,r,b}, stroke, icon).
 */
export function loadScene(fixtureJson) {
  const Editor = loadEditor();
  const data = typeof fixtureJson === 'string' ? JSON.parse(fixtureJson) : JSON.parse(JSON.stringify(fixtureJson));
  const C = Editor.Core;

  // Apply settings
  if (data.settings) {
    if (data.settings.bg) {
      document.getElementById('bgSel').value = data.settings.bg;
      C.setBg(data.settings.bg);
    }
    // Set ruins opacity slider if provided
    const ruinsSlider = document.getElementById('ruinsOpacitySlider');
    if (data.settings.ruinsOpacity != null && ruinsSlider) {
      ruinsSlider.value = data.settings.ruinsOpacity;
      ruinsSlider.nextElementSibling.textContent = data.settings.ruinsOpacity + '%';
    }
  }

  // Clear default models
  document.getElementById('modelLayer').innerHTML = '';
  C.allModels = [];

  // Create sprites
  if (data.sprites) {
    data.sprites.forEach(s => {
      const lt = s.layerType || 'floor';
      const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot || 0, lt, true);
      sp.hidden = !!s.hidden;
      sp.el.style.display = sp.hidden ? 'none' : '';
      sp.flipX = !!s.flipX;
      sp.flipY = !!s.flipY;
      if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
      if (s.groupId) sp.groupId = s.groupId;
      // Convert output-format crop to internal format
      if (s.crop) {
        sp.cropL = s.crop.l || 0;
        sp.cropT = s.crop.t || 0;
        sp.cropR = s.crop.r || 0;
        sp.cropB = s.crop.b || 0;
      }
      sp.shadowMul = s.shadowMul != null ? s.shadowMul : 1.0;
    });
  }

  // Models
  if (data.models) {
    data.models.forEach(m => {
      const fill = (m.stroke || '#0088aa') === '#0088aa' ? 'url(#mf-imp)' : 'url(#mf-ork)';
      if (m.kind === 'circle') {
        Editor.Models.addCircle(m.x, m.y, m.r, m.stroke, fill, m.icon || m.iconType);
      } else {
        Editor.Models.addRect(m.x, m.y, m.w, m.h, m.stroke, fill);
      }
    });
  }

  // Lights
  if (data.lights && data.lights.length) {
    data.lights.forEach(l => Editor.Lights.addLight(l.x, l.y, l.color, l.radius, l.intensity, true));
  }

  // Objectives
  if (data.objectives) {
    Editor.Objectives.restorePositions(data.objectives);
  }

  // Groups — restore after sprites exist
  if (data.groups && data.groups.length) {
    Editor.Groups.restore(data.groups);
  } else {
    // Check if any sprites reference groups not in the groups array
    const groupIds = new Set(C.allSprites.filter(s => s.groupId).map(s => s.groupId));
    if (groupIds.size > 0) {
      const groupsData = Array.from(groupIds).map(id => ({ id, name: id.replace('group-g', 'Group '), opacity: 1 }));
      Editor.Groups.restore(groupsData);
    }
  }

  // Apply crops and effects
  Editor.Crop.reapplyAll();
  Editor.Effects.rebuildAll();

  // Migrate any sprites in old containers
  const svg = document.getElementById('battlefield');
  const selUI = document.getElementById('selUI');
  ['spriteFloor', 'spriteTop'].forEach(cid => {
    const container = document.getElementById(cid);
    if (container) {
      Array.from(container.children).forEach(child => {
        container.removeChild(child);
        svg.insertBefore(child, selUI);
      });
    }
  });

  Editor.Layers.rebuild();
  return Editor;
}

/**
 * Export current editor state as output-format JSON (matching test-scene.json schema).
 */
export function exportScene(Editor) {
  const C = Editor.Core;
  return {
    sprites: C.allSprites.map(s => {
      const crop = (s.cropL || s.cropT || s.cropR || s.cropB)
        ? { l: s.cropL || 0, t: s.cropT || 0, r: s.cropR || 0, b: s.cropB || 0 }
        : null;
      return {
        id: s.id,
        file: s.file,
        x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot,
        layerType: s.layerType || 'floor',
        hidden: !!s.hidden,
        flipX: !!s.flipX, flipY: !!s.flipY,
        groupId: s.groupId || null,
        shadowMul: s.shadowMul != null ? s.shadowMul : 1,
        crop
      };
    }),
    models: C.allModels.map(m => m.kind === 'circle'
      ? { kind: 'circle', x: m.x, y: m.y, r: m.r, stroke: m.s, icon: m.iconType }
      : { kind: 'rect', x: m.x, y: m.y, w: m.w, h: m.h, stroke: m.s }),
    lights: C.allLights.map(l => ({ x: l.x, y: l.y, color: l.color, radius: l.radius, intensity: l.intensity })),
    objectives: C.allObjectives.map(o => ({ idx: o.idx, leftPct: o.leftPct, topPct: o.topPct })),
    groups: (C.groups || []).map(g => ({ id: g.id, name: g.name, opacity: g.opacity })),
    settings: {
      bg: document.getElementById('bgSel').value,
      ruinsOpacity: 100,
    }
  };
}

/**
 * Get the z-ordered list of sprite file names (bottom to top) from SVG DOM.
 */
export function getSpriteZOrder(Editor) {
  const C = Editor.Core;
  const svg = document.getElementById('battlefield');
  const order = [];
  Array.from(svg.children).forEach(el => {
    // Direct sprite
    let sp = C.allSprites.find(s => s.el === el);
    if (sp) { order.push(sp.file); return; }
    // Crop wrapper
    if (el.tagName === 'g' && el.id && el.id.endsWith('-wrap')) {
      sp = C.allSprites.find(s => s._clipWrap === el);
      if (sp) { order.push(sp.file); return; }
    }
    // Custom group — recurse children
    if (el.tagName === 'g' && el.id && el.id.startsWith('group-')) {
      Array.from(el.children).forEach(child => {
        let csp = C.allSprites.find(s => s.el === child);
        if (!csp && child.tagName === 'g' && child.id && child.id.endsWith('-wrap')) {
          csp = C.allSprites.find(s => s._clipWrap === child);
        }
        if (csp) order.push(csp.file);
      });
    }
  });
  return order;
}

/**
 * Deep-compare two scene exports, ignoring generated sprite IDs.
 * Returns { equal: boolean, differences: string[] }
 */
export function assertSceneEqual(a, b) {
  const diffs = [];

  // Sprite count
  if (a.sprites.length !== b.sprites.length) {
    diffs.push(`sprite count: ${a.sprites.length} vs ${b.sprites.length}`);
  }

  // Compare sprites by matching (file + position), not by index.
  // DOM z-order serialization may reorder sprites (grouped sprites move to group position).
  const used = new Set();
  for (let i = 0; i < a.sprites.length; i++) {
    const sa = a.sprites[i];
    const matchIdx = b.sprites.findIndex((sb, j) =>
      !used.has(j) && sb.file === sa.file && Math.abs(sb.x - sa.x) < 2 && Math.abs(sb.y - sa.y) < 2
    );
    if (matchIdx === -1) {
      diffs.push(`sprite[${i}] ${sa.file} at (${sa.x},${sa.y}) not found in other scene`);
      continue;
    }
    used.add(matchIdx);
    const sb = b.sprites[matchIdx];
    const fields = ['w', 'h', 'layerType', 'hidden', 'flipX', 'flipY', 'shadowMul'];
    fields.forEach(f => {
      if (sa[f] !== sb[f]) diffs.push(`sprite ${sa.file}(${sa.x},${sa.y}).${f}: ${sa[f]} vs ${sb[f]}`);
    });
    if (Math.abs((sa.rot || 0) - (sb.rot || 0)) > 1e-10) {
      diffs.push(`sprite ${sa.file}(${sa.x},${sa.y}).rot: ${sa.rot} vs ${sb.rot}`);
    }
    const ca = sa.crop, cb = sb.crop;
    if ((!ca) !== (!cb)) {
      diffs.push(`sprite ${sa.file}(${sa.x},${sa.y}).crop: ${JSON.stringify(ca)} vs ${JSON.stringify(cb)}`);
    } else if (ca && cb) {
      ['l', 't', 'r', 'b'].forEach(k => {
        if (Math.abs((ca[k] || 0) - (cb[k] || 0)) > 1e-6) {
          diffs.push(`sprite ${sa.file}(${sa.x},${sa.y}).crop.${k}: ${ca[k]} vs ${cb[k]}`);
        }
      });
    }
    if ((!sa.groupId) !== (!sb.groupId)) {
      diffs.push(`sprite ${sa.file}(${sa.x},${sa.y}).groupId: ${sa.groupId} vs ${sb.groupId}`);
    }
  }

  // Models
  if (a.models.length !== b.models.length) {
    diffs.push(`model count: ${a.models.length} vs ${b.models.length}`);
  }
  const mLen = Math.min(a.models.length, b.models.length);
  for (let i = 0; i < mLen; i++) {
    const ma = a.models[i], mb = b.models[i];
    if (ma.kind !== mb.kind) diffs.push(`model[${i}].kind: ${ma.kind} vs ${mb.kind}`);
    if (Math.abs(ma.x - mb.x) > 0.5) diffs.push(`model[${i}].x: ${ma.x} vs ${mb.x}`);
    if (Math.abs(ma.y - mb.y) > 0.5) diffs.push(`model[${i}].y: ${ma.y} vs ${mb.y}`);
  }

  // Objectives
  if (a.objectives.length !== b.objectives.length) {
    diffs.push(`objective count: ${a.objectives.length} vs ${b.objectives.length}`);
  }

  return { equal: diffs.length === 0, differences: diffs };
}

/**
 * Load the test-scene.json fixture.
 */
export function loadFixture() {
  const fixturePath = path.resolve(__dirname, 'fixtures', 'test-scene.json');
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}
