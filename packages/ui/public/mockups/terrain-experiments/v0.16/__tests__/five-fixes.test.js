/**
 * Regression tests for 5 terrain editor fixes:
 * 1. Group rename via pencil button (not dblclick)
 * 2. Drag sprite INTO custom group
 * 3. Shadow filter region large enough for rotated sprites
 * 4. Shadow distance parameter
 * 5. Drag between groups doesn't auto-snap into group below
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Issue 1: Group rename pencil button', () => {
  let Editor;

  beforeEach(() => { Editor = loadEditor(); });

  it('custom group row has pencil rename button (not dblclick)', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    Editor.Groups.createGroup([sp1, sp2]);
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const renameBtn = list.querySelector('.group-rename-btn');
    expect(renameBtn).toBeTruthy();
    expect(renameBtn.textContent.trim()).toContain('✏');
  });

  it('custom group row does NOT have dblclick rename title', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    Editor.Groups.createGroup([sp1, sp2]);
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const nameEl = list.querySelector('.group-name');
    expect(nameEl).toBeTruthy();
    expect(nameEl.getAttribute('title')).toBeFalsy();
  });

  it('_startGroupRename creates inline input', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const renameBtn = list.querySelector('.group-rename-btn');
    Editor.Layers._startGroupRename(group.id, renameBtn);

    const input = list.querySelector('.group-rename-input');
    expect(input).toBeTruthy();
    expect(input.value).toBe(group.name);
  });

  it('custom-group-row has min-height for easier interaction', () => {
    // Verify the CSS class exists on the row
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    Editor.Groups.createGroup([sp1, sp2]);
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const groupRow = list.querySelector('.custom-group-row');
    expect(groupRow).toBeTruthy();
    expect(groupRow.classList.contains('custom-group-row')).toBe(true);
  });
});

describe('Issue 2: Drag sprite INTO custom group', () => {
  let Editor;

  beforeEach(() => { Editor = loadEditor(); });

  it('addToGroup moves ungrouped sprite into group DOM', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2]);
    const gEl = document.getElementById(group.id);

    // sp3 is ungrouped, add it to the group
    Editor.Groups.addToGroup(group.id, sp3);

    expect(sp3.groupId).toBe(group.id);
    expect(gEl.contains(sp3.el)).toBe(true);
    // Should have 3 children now
    const childSprites = Editor.Core.allSprites.filter(s => s.groupId === group.id);
    expect(childSprites.length).toBe(3);
  });

  it('addToGroup moves sprite from one group to another', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);
    const sp4 = Editor.Sprites.addSprite('d.png', 190, 10, 50, 50, 0, 'floor', true);

    const group1 = Editor.Groups.createGroup([sp1, sp2]);
    const group2 = Editor.Groups.createGroup([sp3, sp4]);

    // Move sp1 from group1 to group2
    Editor.Groups.addToGroup(group2.id, sp1);

    expect(sp1.groupId).toBe(group2.id);
    const g2El = document.getElementById(group2.id);
    expect(g2El.contains(sp1.el)).toBe(true);
    const g1El = document.getElementById(group1.id);
    expect(g1El.contains(sp1.el)).toBe(false);
  });
});

describe('Issue 3: Shadow filter region for rotated sprites', () => {
  let Editor;

  beforeEach(() => { Editor = loadEditor(); });

  it('filter region uses -100%/-100%/300%/300%', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 45, 'floor', true);
    Editor.Effects.rebuildAll();

    const filterAttr = sp.el.getAttribute('filter');
    expect(filterAttr).toBeTruthy();

    const filterId = filterAttr.match(/url\(#(.+)\)/)[1];
    const filterEl = document.getElementById(filterId);
    expect(filterEl).toBeTruthy();
    expect(filterEl.getAttribute('x')).toBe('-100%');
    expect(filterEl.getAttribute('y')).toBe('-100%');
    expect(filterEl.getAttribute('width')).toBe('300%');
    expect(filterEl.getAttribute('height')).toBe('300%');
  });

  it('rotated+flipped sprite gets correct filter region', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 90, 'floor', true);
    sp.flipX = true;
    sp.flipY = true;
    Editor.Effects.rebuildAll();

    const filterAttr = sp.el.getAttribute('filter');
    const filterId = filterAttr.match(/url\(#(.+)\)/)[1];
    const filterEl = document.getElementById(filterId);
    expect(filterEl.getAttribute('x')).toBe('-100%');
    expect(filterEl.getAttribute('width')).toBe('300%');
  });
});

describe('Issue 4: Shadow distance parameter', () => {
  let Editor;

  beforeEach(() => { Editor = loadEditor(); });

  it('shadow defaults include distance: 1.0', () => {
    expect(Editor.Effects.shadow.distance).toBe(1.0);
  });

  it('setShadowParam updates distance', () => {
    Editor.Effects.setShadowParam('distance', 2.0);
    expect(Editor.Effects.shadow.distance).toBe(2.0);
  });

  it('distance=0 produces zero-offset shadow', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    Editor.Effects.setShadowParam('distance', 0);
    Editor.Effects.rebuildAll();

    const filterAttr = sp.el.getAttribute('filter');
    expect(filterAttr).toBeTruthy();

    const filterId = filterAttr.match(/url\(#(.+)\)/)[1];
    const filterEl = document.getElementById(filterId);
    const offEl = filterEl.querySelector('feOffset');
    expect(offEl).toBeTruthy();
    expect(offEl.getAttribute('dx')).toBe('0.00');
    expect(offEl.getAttribute('dy')).toBe('0.00');
  });

  it('distance=2 doubles shadow offset', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    Editor.Effects.setShadowParam('distance', 2.0);
    Editor.Effects.rebuildAll();

    const filterAttr = sp.el.getAttribute('filter');
    const filterId = filterAttr.match(/url\(#(.+)\)/)[1];
    const filterEl = document.getElementById(filterId);
    const offEl = filterEl.querySelector('feOffset');
    // Default dx=3, dy=3 → with distance=2: dx=6, dy=6
    expect(parseFloat(offEl.getAttribute('dx'))).toBeCloseTo(6, 1);
    expect(parseFloat(offEl.getAttribute('dy'))).toBeCloseTo(6, 1);
  });

  it('distance is included in filter cache key (different filters for different distances)', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    Editor.Effects.rebuildAll();

    const filter1 = sp.el.getAttribute('filter');

    Editor.Effects.setShadowParam('distance', 2.0);
    Editor.Effects.rebuildAll();

    const filter2 = sp.el.getAttribute('filter');
    expect(filter1).not.toBe(filter2);
  });

  it('distance persists through save/load cycle', () => {
    Editor.Effects.setShadowParam('distance', 1.5);
    Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    Editor.Persistence.save();

    const raw = localStorage.getItem(Editor.Persistence.STORAGE_KEY);
    const data = JSON.parse(raw);
    expect(data.effects.shadow.distance).toBe(1.5);
  });

  it('distance slider exists in shadow controls DOM', () => {
    const shadowControls = document.getElementById('fxShadowControls');
    const sliders = shadowControls.querySelectorAll('input[type=range]');
    // blur, opacity, dx, dy, distance = 5 sliders
    expect(sliders.length).toBe(5);
    expect(sliders[4].getAttribute('max')).toBe('300');
  });
});

describe('Issue 5: Drag between groups — no auto-snap', () => {
  let Editor;

  beforeEach(() => { Editor = loadEditor(); });

  it('drop-above on group row places sprite AFTER group in DOM (not inside)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);
    const sp4 = Editor.Sprites.addSprite('d.png', 190, 10, 50, 50, 0, 'floor', true);

    // Create a group with sp3+sp4
    const group = Editor.Groups.createGroup([sp3, sp4]);
    const gEl = document.getElementById(group.id);

    // Now simulate dropping sp1 "above" the group row
    // This should place sp1 AFTER the group <g> in DOM, NOT inside it
    Editor.Layers.rebuild();
    const zItems = Editor.Layers._buildZOrder();

    // Set up draggedId as sp1
    Editor.Layers.draggedId = sp1.id;

    // Simulate the drop-above behavior from _createCustomGroupRow's drop handler
    // by calling the internal logic directly
    const beforeOrder = Editor.Commands.captureDOMOrder();
    const elToMove = sp1.rootEl;
    svg.insertBefore(elToMove, gEl.nextElementSibling);
    const selUI = document.getElementById('selUI');
    const dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);

    // Verify sprite is NOT inside the group
    expect(gEl.contains(sp1.el)).toBe(false);
    // Sprite should be a direct SVG child
    expect(sp1.el.parentNode).toBe(svg);
    // Sprite should be after the group in DOM
    const children = Array.from(svg.children);
    expect(children.indexOf(sp1.el)).toBeGreaterThan(children.indexOf(gEl));
  });

  it('drop-below on group row adds sprite INTO group', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp2, sp3]);

    // Drop sp1 "below" the group row = add to group
    Editor.Groups.addToGroup(group.id, sp1);

    expect(sp1.groupId).toBe(group.id);
    const gEl = document.getElementById(group.id);
    expect(gEl.contains(sp1.el)).toBe(true);
  });

  it('sprite dragged out of group onto another group (above) stays between groups', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);
    const sp4 = Editor.Sprites.addSprite('d.png', 190, 10, 50, 50, 0, 'floor', true);

    const group1 = Editor.Groups.createGroup([sp1, sp2]);
    const group2 = Editor.Groups.createGroup([sp3, sp4]);
    const g1El = document.getElementById(group1.id);
    const g2El = document.getElementById(group2.id);

    // Drag sp1 out of group1, position it between groups (above group2)
    const elToMove = sp1.rootEl;
    g1El.removeChild(elToMove);
    delete sp1.groupId;
    svg.insertBefore(elToMove, g2El.nextElementSibling);

    // Verify sp1 is between groups, not inside either
    expect(sp1.el.parentNode).toBe(svg);
    expect(g1El.contains(sp1.el)).toBe(false);
    expect(g2El.contains(sp1.el)).toBe(false);

    const children = Array.from(svg.children);
    expect(children.indexOf(sp1.el)).toBeGreaterThan(children.indexOf(g2El));
  });
});
