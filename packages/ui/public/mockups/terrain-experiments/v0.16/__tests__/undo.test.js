/**
 * Phase 0.3 — Undo Tests
 *
 * Verifies that undo correctly restores editor state after mutations.
 *
 * Run: npx vitest run packages/ui/public/mockups/terrain-experiments/v0.16/__tests__/undo.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor, loadScene, loadFixture } from './test-helpers.js';

describe('Undo', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('move sprite → undo → position restored', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 200, 50, 50, 0, 'floor', true);
    Editor.Undo.push();

    sp.x = 300;
    sp.y = 400;
    Editor.Sprites.apply(sp);

    Editor.Undo.pop();

    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored).toBeTruthy();
    expect(restored.x).toBeCloseTo(100, 0);
    expect(restored.y).toBeCloseTo(200, 0);
  });

  it('add sprite → undo → sprite removed', () => {
    Editor.Undo.push();

    Editor.Sprites.addSprite('new.png', 50, 50, 40, 40, 0, 'floor', true);
    expect(Editor.Core.allSprites.length).toBe(1);

    Editor.Undo.pop();
    expect(Editor.Core.allSprites.length).toBe(0);
  });

  it('create group → undo → group removed, sprites ungrouped', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    // createGroup internally calls Undo.push
    const group = Editor.Groups.createGroup([sp1, sp2]);
    expect(Editor.Core.groups.length).toBe(1);

    Editor.Undo.pop();
    expect(Editor.Core.groups.length).toBe(0);
    // Sprites should exist but not be grouped
    Editor.Core.allSprites.forEach(s => {
      expect(s.groupId).toBeFalsy();
    });
  });

  it('crop → undo → crop removed', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    Editor.Undo.push();

    sp.cropL = 0.1;
    sp.cropT = 0.2;
    sp.cropR = 0;
    sp.cropB = 0;
    Editor.Crop.reapplyAll();

    expect(sp._clipWrap).toBeTruthy();

    Editor.Undo.pop();

    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored).toBeTruthy();
    expect(restored.cropL || 0).toBe(0);
    expect(restored.cropT || 0).toBe(0);
    expect(restored._clipWrap).toBeFalsy();
  });

  it('preserves shadowMul through undo', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.shadowMul = 0.3;
    Editor.Undo.push();

    sp.shadowMul = 1.0;

    Editor.Undo.pop();

    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.shadowMul).toBeCloseTo(0.3);
  });

  it('multiple undos in sequence restore intermediate states', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);

    // State 1: original position
    Editor.Undo.push();
    sp.x = 200;
    Editor.Sprites.apply(sp);

    // State 2: moved once
    Editor.Undo.push();
    sp.x = 300;
    Editor.Sprites.apply(sp);

    // Undo to state 2 (x=200)
    Editor.Undo.pop();
    let restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.x).toBeCloseTo(200, 0);

    // Undo to state 1 (x=100)
    Editor.Undo.pop();
    restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored.x).toBeCloseTo(100, 0);
  });

  it('undo with grouped + cropped sprite restores clean state', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    // Snapshot before grouping
    Editor.Undo.push();

    // Crop sp1
    sp1.cropL = 0.15;
    sp1.cropB = 0.2;
    Editor.Crop._applyClip(sp1);

    // Group them (this also pushes undo internally)
    Editor.Groups.createGroup([sp1, sp2]);

    expect(Editor.Core.groups.length).toBe(1);
    expect(sp1._clipWrap).toBeTruthy();

    // Undo the group creation
    Editor.Undo.pop();

    // Undo our manual changes (back to pre-crop state)
    Editor.Undo.pop();

    // Should be clean: no groups, no crops
    expect(Editor.Core.groups.length).toBe(0);
    const restoredSp1 = Editor.Core.allSprites.find(s => s.file === 'a.png');
    expect(restoredSp1).toBeTruthy();
    expect(restoredSp1.groupId).toBeFalsy();
    expect(restoredSp1.cropL || 0).toBe(0);
    expect(restoredSp1.cropB || 0).toBe(0);
  });

  // Documents known gap: effects globals are not captured in undo snapshots
  it.skip('undo restores effects globals (KNOWN GAP)', () => {
    Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    Editor.Undo.push();

    Editor.Effects.shadow.dx = 10;
    Editor.Effects.shadow.dy = 10;

    Editor.Undo.pop();

    // These would need to be in the snapshot — currently they aren't
    expect(Editor.Effects.shadow.dx).toBe(3);
    expect(Editor.Effects.shadow.dy).toBe(3);
  });
});

describe('Undo with fixture scene', () => {
  let fixture;

  beforeEach(() => {
    fixture = loadFixture();
  });

  it('undo after loading full scene restores empty state', () => {
    const Editor = loadEditor();
    Editor.Undo.push(); // capture empty state

    // Now load the scene manually
    fixture.sprites.forEach(s => {
      const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot || 0, s.layerType || 'floor', true);
      sp.shadowMul = s.shadowMul != null ? s.shadowMul : 1;
    });

    expect(Editor.Core.allSprites.length).toBe(20);

    Editor.Undo.pop();
    expect(Editor.Core.allSprites.length).toBe(0);
  });
});
