/**
 * Unit tests for the Terrain Sprite Editor v0.16
 * 
 * These tests verify the editor's data-layer logic (groups, selection,
 * layers, crop) using a minimal SVG DOM setup. They run in jsdom via Vitest.
 *
 * Run: npx vitest run packages/ui/public/mockups/terrain-experiments/v0.16/__tests__/editor.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// ─── Helpers ───

function loadEditor() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="main">
      <div class="sidebar left"></div>
      <div id="layersList"></div>
      <select id="bgSel"><option value="svg-gradient">SVG</option></select>
      <textarea id="debug"></textarea>
      <div id="tRuinsFloor"></div><div id="tRuinsTop"></div><div id="tScatter"></div>
      <div id="objectives"></div>
      <div class="map-wrapper" id="mapWrap">
        <svg id="battlefield" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 528">
          <defs></defs>
          <rect width="720" height="528" fill="#0c1218"/>
          <image id="bgImg" href="" x="0" y="0" width="720" height="528"/>
          <g id="deployZones"></g>
          <g id="lightLayer"></g>
          <g id="spriteFloor"></g>
          <g id="spriteTop"></g>
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

  // Patch globals
  global.window = window;
  global.document = document;
  try { global.navigator = window.navigator; } catch (_) { /* readonly in newer Node */ }
  global.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  };

  // SVG createSVGPoint polyfill for jsdom
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

  // Load all editor modules in order
  const editorDir = path.resolve(__dirname, '..');
  const modules = [
    'editor-core.js', 'editor-undo.js', 'editor-models.js', 'editor-sprites.js',
    'editor-objectives.js', 'editor-lights.js', 'editor-groups.js', 'editor-crop.js',
    'editor-zoom.js', 'editor-shortcuts.js', 'editor-selection.js', 'editor-layers.js',
    'editor-effects.js', 'editor-persistence.js'
  ];

  // Create Editor namespace — must be on window AND as a global var the scripts can see
  window.Editor = {};

  modules.forEach(mod => {
    const code = fs.readFileSync(path.join(editorDir, mod), 'utf8');
    // Execute in window scope; inject Editor as a local alias
    const wrapped = `var Editor = window.Editor;\n${code}`;
    const fn = new window.Function(wrapped);
    fn.call(window);
  });

  // Init (skip populateThumbs image loading, stub it)
  window.Editor.Core.populateThumbs = () => {};
  // Stub confirm for deleteGroup
  window.confirm = () => true;

  // Init shortcuts (no-op stub if missing)
  if (!window.Editor.Shortcuts) window.Editor.Shortcuts = { init() {} };
  window.Editor.Shortcuts.init();
  window.Editor.Core.init();
  if (window.Editor.Effects) window.Editor.Effects.init();
  if (window.Editor.Zoom) window.Editor.Zoom.init();

  return window.Editor;
}

// ─── Tests ───

describe('Editor Groups', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('createGroup assigns groupId to sprites', () => {
    const sp1 = Editor.Sprites.addSprite('test1.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('test2.png', 70, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2]);
    expect(group).toBeTruthy();
    expect(sp1.groupId).toBe(group.id);
    expect(sp2.groupId).toBe(group.id);
  });

  it('ungroup preserves z-order position (not popping to top)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('bottom.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('mid1.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('mid2.png', 130, 10, 50, 50, 0, 'floor', true);
    const sp4 = Editor.Sprites.addSprite('top.png', 190, 10, 50, 50, 0, 'floor', true);

    // Group mid1 + mid2
    const group = Editor.Groups.createGroup([sp2, sp3]);

    // Record what's above the group
    const gEl = document.getElementById(group.id);
    const aboveGroup = gEl.nextElementSibling;

    // Ungroup
    Editor.Groups.ungroup(group.id);

    // sp2 and sp3 should be before whatever was above the group
    // They should NOT be at the very end (before selUI)
    expect(sp2.groupId).toBeUndefined();
    expect(sp3.groupId).toBeUndefined();

    // The ungrouped sprites should be siblings of sp1 and sp4
    const selUI = document.getElementById('selUI');
    const directChildren = Array.from(svg.children).filter(el =>
      el.tagName === 'image' || (el.tagName === 'g' && el.id && el.id.startsWith('group-'))
    );
    const spriteEls = directChildren.filter(el => el.tagName === 'image');

    // sp2 and sp3 should not be the last images before selUI
    // Find their positions
    const allEls = Array.from(svg.children);
    const sp1Idx = allEls.indexOf(sp1.el);
    const sp2Idx = allEls.indexOf(sp2.el);
    const sp3Idx = allEls.indexOf(sp3.el);
    const sp4Idx = allEls.indexOf(sp4.el);

    // sp2 and sp3 should be between sp1 and sp4 in z-order
    expect(sp2Idx).toBeGreaterThan(sp1Idx);
    expect(sp3Idx).toBeGreaterThan(sp1Idx);
    expect(sp2Idx).toBeLessThan(sp4Idx);
    expect(sp3Idx).toBeLessThan(sp4Idx);
  });

  it('addToGroup moves sprite into group DOM', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Groups.addToGroup(group.id, sp3);

    expect(sp3.groupId).toBe(group.id);
    const gEl = document.getElementById(group.id);
    expect(gEl.contains(sp3.el)).toBe(true);
  });

  it('rename updates group name', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);

    Editor.Groups.rename(group.id, 'My Terrain');
    expect(group.name).toBe('My Terrain');
  });
});

