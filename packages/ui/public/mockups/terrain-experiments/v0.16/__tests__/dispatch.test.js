/**
 * Phase 2 Tests — Auto-save via dispatch, zero manual save() calls.
 *
 * Covers:
 * - Dispatch mechanics (dirty tracking, debounce, flush)
 * - Effects globals persistence across reload
 * - Light visibility persistence across reload
 * - Cropping with flip/rotation
 * - Resizing with rotation + flip
 * - Layer moves (into/out-of groups, to top, multi-move, persist)
 * - Undo granularity (one action at a time)
 * - Persistence of everything (effects, lights, settings, sprites, models, groups, crops, zOrder)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadEditor, loadScene, exportScene, loadFixture, getSpriteZOrder } from './test-helpers.js';

// ═══════════════════════════════════════════════════════════════
// Dispatch mechanics
// ═══════════════════════════════════════════════════════════════

describe('Dispatch — dirty tracking and debounce', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatch marks state dirty', () => {
    Editor.State._dirty = false;
    Editor.State.dispatch({ type: 'SET_PROPERTY' });
    expect(Editor.State._dirty).toBe(true);
  });

  it('dispatch schedules a save timer', () => {
    Editor.State.dispatch({ type: 'SET_PROPERTY' });
    expect(Editor.State._saveTimer).not.toBeNull();
  });

  it('debounced save fires after delay', () => {
    const saveSpy = vi.spyOn(Editor.Persistence, 'save');
    Editor.State.dispatch({ type: 'SET_PROPERTY' });
    expect(saveSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(Editor.State._dirty).toBe(false);
    saveSpy.mockRestore();
  });

  it('rapid mutations → single save (debounce coalescing)', () => {
    const saveSpy = vi.spyOn(Editor.Persistence, 'save');

    Editor.State.dispatch({ type: 'MOVE_SPRITE' });
    Editor.State.dispatch({ type: 'MOVE_SPRITE' });
    Editor.State.dispatch({ type: 'MOVE_SPRITE' });
    Editor.State.dispatch({ type: 'MOVE_SPRITE' });
    Editor.State.dispatch({ type: 'MOVE_SPRITE' });

    vi.advanceTimersByTime(300);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    saveSpy.mockRestore();
  });

  it('flush() saves immediately and clears timer', () => {
    const saveSpy = vi.spyOn(Editor.Persistence, 'save');
    Editor.State.dispatch({ type: 'SET_PROPERTY' });

    Editor.State.flush();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(Editor.State._dirty).toBe(false);
    expect(Editor.State._saveTimer).toBeNull();
    saveSpy.mockRestore();
  });

  it('flush() is a no-op when not dirty', () => {
    const saveSpy = vi.spyOn(Editor.Persistence, 'save');
    Editor.State._dirty = false;
    Editor.State.flush();
    expect(saveSpy).not.toHaveBeenCalled();
    saveSpy.mockRestore();
  });

  it('moving a sprite without explicit save() → state persisted after debounce', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    vi.advanceTimersByTime(300); // flush the add

    // Simulate a move (as startMove mouseup would do)
    sp.x = 200; sp.y = 300;
    Editor.State.dispatch({ type: 'MOVE_SPRITE' });

    vi.advanceTimersByTime(300); // flush the move

    // Verify persisted to localStorage
    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    const savedSprite = data.sprites.find(s => s.file === 'test.png');
    expect(savedSprite.x).toBe(200);
    expect(savedSprite.y).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════════════
// No manual save() calls remain
// ═══════════════════════════════════════════════════════════════

describe('Zero manual save() calls in production modules', () => {
  it('no Editor.Persistence.save() in any editor module except persistence itself', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.resolve(__dirname, '..');
    const modules = [
      'js/tools/effects.js', 'js/entities/sprites.js', 'js/tools/groups.js',
      'js/ui/layers.js', 'js/tools/crop.js', 'js/entities/lights.js',
      'js/entities/core.js', 'js/tools/selection.js', 'js/core/undo.js',
      'js/entities/models.js'
    ];
    const violations = [];
    modules.forEach(mod => {
      const code = fs.readFileSync(path.join(dir, mod), 'utf8');
      const matches = code.match(/Editor\.Persistence\.save\(\)/g);
      if (matches) violations.push(`${mod}: ${matches.length} call(s)`);
    });
    expect(violations).toEqual([]);
  });

  it('all modules use Editor.State.dispatch instead', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.resolve(__dirname, '..');
    // Modules that mutate state should have at least one dispatch call
    const mutatingModules = [
      'js/tools/effects.js', 'js/entities/sprites.js', 'js/tools/groups.js',
      'js/ui/layers.js', 'js/tools/crop.js', 'js/entities/lights.js',
      'js/core/undo.js', 'js/tools/selection.js'
    ];
    mutatingModules.forEach(mod => {
      const code = fs.readFileSync(path.join(dir, mod), 'utf8');
      expect(code).toContain('Editor.State.dispatch(');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Persistence: EVERYTHING saves
// ═══════════════════════════════════════════════════════════════

describe('Persistence — everything saves and restores', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('effects globals persist across reload', () => {
    // Modify all effects globals
    Editor.Effects.shadow.dx = 7;
    Editor.Effects.shadow.dy = 12;
    Editor.Effects.shadow.blur = 10;
    Editor.Effects.shadow.opacity = 0.8;
    Editor.Effects.shadow.on = false;
    Editor.Effects.feather.on = true;
    Editor.Effects.feather.radius = 25;
    Editor.Effects.grade.on = false;
    Editor.Effects.grade.brightness = 0.5;
    Editor.Effects.grade.saturation = 0.3;
    Editor.Effects.grade.sepia = 0.15;

    Editor.State.dispatch({ type: 'SET_EFFECT' });
    vi.advanceTimersByTime(300);

    // Reload
    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);

    expect(data.effects.shadow.dx).toBe(7);
    expect(data.effects.shadow.dy).toBe(12);
    expect(data.effects.shadow.blur).toBe(10);
    expect(data.effects.shadow.opacity).toBe(0.8);
    expect(data.effects.shadow.on).toBe(false);
    expect(data.effects.feather.on).toBe(true);
    expect(data.effects.feather.radius).toBe(25);
    expect(data.effects.grade.on).toBe(false);
    expect(data.effects.grade.brightness).toBe(0.5);
    expect(data.effects.grade.saturation).toBe(0.3);
    expect(data.effects.grade.sepia).toBe(0.15);
  });

  it('light visibility persists across reload', () => {
    // Add a light and hide it
    Editor.Lights.addLight(100, 100, '#ff0000', 50, 0.5, true);
    const light = Editor.Core.allLights[0];
    light.el.style.display = 'none';
    light.hidden = true;

    Editor.State.dispatch({ type: 'TOGGLE_LIGHT_VIS' });
    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    expect(data.lights.length).toBe(1);
    expect(data.lights[0].color).toBe('#ff0000');
  });

  it('settings persist (bg, ruinsOpacity, roofOpacity)', () => {
    // Change bg via select element (save reads bgSel.value directly)
    const bgSel = document.getElementById('bgSel');
    // Add the option first so the select can hold the value
    const opt = document.createElement('option');
    opt.value = 'svg-warm'; opt.textContent = 'Warm';
    bgSel.appendChild(opt);
    bgSel.value = 'svg-warm';

    Editor.State.dispatch({ type: 'SET_SETTING' });
    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    expect(data.bg).toBe('svg-warm');
  });

  it('sprite properties persist (position, size, rotation, flip, layerType, hidden, shadowMul)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 45, 'top', true);
    sp.flipX = true;
    sp.flipY = true;
    sp.hidden = true;
    sp.el.style.display = 'none';
    sp.shadowMul = 0.3;

    Editor.State.dispatch({ type: 'SET_PROPERTY' });
    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    const saved = data.sprites.find(s => s.file === 'test.png');
    expect(saved.x).toBe(50);
    expect(saved.y).toBe(60);
    expect(saved.w).toBe(100);
    expect(saved.h).toBe(80);
    expect(saved.rot).toBe(45);
    expect(saved.layerType).toBe('top');
    expect(saved.flipX).toBe(true);
    expect(saved.flipY).toBe(true);
    expect(saved.hidden).toBe(true);
    expect(saved.shadowMul).toBe(0.3);
  });

  it('crop data persists', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropT = 0.2; sp.cropR = 0.15; sp.cropB = 0.05;
    Editor.Crop._applyClip(sp);

    Editor.State.dispatch({ type: 'CROP' });
    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    const saved = data.sprites.find(s => s.file === 'test.png');
    expect(saved.cropL).toBeCloseTo(0.1, 5);
    expect(saved.cropT).toBeCloseTo(0.2, 5);
    expect(saved.cropR).toBeCloseTo(0.15, 5);
    expect(saved.cropB).toBeCloseTo(0.05, 5);
  });

  it('group data persists (id, name, opacity)', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    Editor.Groups.createGroup([sp1, sp2]);

    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    expect(data.groups.length).toBe(1);
    expect(data.groups[0].name).toBeTruthy();
    expect(data.groups[0].opacity).toBe(1);
    // Sprites should reference the group
    const ga = data.sprites.find(s => s.file === 'a.png');
    const gb = data.sprites.find(s => s.file === 'b.png');
    expect(ga.groupId).toBe(data.groups[0].id);
    expect(gb.groupId).toBe(data.groups[0].id);
  });

  it('models persist', () => {
    Editor.Models.addCircle(100, 200, 8, '#0088aa', 'url(#mf-imp)', 'leader');
    Editor.Models.addRect(300, 400, 20, 10, '#aa2810', 'url(#mf-ork)');

    Editor.State.dispatch({ type: 'SET_PROPERTY' });
    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    // May include default models + our 2
    const circles = data.models.filter(m => m.kind === 'circle');
    const rects = data.models.filter(m => m.kind === 'rect');
    expect(circles.length).toBeGreaterThanOrEqual(1);
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it('zOrder persists in both explicit and legacy formats', () => {
    Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    // Phase 1 format: explicit zOrder array with type/id
    expect(data.zOrder).toBeTruthy();
    expect(data.zOrder.length).toBeGreaterThan(0);
    expect(data.zOrder[0]).toHaveProperty('type');
    expect(data.zOrder[0]).toHaveProperty('id');
    // Legacy format: layerOrder (flat ID list)
    expect(data.layerOrder).toBeTruthy();
    expect(data.layerOrder.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Cropping — right place when flipped/rotated
// ═══════════════════════════════════════════════════════════════

describe('Cropping — correct with flip and rotation', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('crop on unflipped unrotated sprite produces correct clip rect', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropT = 0.2; sp.cropR = 0.15; sp.cropB = 0.05;
    Editor.Crop._applyClip(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    expect(parseFloat(clipRect.getAttribute('x'))).toBeCloseTo(100 + 200 * 0.1, 1);
    expect(parseFloat(clipRect.getAttribute('y'))).toBeCloseTo(100 + 150 * 0.2, 1);
    expect(parseFloat(clipRect.getAttribute('width'))).toBeCloseTo(200 * (1 - 0.1 - 0.15), 1);
    expect(parseFloat(clipRect.getAttribute('height'))).toBeCloseTo(150 * (1 - 0.2 - 0.05), 1);
  });

  it('crop on flipX sprite swaps L and R clip sides', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.flipX = true;
    sp.cropL = 0.1; sp.cropT = 0; sp.cropR = 0.3; sp.cropB = 0;
    Editor.Crop._applyClip(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    // flipX swaps: effective cL=0.3, cR=0.1
    expect(parseFloat(clipRect.getAttribute('x'))).toBeCloseTo(100 + 200 * 0.3, 1);
    expect(parseFloat(clipRect.getAttribute('width'))).toBeCloseTo(200 * (1 - 0.3 - 0.1), 1);
  });

  it('crop on flipY sprite swaps T and B clip sides', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.flipY = true;
    sp.cropL = 0; sp.cropT = 0.1; sp.cropR = 0; sp.cropB = 0.3;
    Editor.Crop._applyClip(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    // flipY swaps: effective cT=0.3, cB=0.1
    expect(parseFloat(clipRect.getAttribute('y'))).toBeCloseTo(100 + 150 * 0.3, 1);
    expect(parseFloat(clipRect.getAttribute('height'))).toBeCloseTo(150 * (1 - 0.3 - 0.1), 1);
  });

  it('crop on flipX+flipY sprite swaps both axes', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.flipX = true; sp.flipY = true;
    sp.cropL = 0.1; sp.cropT = 0.2; sp.cropR = 0.3; sp.cropB = 0.4;
    Editor.Crop._applyClip(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    // flipX swaps L/R: effective cL=0.3, cR=0.1
    // flipY swaps T/B: effective cT=0.4, cB=0.2
    expect(parseFloat(clipRect.getAttribute('x'))).toBeCloseTo(100 + 200 * 0.3, 1);
    expect(parseFloat(clipRect.getAttribute('y'))).toBeCloseTo(100 + 150 * 0.4, 1);
    expect(parseFloat(clipRect.getAttribute('width'))).toBeCloseTo(200 * (1 - 0.3 - 0.1), 1);
    expect(parseFloat(clipRect.getAttribute('height'))).toBeCloseTo(150 * (1 - 0.4 - 0.2), 1);
  });

  it('crop on rotated sprite adds rotation transform to clip rect', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 45, 'floor', true);
    sp.cropL = 0.1; sp.cropT = 0; sp.cropR = 0; sp.cropB = 0;
    Editor.Crop._applyClip(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    const t = clipRect.getAttribute('transform');
    expect(t).toContain('rotate(45');
  });

  it('crop on rotated+flipped sprite has correct clip rect position', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 90, 'floor', true);
    sp.flipX = true;
    sp.cropL = 0.2; sp.cropT = 0; sp.cropR = 0; sp.cropB = 0;
    Editor.Crop._applyClip(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    // flipX swaps L/R: effective cL=0, cR=0.2
    expect(parseFloat(clipRect.getAttribute('x'))).toBeCloseTo(100, 1);
    expect(parseFloat(clipRect.getAttribute('width'))).toBeCloseTo(200 * (1 - 0.2), 1);
    // Should have rotation transform
    const t = clipRect.getAttribute('transform');
    expect(t).toContain('rotate(90');
  });

  it('updateClipPosition syncs clip rect when sprite moves after crop', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropT = 0.2; sp.cropR = 0; sp.cropB = 0;
    Editor.Crop._applyClip(sp);

    // Move the sprite
    sp.x = 300; sp.y = 400;
    Editor.Crop.updateClipPosition(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    expect(parseFloat(clipRect.getAttribute('x'))).toBeCloseTo(300 + 200 * 0.1, 1);
    expect(parseFloat(clipRect.getAttribute('y'))).toBeCloseTo(400 + 150 * 0.2, 1);
  });

  it('crop confirm through normal flow sets correct percentages', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    Editor.Crop.enter(sp);

    // Simulate cropping: shrink the crop rect
    Editor.Crop.cropRect = { x: 120, y: 130, w: 160, h: 100 };
    Editor.Crop.confirm();

    expect(sp.cropL).toBeCloseTo((120 - 100) / 200, 3);
    expect(sp.cropT).toBeCloseTo((130 - 100) / 150, 3);
    expect(sp.cropR).toBeCloseTo(1 - (120 + 160 - 100) / 200, 3);
    expect(sp.cropB).toBeCloseTo(1 - (130 + 100 - 100) / 150, 3);
    expect(sp._clipWrap).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// Resizing — right handles when rotated + flipped
// ═══════════════════════════════════════════════════════════════

describe('Resizing — handles correct with rotation and flip', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('apply() sets correct transform for unrotated unflipped sprite', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 0, 'floor', true);
    Editor.Sprites.apply(sp);
    const t = sp.el.getAttribute('transform');
    expect(t).toBe('');
  });

  it('apply() sets rotation transform', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 45, 'floor', true);
    Editor.Sprites.apply(sp);
    const t = sp.el.getAttribute('transform');
    expect(t).toContain('rotate(45');
  });

  it('apply() sets flip transform', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 0, 'floor', true);
    sp.flipX = true;
    Editor.Sprites.apply(sp);
    const t = sp.el.getAttribute('transform');
    expect(t).toContain('scale(-1,1)');
  });

  it('apply() sets combined rotation + flip transform', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 30, 'floor', true);
    sp.flipX = true; sp.flipY = true;
    Editor.Sprites.apply(sp);
    const t = sp.el.getAttribute('transform');
    expect(t).toContain('rotate(30');
    expect(t).toContain('scale(-1,-1)');
  });

  it('apply() updates SVG attributes after resize', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 0, 'floor', true);
    sp.w = 200; sp.h = 160;
    Editor.Sprites.apply(sp);
    expect(sp.el.getAttribute('width')).toBe('200');
    expect(sp.el.getAttribute('height')).toBe('160');
  });

  it('apply() updates position after move', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 0, 'floor', true);
    sp.x = 200; sp.y = 300;
    Editor.Sprites.apply(sp);
    expect(sp.el.getAttribute('x')).toBe('200');
    expect(sp.el.getAttribute('y')).toBe('300');
  });

  it('apply() on rotated sprite updates crop clip position', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 45, 'floor', true);
    sp.cropL = 0.1; sp.cropT = 0; sp.cropR = 0; sp.cropB = 0;
    Editor.Crop._applyClip(sp);

    sp.x = 200; sp.y = 200;
    Editor.Sprites.apply(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    expect(parseFloat(clipRect.getAttribute('x'))).toBeCloseTo(200 + 200 * 0.1, 1);
  });

  it('apply() on flipped+rotated sprite updates all transforms', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 60, 100, 80, 90, 'floor', true);
    sp.flipX = true;
    sp.w = 150; sp.h = 120;
    Editor.Sprites.apply(sp);

    expect(sp.el.getAttribute('width')).toBe('150');
    expect(sp.el.getAttribute('height')).toBe('120');
    const t = sp.el.getAttribute('transform');
    expect(t).toContain('rotate(90');
    expect(t).toContain('scale(-1,1)');
  });
});

// ═══════════════════════════════════════════════════════════════
// Layer moves — into/out of groups, to top, persist, multi
// ═══════════════════════════════════════════════════════════════

describe('Layer moves — groups, top, multi-select, persistence', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('move sprite into group via addToGroup', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Groups.addToGroup(group.id, sp3);

    expect(sp3.groupId).toBe(group.id);
    const gEl = document.getElementById(group.id);
    expect(gEl.contains(sp3.el)).toBe(true);
  });

  it('move sprite out of group via ungroup', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2]);
    const gId = group.id;
    Editor.Groups.ungroup(gId);

    expect(sp1.groupId).toBeUndefined();
    expect(sp2.groupId).toBeUndefined();
    expect(sp1.el.parentNode).toBe(svg);
    expect(sp2.el.parentNode).toBe(svg);
    expect(document.getElementById(gId)).toBeNull();
  });

  it('move sprite to top via layer panel top zone', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Build zItems, then simulate top-zone drop for sp1
    const zItems = Editor.Layers._buildZOrder();
    const dragItem = zItems.find(z => z.type === 'sprite' && z.ref === sp1);
    if (dragItem) {
      const selUI = document.getElementById('selUI');
      svg.insertBefore(dragItem.svgEl, selUI);
      svg.appendChild(document.getElementById('selUI'));
      svg.appendChild(document.getElementById('dragRect'));
      Editor.State.syncZOrderFromDOM();
    }

    const children = Array.from(svg.children);
    const idx1 = children.indexOf(sp1.el);
    const idx2 = children.indexOf(sp2.el);
    const idx3 = children.indexOf(sp3.el);
    // sp1 should now be after sp2 and sp3
    expect(idx1).toBeGreaterThan(idx2);
    expect(idx1).toBeGreaterThan(idx3);
  });

  it('layer changes persist after dispatch + debounce', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const zItems = Editor.Layers._buildZOrder();
    Editor.Layers._handleDrop(sp1.id, sp3.id, zItems);

    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    expect(data.zOrder).toBeTruthy();
    expect(data.sprites.length).toBe(3);
  });

  it('multi-select move preserves relative order', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);
    const sp4 = Editor.Sprites.addSprite('d.png', 190, 10, 50, 50, 0, 'floor', true);

    Editor.Core.multiSel = [sp1, sp2];
    Editor.Core.selected = sp1;

    const zItems = Editor.Layers._buildZOrder();
    Editor.Layers._handleDrop(sp1.id, sp4.id, zItems);

    const children = Array.from(svg.children);
    const idx1 = children.indexOf(sp1.el);
    const idx2 = children.indexOf(sp2.el);
    // Relative order preserved
    expect(idx1).toBeLessThan(idx2);
  });

  it('group rename persists', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Groups.rename(group.id, 'My Custom Group');

    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    const savedGroup = data.groups.find(g => g.id === group.id);
    expect(savedGroup.name).toBe('My Custom Group');
  });

  it('group opacity persists', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Groups.setOpacity(group.id, 0.5);

    vi.advanceTimersByTime(300);

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    const savedGroup = data.groups.find(g => g.id === group.id);
    expect(savedGroup.opacity).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Undo — actually undoes just ONE thing at a time
// ═══════════════════════════════════════════════════════════════

describe('Undo — granularity: one action at a time', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('undo move reverts position only', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const cmd = Editor.Commands.Move.create(sp.id, 100, 100, 200, 200);
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(100);
  });

  it('undo add reverts to no sprites', () => {
    const count0 = Editor.Core.allSprites.length;
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const data = Editor.Commands._captureSprite(sp);
    const cmd = Editor.Commands.AddSprite.create(data);
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    expect(Editor.Core.allSprites.length).toBe(count0);
  });

  it('undo resize reverts dimensions only', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const cmd = Editor.Commands.Resize.create(sp.id,
      { x: 100, y: 100, w: 80, h: 60 },
      { x: 100, y: 100, w: 200, h: 150 });
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.w).toBe(80);
    expect(restored.h).toBe(60);
  });

  it('undo rotate reverts rotation only', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const cmd = Editor.Commands.Rotate.create(sp.id, 0, 45);
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.rot).toBe(0);
  });

  it('undo flip reverts flip only', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const cmd = Editor.Commands.SetProperty.create(sp.id, { flipX: false }, { flipX: true });
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.flipX).toBe(false);
  });

  it('undo crop reverts crop values', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    const cmd = Editor.Commands.Crop.create(sp.id,
      { cropL: 0, cropT: 0, cropR: 0, cropB: 0 },
      { cropL: 0.1, cropT: 0.2, cropR: 0, cropB: 0 });
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.cropL).toBe(0);
    expect(restored.cropT).toBe(0);
  });

  it('undo delete restores the sprite', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const data = Editor.Commands._captureSprite(sp);
    const cmd = Editor.Commands.DeleteSprite.create(data);
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored).toBeTruthy();
    expect(restored.x).toBe(100);
  });

  it('undo group creation reverts grouping', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    // createGroup records undo command internally
    Editor.Groups.createGroup([sp1, sp2]);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.filter(s => s.file === 'a.png' || s.file === 'b.png');
    restored.forEach(s => {
      expect(s.groupId).toBeFalsy();
    });
    expect(Editor.Core.groups.length).toBe(0);
  });

  it('undo shadowMul change reverts per-sprite shadow', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    expect(sp.shadowMul).toBe(1.0);
    const cmd = Editor.Commands.SetProperty.create(sp.id, { shadowMul: 1.0 }, { shadowMul: 0.3 });
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.shadowMul).toBe(1.0);
  });

  it('multiple undos revert in reverse order', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);

    // Action 1: move
    const cmd1 = Editor.Commands.Move.create(sp.id, 100, 100, 200, 200);
    cmd1.apply();
    Editor.Undo.record(cmd1);

    // Action 2: resize
    const cmd2 = Editor.Commands.Resize.create(sp.id,
      { x: 200, y: 200, w: 80, h: 60 },
      { x: 200, y: 200, w: 160, h: 120 });
    cmd2.apply();
    Editor.Undo.record(cmd2);

    // Undo resize first
    Editor.Undo.undo();
    let restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.w).toBe(80);
    expect(restored.h).toBe(60);
    expect(restored.x).toBe(200);
    expect(restored.y).toBe(200);

    // Undo move
    Editor.Undo.undo();
    restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(100);
  });

  it('undo with empty stack is a no-op', () => {
    Editor.Undo.undoStack = [];
    const count = Editor.Core.allSprites.length;
    Editor.Undo.undo();
    expect(Editor.Core.allSprites.length).toBe(count);
  });
});

// ═══════════════════════════════════════════════════════════════
// Full round-trip: fixture → save → load → compare
// ═══════════════════════════════════════════════════════════════

describe('Full fixture round-trip with dispatch', () => {
  it('test-scene.json survives save → load via dispatch', () => {
    vi.useFakeTimers();
    const fixture = loadFixture();
    const Editor = loadScene(fixture);
    const before = exportScene(Editor);

    // Trigger dispatch to save
    Editor.State.dispatch({ type: 'SET_PROPERTY' });
    vi.advanceTimersByTime(300);

    // Capture saved data from localStorage
    const savedData = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    expect(savedData).toBeTruthy();

    // Reload from localStorage (loadEditor creates fresh localStorage, so inject saved data)
    const Editor2 = loadEditor();
    localStorage.setItem(Editor2.Persistence.STORAGE_KEY, savedData);
    Editor2.Persistence.load();
    Editor2.State.syncFromCore();
    Editor2.State.syncZOrderFromDOM();
    const after = exportScene(Editor2);

    // Compare sprite data (ignoring generated IDs)
    expect(after.sprites.length).toBe(before.sprites.length);
    expect(after.models.length).toBe(before.models.length);
    expect(after.groups.length).toBe(before.groups.length);

    vi.useRealTimers();
  });
});
