/**
 * Phase 4 — Command-Pattern Undo/Redo Tests
 *
 * Verifies granular undo via reversible commands (Editor.Commands + Editor.Undo).
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
    const cmd = Editor.Commands.Move.create(sp.id, 100, 200, 300, 400);
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(sp.x).toBe(300);
    expect(sp.y).toBe(400);

    Editor.Undo.undo();

    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored).toBeTruthy();
    expect(restored.x).toBeCloseTo(100, 0);
    expect(restored.y).toBeCloseTo(200, 0);
  });

  it('move → undo → redo → position matches moved', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 200, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.Move.create(sp.id, 100, 200, 300, 400);
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    expect(sp.x).toBe(100);
    expect(sp.y).toBe(200);

    Editor.Undo.redo();
    expect(sp.x).toBe(300);
    expect(sp.y).toBe(400);
  });

  it('move A, resize B → undo → only B reverts, A unchanged', () => {
    const spA = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 70, 10, 80, 60, 0, 'floor', true);

    // Move A
    const cmdA = Editor.Commands.Move.create(spA.id, 10, 10, 200, 200);
    cmdA.apply();
    Editor.Undo.record(cmdA);

    // Resize B
    const cmdB = Editor.Commands.Resize.create(spB.id, { x: 70, y: 10, w: 80, h: 60 }, { x: 70, y: 10, w: 160, h: 120 });
    cmdB.apply();
    Editor.Undo.record(cmdB);

    // Undo → only B should revert
    Editor.Undo.undo();
    expect(spA.x).toBe(200); // A's move NOT reverted
    expect(spB.w).toBe(80);  // B's resize reverted
    expect(spB.h).toBe(60);
  });

  it('batch (multi-move) → single undo reverts all', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    const cmd = Editor.Commands.Batch.create([
      Editor.Commands.Move.create(sp1.id, 10, 10, 200, 200),
      Editor.Commands.Move.create(sp2.id, 70, 10, 300, 300),
    ], 'Multi-move');
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(sp1.x).toBe(200);
    expect(sp2.x).toBe(300);

    // Single undo reverts both
    Editor.Undo.undo();
    expect(sp1.x).toBe(10);
    expect(sp1.y).toBe(10);
    expect(sp2.x).toBe(70);
    expect(sp2.y).toBe(10);
  });

  it('add sprite → undo → sprite removed', () => {
    const sp = Editor.Sprites.addSprite('new.png', 50, 50, 40, 40, 0, 'floor', true);
    const data = Editor.Commands._captureSprite(sp);
    const cmd = Editor.Commands.AddSprite.create(data);
    // Already applied (sprite exists), just record
    Editor.Undo.record(cmd);

    expect(Editor.Core.allSprites.length).toBe(1);

    Editor.Undo.undo();
    expect(Editor.Core.allSprites.length).toBe(0);
  });

  it('delete sprite → undo → sprite restored', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const data = Editor.Commands._captureSprite(sp);
    const cmd = Editor.Commands.DeleteSprite.create(data);
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(Editor.Core.allSprites.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allSprites.length).toBe(1);
    const restored = Editor.Core.allSprites[0];
    expect(restored.x).toBe(100);
    expect(restored.file).toBe('test.png');
  });

  it('create group → undo → group removed, sprites ungrouped', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    // createGroup internally records an undo command
    Editor.Groups.createGroup([sp1, sp2]);
    expect(Editor.Core.groups.length).toBe(1);

    Editor.Undo.undo();
    expect(Editor.Core.groups.length).toBe(0);
    Editor.Core.allSprites.forEach(s => {
      expect(s.groupId).toBeFalsy();
    });
  });

  it('crop → undo → crop removed cleanly', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const from = { cropL: 0, cropT: 0, cropR: 0, cropB: 0 };
    const to = { cropL: 0.1, cropT: 0.2, cropR: 0, cropB: 0 };
    const cmd = Editor.Commands.Crop.create(sp.id, from, to);
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(sp.cropL).toBe(0.1);
    expect(sp.cropT).toBe(0.2);
    expect(sp._clipWrap).toBeTruthy();

    Editor.Undo.undo();

    const restored = Editor.Core.allSprites.find(s => s.file === 'test.png');
    expect(restored).toBeTruthy();
    expect(restored.cropL || 0).toBe(0);
    expect(restored.cropT || 0).toBe(0);
    expect(restored._clipWrap).toBeFalsy();
  });

  it('crop → undo → redo → crop reapplied', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const from = { cropL: 0, cropT: 0, cropR: 0, cropB: 0 };
    const to = { cropL: 0.1, cropT: 0.2, cropR: 0, cropB: 0 };
    const cmd = Editor.Commands.Crop.create(sp.id, from, to);
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    expect(sp.cropL || 0).toBe(0);

    Editor.Undo.redo();
    expect(sp.cropL).toBe(0.1);
    expect(sp.cropT).toBe(0.2);
  });

  it('preserves shadowMul through undo', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.shadowMul = 0.3;
    const cmd = Editor.Commands.SetProperty.create(sp.id, { shadowMul: 0.3 }, { shadowMul: 1.0 });
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(sp.shadowMul).toBe(1.0);

    Editor.Undo.undo();
    expect(sp.shadowMul).toBeCloseTo(0.3);
  });

  it('multiple undos in sequence restore intermediate states', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);

    // Move to 200
    const cmd1 = Editor.Commands.Move.create(sp.id, 100, 100, 200, 100);
    cmd1.apply();
    Editor.Undo.record(cmd1);

    // Move to 300
    const cmd2 = Editor.Commands.Move.create(sp.id, 200, 100, 300, 100);
    cmd2.apply();
    Editor.Undo.record(cmd2);

    // Undo to 200
    Editor.Undo.undo();
    expect(sp.x).toBeCloseTo(200, 0);

    // Undo to 100
    Editor.Undo.undo();
    expect(sp.x).toBeCloseTo(100, 0);
  });

  it('undo with grouped + cropped sprite restores clean state', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    // Crop sp1
    const cropCmd = Editor.Commands.Crop.create(sp1.id,
      { cropL: 0, cropT: 0, cropR: 0, cropB: 0 },
      { cropL: 0.15, cropT: 0, cropR: 0, cropB: 0.2 });
    cropCmd.apply();
    Editor.Undo.record(cropCmd);

    // Group them (this records its own undo command)
    Editor.Groups.createGroup([sp1, sp2]);
    expect(Editor.Core.groups.length).toBe(1);
    expect(sp1._clipWrap).toBeTruthy();

    // Undo the group creation
    Editor.Undo.undo();
    expect(Editor.Core.groups.length).toBe(0);

    // Undo the crop
    Editor.Undo.undo();
    const restoredSp1 = Editor.Core.allSprites.find(s => s.file === 'a.png');
    expect(restoredSp1).toBeTruthy();
    expect(restoredSp1.groupId).toBeFalsy();
    expect(restoredSp1.cropL || 0).toBe(0);
    expect(restoredSp1.cropB || 0).toBe(0);
  });

  it('rotate → undo → rotation restored', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.Rotate.create(sp.id, 0, 45);
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    expect(sp.rot).toBe(0);
  });

  it('flip → undo → flip restored', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.SetProperty.create(sp.id, { flipX: false }, { flipX: true });
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(sp.flipX).toBe(true);

    Editor.Undo.undo();
    expect(sp.flipX).toBe(false);
  });

  it('hide → undo → shown again', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.SetProperty.create(sp.id, { hidden: false }, { hidden: true });
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(sp.hidden).toBe(true);

    Editor.Undo.undo();
    expect(sp.hidden).toBe(false);
  });

  it('resize → undo → dimensions restored', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    const cmd = Editor.Commands.Resize.create(sp.id,
      { x: 100, y: 100, w: 80, h: 60 },
      { x: 100, y: 100, w: 200, h: 150 });
    cmd.apply();
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    expect(sp.w).toBe(80);
    expect(sp.h).toBe(60);
  });

  it('undo clears redo stack on new command', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);

    const cmd1 = Editor.Commands.Move.create(sp.id, 100, 100, 200, 200);
    cmd1.apply();
    Editor.Undo.record(cmd1);

    Editor.Undo.undo();
    expect(Editor.Undo.canRedo()).toBe(true);

    // New command should clear redo
    const cmd2 = Editor.Commands.Move.create(sp.id, 100, 100, 300, 300);
    cmd2.apply();
    Editor.Undo.record(cmd2);
    expect(Editor.Undo.canRedo()).toBe(false);
  });

  it('undo stack respects max size (50)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    for (let i = 0; i < 60; i++) {
      const cmd = Editor.Commands.Move.create(sp.id, i, 0, i + 1, 0);
      cmd.apply();
      Editor.Undo.record(cmd);
    }
    expect(Editor.Undo.undoStack.length).toBeLessThanOrEqual(50);
  });

  it('canUndo/canRedo reflect stack state', () => {
    expect(Editor.Undo.canUndo()).toBe(false);
    expect(Editor.Undo.canRedo()).toBe(false);

    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    const cmd = Editor.Commands.Move.create(sp.id, 100, 100, 200, 200);
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(Editor.Undo.canUndo()).toBe(true);
    expect(Editor.Undo.canRedo()).toBe(false);

    Editor.Undo.undo();
    expect(Editor.Undo.canUndo()).toBe(false);
    expect(Editor.Undo.canRedo()).toBe(true);
  });

  it('effects undo via SetEffect command', () => {
    const cmd = Editor.Commands.SetEffect.create('shadow',
      { dx: 3, dy: 3 }, { dx: 10, dy: 10 });
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(Editor.Effects.shadow.dx).toBe(10);

    Editor.Undo.undo();
    expect(Editor.Effects.shadow.dx).toBe(3);
    expect(Editor.Effects.shadow.dy).toBe(3);
  });

  it('reorder → undo → original order restored', () => {
    const spA = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    const beforeOrder = Editor.Commands.captureDOMOrder();

    // Simulate reorder by swapping DOM elements
    const svg = document.getElementById('battlefield');
    const elA = spA.rootEl;
    const elB = spB.rootEl;
    svg.insertBefore(elB, elA);

    const afterOrder = Editor.Commands.captureDOMOrder();
    const cmd = Editor.Commands.Reorder.create(beforeOrder, afterOrder);
    Editor.Undo.record(cmd);

    Editor.Undo.undo();
    // DOM order should be restored: a appears before b
    const allEls = Array.from(svg.children);
    const idxA = allEls.indexOf(spA.rootEl);
    const idxB = allEls.indexOf(spB.rootEl);
    expect(idxA).toBeLessThan(idxB);
  });

  it('ALL action types can be on undo stack without undoing too much', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);

    // 1. Move
    const c1 = Editor.Commands.Move.create(sp.id, 100, 100, 200, 200);
    c1.apply(); Editor.Undo.record(c1);

    // 2. Rotate
    const c2 = Editor.Commands.Rotate.create(sp.id, 0, 45);
    c2.apply(); Editor.Undo.record(c2);

    // 3. SetProperty (flip)
    const c3 = Editor.Commands.SetProperty.create(sp.id, { flipX: false }, { flipX: true });
    c3.apply(); Editor.Undo.record(c3);

    // Current state: x=200, rot=45, flipX=true
    expect(sp.x).toBe(200);
    expect(sp.rot).toBe(45);
    expect(sp.flipX).toBe(true);

    // Undo flip only
    Editor.Undo.undo();
    expect(sp.flipX).toBe(false);
    expect(sp.rot).toBe(45);   // unchanged
    expect(sp.x).toBe(200);    // unchanged

    // Undo rotate only
    Editor.Undo.undo();
    expect(sp.rot).toBe(0);
    expect(sp.x).toBe(200);    // still unchanged

    // Undo move
    Editor.Undo.undo();
    expect(sp.x).toBe(100);
    expect(sp.y).toBe(100);
  });
});

describe('Undo with fixture scene', () => {
  let fixture;

  beforeEach(() => {
    fixture = loadFixture();
  });

  it('move sprite in full scene → undo → only that sprite reverts', () => {
    const Editor = loadScene(fixture);
    const sp = Editor.Core.allSprites[0];
    const origX = sp.x, origY = sp.y;

    const cmd = Editor.Commands.Move.create(sp.id, origX, origY, origX + 100, origY + 50);
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(sp.x).toBe(origX + 100);

    Editor.Undo.undo();
    expect(sp.x).toBe(origX);
    expect(sp.y).toBe(origY);

    // Other sprites unchanged
    expect(Editor.Core.allSprites.length).toBe(20);
  });
});
