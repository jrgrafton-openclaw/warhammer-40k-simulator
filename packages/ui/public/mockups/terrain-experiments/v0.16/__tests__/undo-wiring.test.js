/**
 * Phase 5 — Undo wiring tests for remaining operations.
 *
 * Verifies that operations in editor-layers, editor-lights, editor-models,
 * and editor-crop correctly record commands for undo/redo.
 *
 * Run: npx vitest run packages/ui/public/mockups/terrain-experiments/v0.16/__tests__/undo-wiring.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Undo wiring — Layers panel', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('layer reorder via _handleDrop → undo restores original order', () => {
    const svg = document.getElementById('battlefield');
    const spA = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const spC = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Capture original order
    const origChildren = Array.from(svg.children).map(e => e.id || e.tagName);

    const zItems = Editor.Layers._buildZOrder();
    Editor.Layers._handleDrop(spA.id, spC.id, zItems);

    // Order changed
    const movedChildren = Array.from(svg.children).map(e => e.id || e.tagName);
    expect(movedChildren).not.toEqual(origChildren);

    // Undo should restore
    expect(Editor.Undo.canUndo()).toBe(true);
    Editor.Undo.undo();

    const restoredChildren = Array.from(svg.children);
    const idxA = restoredChildren.indexOf(spA.el);
    const idxB = restoredChildren.indexOf(spB.el);
    const idxC = restoredChildren.indexOf(spC.el);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it('reorderBefore → undo restores original order', () => {
    const svg = document.getElementById('battlefield');
    const spA = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    const childrenBefore = Array.from(svg.children);
    const idxABefore = childrenBefore.indexOf(spA.el);
    const idxBBefore = childrenBefore.indexOf(spB.el);
    expect(idxABefore).toBeLessThan(idxBBefore);

    Editor.Layers.reorderBefore(spB.id, spA.id);

    // B is now before A
    let children = Array.from(svg.children);
    expect(children.indexOf(spB.el)).toBeLessThan(children.indexOf(spA.el));

    // Undo
    Editor.Undo.undo();
    children = Array.from(svg.children);
    expect(children.indexOf(spA.el)).toBeLessThan(children.indexOf(spB.el));
  });

  it('delSprite from layers panel → undo restores sprite', () => {
    const spA = Editor.Sprites.addSprite('a.png', 100, 200, 50, 50, 0, 'floor', true);
    expect(Editor.Core.allSprites.length).toBe(1);

    Editor.Layers.delSprite(spA.id);
    expect(Editor.Core.allSprites.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allSprites.length).toBe(1);
    const restored = Editor.Core.allSprites[0];
    expect(restored.file).toBe('a.png');
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(200);
  });

  it('dupSprite from layers panel → undo removes duplicate', () => {
    const spA = Editor.Sprites.addSprite('a.png', 100, 200, 50, 50, 0, 'floor', true);
    expect(Editor.Core.allSprites.length).toBe(1);

    Editor.Layers.dupSprite(spA.id);
    expect(Editor.Core.allSprites.length).toBe(2);

    Editor.Undo.undo();
    expect(Editor.Core.allSprites.length).toBe(1);
    expect(Editor.Core.allSprites[0].file).toBe('a.png');
  });
});

describe('Undo wiring — Lights', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('add light → undo removes it', () => {
    const light = Editor.Lights.addLight(100, 100, '#ff0000', 50, 0.5);
    Editor.Undo.record(Editor.Commands.AddLight.create(Editor.Commands._captureLight(light)));

    expect(Editor.Core.allLights.length).toBe(1);

    Editor.Undo.undo();
    expect(Editor.Core.allLights.length).toBe(0);
  });

  it('remove light → undo restores it', () => {
    const light = Editor.Lights.addLight(200, 200, '#00ff00', 80, 0.3, true);
    expect(Editor.Core.allLights.length).toBe(1);

    Editor.Lights.removeLight(light.id);
    expect(Editor.Core.allLights.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allLights.length).toBe(1);
    const restored = Editor.Core.allLights[0];
    expect(restored.x).toBe(200);
    expect(restored.y).toBe(200);
    expect(restored.color).toBe('#00ff00');
  });

  it('move light → undo restores position', () => {
    const light = Editor.Lights.addLight(100, 100, '#ff0000', 50, 0.5, true);

    // Simulate a drag by recording a MoveLight command directly
    const fromX = light.x, fromY = light.y;
    light.x = 300; light.y = 400;
    Editor.Lights.applyLight(light);
    Editor.Undo.record(Editor.Commands.MoveLight.create(light.id, fromX, fromY, 300, 400));

    expect(light.x).toBe(300);
    expect(light.y).toBe(400);

    Editor.Undo.undo();
    const restored = Editor.Core.allLights.find(l => l.id === light.id);
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(100);
  });

  it('delete light → undo → redo round-trips cleanly', () => {
    const light = Editor.Lights.addLight(150, 250, '#0000ff', 60, 0.4, true);
    const id = light.id;

    Editor.Lights.removeLight(id);
    expect(Editor.Core.allLights.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allLights.length).toBe(1);

    Editor.Undo.redo();
    expect(Editor.Core.allLights.length).toBe(0);
  });
});

describe('Undo wiring — Models', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
    // Clear default models
    document.getElementById('modelLayer').innerHTML = '';
    Editor.Core.allModels = [];
  });

  it('delete model → undo restores it', () => {
    const m = Editor.Models.addCircle(100, 100, 8, '#0088aa', 'url(#mf-imp)', 'cross');
    expect(Editor.Core.allModels.length).toBe(1);

    Editor.Models.removeModel(m.id);
    expect(Editor.Core.allModels.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allModels.length).toBe(1);
    const restored = Editor.Core.allModels[0];
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(100);
    expect(restored.kind).toBe('circle');
  });

  it('move model → undo restores position', () => {
    const m = Editor.Models.addCircle(100, 100, 8, '#0088aa', 'url(#mf-imp)', 'cross');

    // Simulate drag by recording MoveModel directly
    const fromX = m.x, fromY = m.y;
    m.x = 500; m.y = 300;
    Editor.Models.applyModel(m);
    Editor.Undo.record(Editor.Commands.MoveModel.create(m.id, fromX, fromY, 500, 300));

    expect(m.x).toBe(500);

    Editor.Undo.undo();
    const restored = Editor.Core.allModels.find(x => x.id === m.id);
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(100);
  });

  it('delete rect model → undo restores it', () => {
    const m = Editor.Models.addRect(50, 50, 43, 25, '#0088aa', 'url(#mf-imp)');
    expect(Editor.Core.allModels.length).toBe(1);

    Editor.Models.removeModel(m.id);
    expect(Editor.Core.allModels.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allModels.length).toBe(1);
    const restored = Editor.Core.allModels[0];
    expect(restored.kind).toBe('rect');
    expect(restored.w).toBe(43);
    expect(restored.h).toBe(25);
  });

  it('delete model → undo → redo round-trips cleanly', () => {
    const m = Editor.Models.addCircle(200, 200, 9, '#aa2810', 'url(#mf-ork)', 'star');

    Editor.Models.removeModel(m.id);
    expect(Editor.Core.allModels.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allModels.length).toBe(1);

    Editor.Undo.redo();
    expect(Editor.Core.allModels.length).toBe(0);
  });
});

describe('Undo wiring — Crop reset', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('resetCrop → undo restores crop values', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);

    // Apply a crop first
    sp.cropL = 0.1; sp.cropT = 0.2; sp.cropR = 0.05; sp.cropB = 0.15;
    Editor.Crop._applyClip(sp);

    // Reset
    Editor.Crop.resetCrop(sp);

    expect(sp.cropL).toBe(0);
    expect(sp.cropT).toBe(0);
    expect(sp.cropR).toBe(0);
    expect(sp.cropB).toBe(0);

    // Undo should restore the crop
    Editor.Undo.undo();
    expect(sp.cropL).toBeCloseTo(0.1);
    expect(sp.cropT).toBeCloseTo(0.2);
    expect(sp.cropR).toBeCloseTo(0.05);
    expect(sp.cropB).toBeCloseTo(0.15);
  });
});
