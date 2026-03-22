/**
 * Deploy Zone Layers — tests for expandable deploy zone group in layers panel
 * with per-zone visibility toggles.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Deploy Zone Layers', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('deployZones appears in z-order as a built-in group', () => {
    const zItems = Editor.Layers._buildZOrder();
    const dz = zItems.find(z => z.type === 'group' && z.groupId === 'deployZones');
    expect(dz).toBeTruthy();
    expect(dz.meta.name).toBe('Deploy Zones');
  });

  it('deploy zones group is expandable and shows child zones', () => {
    // Default: collapsed
    expect(Editor.Layers.expandedGroups.deployZones).toBe(false);

    // Expand
    Editor.Layers.expandedGroups.deployZones = true;
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const childRows = list.querySelectorAll('.child-row');
    // Should have at least 2 child rows (imperium + ork)
    const deployChildren = Array.from(childRows).filter(r => r.textContent.includes('Deploy'));
    expect(deployChildren.length).toBe(2);
  });

  it('child zone rows show correct names', () => {
    Editor.Layers.expandedGroups.deployZones = true;
    Editor.Layers.rebuild();

    const list = document.getElementById('layersList');
    const html = list.innerHTML;
    expect(html).toContain('Imperium Deploy');
    expect(html).toContain('Ork Deploy');
  });

  it('toggleDeployZoneVis hides individual zone', () => {
    const impEl = document.getElementById('deploy-imperium');
    expect(impEl.style.display).not.toBe('none');

    Editor.Layers.toggleDeployZoneVis('deploy-imperium');
    expect(impEl.style.display).toBe('none');

    // Ork should still be visible
    const orkEl = document.getElementById('deploy-ork');
    expect(orkEl.style.display).not.toBe('none');
  });

  it('toggleDeployZoneVis re-shows hidden zone', () => {
    const impEl = document.getElementById('deploy-imperium');

    // Hide then show
    Editor.Layers.toggleDeployZoneVis('deploy-imperium');
    expect(impEl.style.display).toBe('none');

    Editor.Layers.toggleDeployZoneVis('deploy-imperium');
    expect(impEl.style.display).toBe('');
  });

  it('deployZones is tracked in EditorState zOrder', () => {
    const S = Editor.State;
    S.syncZOrderFromDOM();
    const entry = S.zOrder.find(e => e.id === 'deployZones');
    expect(entry).toBeTruthy();
    expect(entry.type).toBe('builtin');
  });

  it('layers panel shows deploy zone group row with correct metadata', () => {
    Editor.Layers.rebuild();
    const list = document.getElementById('layersList');
    const groupRows = list.querySelectorAll('.group-row');
    const deployRow = Array.from(groupRows).find(r => r.textContent.includes('Deploy Zones'));
    expect(deployRow).toBeTruthy();
    expect(deployRow.textContent).toContain('2 zones');
  });
});
