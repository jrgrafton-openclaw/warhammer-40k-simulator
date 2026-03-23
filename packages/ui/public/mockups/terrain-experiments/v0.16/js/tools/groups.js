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

  /* ── Add any entity to an existing group ── */
  addToGroup(groupId, entity) {
    const C = Editor.Core;
    const gEl = document.getElementById(groupId);
    if (!gEl || !entity) return;
    const beforeDOM = Editor.Commands.captureDOMOrder();
    const oldGroupId = entity.groupId || null;

    // The element to move — sprites have rootEl (for crop wrappers), others use el
    const elToMove = entity.rootEl || entity.el;

    // Remove from current group if in one
    if (entity.groupId && entity.groupId !== groupId) {
      const oldGroupEl = document.getElementById(entity.groupId);
      if (oldGroupEl && elToMove.parentNode === oldGroupEl) {
        oldGroupEl.removeChild(elToMove);
      }
    }

    // Move entity into the group <g>
    if (elToMove.parentNode) elToMove.parentNode.removeChild(elToMove);
    gEl.appendChild(elToMove);
    
    entity.groupId = groupId;

    Editor.Selection.deselect();
    Editor.Undo.record(Editor.Commands.AddToGroup.create(entity.id, oldGroupId, groupId, beforeDOM));
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

    // Move all entities back to being direct SVG children at the group's current position.
    // Iterate in DOM order within the group to preserve their relative z-order.
    const childEls = Array.from(gEl.children);
    const entities = [];
    childEls.forEach(el => {
      // Check sprites (rootEl may be crop wrapper)
      let ent = C.allSprites.find(s => s.rootEl === el);
      // Check smoke/fire FX
      if (!ent) ent = C.allSmokeFx.find(f => f.el === el);
      // Check lights
      if (!ent) ent = C.allLights.find(l => l.el === el);
      if (ent && ent.groupId === groupId) entities.push(ent);
    });
    const spriteIds = entities.map(s => s.id);
    const insertRef = gEl.nextElementSibling; // insert where the group was
    entities.forEach(ent => {
      const elToMove = ent.rootEl || ent.el;
      gEl.removeChild(elToMove);
      svg.insertBefore(elToMove, insertRef);
      delete ent.groupId;
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

    // Collect ALL entities in this group (sprites, fx, lights)
    const sprites = C.allSprites.filter(s => s.groupId === groupId);
    const fxEntities = C.allSmokeFx.filter(f => f.groupId === groupId);
    const lightEntities = C.allLights.filter(l => l.groupId === groupId);
    const spriteDatas = sprites.map(s => Editor.Commands._captureSprite(s));
    const fxDatas = fxEntities.map(f => Editor.Commands._captureFx(f));
    const lightDatas = lightEntities.map(l => Editor.Commands._captureLight(l));
    const spriteIds = sprites.map(s => s.id);

    // Build undo: first ungrouping, then deleting each sprite
    const cmds = spriteDatas.map(d => Editor.Commands.DeleteSprite.create(d));

    sprites.forEach(sp => {
      if (sp._clipId || sp._clipWrap) Editor.Crop._removeClip(sp);
      sp.el.remove();
      C.allSprites = C.allSprites.filter(s => s !== sp);
      if (Editor.Entity) Editor.Entity.unregister(sp.id);
    });
    fxEntities.forEach(fx => {
      Editor.Commands._removeFx(fx.id);
    });
    lightEntities.forEach(l => {
      Editor.Commands._removeLight(l.id);
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
        // Re-delete: remove all entities and group
        var sprites2 = Editor.Core.allSprites.filter(function(s) { return s.groupId === groupId; });
        sprites2.forEach(function(sp) { if (sp._clipId || sp._clipWrap) Editor.Crop._removeClip(sp); sp.el.remove(); if (Editor.Entity) Editor.Entity.unregister(sp.id); });
        Editor.Core.allSprites = Editor.Core.allSprites.filter(function(s) { return s.groupId !== groupId; });
        var fxInGroup = Editor.Core.allSmokeFx.filter(function(f) { return f.groupId === groupId; });
        fxInGroup.forEach(function(fx) { Editor.Commands._removeFx(fx.id); });
        var lightsInGroup = Editor.Core.allLights.filter(function(l) { return l.groupId === groupId; });
        lightsInGroup.forEach(function(l) { Editor.Commands._removeLight(l.id); });
        var gEl2 = document.getElementById(groupId);
        if (gEl2) gEl2.remove();
        Editor.Core.groups = Editor.Core.groups.filter(function(g) { return g.id !== groupId; });
      },
      reverse: function() {
        // Restore: recreate group, recreate all entities, restore DOM order
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
        fxDatas.forEach(function(d) {
          var fx = Editor.Commands._restoreFx(d);
          if (fx) { fx.groupId = groupId; var gEl = document.getElementById(groupId); if (gEl) { if (fx.el.parentNode) fx.el.parentNode.removeChild(fx.el); gEl.appendChild(fx.el); } }
        });
        lightDatas.forEach(function(d) {
          var l = Editor.Commands._restoreLight(d);
          if (l) { l.groupId = groupId; var gEl = document.getElementById(groupId); if (gEl) { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); gEl.appendChild(l.el); } }
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

    // Move FX into their groups
    if (C.allSmokeFx) {
      C.allSmokeFx.forEach(fx => {
        if (fx.groupId && document.getElementById(fx.groupId)) {
          const gEl = document.getElementById(fx.groupId);
          if (fx.el.parentNode) fx.el.parentNode.removeChild(fx.el);
          gEl.appendChild(fx.el);
        }
      });
    }

    // Move lights into their groups
    if (C.allLights) {
      C.allLights.forEach(l => {
        if (l.groupId && document.getElementById(l.groupId)) {
          const gEl = document.getElementById(l.groupId);
          if (l.el.parentNode) l.el.parentNode.removeChild(l.el);
          gEl.appendChild(l.el);
        }
      });
    }

    // Restore layer order
    const selUI = document.getElementById('selUI');
    const dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);
  }
};
