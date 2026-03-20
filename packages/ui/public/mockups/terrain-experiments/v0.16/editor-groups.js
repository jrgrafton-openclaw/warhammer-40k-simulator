/* ══════════════════════════════════════════════════════════════
   Editor Groups — custom sprite groups with DOM <g> wrapper
   and per-group opacity.
   ⌘/Ctrl+G to group, ⌘/Ctrl+G on grouped = ungroup.
══════════════════════════════════════════════════════════════ */

Editor.Groups = {
  gid: 0,

  init() {
    const C = Editor.Core;
    if (!C.groups) C.groups = [];
  },

  /* ── Create a group from selected sprites ── */
  createGroup(sprites) {
    if (!sprites || sprites.length < 2) return;
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');
    Editor.Undo.push();

    const id = 'group-g' + (this.gid++);
    const name = 'Group ' + this.gid;

    // Create SVG <g> wrapper
    const g = document.createElementNS(C.NS, 'g');
    g.id = id;
    g.setAttribute('opacity', '1');

    // Insert the group at the position of the first (topmost) sprite
    // Find the highest z-order parent among the sprites
    let insertRef = null;
    const svgChildren = Array.from(svg.children);
    for (let i = svgChildren.length - 1; i >= 0; i--) {
      const child = svgChildren[i];
      if (sprites.some(s => s.el.parentNode === child || s.el === child)) {
        insertRef = child.nextElementSibling;
        break;
      }
    }
    if (insertRef) svg.insertBefore(g, insertRef);
    else svg.appendChild(g);

    // Move sprites into the group <g>
    sprites.forEach(sp => {
      sp.el.parentNode.removeChild(sp.el);
      g.appendChild(sp.el);
      sp.groupId = id;
      
      
    });

    // Ensure selUI and dragRect stay last
    const selUI = document.getElementById('selUI');
    const dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);

    const group = { id, name, opacity: 1.0 };
    C.groups.push(group);

    Editor.Selection.deselect();
    Editor.Persistence.save();
    Editor.Layers.rebuild();
    C.updateDebug();
    return group;
  },

  /* ── Add a sprite to an existing group ── */
  addToGroup(groupId, sp) {
    const C = Editor.Core;
    const gEl = document.getElementById(groupId);
    if (!gEl || !sp) return;
    Editor.Undo.push();

    // Remove from current group if in one
    if (sp.groupId) {
      // Just move out, don't delete the old group
    }

    // Move sprite into the group <g>
    sp.el.parentNode.removeChild(sp.el);
    gEl.appendChild(sp.el);
    
    sp.groupId = groupId;
    

    Editor.Selection.deselect();
    Editor.Persistence.save();
    Editor.Layers.rebuild();
    C.updateDebug();
  },

  /* ── Rename group ── */
  rename(groupId, newName) {
    const C = Editor.Core;
    const group = C.groups.find(g => g.id === groupId);
    if (!group) return;
    group.name = newName;
    Editor.Persistence.save();
    Editor.Layers.rebuild();
  },

  /* ── Set group opacity ── */
  setOpacity(groupId, opacity) {
    const C = Editor.Core;
    const group = C.groups.find(g => g.id === groupId);
    if (!group) return;
    group.opacity = Math.max(0, Math.min(1, opacity));
    const el = document.getElementById(groupId);
    if (el) el.setAttribute('opacity', group.opacity);
    Editor.Persistence.save();
  },

  /* ── Ungroup — return sprites to original layers ── */
  ungroup(groupId) {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');
    Editor.Undo.push();

    const gEl = document.getElementById(groupId);
    if (!gEl) return;

    // Move sprites back to being direct SVG children (insert before selUI)
    const sprites = C.allSprites.filter(s => s.groupId === groupId);
    const selUI = document.getElementById('selUI');
    sprites.forEach(sp => {
      gEl.removeChild(sp.el);
      svg.insertBefore(sp.el, selUI);
      delete sp.groupId;
    });

    // Remove the group <g> element
    gEl.remove();

    // Remove from groups array
    C.groups = C.groups.filter(g => g.id !== groupId);

    Editor.Selection.deselect();
    Editor.Persistence.save();
    Editor.Layers.rebuild();
    C.updateDebug();
  },

  /* ── Delete group and its sprites ── */
  deleteGroup(groupId) {
    const C = Editor.Core;
    Editor.Undo.push();

    const sprites = C.allSprites.filter(s => s.groupId === groupId);
    sprites.forEach(sp => {
      sp.el.remove();
      C.allSprites = C.allSprites.filter(s => s !== sp);
    });

    const gEl = document.getElementById(groupId);
    if (gEl) gEl.remove();

    C.groups = C.groups.filter(g => g.id !== groupId);

    Editor.Selection.deselect();
    Editor.Persistence.save();
    Editor.Layers.rebuild();
    C.updateDebug();
  },

  /* ── Restore groups from saved data ── */
  restore(groupsData, spriteGroupMap) {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');

    if (!groupsData || !groupsData.length) return;

    groupsData.forEach(gd => {
      const g = document.createElementNS(C.NS, 'g');
      g.id = gd.id;
      g.setAttribute('opacity', gd.opacity != null ? gd.opacity : 1);

      // Insert before selUI
      const selUI = document.getElementById('selUI');
      svg.insertBefore(g, selUI);

      C.groups.push({ id: gd.id, name: gd.name, opacity: gd.opacity != null ? gd.opacity : 1 });

      // Update gid counter
      const num = parseInt(gd.id.replace('group-g', ''));
      if (num >= this.gid) this.gid = num + 1;
    });

    // Move sprites into their groups
    C.allSprites.forEach(sp => {
      if (sp.groupId && document.getElementById(sp.groupId)) {
        const gEl = document.getElementById(sp.groupId);
        sp.el.parentNode.removeChild(sp.el);
        gEl.appendChild(sp.el);
        // sprite stays in the group DOM
      }
    });

    // Restore layer order
    const selUI = document.getElementById('selUI');
    const dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);
  }
};
