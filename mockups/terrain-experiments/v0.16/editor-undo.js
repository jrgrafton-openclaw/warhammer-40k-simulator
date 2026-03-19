/* ══════════════════════════════════════════════════════════════
   Editor Undo — Ctrl/Cmd+Z undo stack (max 50 entries)
   Captures full sprite + model + light + objective state snapshots.
══════════════════════════════════════════════════════════════ */

Editor.Undo = {
  stack: [],
  MAX: 50,

  // Call before any mutation (move, resize, rotate, add, delete, reorder, paste, duplicate)
  push() {
    const C = Editor.Core;
    const snapshot = {
      sprites: C.allSprites.map(s => ({
        id: s.id, file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot, layer: s.layer, hidden: s.hidden
      })),
      models: C.allModels.map(m => m.kind === 'circle'
        ? { kind: 'circle', x: m.x, y: m.y, r: m.r, s: m.s, f: m.f, iconType: m.iconType }
        : { kind: 'rect', x: m.x, y: m.y, w: m.w, h: m.h, s: m.s, f: m.f }),
      lights: C.allLights.map(l => ({ id: l.id, x: l.x, y: l.y, color: l.color, radius: l.radius, intensity: l.intensity })),
      objectives: C.allObjectives.map(o => ({ idx: o.idx, leftPct: o.leftPct, topPct: o.topPct })),
      sid: C.sid
    };
    this.stack.push(snapshot);
    if (this.stack.length > this.MAX) this.stack.shift();
  },

  pop() {
    if (this.stack.length === 0) return;
    const snapshot = this.stack.pop();
    const C = Editor.Core;

    // Restore sprites
    C.allSprites.forEach(s => s.el.remove());
    C.allSprites = [];
    C.sid = snapshot.sid;
    snapshot.sprites.forEach(s => {
      const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, s.layer, true);
      sp.hidden = s.hidden;
      sp.el.style.display = sp.hidden ? 'none' : '';
    });

    // Restore models
    document.getElementById('modelLayer').innerHTML = '';
    C.allModels = [];
    snapshot.models.forEach(m => {
      if (m.kind === 'circle') Editor.Models.addCircle(m.x, m.y, m.r, m.s, m.f, m.iconType);
      else Editor.Models.addRect(m.x, m.y, m.w, m.h, m.s, m.f);
    });

    // Restore lights
    Editor.Lights.removeAll();
    snapshot.lights.forEach(l => Editor.Lights.addLight(l.x, l.y, l.color, l.radius, l.intensity, true));

    // Restore objectives
    Editor.Objectives.restorePositions(snapshot.objectives);

    C.selected = null;
    C.multiSel = [];
    C.selUI.style.display = 'none';
    C.selUI.innerHTML = '';
    Editor.Layers.rebuild();
    C.updateDebug();
    Editor.Persistence.save();
  }
};
