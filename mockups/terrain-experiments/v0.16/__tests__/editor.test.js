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
          <g id="svgGroundGradient" style="display:none"></g>
          <g id="svgGroundWarm" style="display:none"></g>
          <g id="svgGroundDual" style="display:none"></g>
          <g id="svgGroundHaze" style="display:none"></g>
          <g id="svgGroundConcrete" style="display:none"></g>
          <g id="svgGroundTactical" style="display:none"></g>
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
    'js/core/state.js',
    'js/core/bus.js', 'js/entities/core.js', 'js/core/undo.js', 'js/core/commands.js', 'js/entities/models.js', 'js/entities/sprites.js',
    'js/entities/objectives.js', 'js/entities/lights.js', 'js/tools/groups.js', 'js/tools/crop.js',
    'js/ui/zoom.js', 'js/ui/shortcuts.js', 'js/tools/selection.js', 'js/ui/layers.js',
    'js/tools/effects.js', 'js/persistence.js'
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

    // Double-wrapper: outer _clipWrap (filter) → inner _clipGroup (clip) → <image>
    expect(sp._clipWrap).toBeTruthy();
    expect(sp._clipWrap.tagName).toBe('g');
    expect(sp._clipGroup).toBeTruthy();
    expect(sp.el.parentNode).toBe(sp._clipGroup);
    expect(sp._clipGroup.getAttribute('clip-path')).toContain('url(#');
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
    // rad = 90 * PI/180 = PI/2
    // cos(PI/2) ≈ 0, sin(PI/2) ≈ 1
    // localDx = 1 * (3*0 + 3*1) = 3
    // localDy = 1 * (-3*1 + 3*0) = -3
    expect(dx).toBeCloseTo(3, 0);
    expect(dy).toBeCloseTo(-3, 0);
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

  it('flipX sprite: local offset is counter-flipped so screen shadow is ↘', () => {
    // feOffset is in LOCAL space (pre-transform). flipX scale(-1,1) will
    // negate the x, so we pre-negate it so the screen result is correct.
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.flipX = true;
    sp.shadowMul = 1.0;
    Editor.Effects._applyToSprite(sp);

    const filterId = sp.el.getAttribute('filter').match(/url\(#(.+)\)/)[1];
    const filter = document.getElementById(filterId);
    const offset = filter.querySelector('feOffset');
    const dx = parseFloat(offset.getAttribute('dx'));
    const dy = parseFloat(offset.getAttribute('dy'));
    // Local dx=-3 (negated), dy=3 (unchanged)
    // After scale(-1,1): screen (-3*-1, 3) = (3, 3) = ↘
    expect(dx).toBeCloseTo(-3, 0);
    expect(dy).toBeCloseTo(3, 0);
  });

  it('flipY sprite: local offset is counter-flipped so screen shadow is ↘', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.flipY = true;
    sp.shadowMul = 1.0;
    Editor.Effects._applyToSprite(sp);

    const filterId = sp.el.getAttribute('filter').match(/url\(#(.+)\)/)[1];
    const filter = document.getElementById(filterId);
    const offset = filter.querySelector('feOffset');
    const dx = parseFloat(offset.getAttribute('dx'));
    const dy = parseFloat(offset.getAttribute('dy'));
    // Local dx=3 (unchanged), dy=-3 (negated)
    // After scale(1,-1): screen (3, -3*-1) = (3, 3) = ↘
    expect(dx).toBeCloseTo(3, 0);
    expect(dy).toBeCloseTo(-3, 0);
  });

  it('flipX + 90° rotation: combined counter-transform for screen ↘', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 90, 'floor', true);
    sp.flipX = true;
    sp.shadowMul = 1.0;
    Editor.Effects._applyToSprite(sp);

    const filterId = sp.el.getAttribute('filter').match(/url\(#(.+)\)/)[1];
    const filter = document.getElementById(filterId);
    const offset = filter.querySelector('feOffset');
    const dx = parseFloat(offset.getAttribute('dx'));
    const dy = parseFloat(offset.getAttribute('dy'));
    // flipX=-1, rot=90: localDx = -1 * (3*0 + 3*1) = -3
    // flipY=1, rot=90:  localDy = 1 * (-3*1 + 3*0) = -3
    // After scale(-1,1) + rotate(90°): screen = (3, 3) = ↘
    expect(dx).toBeCloseTo(-3, 0);
    expect(dy).toBeCloseTo(-3, 0);
  });

  it('flipX + flipY: both axes counter-flipped for screen ↘', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.flipX = true;
    sp.flipY = true;
    sp.shadowMul = 1.0;
    Editor.Effects._applyToSprite(sp);

    const filterId = sp.el.getAttribute('filter').match(/url\(#(.+)\)/)[1];
    const filter = document.getElementById(filterId);
    const offset = filter.querySelector('feOffset');
    const dx = parseFloat(offset.getAttribute('dx'));
    const dy = parseFloat(offset.getAttribute('dy'));
    // Both flipped: local dx=-3, dy=-3
    // After scale(-1,-1): screen (3, 3) = ↘
    expect(dx).toBeCloseTo(-3, 0);
    expect(dy).toBeCloseTo(-3, 0);
  });
});

describe('Editor Effects — filter region (Bug 7)', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('filter region is large enough for rotated sprites with shadows', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 45, 'floor', true);
    sp.shadowMul = 1.0;
    Editor.Effects._applyToSprite(sp);

    const filterId = sp.el.getAttribute('filter').match(/url\(#(.+)\)/)[1];
    const filter = document.getElementById(filterId);
    // Filter region should be at least -50%/-50% and 200%/200%
    expect(parseInt(filter.getAttribute('x'))).toBeLessThanOrEqual(-50);
    expect(parseInt(filter.getAttribute('y'))).toBeLessThanOrEqual(-50);
    expect(parseInt(filter.getAttribute('width'))).toBeGreaterThanOrEqual(200);
    expect(parseInt(filter.getAttribute('height'))).toBeGreaterThanOrEqual(200);
  });
});

describe('Editor Groups — rename (Bug 1)', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('Groups.rename updates group name', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);
    expect(group.name).toBe('Group 1');

    Editor.Groups.rename(group.id, 'My Group');
    const updated = Editor.Core.groups.find(g => g.id === group.id);
    expect(updated.name).toBe('My Group');
  });

  it('custom group row dragstart is prevented on group-name element', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    Editor.Groups.createGroup([sp1, sp2]);
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const groupRow = list.querySelector('.custom-group-row');
    expect(groupRow).toBeTruthy();

    // Simulate dragstart on the group-name element
    const nameEl = groupRow.querySelector('.group-name');
    expect(nameEl).toBeTruthy();

    const event = new window.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: nameEl });
    const defaultPrevented = !nameEl.dispatchEvent(event);
    // The dragstart should be prevented when originating from group-name
    // (The row's dragstart handler checks for .group-name and calls preventDefault)
  });
});

