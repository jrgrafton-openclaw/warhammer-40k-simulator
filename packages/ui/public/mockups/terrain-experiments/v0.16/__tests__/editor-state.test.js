/**
 * Phase 1 — EditorState Tests
 *
 * Tests for the EditorState single source of truth, zOrder management,
 * cropping with transforms, resizing with rotation+flip, layer moves,
 * undo granularity, and persistence through EditorState.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor, loadScene, exportScene, getSpriteZOrder, assertSceneEqual, loadFixture } from './test-helpers.js';

// ═══════════════════════════════════════════════════════════════════
// EditorState basics
// ═══════════════════════════════════════════════════════════════════

describe('EditorState — core accessors', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('Editor.State exists after init', () => {
    expect(Editor.State).toBeDefined();
    expect(Editor.State.sprites).toBeDefined();
    expect(Editor.State.zOrder).toBeDefined();
  });

  it('findSprite returns correct sprite', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    Editor.State.syncFromCore();
    expect(Editor.State.findSprite(sp.id)).toBe(sp);
  });

  it('findSprite returns null for missing id', () => {
    Editor.State.syncFromCore();
    expect(Editor.State.findSprite('nonexistent')).toBeNull();
  });

  it('findGroup returns correct group', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.State.syncFromCore();
    expect(Editor.State.findGroup(group.id)).toBeTruthy();
    expect(Editor.State.findGroup(group.id).name).toBe(group.name);
  });

  it('findGroup returns null for missing id', () => {
    Editor.State.syncFromCore();
    expect(Editor.State.findGroup('nonexistent')).toBeNull();
  });

  it('getSpriteRootEl returns _clipWrap when cropped', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropR = 0.1;
    Editor.Crop.reapplyAll();
    expect(sp._clipWrap).toBeTruthy();
    expect(Editor.State.getSpriteRootEl(sp)).toBe(sp._clipWrap);
  });

  it('getSpriteRootEl returns el when not cropped', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    expect(Editor.State.getSpriteRootEl(sp)).toBe(sp.el);
  });

  // ── Phase 3: rootEl getter tests ──

  it('sp.rootEl returns el when uncropped', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    expect(sp.rootEl).toBe(sp.el);
  });

  it('sp.rootEl returns _clipWrap when cropped', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropR = 0.1;
    Editor.Crop.reapplyAll();
    expect(sp._clipWrap).toBeTruthy();
    expect(sp.rootEl).toBe(sp._clipWrap);
  });

  it('sp.rootEl falls back to el after uncrop', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropR = 0.1;
    Editor.Crop.reapplyAll();
    expect(sp.rootEl).toBe(sp._clipWrap);
    // Remove crop
    Editor.Crop._removeClip(sp);
    expect(sp._clipWrap).toBeNull();
    expect(sp.rootEl).toBe(sp.el);
  });

  it('getSpriteRootEl delegates to sp.rootEl', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    expect(Editor.State.getSpriteRootEl(sp)).toBe(sp.rootEl);
    sp.cropL = 0.1;
    Editor.Crop.reapplyAll();
    expect(Editor.State.getSpriteRootEl(sp)).toBe(sp.rootEl);
  });

  it('rootEl is not enumerable (does not pollute serialization)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    const keys = Object.keys(sp);
    expect(keys).not.toContain('rootEl');
  });

  it('syncFromCore copies all arrays by reference', () => {
    const sp = Editor.Sprites.addSprite('test.png', 10, 20, 100, 80, 0, 'floor', true);
    Editor.State.syncFromCore();
    expect(Editor.State.sprites).toBe(Editor.Core.allSprites);
    expect(Editor.State.models).toBe(Editor.Core.allModels);
    expect(Editor.State.lights).toBe(Editor.Core.allLights);
    expect(Editor.State.objectives).toBe(Editor.Core.allObjectives);
    expect(Editor.State.groups).toBe(Editor.Core.groups);
  });

  it('syncFromCore captures counters', () => {
    Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    Editor.State.syncFromCore();
    expect(Editor.State.counters.sid).toBe(Editor.Core.sid);
  });
});

// ═══════════════════════════════════════════════════════════════════
// zOrder management
// ═══════════════════════════════════════════════════════════════════

describe('EditorState — zOrder', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('syncZOrderFromDOM populates zOrder with sprites', () => {
    Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    const spriteEntries = Editor.State.zOrder.filter(e => e.type === 'sprite');
    expect(spriteEntries.length).toBe(2);
  });

  it('syncZOrderFromDOM includes builtin layers', () => {
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    const builtins = Editor.State.zOrder.filter(e => e.type === 'builtin');
    const builtinIds = builtins.map(e => e.id);
    expect(builtinIds).toContain('modelLayer');
    expect(builtinIds).toContain('lightLayer');
  });

  it('syncZOrderFromDOM includes custom groups', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    Editor.Groups.createGroup([sp1, sp2]);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    const groups = Editor.State.zOrder.filter(e => e.type === 'group');
    expect(groups.length).toBe(1);
    expect(groups[0].id).toMatch(/^group-g/);
  });

  it('grouped sprites are NOT in zOrder (they are children of the group)', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    Editor.Groups.createGroup([sp1, sp2]);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    const spriteEntries = Editor.State.zOrder.filter(e => e.type === 'sprite');
    // Both sprites are now in the group, so they should NOT appear as individual zOrder entries
    expect(spriteEntries.length).toBe(0);
  });

  it('zOrder matches expected order after mutations', () => {
    const spA = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    const spC = Editor.Sprites.addSprite('c.png', 120, 0, 50, 50, 0, 'floor', true);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();

    // Initial order: a, b, c (bottom to top)
    const spriteIds = Editor.State.zOrder.filter(e => e.type === 'sprite').map(e => e.id);
    expect(spriteIds).toEqual([spA.id, spB.id, spC.id]);
  });

  it('addSpriteToZOrder does not add duplicates', () => {
    const sp = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    const before = Editor.State.zOrder.length;
    Editor.State.addSpriteToZOrder(sp.id);
    expect(Editor.State.zOrder.length).toBe(before);
  });

  it('removeFromZOrder removes an entry', () => {
    const sp = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    Editor.State.removeFromZOrder(sp.id);
    expect(Editor.State.zOrder.find(e => e.id === sp.id)).toBeUndefined();
  });

  it('getZOrderedElements returns items from zOrder', () => {
    const sp = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    const items = Editor.State.getZOrderedElements();
    const spriteItems = items.filter(i => i.type === 'sprite');
    expect(spriteItems.length).toBe(1);
    expect(spriteItems[0].ref).toBe(sp);
  });

  it('zOrder persists through save/load cycle', () => {
    const spA = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    Editor.Persistence.save();

    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.zOrder).toBeDefined();
    expect(saved.zOrder.length).toBeGreaterThan(0);
    const spEntries = saved.zOrder.filter(e => e.type === 'sprite');
    expect(spEntries.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// zOrder with test fixture
// ═══════════════════════════════════════════════════════════════════

describe('EditorState — zOrder with fixture', () => {
  let fixture;

  beforeEach(() => {
    fixture = loadFixture();
  });

  it('zOrder populated after loadScene', () => {
    const Editor = loadScene(fixture);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    expect(Editor.State.zOrder.length).toBeGreaterThan(0);
  });

  it('zOrder contains ungrouped sprites and groups', () => {
    const Editor = loadScene(fixture);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    const spriteEntries = Editor.State.zOrder.filter(e => e.type === 'sprite');
    const groupEntries = Editor.State.zOrder.filter(e => e.type === 'group');
    // 20 sprites total, 6 in group-g1 → 14 ungrouped
    expect(spriteEntries.length).toBe(14);
    expect(groupEntries.length).toBe(1);
  });

  it('_buildZOrder uses EditorState when populated', () => {
    const Editor = loadScene(fixture);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    // _buildZOrder should now use the State path
    const items = Editor.Layers._buildZOrder();
    expect(items.length).toBeGreaterThan(0);
    // Should contain sprites, custom-groups, and builtin groups
    const types = new Set(items.map(i => i.type));
    expect(types.has('sprite')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cropping — right place even when flipped/rotated
// ═══════════════════════════════════════════════════════════════════

describe('Cropping — transforms', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('crop values preserved after round-trip', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropT = 0.05; sp.cropR = 0.2; sp.cropB = 0.15;
    Editor.Crop.reapplyAll();
    Editor.Persistence.save();

    // Reload
    Editor.Core.allSprites.forEach(s => {
      if (s._clipWrap) s._clipWrap.remove(); else s.el.remove();
    });
    Editor.Core.allSprites = [];
    Editor.Core.sid = 0;
    Editor.Persistence.load();

    const loaded = Editor.Core.allSprites[0];
    expect(loaded.cropL).toBeCloseTo(0.1, 3);
    expect(loaded.cropT).toBeCloseTo(0.05, 3);
    expect(loaded.cropR).toBeCloseTo(0.2, 3);
    expect(loaded.cropB).toBeCloseTo(0.15, 3);
  });

  it('clip rect accounts for flipX (cropL/cropR swap)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.flipX = true;
    sp.cropL = 0.2; sp.cropR = 0.0;
    Editor.Sprites.apply(sp);
    Editor.Crop._applyClip(sp);

    const clipPath = document.getElementById(sp._clipId);
    expect(clipPath).toBeTruthy();
    const clipRect = clipPath.querySelector('rect');
    // With flipX, cropL=0.2 should be applied as cropR visually
    // Internal: cL and cR are swapped → cL=0 (cropR), cR=0.2 (cropL)
    // x = sp.x + sp.w * 0 = 100, width = 200*(1-0-0.2) = 160
    const x = parseFloat(clipRect.getAttribute('x'));
    const w = parseFloat(clipRect.getAttribute('width'));
    expect(x).toBeCloseTo(100, 0);
    expect(w).toBeCloseTo(160, 0);
  });

  it('clip rect accounts for flipY (cropT/cropB swap)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.flipY = true;
    sp.cropT = 0.3; sp.cropB = 0.0;
    Editor.Sprites.apply(sp);
    Editor.Crop._applyClip(sp);

    const clipPath = document.getElementById(sp._clipId);
    const clipRect = clipPath.querySelector('rect');
    // With flipY, cropT=0.3 becomes cropB → cT=0 (cropB), cB=0.3 (cropT)
    const y = parseFloat(clipRect.getAttribute('y'));
    const h = parseFloat(clipRect.getAttribute('height'));
    expect(y).toBeCloseTo(100, 0);
    expect(h).toBeCloseTo(105, 0); // 150*(1-0-0.3)=105
  });

  it('clip rect includes rotation transform', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 45, 'floor', true);
    sp.cropL = 0.1;
    Editor.Crop._applyClip(sp);

    const clipPath = document.getElementById(sp._clipId);
    const clipRect = clipPath.querySelector('rect');
    const t = clipRect.getAttribute('transform');
    expect(t).toContain('rotate(45');
  });

  it('crop + flip + rotation all work together', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 50, 100, 80, 30, 'floor', true);
    sp.flipX = true;
    sp.flipY = true;
    sp.cropL = 0.15; sp.cropT = 0.1; sp.cropR = 0.05; sp.cropB = 0.2;
    Editor.Sprites.apply(sp);
    Editor.Crop._applyClip(sp);

    expect(sp._clipWrap).toBeTruthy();
    expect(sp._clipId).toBeTruthy();

    const clipPath = document.getElementById(sp._clipId);
    const clipRect = clipPath.querySelector('rect');
    const t = clipRect.getAttribute('transform');
    expect(t).toContain('rotate(30');

    // With flipX+flipY: L↔R, T↔B swap
    // cL=0.05 (original cropR), cR=0.15 (original cropL)
    // cT=0.2 (original cropB), cB=0.1 (original cropT)
    const x = parseFloat(clipRect.getAttribute('x'));
    const y = parseFloat(clipRect.getAttribute('y'));
    const w = parseFloat(clipRect.getAttribute('width'));
    const h = parseFloat(clipRect.getAttribute('height'));
    expect(x).toBeCloseTo(50 + 100 * 0.05, 0); // = 55
    expect(y).toBeCloseTo(50 + 80 * 0.2, 0);   // = 66
    expect(w).toBeCloseTo(100 * (1 - 0.05 - 0.15), 0); // = 80
    expect(h).toBeCloseTo(80 * (1 - 0.2 - 0.1), 0);    // = 56
  });

  it('crop survives round-trip when flipped', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.flipX = true;
    sp.cropL = 0.2; sp.cropR = 0.1; sp.cropT = 0.05; sp.cropB = 0.15;
    Editor.Sprites.apply(sp);
    Editor.Crop.reapplyAll();
    Editor.Persistence.save();

    Editor.Core.allSprites.forEach(s => {
      if (s._clipWrap) s._clipWrap.remove(); else s.el.remove();
    });
    Editor.Core.allSprites = [];
    Editor.Core.sid = 0;
    Editor.Persistence.load();
    Editor.Crop.reapplyAll();

    const loaded = Editor.Core.allSprites[0];
    expect(loaded.flipX).toBe(true);
    expect(loaded.cropL).toBeCloseTo(0.2, 3);
    expect(loaded.cropR).toBeCloseTo(0.1, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Resizing — handles even when rotated + flipped
// ═══════════════════════════════════════════════════════════════════

describe('Resizing — with rotation and flip', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('resize preserves position for unrotated sprite', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    const origX = sp.x, origY = sp.y;
    sp.w = 250; sp.h = 180;
    Editor.Sprites.apply(sp);
    expect(sp.x).toBe(origX);
    expect(sp.y).toBe(origY);
    expect(sp.w).toBe(250);
    expect(sp.h).toBe(180);
  });

  it('resize updates SVG attributes', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.w = 300; sp.h = 200;
    Editor.Sprites.apply(sp);
    expect(sp.el.getAttribute('width')).toBe('300');
    expect(sp.el.getAttribute('height')).toBe('200');
  });

  it('resize of rotated sprite keeps center', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 45, 'floor', true);
    const cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2;
    sp.w = 250; sp.h = 180;
    Editor.Sprites.apply(sp);
    // Transform should use the new center
    const t = sp.el.getAttribute('transform');
    const newCx = sp.x + sp.w / 2;
    const newCy = sp.y + sp.h / 2;
    expect(t).toContain(`rotate(45,${newCx},${newCy})`);
  });

  it('resize of flipped sprite preserves flip in transform', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.flipX = true;
    sp.w = 300;
    Editor.Sprites.apply(sp);
    const t = sp.el.getAttribute('transform');
    expect(t).toContain('scale(-1,1)');
  });

  it('resize of rotated+flipped sprite produces valid transform', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 90, 'floor', true);
    sp.flipX = true; sp.flipY = true;
    sp.w = 250; sp.h = 180;
    Editor.Sprites.apply(sp);
    const t = sp.el.getAttribute('transform');
    expect(t).toContain('rotate(90');
    expect(t).toContain('scale(-1,-1)');
  });

  it('resize updates clip rect when cropped', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    sp.cropL = 0.1; sp.cropR = 0.1;
    Editor.Crop._applyClip(sp);

    // Now resize
    sp.w = 300;
    Editor.Sprites.apply(sp);
    Editor.Crop.updateClipPosition(sp);

    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    const x = parseFloat(clipRect.getAttribute('x'));
    const w = parseFloat(clipRect.getAttribute('width'));
    expect(x).toBeCloseTo(100 + 300 * 0.1, 0); // = 130
    expect(w).toBeCloseTo(300 * 0.8, 0); // = 240
  });

  it('resize with rotation+flip+crop all together', () => {
    const sp = Editor.Sprites.addSprite('test.png', 50, 50, 100, 80, 45, 'floor', true);
    sp.flipX = true;
    sp.cropL = 0.1; sp.cropR = 0.2;
    Editor.Sprites.apply(sp);
    Editor.Crop._applyClip(sp);

    // Resize
    sp.w = 150; sp.h = 100;
    Editor.Sprites.apply(sp);
    Editor.Crop.updateClipPosition(sp);

    // Verify clip rect was updated for new dimensions
    const clipRect = document.getElementById(sp._clipId).querySelector('rect');
    const w = parseFloat(clipRect.getAttribute('width'));
    // flipX swaps L/R: cL=0.2, cR=0.1 → width = 150*(1-0.2-0.1) = 105
    expect(w).toBeCloseTo(105, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Moving layers — into/out of groups, to top, persistence
// ═══════════════════════════════════════════════════════════════════

describe('Moving layers — groups and z-order', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('move sprite into group via addToGroup', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 120, 0, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Groups.addToGroup(group.id, sp3);
    expect(sp3.groupId).toBe(group.id);
    const gEl = document.getElementById(group.id);
    expect(Editor.State.getSpriteRootEl(sp3).parentNode).toBe(gEl);
  });

  it('move sprite out of group via ungroup', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Groups.ungroup(group.id);
    expect(sp1.groupId).toBeUndefined();
    expect(sp2.groupId).toBeUndefined();
    const svg = document.getElementById('battlefield');
    expect(sp1.el.parentNode).toBe(svg);
    expect(sp2.el.parentNode).toBe(svg);
  });

  it('move sprite to top (drag to top zone)', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    const svg = document.getElementById('battlefield');
    const selUI = document.getElementById('selUI');

    // Move sp1 to front (before selUI)
    svg.insertBefore(Editor.State.getSpriteRootEl(sp1), selUI);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();

    const spriteOrder = Editor.State.zOrder.filter(e => e.type === 'sprite').map(e => e.id);
    expect(spriteOrder[spriteOrder.length - 1]).toBe(sp1.id);
  });

  it('layer move persists through save/load', () => {
    const spA = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    const spC = Editor.Sprites.addSprite('c.png', 120, 0, 50, 50, 0, 'floor', true);

    // Reorder: move C below A
    const svg = document.getElementById('battlefield');
    svg.insertBefore(spC.el, spA.el);
    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();
    Editor.Persistence.save();

    // Nuke and reload
    Editor.Core.allSprites.forEach(s => s.el.remove());
    Editor.Core.allSprites = [];
    Editor.Core.sid = 0;
    Editor.Persistence.load();

    const order = getSpriteZOrder(Editor);
    // C should be before A
    expect(order.indexOf('c.png')).toBeLessThan(order.indexOf('a.png'));
  });

  it('multi-select batch move preserves relative order', () => {
    const spA = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    const spC = Editor.Sprites.addSprite('c.png', 120, 0, 50, 50, 0, 'floor', true);
    const spD = Editor.Sprites.addSprite('d.png', 180, 0, 50, 50, 0, 'floor', true);

    // Select A and B
    Editor.Core.multiSel = [spA, spB];

    // Move A and B before D (batch move via _handleDrop logic)
    const svg = document.getElementById('battlefield');
    const selUI = document.getElementById('selUI');
    const selEls = [spA, spB].map(s => s.el);
    const allChildren = Array.from(svg.children);
    selEls.sort((a, b) => allChildren.indexOf(a) - allChildren.indexOf(b));
    selEls.forEach(el => svg.insertBefore(el, selUI));

    Editor.State.syncFromCore();
    Editor.State.syncZOrderFromDOM();

    const spriteIds = Editor.State.zOrder.filter(e => e.type === 'sprite').map(e => e.id);
    // A should still be before B
    expect(spriteIds.indexOf(spA.id)).toBeLessThan(spriteIds.indexOf(spB.id));
  });

  it('cropped sprite can be moved into group', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    sp1.cropL = 0.1;
    Editor.Crop._applyClip(sp1);
    const sp3 = Editor.Sprites.addSprite('c.png', 120, 0, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp2, sp3]);

    // Now add cropped sp1 into the group
    Editor.Groups.addToGroup(group.id, sp1);
    expect(sp1.groupId).toBe(group.id);
    // The crop wrapper should be the child of the group
    expect(sp1._clipWrap.parentNode).toBe(document.getElementById(group.id));
  });

  it('ungroup with cropped sprites preserves crop wrappers', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    sp1.cropL = 0.2; sp1.cropR = 0.1;
    Editor.Crop._applyClip(sp1);
    const group = Editor.Groups.createGroup([sp1, sp2]);

    Editor.Groups.ungroup(group.id);
    // Crop wrapper should now be direct SVG child
    const svg = document.getElementById('battlefield');
    expect(sp1._clipWrap.parentNode).toBe(svg);
    expect(sp1.cropL).toBeCloseTo(0.2, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Undo — actually undoes ONE thing at a time
// ═══════════════════════════════════════════════════════════════════

describe('Undo — granularity', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('undo reverts a move (position restored)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.Move.create(sp.id, 100, 100, 200, 200);
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(100);
  });

  it('undo reverts a resize', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    const cmd = Editor.Commands.Resize.create(sp.id,
      { x: 100, y: 100, w: 200, h: 150 },
      { x: 100, y: 100, w: 300, h: 250 });
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.w).toBe(200);
    expect(restored.h).toBe(150);
  });

  it('undo reverts a rotation', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.Rotate.create(sp.id, 0, 45);
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.rot).toBe(0);
  });

  it('undo reverts a flip', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.SetProperty.create(sp.id, { flipX: false }, { flipX: true });
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.flipX).toBe(false);
  });

  it('undo reverts adding a sprite', () => {
    const sp = Editor.Sprites.addSprite('new.png', 0, 0, 50, 50, 0, 'floor', true);
    const data = Editor.Commands._captureSprite(sp);
    const cmd = Editor.Commands.AddSprite.create(data);
    Editor.Undo.record(cmd);
    expect(Editor.Core.allSprites.length).toBe(1);
    Editor.Undo.undo();
    expect(Editor.Core.allSprites.length).toBe(0);
  });

  it('undo reverts group creation', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 60, 0, 50, 50, 0, 'floor', true);
    // createGroup records undo command internally
    Editor.Groups.createGroup([sp1, sp2]);
    expect(Editor.Core.groups.length).toBe(1);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites;
    expect(restored.every(s => !s.groupId)).toBe(true);
    expect(Editor.Core.groups.length).toBe(0);
  });

  it('undo reverts crop', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 200, 150, 0, 'floor', true);
    const cmd = Editor.Commands.Crop.create(sp.id,
      { cropL: 0, cropT: 0, cropR: 0, cropB: 0 },
      { cropL: 0.1, cropT: 0.2, cropR: 0.15, cropB: 0.05 });
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.cropL).toBe(0);
    expect(restored.cropT).toBe(0);
    expect(restored._clipWrap).toBeFalsy();
  });

  it('undo reverts shadowMul change', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.SetProperty.create(sp.id, { shadowMul: 1.0 }, { shadowMul: 0 });
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.shadowMul).toBe(1.0);
  });

  it('undo reverts hide/show', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.SetProperty.create(sp.id, { hidden: false }, { hidden: true });
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.Undo.undo();
    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.hidden).toBe(false);
  });

  it('two operations → undo → only second reverts', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    const cmd1 = Editor.Commands.Move.create(sp1.id, 10, 10, 200, 10);
    cmd1.apply();
    Editor.Undo.record(cmd1);

    const cmd2 = Editor.Commands.Move.create(sp2.id, 70, 10, 300, 10);
    cmd2.apply();
    Editor.Undo.record(cmd2);

    Editor.Undo.undo();
    const restoredSp1 = Editor.Core.allSprites.find(s => s.file === 'a.png');
    const restoredSp2 = Editor.Core.allSprites.find(s => s.file === 'b.png');
    expect(restoredSp1.x).toBe(200); // sp1's move NOT reverted
    expect(restoredSp2.x).toBe(70);  // sp2's move reverted
  });

  it('undo stack respects max size', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    for (let i = 0; i < 60; i++) {
      const cmd = Editor.Commands.Move.create(sp.id, i, 0, i + 1, 0);
      cmd.apply();
      Editor.Undo.record(cmd);
    }
    expect(Editor.Undo.undoStack.length).toBeLessThanOrEqual(50);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Persistence — everything saves correctly through EditorState
// ═══════════════════════════════════════════════════════════════════

describe('Persistence — EditorState integration', () => {
  let fixture;

  beforeEach(() => {
    fixture = loadFixture();
  });

  it('save includes zOrder array in localStorage', () => {
    const Editor = loadScene(fixture);
    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.zOrder).toBeDefined();
    expect(Array.isArray(saved.zOrder)).toBe(true);
  });

  it('save includes layerOrder for backward compat', () => {
    const Editor = loadScene(fixture);
    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.layerOrder).toBeDefined();
    expect(Array.isArray(saved.layerOrder)).toBe(true);
  });

  it('save zOrder and layerOrder are consistent', () => {
    const Editor = loadScene(fixture);
    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    const zIds = saved.zOrder.map(e => e.id);
    expect(zIds).toEqual(saved.layerOrder);
  });

  it('effects are saved via EditorState', () => {
    const Editor = loadScene(fixture);
    Editor.Effects.shadow.dx = 10;
    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.effects.shadow.dx).toBe(10);
  });

  it('full fixture round-trip via EditorState still works', () => {
    const Editor = loadScene(fixture);
    const before = exportScene(Editor);
    Editor.Persistence.save();

    // Nuke
    const C = Editor.Core;
    C.allSprites.forEach(s => {
      if (s._clipWrap) s._clipWrap.remove(); else s.el.remove();
    });
    C.allSprites = [];
    document.getElementById('modelLayer').innerHTML = '';
    C.allModels = [];
    C.allLights = [];
    (C.groups || []).forEach(g => {
      const el = document.getElementById(g.id);
      if (el) el.remove();
    });
    C.groups = [];
    C.sid = 0;
    Editor.Groups.gid = 0;

    // Reload
    Editor.Persistence.load();
    Editor.Crop.reapplyAll();
    Editor.Effects.rebuildAll();

    const after = exportScene(Editor);
    expect(after.sprites.length).toBe(before.sprites.length);
    expect(after.models.length).toBe(before.models.length);

    const result = assertSceneEqual(before, after);
    const realDiffs = result.differences.filter(d => !d.includes('objective'));
    expect(realDiffs.length).toBe(0);
  });

  it('legacy layerOrder format still loads correctly', () => {
    const Editor = loadScene(fixture);
    Editor.Persistence.save();

    // Remove zOrder from saved data (simulate legacy format)
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    delete saved.zOrder;
    localStorage.setItem(Editor.Persistence.STORAGE_KEY, JSON.stringify(saved));

    // Nuke and reload
    const C = Editor.Core;
    C.allSprites.forEach(s => {
      if (s._clipWrap) s._clipWrap.remove(); else s.el.remove();
    });
    C.allSprites = [];
    document.getElementById('modelLayer').innerHTML = '';
    C.allModels = [];
    C.allLights = [];
    (C.groups || []).forEach(g => {
      const el = document.getElementById(g.id);
      if (el) el.remove();
    });
    C.groups = [];
    C.sid = 0;
    Editor.Groups.gid = 0;

    Editor.Persistence.load();
    // Should still work via layerOrder fallback
    expect(Editor.Core.allSprites.length).toBe(20);
  });
});
