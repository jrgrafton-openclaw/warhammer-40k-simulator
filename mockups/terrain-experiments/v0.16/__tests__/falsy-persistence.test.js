/**
 * Falsy-value persistence tests.
 *
 * Verifies that values like 0, false, and empty string survive save → load
 * round-trips. These are the class of bugs where truthy checks (e.g. `if (val)`)
 * silently drop valid falsy values.
 */

import { describe, it, expect } from 'vitest';
import { loadEditor, loadScene, loadFixture } from './test-helpers.js';

describe('Falsy value persistence', () => {
  function roundTrip(Editor) {
    Editor.Persistence.save();

    // Nuke state
    const C = Editor.Core;
    C.allSprites.forEach(s => { if (s._clipWrap) s._clipWrap.remove(); else s.el.remove(); });
    C.allSprites = [];
    document.getElementById('modelLayer').innerHTML = '';
    C.allModels = [];
    C.allLights = [];
    (C.groups || []).forEach(g => { const el = document.getElementById(g.id); if (el) el.remove(); });
    C.groups = [];
    C.allObjectives = [];
    document.getElementById('objectiveRings').innerHTML = '';
    document.getElementById('objectiveHexes').innerHTML = '';
    C.sid = 0;
    Editor.Groups.gid = 0;

    Editor.Persistence.load();
    Editor.Crop.reapplyAll();
    Editor.Effects.rebuildAll();
  }

  it('ruinsOpacity=0 persists (not skipped by falsy check)', () => {
    const fixture = loadFixture();
    const Editor = loadScene(fixture);

    // Inject a save payload with ruinsOpacity=0 directly into localStorage
    // (the save code uses ranges[0] which may vary by DOM order — test the load path)
    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    saved.ruinsOpacity = 0;
    localStorage.setItem(Editor.Persistence.STORAGE_KEY, JSON.stringify(saved));

    // Reset to non-zero so we can verify load restores 0
    document.getElementById('svgRuins').style.opacity = 0.5;

    Editor.Persistence.load();

    // The != null check in load() must not skip ruinsOpacity=0
    expect(document.getElementById('svgRuins').style.opacity).toBe('0');
  });

  it('shadowMul=0 persists on sprites', () => {
    const Editor = loadEditor();
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, 0, 'floor', true);
    sp.shadowMul = 0;

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.sprites[0].shadowMul).toBe(0);
  });

  it('shadow.opacity=0 persists', () => {
    const fixture = loadFixture();
    const Editor = loadScene(fixture);

    Editor.Effects.shadow.opacity = 0;
    Editor.Persistence.save();

    // Reset to non-zero
    Editor.Effects.shadow.opacity = 0.55;
    Editor.Persistence.load();

    expect(Editor.Effects.shadow.opacity).toBe(0);
  });

  it('grade.brightness=0 persists', () => {
    const fixture = loadFixture();
    const Editor = loadScene(fixture);

    Editor.Effects.grade.brightness = 0;
    Editor.Persistence.save();

    // Reset to non-zero
    Editor.Effects.grade.brightness = 0.75;
    Editor.Persistence.load();

    expect(Editor.Effects.grade.brightness).toBe(0);
  });

  it('toggles.svgRuins=false persists', () => {
    const fixture = loadFixture();
    const Editor = loadScene(fixture);

    // Hide svgRuins
    document.getElementById('svgRuins').style.display = 'none';

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.toggles.svgRuins).toBe(false);

    // Reset to visible
    document.getElementById('svgRuins').style.display = '';

    Editor.Persistence.load();
    expect(document.getElementById('svgRuins').style.display).toBe('none');
  });

  it('toggles.svgScatter=false persists', () => {
    const fixture = loadFixture();
    const Editor = loadScene(fixture);

    // Hide svgScatter
    document.getElementById('svgScatter').style.display = 'none';

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.toggles.svgScatter).toBe(false);

    // Reset to visible
    document.getElementById('svgScatter').style.display = '';

    Editor.Persistence.load();
    expect(document.getElementById('svgScatter').style.display).toBe('none');
  });

  it('near-zero rotation persists (not truncated to 0 or NaN)', () => {
    const Editor = loadEditor();
    const tinyRot = 1.7763568394002505e-15;
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 50, 50, tinyRot, 'floor', true);

    Editor.Persistence.save();
    const saved = JSON.parse(localStorage.getItem(Editor.Persistence.STORAGE_KEY));
    expect(saved.sprites[0].rot).toBe(tinyRot);
    expect(saved.sprites[0].rot).not.toBeNaN();
  });
});