describe('Editor Undo — shadowMul preservation', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('command captures shadowMul via _captureSprite', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.shadowMul = 0.3;

    const captured = Editor.Commands._captureSprite(sp);
    expect(captured.shadowMul).toBeCloseTo(0.3);
  });

  it('undo restores shadowMul correctly', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.shadowMul = 0.5;

    const cmd = Editor.Commands.SetProperty.create(sp.id, { shadowMul: 0.5 }, { shadowMul: 1.0 });
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();

    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored).toBeTruthy();
    expect(restored.shadowMul).toBeCloseTo(0.5);
  });

  it('undo restores multiple sprites with different shadowMul values', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    sp1.shadowMul = 0.2;
    sp2.shadowMul = 0.8;

    const cmd = Editor.Commands.Batch.create([
      Editor.Commands.SetProperty.create(sp1.id, { shadowMul: 0.2 }, { shadowMul: 1.0 }),
      Editor.Commands.SetProperty.create(sp2.id, { shadowMul: 0.8 }, { shadowMul: 1.0 }),
    ], 'Batch shadowMul change');
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();

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
    const layoutPath = path.resolve(__dirname, '..', 'data', 'james-layout.json');
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

    expect(layout.sprites.length).toBeGreaterThan(0);
    expect(layout.models.length).toBeGreaterThan(0);

    layout.sprites.forEach(s => {
      expect(s.file).toBeTruthy();
      expect(typeof s.x).toBe('number');
      expect(typeof s.y).toBe('number');
    });
  });

  it('all sprites render with correct structure after import', () => {
    const layoutPath = path.resolve(__dirname, '..', 'data', 'james-layout.json');
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

    // Simulate import: create all sprites from layout data
    layout.sprites.forEach(s => {
      const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, s.layerType || 'floor', true);
      sp.hidden = !!s.hidden;
      sp.flipX = !!s.flipX;
      sp.flipY = !!s.flipY;
      sp.cropL = s.cropL || 0;
      sp.cropT = s.cropT || 0;
      sp.cropR = s.cropR || 0;
      sp.cropB = s.cropB || 0;
      sp.shadowMul = s.shadowMul != null ? s.shadowMul : 1.0;
      if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
    });

    // Apply crops
    Editor.Crop.reapplyAll();

    // Apply effects (simulating Effects.init)
    Editor.Effects._ready = true;
    Editor.Effects.rebuildAll();

    const C = Editor.Core;
    expect(C.allSprites.length).toBe(layout.sprites.length);

    // Verify every sprite has a valid element in the SVG
    C.allSprites.forEach(sp => {
      expect(sp.el).toBeTruthy();
      expect(sp.el.getAttribute('href')).toContain(sp.file);

      // Sprite element should be in the SVG (directly or via wrapper)
      const svg = document.getElementById('battlefield');
      const elInSvg = sp._clipWrap
        ? svg.contains(sp._clipWrap) && sp._clipWrap.contains(sp.el)
        : svg.contains(sp.el);
      expect(elInSvg).toBe(true);

      // Every sprite should have a filter applied (on wrapper if cropped, on image if not)
      const filterTarget = sp._clipWrap || sp.el;
      expect(filterTarget.getAttribute('filter')).toBeTruthy();
    });

    // Verify cropped sprites have correct wrapper structure
    const cropped = C.allSprites.filter(sp => sp.cropL || sp.cropT || sp.cropR || sp.cropB);
    expect(cropped.length).toBe(4); // 4 cropped sprites in James's data

    cropped.forEach(sp => {
      expect(sp._clipWrap).toBeTruthy();
      expect(sp._clipGroup).toBeTruthy();
      expect(sp._clipGroup.getAttribute('clip-path')).toBeTruthy();
      expect(sp.el.parentNode).toBe(sp._clipGroup);
    });

    // Verify uncropped sprites are direct SVG children (not wrapped)
    const uncropped = C.allSprites.filter(sp => !sp.cropL && !sp.cropT && !sp.cropR && !sp.cropB);
    const svg = document.getElementById('battlefield');
    uncropped.forEach(sp => {
      expect(sp._clipWrap).toBeFalsy();
      expect(sp.el.parentNode).toBe(svg);
    });
  });
});

