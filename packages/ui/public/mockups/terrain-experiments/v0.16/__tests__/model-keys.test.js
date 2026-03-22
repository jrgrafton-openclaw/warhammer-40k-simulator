/**
 * Tests for model keyboard controls: arrow-key movement and Delete key.
 * Regression test for: models could not be moved via arrow keys or deleted via Delete key.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Model keyboard controls', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  function fireKey(key, opts = {}) {
    const e = new window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    });
    Editor.Selection.onKey(e);
    return e;
  }

  function addAndSelectModel(x = 100, y = 100) {
    const m = Editor.Models.addCircle(x, y, 8, '#0088aa', '', 'cross');
    Editor.Models.selectModel(m);
    return m;
  }

  // --- Arrow key movement ---

  it('ArrowUp moves selected model by 1px', () => {
    const m = addAndSelectModel(100, 100);
    fireKey('ArrowUp');
    expect(m.y).toBe(99);
    expect(m.x).toBe(100);
  });

  it('ArrowDown moves selected model by 1px', () => {
    const m = addAndSelectModel(100, 100);
    fireKey('ArrowDown');
    expect(m.y).toBe(101);
    expect(m.x).toBe(100);
  });

  it('ArrowLeft moves selected model by 1px', () => {
    const m = addAndSelectModel(100, 100);
    fireKey('ArrowLeft');
    expect(m.x).toBe(99);
    expect(m.y).toBe(100);
  });

  it('ArrowRight moves selected model by 1px', () => {
    const m = addAndSelectModel(100, 100);
    fireKey('ArrowRight');
    expect(m.x).toBe(101);
    expect(m.y).toBe(100);
  });

  it('Shift+Arrow moves selected model by 10px', () => {
    const m = addAndSelectModel(100, 100);
    fireKey('ArrowRight', { shiftKey: true });
    expect(m.x).toBe(110);
    fireKey('ArrowDown', { shiftKey: true });
    expect(m.y).toBe(110);
  });

  it('arrow key movement records undo', () => {
    const m = addAndSelectModel(100, 100);
    const undoBefore = Editor.Undo.undoStack.length;
    fireKey('ArrowRight');
    expect(Editor.Undo.undoStack.length).toBe(undoBefore + 1);
  });

  it('arrow keys do NOT move models when no model is selected', () => {
    // Add model but don't select it
    Editor.Models.addCircle(100, 100, 8, '#0088aa', '', 'cross');
    Editor.Models.selectedModel = null;
    // Also no sprite selected
    Editor.Core.selected = null;
    fireKey('ArrowRight');
    // Model should be unchanged
    expect(Editor.Core.allModels[0].x).toBe(100);
  });

  it('arrow keys still move sprites when no model is selected', () => {
    const sp = Editor.Sprites.addSprite('img/test.png', 50, 50, 40, 40, 0, 'floor', true);
    Editor.Core.selected = sp;
    Editor.Core.multiSel = [sp];
    fireKey('ArrowRight');
    expect(sp.x).toBe(51);
  });

  // --- Delete key ---

  it('Delete key removes selected model', () => {
    const m = addAndSelectModel(200, 200);
    const countBefore = Editor.Core.allModels.length;
    fireKey('Delete');
    expect(Editor.Core.allModels.length).toBe(countBefore - 1);
    expect(Editor.Core.allModels.find(x => x.id === m.id)).toBeUndefined();
    expect(Editor.Models.selectedModel).toBeFalsy();
  });

  it('Backspace key removes selected model', () => {
    const m = addAndSelectModel(200, 200);
    fireKey('Backspace');
    expect(Editor.Core.allModels.find(x => x.id === m.id)).toBeUndefined();
  });

  it('Delete on model records undo', () => {
    addAndSelectModel(200, 200);
    const undoBefore = Editor.Undo.undoStack.length;
    fireKey('Delete');
    expect(Editor.Undo.undoStack.length).toBe(undoBefore + 1);
  });

  it('sprite selection takes priority over stale model selection for arrow keys', () => {
    const m = addAndSelectModel(100, 100);
    // Now select a sprite — this should deselect the model
    const sp = Editor.Sprites.addSprite('img/test.png', 50, 50, 40, 40, 0, 'floor', true);
    Editor.Selection.select(sp);
    fireKey('ArrowRight');
    // Sprite should move, model should not
    expect(sp.x).toBe(51);
    expect(m.x).toBe(100);
  });

  it('sprite selection takes priority over stale model selection for Delete', () => {
    const m = addAndSelectModel(100, 100);
    const sp = Editor.Sprites.addSprite('img/test.png', 50, 50, 40, 40, 0, 'floor', true);
    Editor.Selection.select(sp);
    const modelCount = Editor.Core.allModels.length;
    const spriteCount = Editor.Core.allSprites.length;
    fireKey('Delete');
    // Sprite should be deleted, model should remain
    expect(Editor.Core.allSprites.length).toBe(spriteCount - 1);
    expect(Editor.Core.allModels.length).toBe(modelCount);
  });

  it('Delete key still removes sprites when no model is selected', () => {
    const sp = Editor.Sprites.addSprite('img/test.png', 50, 50, 40, 40, 0, 'floor', true);
    Editor.Core.selected = sp;
    Editor.Core.multiSel = [sp];
    const countBefore = Editor.Core.allSprites.length;
    fireKey('Delete');
    expect(Editor.Core.allSprites.length).toBe(countBefore - 1);
  });
});