describe('Editor Selection — multi-select pointer events', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('drawMultiSel highlight rects have pointer-events: none', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    Editor.Core.multiSel = [sp1, sp2];
    Editor.Core.selected = sp1;
    Editor.Selection.drawMultiSel();

    const selUI = document.getElementById('selUI');
    const rects = selUI.querySelectorAll('rect');
    // The bounding box rect + 2 per-sprite highlight rects + corner handles + edge handles
    // Check that at least the highlight rects have pointer-events none
    let foundPointerEventsNone = 0;
    rects.forEach(r => {
      if (r.style.pointerEvents === 'none') foundPointerEventsNone++;
    });
    // At least 3: bounding box + 2 per-sprite highlights
    expect(foundPointerEventsNone).toBeGreaterThanOrEqual(3);
  });
});

describe('Editor Crop — wrapper approach', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('applyClip wraps sprite in <g> with clip-path', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.cropL = 0.1;
    sp.cropT = 0.2;
    sp.cropR = 0;
    sp.cropB = 0;

    Editor.Crop._applyClip(sp);

    // Sprite should be inside a wrapper <g>
    expect(sp._clipWrap).toBeTruthy();
    expect(sp._clipWrap.tagName).toBe('g');
    expect(sp.el.parentNode).toBe(sp._clipWrap);
    expect(sp._clipWrap.getAttribute('clip-path')).toContain('url(#');
  });

  it('removeClip unwraps sprite back to direct parent', () => {
    const svg = document.getElementById('battlefield');
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.cropL = 0.1;
    sp.cropT = 0;
    sp.cropR = 0;
    sp.cropB = 0;

    Editor.Crop._applyClip(sp);
    expect(sp._clipWrap).toBeTruthy();

    Editor.Crop._removeClip(sp);
    expect(sp._clipWrap).toBeNull();
    // Image should be a direct child of SVG (or its group)
    expect(sp.el.parentNode).toBe(svg);
  });

  it('cropped sprite inside group ungroups correctly', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    // Crop sp1
    sp1.cropL = 0.1;
    sp1.cropT = 0;
    sp1.cropR = 0;
    sp1.cropB = 0.2;
    Editor.Crop._applyClip(sp1);

    // Group them
    const group = Editor.Groups.createGroup([sp1, sp2]);
    const gEl = document.getElementById(group.id);
    expect(gEl.contains(sp1._clipWrap)).toBe(true);
    expect(gEl.contains(sp2.el)).toBe(true);

    // Ungroup
    Editor.Groups.ungroup(group.id);
    expect(sp1.groupId).toBeUndefined();
    // The crop wrapper should be a direct child of SVG
    expect(sp1._clipWrap.parentNode).toBe(svg);
  });
});

