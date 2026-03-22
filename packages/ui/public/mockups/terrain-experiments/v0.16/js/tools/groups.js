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
    const beforeDOM = Editor.Commands.captureDOMOrder();

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
      if (sprites.some(s => {
        const el = s.rootEl;
        return el.parentNode === child || el === child;
      })) {
        insertRef = child.nextElementSibling;
        break;
      }
    }
    if (insertRef) svg.insertBefore(g, insertRef);
    else svg.appendChild(g);

    // Move sprites into the group <g> in their current DOM z-order (not selection order)
    const svgChildrenList = Array.from(svg.children);
    const sorted = sprites.slice().sort((a, b) =>
      svgChildrenList.indexOf(a.rootEl) - svgChildrenList.indexOf(b.rootEl)
    );
    sorted.forEach(sp => {
      const elToMove = sp.rootEl;
      elToMove.parentNode.removeChild(elToMove);
      g.appendChild(elToMove);
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
    const spriteIds = sprites.map(function(s) { return s.id; });
    Editor.Undo.record(Editor.Commands.Group.create(id, name, 1.0, spriteIds, beforeDOM));
    Editor.State.dispatch({ type: 'GROUP', id: id });
    Editor.Layers.rebuild();
    C.updateDebug();
    return group;
  },

  /* ── Add a sprite to an existing group ── */
  addToGroup(groupId, sp) {
    const C = Editor.Core;
    const gEl = document.getElementById(groupId);
    if (!gEl || !sp) return;
    const beforeDOM = Editor.Commands.captureDOMOrder();
    const oldGroupId = sp.groupId || null;

    // The element to move may be wrapped in a crop <g>
    const elToMove = sp.rootEl;

    // Remove from current group if in one
    if (sp.groupId && sp.groupId !== groupId) {
      const oldGroupEl = document.getElementById(sp.groupId);
      if (oldGroupEl && elToMove.parentNode === oldGroupEl) {
        oldGroupEl.removeChild(elToMove);
      }
    }

    // Move sprite into the group <g>
    if (elToMove.parentNode) elToMove.parentNode.removeChild(elToMove);
    gEl.appendChild(elToMove);
    
    sp.groupId = groupId;

    Editor.Selection.deselect();
    Editor.Undo.record(Editor.Commands.AddToGroup.create(sp.id, oldGroupId, groupId, beforeDOM));
    Editor.State.dispatch({ type: 'ADD_TO_GROUP', id: groupId });
    Editor.Layers.rebuild();
    C.updateDebug();
  },

  /* ── Rename group ── */
  rename(groupId, newName) {
    const C = Editor.Core;
    const group = C.groups.find(g => g.id === groupId);
    if (!group) return;
    group.name = newName;
    Editor.State.dispatch({ type: 'RENAME_GROUP', id: groupId });
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
    Editor.State.dispatch({ type: 'SET_GROUP_OPACITY', id: groupId });
  },

  /* ── Ungroup — return sprites to original layers ── */
  ungroup(groupId) {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');
    const beforeDOM = Editor.Commands.captureDOMOrder();

    const gEl = document.getElementById(groupId);
    if (!gEl) return;

    const group = C.groups.find(g => g.id === groupId);
    const groupName = group ? group.name : groupId;
    const opacity = group ? group.opacity : 1;

    // Move sprites back to being direct SVG children at the group's current position.
    // Iterate in DOM order within the group to preserve their relative z-order.
    const childEls = Array.from(gEl.children);
    const sprites = [];
    childEls.forEach(el => {
      let sp = C.allSprites.find(s => s.rootEl === el);
      if (sp && sp.groupId === groupId) sprites.push(sp);
    });
    const spriteIds = sprites.map(s => s.id);
    const insertRef = gEl.nextElementSibling; // insert where the group was
    sprites.forEach(sp => {
      const elToMove = sp.rootEl;
      gEl.removeChild(elToMove);
      svg.insertBefore(elToMove, insertRef);
      delete sp.groupId;
    });

    // Remove the group <g> element
    gEl.remove();

    // Remove from groups array
    C.groups = C.groups.filter(g => g.id !== groupId);

    Editor.Selection.deselect();
    Editor.Undo.record(Editor.Commands.Ungroup.create(groupId, groupName, opacity, spriteIds, beforeDOM));
    Editor.State.dispatch({ type: 'UNGROUP', id: groupId });
    Editor.Layers.rebuild();
    C.updateDebug();
  },

  /* ── Delete group and its sprites ── */
  deleteGroup(groupId) {
    const C = Editor.Core;
    const beforeDOM = Editor.Commands.captureDOMOrder();
    const group = C.groups.find(g => g.id === groupId);
    const groupName = group ? group.name : groupId;
    const opacity = group ? group.opacity : 1;

    const sprites = C.allSprites.filter(s => s.groupId === groupId);
    const spriteDatas = sprites.map(s => Editor.Commands._captureSprite(s));
    const spriteIds = sprites.map(s => s.id);

    // Build undo: first ungrouping, then deleting each sprite
    const cmds = spriteDatas.map(d => Editor.Commands.DeleteSprite.create(d));

    sprites.forEach(sp => {
      if (sp._clipId || sp._clipWrap) Editor.Crop._removeClip(sp);
      sp.el.remove();
      C.allSprites = C.allSprites.filter(s => s !== sp);
    });

    const gEl = document.getElementById(groupId);
    if (gEl) gEl.remove();

    C.groups = C.groups.filter(g => g.id !== groupId);

    // Batch: group command (for restoring the group structure) + delete sprites
    const groupCmd = Editor.Commands.Group.create(groupId, groupName, opacity, spriteIds, beforeDOM);
    // On undo, we reverse the batch: first restore sprites, then restore group
    // So we record: [deleteSprites..., removeGroup] → reverse restores group then sprites
    cmds.push({ type: 'REMOVE_GROUP_ENTRY', apply: function() { C.groups = C.groups.filter(function(g) { return g.id !== groupId; }); }, reverse: function() { C.groups.push({ id: groupId, name: groupName, opacity: opacity }); } });
    // Actually simpler: use a custom batch that restores everything
    Editor.Undo.record({
      type: 'DELETE_GROUP',
      description: 'Delete group ' + groupId,
      apply: function() {
        // Re-delete: remove sprites and group
        var sprites2 = Editor.Core.allSprites.filter(function(s) { return s.groupId === groupId; });
        sprites2.forEach(function(sp) { if (sp._clipId || sp._clipWrap) Editor.Crop._removeClip(sp); sp.el.remove(); });
        Editor.Core.allSprites = Editor.Core.allSprites.filter(function(s) { return s.groupId !== groupId; });
        var gEl2 = document.getElementById(groupId);
        if (gEl2) gEl2.remove();
        Editor.Core.groups = Editor.Core.groups.filter(function(g) { return g.id !== groupId; });
      },
      reverse: function() {
        // Restore: recreate group, recreate sprites, restore DOM order
        var svg = document.getElementById('battlefield');
        var g = document.createElementNS(Editor.Core.NS, 'g');
        g.id = groupId;
        g.setAttribute('opacity', opacity != null ? opacity : 1);
        var selUI = document.getElementById('selUI');
        svg.insertBefore(g, selUI);
        Editor.Core.groups.push({ id: groupId, name: groupName, opacity: opacity != null ? opacity : 1 });
        spriteDatas.forEach(function(d) {
          Editor.Commands._restoreSprite(d);
        });
        if (beforeDOM) Editor.Commands._restoreDOMOrder(beforeDOM);
      }
    });

    Editor.Selection.deselect();
    Editor.State.dispatch({ type: 'DELETE_GROUP', id: groupId });
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

    // Move sprites into their groups (handle crop wrappers)
    C.allSprites.forEach(sp => {
      if (sp.groupId && document.getElementById(sp.groupId)) {
        const gEl = document.getElementById(sp.groupId);
        const elToMove = sp.rootEl;
        if (elToMove.parentNode) elToMove.parentNode.removeChild(elToMove);
        gEl.appendChild(elToMove);
      }
    });

    // Restore layer order
    const selUI = document.getElementById('selUI');
    const dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);
  }
};
