/* ══════════════════════════════════════════════════════════════
   Editor Undo — Ctrl/Cmd+Z undo stack (max 50 entries)
   Captures full sprite + model + light + objective + group state.
══════════════════════════════════════════════════════════════ */

Editor.Undo = {
  stack: [],
  MAX: 50,

  push() {
    const C = Editor.Core;
    const snapshot = {
      sprites: C.allSprites.map(s => ({
        id: s.id, file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot,
        layerType: s.layerType || 'floor', hidden: s.hidden,
        flipX: s.flipX || false, flipY: s.flipY || false,
        cropL: s.cropL || 0, cropT: s.cropT || 0, cropR: s.cropR || 0, cropB: s.cropB || 0,
        groupId: s.groupId || null,
        shadowMul: s.shadowMul != null ? s.shadowMul : 1.0
      })),
      models: C.allModels.map(m => m.kind === 'circle'
        ? { kind: 'circle', x: m.x, y: m.y, r: m.r, s: m.s, f: m.f, iconType: m.iconType }
        : { kind: 'rect', x: m.x, y: m.y, w: m.w, h: m.h, s: m.s, f: m.f }),
      lights: C.allLights.map(l => ({ id: l.id, x: l.x, y: l.y, color: l.color, radius: l.radius, intensity: l.intensity })),
      objectives: C.allObjectives.map(o => ({ idx: o.idx, leftPct: o.leftPct, topPct: o.topPct })),
      groups: (C.groups || []).map(g => ({ id: g.id, name: g.name, opacity: g.opacity })),
      sid: C.sid
    };
    this.stack.push(snapshot);
    if (this.stack.length > this.MAX) this.stack.shift();
  },

  pop() {
    if (this.stack.length === 0) return;
    const snapshot = this.stack.pop();
    const C = Editor.Core;

    // Cancel active crop mode
    if (Editor.Crop && Editor.Crop.active) Editor.Crop.cancel();

    // Remove existing sprites and their clips/wrappers
    C.allSprites.forEach(s => {
      if (s._clipId || s._clipWrap) Editor.Crop._removeClip(s);
      s.el.remove();
    });
    C.allSprites = [];

    // Remove existing custom groups from DOM
    (C.groups || []).forEach(g => {
      const el = document.getElementById(g.id);
      if (el) el.remove();
    });
    C.groups = [];

    // Restore groups first (create the <g> elements)
    if (snapshot.groups && snapshot.groups.length) {
      const svg = document.getElementById('battlefield');
      const selUI = document.getElementById('selUI');
      snapshot.groups.forEach(gd => {
        const g = document.createElementNS(C.NS, 'g');
        g.id = gd.id;
        g.setAttribute('opacity', gd.opacity != null ? gd.opacity : 1);
        svg.insertBefore(g, selUI);
        C.groups.push({ id: gd.id, name: gd.name, opacity: gd.opacity != null ? gd.opacity : 1 });
        // Update gid counter
        const num = parseInt(gd.id.replace('group-g', ''));
        if (num >= Editor.Groups.gid) Editor.Groups.gid = num + 1;
      });
    }

    // Restore sprites
    C.sid = snapshot.sid;
    snapshot.sprites.forEach(s => {
      // Add to original layer first (or spriteFloor as fallback)
      const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, s.layerType || 'floor', true);
      sp.hidden = s.hidden;
      sp.el.style.display = sp.hidden ? 'none' : '';
      sp.flipX = s.flipX || false;
      sp.flipY = s.flipY || false;
      sp.cropL = s.cropL || 0;
      sp.cropT = s.cropT || 0;
      sp.cropR = s.cropR || 0;
      sp.cropB = s.cropB || 0;
      sp.shadowMul = s.shadowMul != null ? s.shadowMul : 1.0;

      // Apply flip
      if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);

      // Move into group if needed (handle crop wrappers)
      if (s.groupId) {
        sp.groupId = s.groupId;
        const gEl = document.getElementById(s.groupId);
        if (gEl) {
          const elToMove = sp._clipWrap || sp.el;
          if (elToMove.parentNode) elToMove.parentNode.removeChild(elToMove);
          gEl.appendChild(elToMove);
        }
      }
    });

    // Re-apply crop clips
    if (Editor.Crop) Editor.Crop.reapplyAll();

    // Restore models
    document.getElementById('modelLayer').innerHTML = '';
    C.allModels = [];
    Editor.Models.mid = 0;
    snapshot.models.forEach(m => {
      if (m.kind === 'circle') Editor.Models.addCircle(m.x, m.y, m.r, m.s, m.f, m.iconType);
      else Editor.Models.addRect(m.x, m.y, m.w, m.h, m.s, m.f);
    });

    // Restore lights
    Editor.Lights.removeAll();
    Editor.Lights.lid = 0;
    snapshot.lights.forEach(l => Editor.Lights.addLight(l.x, l.y, l.color, l.radius, l.intensity, true));

    Editor.Objectives.restorePositions(snapshot.objectives);

    // Re-apply sprite effects (filters) with correct per-sprite shadowMul
    if (Editor.Effects && Editor.Effects._ready) Editor.Effects.rebuildAll();

    // Ensure selUI and dragRect stay last
    const svg = document.getElementById('battlefield');
    const selUI = document.getElementById('selUI');
    const dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);

    C.selected = null;
    C.multiSel = [];
    C.selUI.style.display = 'none';
    C.selUI.innerHTML = '';
    Editor.Layers.rebuild();
    C.updateDebug();
    Editor.Persistence.save();
  }
};