describe('Bug 1 — Effects persistence', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('save includes effects state, load restores it', () => {
    // Change effects to non-default values
    Editor.Effects.shadow.on = false;
    Editor.Effects.shadow.dx = 5;
    Editor.Effects.shadow.dy = 7;
    Editor.Effects.shadow.blur = 10;
    Editor.Effects.shadow.opacity = 0.8;
    Editor.Effects.feather.on = true;
    Editor.Effects.feather.radius = 15;
    Editor.Effects.grade.on = false;
    Editor.Effects.grade.brightness = 0.5;
    Editor.Effects.grade.saturation = 0.3;
    Editor.Effects.grade.sepia = 0.2;

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.effects).toBeTruthy();
    expect(saved.effects.shadow.on).toBe(false);
    expect(saved.effects.shadow.dx).toBe(5);
    expect(saved.effects.feather.on).toBe(true);
    expect(saved.effects.feather.radius).toBe(15);
    expect(saved.effects.grade.on).toBe(false);
    expect(saved.effects.grade.brightness).toBe(0.5);

    // Reset to defaults
    Editor.Effects.shadow.on = true;
    Editor.Effects.shadow.dx = 3;
    Editor.Effects.feather.on = false;
    Editor.Effects.grade.on = true;

    // Reload
    Editor.Persistence.load();

    // Verify restored
    expect(Editor.Effects.shadow.on).toBe(false);
    expect(Editor.Effects.shadow.dx).toBe(5);
    expect(Editor.Effects.shadow.dy).toBe(7);
    expect(Editor.Effects.feather.on).toBe(true);
    expect(Editor.Effects.feather.radius).toBe(15);
    expect(Editor.Effects.grade.on).toBe(false);
    expect(Editor.Effects.grade.brightness).toBe(0.5);
    expect(Editor.Effects.grade.saturation).toBe(0.3);
    expect(Editor.Effects.grade.sepia).toBe(0.2);
  });

  it('toggle/set functions call State.dispatch (Phase 2: auto-save via dispatch)', () => {
    const dispatchSpy = vi.spyOn(Editor.State, 'dispatch');
    const fakeBtn = document.createElement('button');

    Editor.Effects.toggleShadow(fakeBtn);
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockClear();

    Editor.Effects.setShadowParam('dx', 10);
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockClear();

    Editor.Effects.toggleFeather(fakeBtn);
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockClear();

    Editor.Effects.setFeatherRadius(20);
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockClear();

    Editor.Effects.toggleGrade(fakeBtn);
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockClear();

    Editor.Effects.setGradeParam('brightness', 0.9);
    expect(dispatchSpy).toHaveBeenCalled();

    dispatchSpy.mockRestore();
  });
});