describe('Editor Layers — group child drag', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('_buildZOrder includes crop-wrapped sprites', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.cropL = 0.1;
    sp.cropT = 0;
    sp.cropR = 0;
    sp.cropB = 0;
    Editor.Crop._applyClip(sp);

    const zItems = Editor.Layers._buildZOrder();
    const found = zItems.find(z => z.type === 'sprite' && z.ref === sp);
    expect(found).toBeTruthy();
  });

  it('rebuild shows group child sprites correctly', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    Editor.Groups.createGroup([sp1, sp2]);
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const rows = list.querySelectorAll('.layer-row');
    // Should have: group row + 2 child rows + 1 ungrouped sprite row + built-in group rows
    const childRows = list.querySelectorAll('.child-row');
    expect(childRows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Editor Effects — shadow rotation compensation', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('unrotated sprite gets original shadow dx/dy', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.shadowMul = 1.0;
    Editor.Effects._applyToSprite(sp);

    const filterId = sp.el.getAttribute('filter').match(/url\(#(.+)\)/)[1];
    const filter = document.getElementById(filterId);
    const offset = filter.querySelector('feOffset');
    // dx/dy should be the original values (3, 3 default)
    expect(parseFloat(offset.getAttribute('dx'))).toBeCloseTo(3, 0);
    expect(parseFloat(offset.getAttribute('dy'))).toBeCloseTo(3, 0);
  });

  it('90° rotated sprite gets counter-rotated shadow offset', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 90, 'floor', true);
    sp.shadowMul = 1.0;
    Editor.Effects._applyToSprite(sp);

    const filterId = sp.el.getAttribute('filter').match(/url\(#(.+)\)/)[1];
    const filter = document.getElementById(filterId);
    const offset = filter.querySelector('feOffset');
    const dx = parseFloat(offset.getAttribute('dx'));
    const dy = parseFloat(offset.getAttribute('dy'));

    // For 90° rotation with default dx=3, dy=3:
    // local_dx = 1 * (3*cos(-90°) + 3*sin(-90°)) = 1 * (0 + -3) = -3
    // local_dy = 1 * (-3*sin(-90°) + 3*cos(-90°)) = 1 * (3 + 0) = 3
    // Wait, let me recalculate. rad = -90 * PI/180 = -PI/2
    // cos(-PI/2) ≈ 0, sin(-PI/2) ≈ -1
    // localDx = 1 * (3*0 + 3*(-1)) = -3
    // localDy = 1 * (-3*(-1) + 3*0) = 3
    expect(dx).toBeCloseTo(-3, 0);
    expect(dy).toBeCloseTo(3, 0);
  });

  it('different rotations produce different filters', () => {
    const sp0 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp90 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 90, 'floor', true);

    Editor.Effects._applyToSprite(sp0);
    Editor.Effects._applyToSprite(sp90);

    const filter0 = sp0.el.getAttribute('filter');
    const filter90 = sp90.el.getAttribute('filter');
    expect(filter0).not.toBe(filter90);
  });
});

describe('Editor Undo — shadowMul preservation', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('undo snapshot captures shadowMul', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.shadowMul = 0.3;

    Editor.Undo.push();
    const snapshot = Editor.Undo.stack[Editor.Undo.stack.length - 1];
    const saved = snapshot.sprites.find(s => s.id === sp.id);
    expect(saved.shadowMul).toBeCloseTo(0.3);
  });

  it('undo restores shadowMul correctly', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.shadowMul = 0.5;

    // Push state with shadowMul=0.5
    Editor.Undo.push();

    // Change shadowMul
    sp.shadowMul = 1.0;

    // Undo should restore shadowMul=0.5
    Editor.Undo.pop();

    // Find the restored sprite
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored).toBeTruthy();
    expect(restored.shadowMul).toBeCloseTo(0.5);
  });

  it('undo restores multiple sprites with different shadowMul values', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    sp1.shadowMul = 0.2;
    sp2.shadowMul = 0.8;

    Editor.Undo.push();

    // Change both
    sp1.shadowMul = 1.0;
    sp2.shadowMul = 1.0;

    Editor.Undo.pop();

    const r1 = Editor.Core.allSprites.find(s => s.file === 'a.png');
    const r2 = Editor.Core.allSprites.find(s => s.file === 'b.png');
    expect(r1.shadowMul).toBeCloseTo(0.2);
    expect(r2.shadowMul).toBeCloseTo(0.8);
  });
});

describe('Integration — James layout JSON', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('loads james-layout.json without errors', () => {
    const layoutPath = path.resolve(__dirname, '..', 'james-layout.json');
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

    expect(layout.sprites.length).toBeGreaterThan(0);
    expect(layout.models.length).toBeGreaterThan(0);

    // Simulate import: store as localStorage data and reload
    // We'll just verify the sprite data is valid
    layout.sprites.forEach(s => {
      expect(s.file).toBeTruthy();
      expect(typeof s.x).toBe('number');
      expect(typeof s.y).toBe('number');
    });
  });
});
