/**
 * Smoke & Fire FX Tests
 *
 * Covers: add, remove, serialize, round-trip, movement, selection, undo.
 *
 * Run: npx vitest run --config __tests__/vitest.config.js __tests__/smoke-fire.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Smoke FX', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('addSmoke creates an FX entity with correct defaults', () => {
    const fx = Editor.Smoke.addSmoke(100, 200, {}, true);
    expect(fx).toBeTruthy();
    expect(fx.type).toBe('smoke');
    expect(fx.x).toBe(100);
    expect(fx.y).toBe(200);
    expect(fx.particleCount).toBe(20);
    expect(fx.sizeMin).toBe(4);
    expect(fx.sizeMax).toBe(12);
    expect(fx.riseSpeed).toBe(4);
    expect(fx.spread).toBe(40);
    expect(fx.opacity).toBe(0.3);
    expect(fx.color).toBe('#555555');
    expect(fx.fadeRate).toBe(5);
    expect(fx.maxHeight).toBe(80);
    expect(fx.id).toMatch(/^fx/);
    expect(Editor.Core.allSmokeFx).toContain(fx);
    // SVG element created
    expect(fx.el).toBeTruthy();
    expect(fx.el.tagName).toBe('g');
  });

  it('addSmoke with custom opts overrides defaults', () => {
    const fx = Editor.Smoke.addSmoke(50, 60, { particleCount: 10, color: '#aaaaaa' }, true);
    expect(fx.particleCount).toBe(10);
    expect(fx.color).toBe('#aaaaaa');
    expect(fx.spread).toBe(40); // default preserved
  });

  it('removeEffect removes the entity', () => {
    const fx = Editor.Smoke.addSmoke(100, 200, {}, true);
    const id = fx.id;
    expect(Editor.Core.allSmokeFx.length).toBe(1);
    Editor.Smoke.removeEffect(id);
    expect(Editor.Core.allSmokeFx.length).toBe(0);
    expect(Editor.Core.allSmokeFx.find(f => f.id === id)).toBeUndefined();
  });

  it('serialize produces correct JSON for smoke', () => {
    Editor.Smoke.addSmoke(100, 200, { particleCount: 15, color: '#aabbcc' }, true);
    const data = Editor.Smoke.serialize();
    expect(data.length).toBe(1);
    expect(data[0].type).toBe('smoke');
    expect(data[0].x).toBe(100);
    expect(data[0].y).toBe(200);
    expect(data[0].particleCount).toBe(15);
    expect(data[0].color).toBe('#aabbcc');
    expect(data[0].spread).toBe(40);
  });

  it('selection and deselection works', () => {
    const fx = Editor.Smoke.addSmoke(100, 200, {}, true);
    expect(Editor.Smoke.selectedFx).toBeNull();
    Editor.Smoke.selectEffect(fx);
    expect(Editor.Smoke.selectedFx).toBe(fx);
    Editor.Smoke.deselectEffect();
    expect(Editor.Smoke.selectedFx).toBeNull();
  });

  it('updateSelected changes properties', () => {
    const fx = Editor.Smoke.addSmoke(100, 200, {}, true);
    Editor.Smoke.selectEffect(fx);
    Editor.Smoke.updateSelected('spread', 80);
    expect(fx.spread).toBe(80);
    Editor.Smoke.updateSelected('color', '#ff0000');
    expect(fx.color).toBe('#ff0000');
  });
});

describe('Fire FX', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('addFire creates a fire entity with correct defaults', () => {
    const fx = Editor.Fire.addFire(300, 400, {}, true);
    expect(fx).toBeTruthy();
    expect(fx.type).toBe('fire');
    expect(fx.x).toBe(300);
    expect(fx.y).toBe(400);
    expect(fx.sparkCount).toBe(10);
    expect(fx.sparkSpeed).toBe(5);
    expect(fx.sparkSize).toBe(2);
    expect(fx.direction).toBe('all');
    expect(fx.maxHeight).toBe(40);
    expect(fx.color).toBe('#ff6600');
    expect(fx.glowRadius).toBe(30);
    expect(fx.glowIntensity).toBe(0.2);
    expect(fx.id).toMatch(/^fx/);
    expect(Editor.Core.allSmokeFx).toContain(fx);
  });

  it('serialize produces correct JSON for fire', () => {
    Editor.Fire.addFire(300, 400, { sparkCount: 20, color: '#ff0000' }, true);
    const data = Editor.Smoke.serialize();
    expect(data.length).toBe(1);
    expect(data[0].type).toBe('fire');
    expect(data[0].x).toBe(300);
    expect(data[0].y).toBe(400);
    expect(data[0].sparkCount).toBe(20);
    expect(data[0].color).toBe('#ff0000');
  });

  it('removeEffect removes fire entity', () => {
    const fx = Editor.Fire.addFire(300, 400, {}, true);
    Editor.Smoke.removeEffect(fx.id);
    expect(Editor.Core.allSmokeFx.length).toBe(0);
  });
});

describe('FX Persistence Round-Trip', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('serialize → restore → serialize produces same data', () => {
    Editor.Smoke.addSmoke(100, 200, { particleCount: 15, color: '#aabbcc', spread: 60 }, true);
    Editor.Fire.addFire(300, 400, { sparkCount: 20, glowRadius: 50 }, true);

    const data1 = Editor.Smoke.serialize();
    expect(data1.length).toBe(2);

    // Clear all
    Editor.Smoke.removeAll();
    expect(Editor.Core.allSmokeFx.length).toBe(0);

    // Restore from serialized data
    data1.forEach(d => {
      const opts = Object.assign({}, d);
      delete opts.id; delete opts.type; delete opts.x; delete opts.y;
      if (d.type === 'smoke') {
        Editor.Smoke.addSmoke(d.x, d.y, opts, true, d.id);
      } else {
        Editor.Fire.addFire(d.x, d.y, opts, true, d.id);
      }
    });

    const data2 = Editor.Smoke.serialize();
    expect(data2.length).toBe(2);

    // Compare
    for (let i = 0; i < data1.length; i++) {
      expect(data2[i].type).toBe(data1[i].type);
      expect(data2[i].x).toBe(data1[i].x);
      expect(data2[i].y).toBe(data1[i].y);
      expect(data2[i].color).toBe(data1[i].color);
      if (data1[i].type === 'smoke') {
        expect(data2[i].particleCount).toBe(data1[i].particleCount);
        expect(data2[i].spread).toBe(data1[i].spread);
      } else {
        expect(data2[i].sparkCount).toBe(data1[i].sparkCount);
        expect(data2[i].glowRadius).toBe(data1[i].glowRadius);
      }
    }
  });
});

describe('FX Undo Commands', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('undo AddFx removes the FX', () => {
    // addSmoke without restoreId records AddFx automatically
    const fx = Editor.Smoke.addSmoke(100, 200);
    expect(Editor.Core.allSmokeFx.length).toBe(1);

    Editor.Undo.undo();
    expect(Editor.Core.allSmokeFx.length).toBe(0);
  });

  it('redo AddFx restores the FX', () => {
    const fx = Editor.Smoke.addSmoke(100, 200);
    const id = fx.id;

    Editor.Undo.undo();
    expect(Editor.Core.allSmokeFx.length).toBe(0);

    Editor.Undo.redo();
    expect(Editor.Core.allSmokeFx.length).toBe(1);
    expect(Editor.Core.allSmokeFx[0].x).toBe(100);
    expect(Editor.Core.allSmokeFx[0].y).toBe(200);
  });

  it('undo RemoveFx restores the FX', () => {
    const fx = Editor.Smoke.addSmoke(100, 200, { spread: 60 }, true);
    const id = fx.id;
    // Clear the AddFx undo entry (since skipSelect=true but restoreId is undefined...)
    // Actually with skipSelect=true but no restoreId, AddFx IS recorded.
    // Let's use restoreId to skip AddFx undo:
    Editor.Undo._stack = [];
    Editor.Undo._idx = -1;

    Editor.Smoke.removeEffect(id);
    expect(Editor.Core.allSmokeFx.length).toBe(0);

    Editor.Undo.undo();
    expect(Editor.Core.allSmokeFx.length).toBe(1);
    expect(Editor.Core.allSmokeFx[0].spread).toBe(60);
  });

  it('undo MoveFx reverts position', () => {
    const fx = Editor.Smoke.addSmoke(100, 200, {}, true, 'fx-test');
    const cmd = Editor.Commands.MoveFx.create(fx.id, 100, 200, 300, 400);
    cmd.apply();
    Editor.Undo.record(cmd);

    expect(fx.x).toBe(300);
    expect(fx.y).toBe(400);

    Editor.Undo.undo();
    const restored = Editor.Core.allSmokeFx.find(f => f.id === fx.id);
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(200);
  });

  it('undo AddFire removes the fire', () => {
    const fx = Editor.Fire.addFire(200, 300);
    expect(Editor.Core.allSmokeFx.length).toBe(1);
    expect(fx.type).toBe('fire');

    Editor.Undo.undo();
    expect(Editor.Core.allSmokeFx.length).toBe(0);
  });

  it('redo AddFire restores the fire', () => {
    Editor.Fire.addFire(200, 300);

    Editor.Undo.undo();
    expect(Editor.Core.allSmokeFx.length).toBe(0);

    Editor.Undo.redo();
    expect(Editor.Core.allSmokeFx.length).toBe(1);
    expect(Editor.Core.allSmokeFx[0].type).toBe('fire');
    expect(Editor.Core.allSmokeFx[0].x).toBe(200);
  });

  it('_captureFx captures all smoke properties', () => {
    const fx = Editor.Smoke.addSmoke(100, 200, { particleCount: 15 }, true, 'fx-cap');
    const data = Editor.Commands._captureFx(fx);
    expect(data.id).toBe('fx-cap');
    expect(data.type).toBe('smoke');
    expect(data.x).toBe(100);
    expect(data.y).toBe(200);
    expect(data.particleCount).toBe(15);
    expect(data.spread).toBe(40);
    expect(data.opacity).toBe(0.3);
  });

  it('_captureFx captures all fire properties', () => {
    const fx = Editor.Fire.addFire(300, 400, { sparkCount: 20 }, true, 'fx-cap-fire');
    const data = Editor.Commands._captureFx(fx);
    expect(data.id).toBe('fx-cap-fire');
    expect(data.type).toBe('fire');
    expect(data.sparkCount).toBe(20);
    expect(data.glowRadius).toBe(30);
    expect(data.glowIntensity).toBe(0.2);
  });
});
