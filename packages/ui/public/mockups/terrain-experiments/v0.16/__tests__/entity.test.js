/**
 * Entity System Tests — Phases 1-8
 * Tests the unified entity registry, selection, clipboard, groups, and persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Entity System', () => {
  let Editor, C;

  beforeEach(() => {
    Editor = loadEditor();
    C = Editor.Core;
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 1: Entity Registry
  // ═══════════════════════════════════════════════════════════

  describe('Entity Registry', () => {
    it('Entity.register adds to allEntities', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      expect(C.allEntities).toBeDefined();
      expect(C.allEntities.some(e => e.id === sp.id)).toBe(true);
    });

    it('Entity.unregister removes from allEntities', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      const id = sp.id;
      expect(C.allEntities.some(e => e.id === id)).toBe(true);
      Editor.Entity.unregister(id);
      expect(C.allEntities.some(e => e.id === id)).toBe(false);
    });

    it('Entity.find returns correct entity', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      const found = Editor.Entity.find(sp.id);
      expect(found).toBe(sp);
    });

    it('Entity.find returns undefined for nonexistent id', () => {
      expect(Editor.Entity.find('nonexistent')).toBeUndefined();
    });

    it('Entity.findByEl walks up to find entity', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      const found = Editor.Entity.findByEl(sp.el);
      expect(found).toBe(sp);
    });

    it('Entity.ofType filters correctly', () => {
      Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
      Editor.Sprites.addSprite('b.png', 10, 10, 50, 50, 0, 'floor', true);
      Editor.Lights.addLight(100, 100, '#ff0000', 50, 0.5, true);

      const sprites = Editor.Entity.ofType('sprite');
      const lights = Editor.Entity.ofType('light');
      expect(sprites.length).toBe(2);
      expect(lights.length).toBe(1);
    });

    it('does not double-register', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      const countBefore = C.allEntities.length;
      Editor.Entity.register(sp);
      expect(C.allEntities.length).toBe(countBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 1: Sprite Entity Interface
  // ═══════════════════════════════════════════════════════════

  describe('Sprite Entity Interface', () => {
    it('Sprite has Entity interface (type, getBounds, apply, serialize, clone)', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 0, 'floor', true);
      expect(sp.type).toBe('sprite');
      expect(typeof sp.getBounds).toBe('function');
      expect(typeof sp.apply).toBe('function');
      expect(typeof sp.serialize).toBe('function');
      expect(typeof sp.clone).toBe('function');
    });

    it('Sprite getBounds returns correct values', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 0, 'floor', true);
      const b = sp.getBounds();
      expect(b.x).toBe(10);
      expect(b.y).toBe(20);
      expect(b.w).toBe(50);
      expect(b.h).toBe(60);
    });

    it('Sprite serialize returns expected shape', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 0, 'floor', true);
      const data = sp.serialize();
      expect(data.type).toBe('sprite');
      expect(data.file).toBe('test.png');
      expect(data.x).toBe(10);
      expect(data.y).toBe(20);
    });

    it('Sprite clone creates a new sprite', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 0, 'floor', true);
      const cloned = sp.clone(5, 5);
      expect(cloned).toBeDefined();
      expect(cloned.id).not.toBe(sp.id);
      expect(cloned.x).toBe(15);
      expect(cloned.y).toBe(25);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 4: FX & Light Entity Adapters
  // ═══════════════════════════════════════════════════════════

  describe('Smoke Entity Interface', () => {
    it('Smoke has Entity interface', () => {
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      expect(fx.type).toBe('smoke');
      expect(typeof fx.getBounds).toBe('function');
      expect(typeof fx.apply).toBe('function');
      expect(typeof fx.serialize).toBe('function');
      expect(typeof fx.clone).toBe('function');
    });

    it('Smoke is registered in allEntities', () => {
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      expect(C.allEntities.some(e => e.id === fx.id)).toBe(true);
    });

    it('Smoke serialize includes type', () => {
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      const data = fx.serialize();
      expect(data.type).toBe('smoke');
      expect(data.x).toBe(100);
    });
  });

  describe('Fire Entity Interface', () => {
    it('Fire has Entity interface', () => {
      const fx = Editor.Fire.addFire(200, 200, {}, true);
      expect(fx.type).toBe('fire');
      expect(typeof fx.getBounds).toBe('function');
      expect(typeof fx.apply).toBe('function');
      expect(typeof fx.serialize).toBe('function');
      expect(typeof fx.clone).toBe('function');
    });

    it('Fire is registered in allEntities', () => {
      const fx = Editor.Fire.addFire(200, 200, {}, true);
      expect(C.allEntities.some(e => e.id === fx.id)).toBe(true);
    });
  });

  describe('Light Entity Interface', () => {
    it('Light has Entity interface', () => {
      const l = Editor.Lights.addLight(300, 300, '#ffaa44', 80, 0.5, true);
      expect(l.type).toBe('light');
      expect(typeof l.getBounds).toBe('function');
      expect(typeof l.apply).toBe('function');
      expect(typeof l.serialize).toBe('function');
      expect(typeof l.clone).toBe('function');
    });

    it('Light is registered in allEntities', () => {
      const l = Editor.Lights.addLight(300, 300, '#ffaa44', 80, 0.5, true);
      expect(C.allEntities.some(e => e.id === l.id)).toBe(true);
    });

    it('Light serialize includes groupId', () => {
      const l = Editor.Lights.addLight(300, 300, '#ffaa44', 80, 0.5, true);
      const data = l.serialize();
      expect(data.type).toBe('light');
      expect('groupId' in data).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 2: Unified Selection
  // ═══════════════════════════════════════════════════════════

  describe('Unified Selection', () => {
    it('Unified select works for sprites', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      Editor.Selection.select(sp);
      expect(C.selected).toBe(sp);
      expect(C.multiSel).toContain(sp);
    });

    it('Unified select works for smoke', () => {
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      Editor.Selection.select(fx);
      expect(C.selected).toBe(fx);
    });

    it('Unified select works for fire', () => {
      const fx = Editor.Fire.addFire(200, 200, {}, true);
      Editor.Selection.select(fx);
      expect(C.selected).toBe(fx);
    });

    it('Multi-select across types', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      const l = Editor.Lights.addLight(200, 200, '#ff0000', 50, 0.5, true);

      Editor.Selection.select(sp);
      C.multiSel.push(fx, l);
      expect(C.multiSel.length).toBe(3);
      expect(C.multiSel).toContain(sp);
      expect(C.multiSel).toContain(fx);
      expect(C.multiSel).toContain(l);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 3: Unified Clipboard
  // ═══════════════════════════════════════════════════════════

  describe('Unified Clipboard', () => {
    it('Clipboard copy/paste sprite', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      Editor.Selection.select(sp);

      // Copy
      C.clipboard = C.multiSel.map(e => e.serialize());
      expect(C.clipboard.length).toBe(1);
      expect(C.clipboard[0].type).toBe('sprite');

      // Paste via createFromData
      const pasted = Editor.Entity.createFromData(C.clipboard[0], 20, 20);
      expect(pasted).toBeDefined();
      expect(pasted.x).toBe(30);
      expect(pasted.type).toBe('sprite');
    });

    it('Clipboard copy/paste smoke', () => {
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      Editor.Selection.select(fx);

      C.clipboard = [fx.serialize()];
      const pasted = Editor.Entity.createFromData(C.clipboard[0], 20, 20);
      expect(pasted).toBeDefined();
      expect(pasted.type).toBe('smoke');
      expect(pasted.x).toBe(120);
    });

    it('Clipboard copy/paste fire', () => {
      const fx = Editor.Fire.addFire(200, 200, {}, true);
      Editor.Selection.select(fx);

      C.clipboard = [fx.serialize()];
      const pasted = Editor.Entity.createFromData(C.clipboard[0], 10, 10);
      expect(pasted).toBeDefined();
      expect(pasted.type).toBe('fire');
    });

    it('Clipboard copy/paste light', () => {
      const l = Editor.Lights.addLight(300, 300, '#ffaa44', 80, 0.5, true);
      C.clipboard = [l.serialize()];
      const pasted = Editor.Entity.createFromData(C.clipboard[0], 10, 10);
      expect(pasted).toBeDefined();
      expect(pasted.type).toBe('light');
      expect(pasted.x).toBe(310);
    });

    it('Clipboard copy/paste mixed types', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 10, 50, 50, 0, 'floor', true);
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      Editor.Selection.select(sp);
      C.multiSel.push(fx);

      C.clipboard = C.multiSel.map(e => e.serialize());
      expect(C.clipboard.length).toBe(2);

      const pasted = C.clipboard.map(d => Editor.Entity.createFromData(d, 5, 5));
      expect(pasted.length).toBe(2);
      expect(pasted.every(p => p != null)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 5: Groups
  // ═══════════════════════════════════════════════════════════

  describe('Entity Groups', () => {
    it('Entity can be added to group', () => {
      const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
      const sp2 = Editor.Sprites.addSprite('b.png', 100, 100, 50, 50, 0, 'floor', true);
      const group = Editor.Groups.createGroup([sp1, sp2]);
      expect(group).toBeDefined();
      expect(sp1.groupId).toBe(group.id);
      expect(sp2.groupId).toBe(group.id);
    });

    it('Entity groupId persists through addToGroup', () => {
      const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
      const sp2 = Editor.Sprites.addSprite('b.png', 100, 100, 50, 50, 0, 'floor', true);
      const group = Editor.Groups.createGroup([sp1, sp2]);

      const fx = Editor.Smoke.addSmoke(200, 200, {}, true);
      Editor.Groups.addToGroup(group.id, fx);
      expect(fx.groupId).toBe(group.id);
    });

    it('addToGroup works with lights', () => {
      const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
      const sp2 = Editor.Sprites.addSprite('b.png', 100, 100, 50, 50, 0, 'floor', true);
      const group = Editor.Groups.createGroup([sp1, sp2]);

      const l = Editor.Lights.addLight(300, 300, '#ff0000', 50, 0.5, true);
      Editor.Groups.addToGroup(group.id, l);
      expect(l.groupId).toBe(group.id);

      // Verify DOM: light element should be inside group <g>
      const gEl = document.getElementById(group.id);
      expect(gEl.contains(l.el)).toBe(true);
    });

    it('ungroup removes groupId from all entity types', () => {
      const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
      const sp2 = Editor.Sprites.addSprite('b.png', 100, 100, 50, 50, 0, 'floor', true);
      const group = Editor.Groups.createGroup([sp1, sp2]);

      const fx = Editor.Smoke.addSmoke(200, 200, {}, true);
      Editor.Groups.addToGroup(group.id, fx);

      Editor.Groups.ungroup(group.id);
      expect(sp1.groupId).toBeUndefined();
      expect(sp2.groupId).toBeUndefined();
      expect(fx.groupId).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 6: Unified Undo Commands
  // ═══════════════════════════════════════════════════════════

  describe('Unified Commands', () => {
    it('_captureEntity captures sprite data', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 0, 'floor', true);
      const data = Editor.Commands._captureEntity(sp);
      expect(data).toBeDefined();
      expect(data.file).toBe('test.png');
      expect(data.x).toBe(10);
    });

    it('_captureEntity captures fx data', () => {
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      const data = Editor.Commands._captureEntity(fx);
      expect(data).toBeDefined();
      expect(data.type).toBe('smoke');
    });

    it('_captureEntity captures light data', () => {
      const l = Editor.Lights.addLight(300, 300, '#ffaa44', 80, 0.5, true);
      const data = Editor.Commands._captureEntity(l);
      expect(data).toBeDefined();
      expect(data.color).toBe('#ffaa44');
    });

    it('AddEntity/RemoveEntity round-trip for sprite', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 0, 'floor', true);
      const data = Editor.Commands._captureEntity(sp);
      const spritesCount = C.allSprites.length;

      const cmd = Editor.Commands.RemoveEntity.create(data, 'sprite');
      cmd.apply();
      expect(C.allSprites.length).toBe(spritesCount - 1);

      cmd.reverse();
      expect(C.allSprites.length).toBe(spritesCount);
    });

    it('MoveEntity works for any entity type', () => {
      const fx = Editor.Smoke.addSmoke(100, 100, {}, true);
      const cmd = Editor.Commands.MoveEntity.create(fx.id, 'smoke', 100, 100, 200, 200);
      cmd.apply();
      expect(fx.x).toBe(200);
      expect(fx.y).toBe(200);
      cmd.reverse();
      expect(fx.x).toBe(100);
      expect(fx.y).toBe(100);
    });

    it('MoveEntity works for lights', () => {
      const l = Editor.Lights.addLight(300, 300, '#ff0000', 50, 0.5, true);
      const cmd = Editor.Commands.MoveEntity.create(l.id, 'light', 300, 300, 400, 400);
      cmd.apply();
      expect(l.x).toBe(400);
      cmd.reverse();
      expect(l.x).toBe(300);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Phase 7: Persistence
  // ═══════════════════════════════════════════════════════════

  describe('Persistence', () => {
    it('Entity round-trip: serialize → restore → serialize', () => {
      const sp = Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 45, 'floor', true);
      sp.flipX = true;
      sp.shadowMul = 0.5;
      const data1 = sp.serialize();

      // Remove and restore
      const captured = Editor.Commands._captureSprite(sp);
      Editor.Commands._removeSprite(sp.id);
      const restored = Editor.Commands._restoreSprite(captured);
      const data2 = restored.serialize();

      expect(data2.x).toBe(data1.x);
      expect(data2.y).toBe(data1.y);
      expect(data2.w).toBe(data1.w);
      expect(data2.file).toBe(data1.file);
    });

    it('All entity types survive persistence round-trip', () => {
      Editor.Sprites.addSprite('test.png', 10, 20, 50, 60, 0, 'floor', true);
      Editor.Smoke.addSmoke(100, 100, {}, true);
      Editor.Fire.addFire(200, 200, {}, true);
      Editor.Lights.addLight(300, 300, '#ffaa44', 80, 0.5, true);

      // Save
      Editor.Persistence.save();

      // Verify localStorage has data
      const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw);
      expect(data.sprites.length).toBeGreaterThanOrEqual(1);
      expect(data.smokeFx.length).toBeGreaterThanOrEqual(1);
      expect(data.lights.length).toBeGreaterThanOrEqual(1);
    });

    it('FX groupId survives save/load', () => {
      const sp1 = Editor.Sprites.addSprite('a.png', 0, 0, 50, 50, 0, 'floor', true);
      const sp2 = Editor.Sprites.addSprite('b.png', 100, 100, 50, 50, 0, 'floor', true);
      const group = Editor.Groups.createGroup([sp1, sp2]);

      const fx = Editor.Smoke.addSmoke(200, 200, {}, true);
      Editor.Groups.addToGroup(group.id, fx);

      // Save
      Editor.Persistence.save();
      const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
      const data = JSON.parse(raw);

      // Verify FX has groupId in saved data
      const savedFx = data.smokeFx.find(f => f.id === fx.id);
      expect(savedFx).toBeDefined();
      expect(savedFx.groupId).toBe(group.id);
    });

    it('Light groupId survives serialization', () => {
      const l = Editor.Lights.addLight(300, 300, '#ffaa44', 80, 0.5, true);
      l.groupId = 'group-g0';
      const data = l.serialize();
      expect(data.groupId).toBe('group-g0');
    });

    it('normalize auto-creates groups from FX groupId refs', () => {
      const data = {
        sprites: [],
        smokeFx: [{ id: 'fx0', type: 'smoke', x: 100, y: 100, groupId: 'group-g5' }],
        lights: [],
        groups: []
      };
      const normalized = Editor.Persistence._normalize(data);
      expect(normalized.groups.some(g => g.id === 'group-g5')).toBe(true);
    });

    it('normalize auto-creates groups from light groupId refs', () => {
      const data = {
        sprites: [],
        smokeFx: [],
        lights: [{ id: 'l0', x: 100, y: 100, color: '#ff0000', radius: 50, intensity: 0.5, groupId: 'group-g3' }],
        groups: []
      };
      const normalized = Editor.Persistence._normalize(data);
      expect(normalized.groups.some(g => g.id === 'group-g3')).toBe(true);
    });
  });
});