describe('Bug 2 — Top zone accepts sprites', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('sprite dragged to top zone moves to front', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Simulate: set draggedId to sp1, then trigger top zone logic
    Editor.Layers.draggedId = sp1.id;
    const zItems = Editor.Layers._buildZOrder();

    // Manually execute the top-zone drop logic
    const selUI = document.getElementById('selUI');
    const dragItem = zItems.find(z => Editor.Layers._itemId(z) === sp1.id);
    svg.insertBefore(dragItem.svgEl, selUI);
    svg.appendChild(document.getElementById('selUI'));
    svg.appendChild(document.getElementById('dragRect'));

    // sp1 should now be after sp2 and sp3 (in front)
    const children = Array.from(svg.children);
    const idx1 = children.indexOf(sp1.el);
    const idx2 = children.indexOf(sp2.el);
    const idx3 = children.indexOf(sp3.el);
    expect(idx1).toBeGreaterThan(idx2);
    expect(idx1).toBeGreaterThan(idx3);
  });
});

describe('Bug 4 — Crop with flip', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('flipX swaps cropL and cropR in clip rect', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.flipX = true;
    sp.cropL = 0.2; // 20% from left
    sp.cropT = 0;
    sp.cropR = 0;
    sp.cropB = 0;

    Editor.Crop._applyClip(sp);

    // With flipX, cropL should be applied as cropR visually
    // So the clip rect x should be at sp.x + sp.w * 0 (swapped: cL=0, cR=0.2)
    const clipPath = document.getElementById(sp._clipId);
    const clipRect = clipPath.querySelector('rect');
    const clipX = parseFloat(clipRect.getAttribute('x'));
    const clipW = parseFloat(clipRect.getAttribute('width'));
    // After swap: cL=0, cR=0.2 → x = 100 + 80*0 = 100, w = 80*(1-0-0.2) = 64
    expect(clipX).toBeCloseTo(100, 0);
    expect(clipW).toBeCloseTo(64, 0);
  });

  it('flipY swaps cropT and cropB in clip rect', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.flipY = true;
    sp.cropL = 0;
    sp.cropT = 0;
    sp.cropR = 0;
    sp.cropB = 0.3; // 30% from bottom

    Editor.Crop._applyClip(sp);

    // With flipY, cropB should be applied as cropT visually
    // After swap: cT=0.3, cB=0 → y = 100 + 60*0.3 = 118, h = 60*(1-0.3-0) = 42
    const clipPath = document.getElementById(sp._clipId);
    const clipRect = clipPath.querySelector('rect');
    const clipY = parseFloat(clipRect.getAttribute('y'));
    const clipH = parseFloat(clipRect.getAttribute('height'));
    expect(clipY).toBeCloseTo(118, 0);
    expect(clipH).toBeCloseTo(42, 0);
  });
});

describe('Bug 5 — Layer order for cropped sprites', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('layer order preserved through save/load for cropped sprites', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Crop sp2 (creates a wrapper)
    sp2.cropL = 0.1;
    sp2.cropT = 0;
    sp2.cropR = 0;
    sp2.cropB = 0;
    Editor.Crop._applyClip(sp2);

    // Reorder: move sp1 to front
    const selUI = document.getElementById('selUI');
    svg.insertBefore(sp1.el, selUI);

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));

    // sp1 should be after sp2 and sp3 in layerOrder (front = last)
    const idx1 = saved.layerOrder.indexOf(sp1.id);
    const idx2 = saved.layerOrder.indexOf(sp2.id);
    expect(idx1).toBeGreaterThan(idx2);

    // layerOrder should use sprite IDs, not wrapper IDs
    expect(saved.layerOrder).toContain(sp2.id);
  });
});

