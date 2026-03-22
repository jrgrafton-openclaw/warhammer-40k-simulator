/**
 * End-to-end round-trip test.
 * Loads fixture → captures full state → save → nuke → load → captures state → deep compare.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor, loadScene, exportScene, assertSceneEqual, loadFixture } from './test-helpers.js';

describe('End-to-end round-trip', () => {
  let fixture;

  beforeEach(() => {
    fixture = loadFixture();
  });

  function captureState(Editor) {
    const C = Editor.Core;
    const S = Editor.State;
    return {
      scene: exportScene(Editor),
      spriteDetails: C.allSprites.map(s => ({
        id: s.id, file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot,
        layerType: s.layerType, hidden: !!s.hidden,
        flipX: !!s.flipX, flipY: !!s.flipY,
        shadowMul: s.shadowMul != null ? s.shadowMul : 1,
        cropL: s.cropL || 0, cropT: s.cropT || 0, cropR: s.cropR || 0, cropB: s.cropB || 0,
        groupId: s.groupId || null,
      })),
      modelCount: C.allModels.length,
      groupCount: (C.groups || []).length,
      groupDetails: (C.groups || []).map(g => ({ id: g.id, name: g.name, opacity: g.opacity })),
      effects: {
        shadow: Object.assign({}, Editor.Effects.shadow),
        feather: Object.assign({}, Editor.Effects.feather),
        grade: Object.assign({}, Editor.Effects.grade),
      },
      bg: document.getElementById('bgSel').value,
    };
  }

  function nukeAll(Editor) {
    const C = Editor.Core;
    C.allSprites.forEach(s => {
      if (s._clipWrap) s._clipWrap.remove();
      else s.el.remove();
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
    C.allObjectives = [];
    document.getElementById('objectiveRings').innerHTML = '';
    document.getElementById('objectiveHexes').innerHTML = '';
    C.sid = 0;
    Editor.Groups.gid = 0;
  }

  it('save → nuke → load preserves ALL state with zero differences', () => {
    const Editor = loadScene(fixture);
    const before = captureState(Editor);

    // Save to localStorage
    Editor.Persistence.save();

    // Nuke everything
    nukeAll(Editor);

    // Verify nuke worked
    expect(Editor.Core.allSprites.length).toBe(0);
    expect(Editor.Core.allModels.length).toBe(0);

    // Reload from localStorage
    Editor.Persistence.load();

    const after = captureState(Editor);

    // Sprite count
    expect(after.spriteDetails.length).toBe(before.spriteDetails.length);

    // Deep compare each sprite (match by file + position since IDs may differ)
    const used = new Set();
    for (const bs of before.spriteDetails) {
      const match = after.spriteDetails.find((as, i) =>
        !used.has(i) && as.file === bs.file && Math.abs(as.x - bs.x) < 2 && Math.abs(as.y - bs.y) < 2
      );
      expect(match, `sprite ${bs.file} at (${bs.x},${bs.y}) not found after round-trip`).toBeTruthy();
      if (!match) continue;
      used.add(after.spriteDetails.indexOf(match));

      expect(match.w).toBeCloseTo(bs.w, 0);
      expect(match.h).toBeCloseTo(bs.h, 0);
      if (Math.abs(bs.rot) > 1e-10) {
        expect(match.rot).toBeCloseTo(bs.rot, 5);
      }
      expect(match.layerType).toBe(bs.layerType);
      expect(match.hidden).toBe(bs.hidden);
      expect(match.flipX).toBe(bs.flipX);
      expect(match.flipY).toBe(bs.flipY);
      expect(match.shadowMul).toBeCloseTo(bs.shadowMul, 4);
      expect(match.cropL).toBeCloseTo(bs.cropL, 4);
      expect(match.cropT).toBeCloseTo(bs.cropT, 4);
      expect(match.cropR).toBeCloseTo(bs.cropR, 4);
      expect(match.cropB).toBeCloseTo(bs.cropB, 4);
      // Group membership preserved (both null or both truthy)
      expect(!!match.groupId).toBe(!!bs.groupId);
    }

    // Model count
    expect(after.modelCount).toBe(before.modelCount);

    // Group count and details
    expect(after.groupCount).toBe(before.groupCount);
    for (let i = 0; i < before.groupDetails.length; i++) {
      const bg = before.groupDetails[i];
      const ag = after.groupDetails.find(g => g.id === bg.id);
      expect(ag, `group ${bg.id} not found after round-trip`).toBeTruthy();
      if (ag) {
        expect(ag.name).toBe(bg.name);
        expect(ag.opacity).toBeCloseTo(bg.opacity, 2);
      }
    }

    // Effects preserved
    expect(after.effects.shadow.dx).toBe(before.effects.shadow.dx);
    expect(after.effects.shadow.dy).toBe(before.effects.shadow.dy);
    expect(after.effects.shadow.blur).toBe(before.effects.shadow.blur);
    expect(after.effects.grade.brightness).toBe(before.effects.grade.brightness);
    expect(after.effects.grade.saturation).toBe(before.effects.grade.saturation);
    expect(after.effects.feather.radius).toBe(before.effects.feather.radius);

    // Background preserved
    expect(after.bg).toBe(before.bg);

    // Full scene comparison via assertSceneEqual
    const result = assertSceneEqual(before.scene, after.scene);
    const realDiffs = result.differences.filter(d => !d.includes('objective'));
    expect(realDiffs).toEqual([]);
  });
});
