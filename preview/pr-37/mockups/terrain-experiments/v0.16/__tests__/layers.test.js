/**
 * Phase 0.4 — Layer Drag Tests
 *
 * Verifies that drag-to-reorder in the layers panel correctly
 * modifies SVG DOM order, group membership, and multi-select batch moves.
 *
 * Run: npx vitest run packages/ui/public/mockups/terrain-experiments/v0.16/__tests__/layers.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Layer drag reordering', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('drag sprite A above sprite B changes SVG DOM order', () => {
    const svg = document.getElementById('battlefield');
    const spA = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const spB = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const spC = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Initial order: A, B, C (A is behind, C is in front)
    const zItems = Editor.Layers._buildZOrder();

    // Drag A to C's position (move A in front of C)
    Editor.Layers._handleDrop(spA.id, spC.id, zItems);

    const children = Array.from(svg.children);
    const idxA = children.indexOf(spA.el);
    const idxC = children.indexOf(spC.el);
    // A should now be before C in DOM (behind in z-order, since insertBefore)
    expect(idxA).toBeLessThan(idxC);
    // But A should be after B (moved past it)
    const idxB = children.indexOf(spB.el);
    expect(idxA).toBeGreaterThan(idxB);
  });

  it('drag sprite out of group → becomes direct SVG child, groupId cleared', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // Group sp1 + sp2
    Editor.Groups.createGroup([sp1, sp2]);
    expect(sp1.groupId).toBeTruthy();

    // Build z-items (sp1 is inside group, not a direct SVG child)
    const zItems = Editor.Layers._buildZOrder();

    // Drag sp1 onto sp3 (out of group)
    Editor.Layers._handleDrop(sp1.id, sp3.id, zItems);

    expect(sp1.groupId).toBeUndefined();
    expect(sp1.el.parentNode).toBe(svg);
  });

  it('addToGroup moves sprite into group DOM', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2]);
    Editor.Groups.addToGroup(group.id, sp3);

    expect(sp3.groupId).toBe(group.id);
    const gEl = document.getElementById(group.id);
    expect(gEl.contains(sp3.el)).toBe(true);
  });

  it('multi-select drag moves all selected sprites together', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);
    const sp4 = Editor.Sprites.addSprite('d.png', 190, 10, 50, 50, 0, 'floor', true);

    // Select sp1 and sp2
    Editor.Core.multiSel = [sp1, sp2];
    Editor.Core.selected = sp1;

    const zItems = Editor.Layers._buildZOrder();
    Editor.Layers._handleDrop(sp1.id, sp4.id, zItems);

    const children = Array.from(svg.children);
    const idx1 = children.indexOf(sp1.el);
    const idx2 = children.indexOf(sp2.el);
    const idx3 = children.indexOf(sp3.el);
    const idx4 = children.indexOf(sp4.el);

    // sp1 and sp2 should be before sp4
    expect(idx1).toBeLessThan(idx4);
    expect(idx2).toBeLessThan(idx4);
    // Relative order preserved: sp1 before sp2
    expect(idx1).toBeLessThan(idx2);
    // sp3 should still be before both (it wasn't moved)
    expect(idx3).toBeLessThan(idx1);
  });

  it('_buildZOrder matches actual SVG children', () => {
    Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const zItems = Editor.Layers._buildZOrder();
    const spriteItems = zItems.filter(z => z.type === 'sprite');

    // Each sprite item's svgEl should be in the SVG
    const svg = document.getElementById('battlefield');
    spriteItems.forEach(z => {
      expect(svg.contains(z.svgEl)).toBe(true);
    });

    // Order should match DOM order
    const svgChildren = Array.from(svg.children);
    for (let i = 1; i < spriteItems.length; i++) {
      const prevIdx = svgChildren.indexOf(spriteItems[i - 1].svgEl);
      const currIdx = svgChildren.indexOf(spriteItems[i].svgEl);
      expect(currIdx).toBeGreaterThan(prevIdx);
    }
  });

  it('_buildZOrder finds crop-wrapped sprites', () => {
    const sp = Editor.Sprites.addSprite('test.png', 100, 100, 80, 60, 0, 'floor', true);
    sp.cropL = 0.1;
    sp.cropT = 0;
    sp.cropR = 0;
    sp.cropB = 0;
    Editor.Crop._applyClip(sp);

    const zItems = Editor.Layers._buildZOrder();
    const found = zItems.find(z => z.type === 'sprite' && z.ref === sp);
    expect(found).toBeTruthy();
    // The svgEl should be the wrapper, not the inner image
    expect(found.svgEl).toBe(sp._clipWrap);
  });

  it('grouping preserves relative z-order of sprites (Bug 2)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    // DOM order before grouping: sp1, sp2, sp3 (sp1 behind, sp3 in front)
    // Select in reverse order (sp3 first) — group should still preserve DOM order
    const group = Editor.Groups.createGroup([sp3, sp1, sp2]);
    const gEl = document.getElementById(group.id);
    const children = Array.from(gEl.children);

    // Inside group, relative order should match original DOM: sp1, sp2, sp3
    expect(children.indexOf(sp1.el)).toBeLessThan(children.indexOf(sp2.el));
    expect(children.indexOf(sp2.el)).toBeLessThan(children.indexOf(sp3.el));
  });

  it('ungrouping preserves relative z-order of sprites (Bug 3)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2, sp3]);
    Editor.Groups.ungroup(group.id);

    // After ungrouping, sprites should be direct SVG children in original order
    const svgChildren = Array.from(svg.children);
    const idx1 = svgChildren.indexOf(sp1.el);
    const idx2 = svgChildren.indexOf(sp2.el);
    const idx3 = svgChildren.indexOf(sp3.el);
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it('drop above target moves sprite after target in DOM (Bug 4)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);

    const zItems = Editor.Layers._buildZOrder();
    // dropAbove=true: user drops sp1 above sp2 row → sp1 should go after sp2 in DOM (in front)
    Editor.Layers._handleDrop(sp1.id, sp2.id, zItems, true);

    const children = Array.from(svg.children);
    expect(children.indexOf(sp1.el)).toBeGreaterThan(children.indexOf(sp2.el));
  });

  it('drop below target moves sprite before target in DOM (existing behavior)', () => {
    const svg = document.getElementById('battlefield');
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const zItems = Editor.Layers._buildZOrder();
    // dropAbove=false (or undefined): insert before target
    Editor.Layers._handleDrop(sp1.id, sp3.id, zItems, false);

    const children = Array.from(svg.children);
    expect(children.indexOf(sp1.el)).toBeLessThan(children.indexOf(sp3.el));
    expect(children.indexOf(sp1.el)).toBeGreaterThan(children.indexOf(sp2.el));
  });

  it('reorder within group changes child order', () => {
    const sp1 = Editor.Sprites.addSprite('a.png', 10, 10, 50, 50, 0, 'floor', true);
    const sp2 = Editor.Sprites.addSprite('b.png', 70, 10, 50, 50, 0, 'floor', true);
    const sp3 = Editor.Sprites.addSprite('c.png', 130, 10, 50, 50, 0, 'floor', true);

    const group = Editor.Groups.createGroup([sp1, sp2, sp3]);
    const gEl = document.getElementById(group.id);

    // Initial order inside group: sp1, sp2, sp3
    let children = Array.from(gEl.children);
    expect(children.indexOf(sp1.el)).toBeLessThan(children.indexOf(sp2.el));
    expect(children.indexOf(sp2.el)).toBeLessThan(children.indexOf(sp3.el));

    // Move sp3 before sp1 inside the group
    gEl.insertBefore(sp3.el, sp1.el);

    children = Array.from(gEl.children);
    expect(children.indexOf(sp3.el)).toBeLessThan(children.indexOf(sp1.el));
  });
});