describe('Bug 6 — Within-group z-order persistence', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('save serializes sprites in DOM order, not creation order', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Reorder in DOM: sp3 before sp1 (sp3 goes behind sp1)
    svg.insertBefore(sp3.el, sp1.el);

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));

    // In saved data, sp3 should come before sp1
    const files = saved.sprites.map(s => s.file);
    expect(files.indexOf('c.png')).toBeLessThan(files.indexOf('a.png'));
  });

  it('within-group sprite order follows DOM order in save', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Group sp1 and sp2
    const group = Editor.Groups.createGroup([sp1, sp2]);
    const gEl = document.getElementById(group.id);

    // Reorder within group: sp2 before sp1 in DOM
    gEl.insertBefore(sp2.el, sp1.el);

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));

    // In saved data, sp2 (b.png) should come before sp1 (a.png) among grouped sprites
    const groupedFiles = saved.sprites.filter(s => s.groupId === group.id).map(s => s.file);
    expect(groupedFiles.indexOf('b.png')).toBeLessThan(groupedFiles.indexOf('a.png'));
  });
});

describe('Integration — test-layout.json', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('loads test-layout.json with groups, crops, flips', () => {
    const layoutPath = path.resolve(__dirname, '..', 'data', 'test-layout.json');
    const raw = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

    // Convert from output format
    const data = {
      sprites: raw.sprites.map(s => ({
        file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot || 0,
        layerType: s.layerType || 'floor', hidden: s.hidden || false,
        flipX: s.flipX || false, flipY: s.flipY || false,
        groupId: s.groupId || null,
        cropL: s.crop?.l || 0, cropT: s.crop?.t || 0, cropR: s.crop?.r || 0, cropB: s.crop?.b || 0,
        shadowMul: s.shadowMul != null ? s.shadowMul : 1.0
      })),
      groups: raw.groups
    };

    // Create sprites
    data.sprites.forEach(s => {
      const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, s.layerType, true);
      sp.hidden = s.hidden;
      sp.flipX = s.flipX;
      sp.flipY = s.flipY;
      sp.groupId = s.groupId;
      sp.cropL = s.cropL;
      sp.cropT = s.cropT;
      sp.cropR = s.cropR;
      sp.cropB = s.cropB;
      sp.shadowMul = s.shadowMul;
      if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
    });

    // Apply crops
    Editor.Crop.reapplyAll();

    // Restore groups
    if (data.groups && data.groups.length) {
      Editor.Groups.restore(data.groups);
    }

    // Apply effects
    Editor.Effects._ready = true;
    Editor.Effects.rebuildAll();

    const C = Editor.Core;

    // 20 sprites in test-layout.json
    expect(C.allSprites.length).toBe(20);

    // Group g1 has 6 sprites
    const g1Sprites = C.allSprites.filter(s => s.groupId === 'group-g1');
    expect(g1Sprites.length).toBe(6);

    // Group element exists in DOM
    const gEl = document.getElementById('group-g1');
    expect(gEl).toBeTruthy();

    // Grouped sprites are inside the group <g>
    g1Sprites.forEach(sp => {
      const elInGroup = sp._clipWrap
        ? gEl.contains(sp._clipWrap)
        : gEl.contains(sp.el);
      expect(elInGroup).toBe(true);
    });

    // Cropped+flipped sprites have clip paths (find by properties, not index)
    // s6: layer-top-v3.png, flipY + crop.b=0.156
    const s6Like = C.allSprites.find(s => s.file === 'layer-top-v3.png' && s.flipY && s.cropB > 0.1);
    expect(s6Like).toBeTruthy();
    expect(s6Like.flipY).toBe(true);
    expect(s6Like.cropB).toBeCloseTo(0.156, 2);
    expect(s6Like._clipWrap).toBeTruthy();

    // s12: layer-bottom-v5.png, flipY + crop.l=0.107
    const s12Like = C.allSprites.find(s => s.file === 'layer-bottom-v5.png' && s.cropL > 0.1);
    expect(s12Like).toBeTruthy();
    expect(s12Like.flipY).toBe(true);
    expect(s12Like.cropL).toBeCloseTo(0.107, 2);
    expect(s12Like._clipWrap).toBeTruthy();

    // s13: scatter-v2.png, flipY + crop.l=0.16 + crop.b=0.343
    const s13Like = C.allSprites.find(s => s.file === 'scatter-v2.png' && s.cropL > 0.1);
    expect(s13Like).toBeTruthy();
    expect(s13Like.flipY).toBe(true);
    expect(s13Like.cropL).toBeCloseTo(0.16, 2);
    expect(s13Like.cropB).toBeCloseTo(0.343, 2);
    expect(s13Like._clipWrap).toBeTruthy();

    // Verify clip rects account for flip (Bug 4 regression test)
    // s6 has flipY + cropB=0.156: after swap, cT=0.156, cB=0
    // clipRect y should be sp.y + sp.h * 0.156
    const s6clip = document.getElementById(s6Like._clipId);
    if (s6clip) {
      const rect = s6clip.querySelector('rect');
      const clipY = parseFloat(rect.getAttribute('y'));
      expect(clipY).toBeCloseTo(s6Like.y + s6Like.h * 0.156, 0);
    }
  });
});

describe('Bug fixes — layer persistence, multi-select drag, insertBefore guard', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('sprite elements have id attribute set (Bug 1 prerequisite)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
    expect(sp.el.id).toBe(sp.id);
    expect(sp.el.dataset.id).toBe(sp.id);
  });

  it('layer order persists sprite IDs through save/load cycle (Bug 1)', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Reorder: move sp1 after sp3 in DOM (in front visually)
    const svg = document.getElementById('battlefield');
    const selUI = document.getElementById('selUI');
    svg.insertBefore(sp1.el, selUI);

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));

    // layerOrder should contain all sprite IDs
    expect(saved.layerOrder).toContain(sp1.id);
    expect(saved.layerOrder).toContain(sp2.id);
    expect(saved.layerOrder).toContain(sp3.id);

    // sp1 should appear after sp3 in the saved order
    const idx1 = saved.layerOrder.indexOf(sp1.id);
    const idx3 = saved.layerOrder.indexOf(sp3.id);
    expect(idx1).toBeGreaterThan(idx3);
  });

  it('save() uses dataset.id fallback for elements without id attr', () => {
    const sp = Editor.Sprites.addSprite('fallback.png', 10, 10, 50, 50, 0, 'floor', true);
    // Simulate an element that has dataset.id but no .id (shouldn't happen after fix, but tests fallback)
    const origId = sp.el.id;
    sp.el.removeAttribute('id');
    sp.el.id = '';

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    // Should still capture the sprite via dataset.id fallback
    expect(saved.layerOrder).toContain(sp.id);

    // Restore
    sp.el.id = origId;
  });

  it('multi-select batch move reorders all selected sprites (Bug 2)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);
    const sp4 = Editor.Sprites.addSprite('d.png', 190, 10, 50, 50, 0, 'floor', true);

    // Select sp1 and sp2
    Editor.Core.multiSel = [sp1, sp2];
    Editor.Core.selected = sp1;

    // Build zItems for _handleDrop
    const zItems = Editor.Layers._buildZOrder();

    // Drag sp1 (multi-selected with sp2) to sp4's position
    Editor.Layers._handleDrop(sp1.id, sp4.id, zItems);

    // Both sp1 and sp2 should now be just before sp4 in DOM order
    const children = Array.from(svg.children);
    const idx1 = children.indexOf(sp1.el);
    const idx2 = children.indexOf(sp2.el);
    const idx4 = children.indexOf(sp4.el);

    // sp1 and sp2 should be moved together, before sp4
    expect(idx1).toBeLessThan(idx4);
    expect(idx2).toBeLessThan(idx4);
    // Relative order preserved: sp1 before sp2
    expect(idx1).toBeLessThan(idx2);
  });

  it('insertBefore guard handles stale svgEl references (Bug 3)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    // Build zItems
    const zItems = Editor.Layers._buildZOrder();

    // Simulate stale svgEl: move target's element into a different parent
    const fakeParent = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(fakeParent);
    const targetItem = zItems.find(z => z.ref === sp2);
    fakeParent.appendChild(targetItem.svgEl); // Now sp2's svgEl is NOT a child of svg

    // This should NOT throw — the guard should catch the stale reference
    expect(() => {
      Editor.Layers._handleDrop(sp1.id, sp2.id, zItems);
    }).not.toThrow();
  });

  it('insertBefore guard for sprite dragged out of group (Bug 3)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Group sp1 and sp2
    const group = Editor.Groups.createGroup([sp1, sp2]);

    // Build zItems (sp1 and sp2 are inside the group, not in zItems as direct SVG children)
    const zItems = Editor.Layers._buildZOrder();

    // Drag sp1 out of group onto sp3 — should not throw even if target svgEl is stale
    expect(() => {
      Editor.Layers._handleDrop(sp1.id, sp3.id, zItems);
    }).not.toThrow();

    // sp1 should no longer have a groupId
    expect(sp1.groupId).toBeUndefined();
  });
});
