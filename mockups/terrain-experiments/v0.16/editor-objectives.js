/* ══════════════════════════════════════════════════════════════
   Editor Objectives — exact command-phase hex markers + area rings
   SVG + CSS copied verbatim from phases/command/v0.1
   All objectives are neutral state, draggable in the editor.
══════════════════════════════════════════════════════════════ */

Editor.Objectives = {
  // Default 5-objective layout (% positions)
  defaultPositions: [
    { idx: 0, leftPct: 50, topPct: 13.64 },
    { idx: 1, leftPct: 16.67, topPct: 50 },
    { idx: 2, leftPct: 50, topPct: 50 },
    { idx: 3, leftPct: 83.33, topPct: 50 },
    { idx: 4, leftPct: 50, topPct: 86.36 }
  ],

  init() {
    const C = Editor.Core;
    const container = document.getElementById('objectives');
    container.innerHTML = '';
    C.allObjectives = [];

    this.defaultPositions.forEach((pos, i) => {
      const num = String(i + 1).padStart(2, '0');

      // Area ring (dashed circle)
      const ring = document.createElement('div');
      ring.className = 'obj-area-ring';
      ring.style.cssText = `left:${pos.leftPct}%;top:${pos.topPct}%`;

      // Hex marker (exact command phase SVG)
      const hex = document.createElement('div');
      hex.className = 'obj-hex-wrap neutral';
      hex.style.cssText = `left:${pos.leftPct}%;top:${pos.topPct}%`;
      hex.innerHTML = `<svg class="obj-svg" viewBox="0 0 84 97">
        <polygon class="obj-bg" points="42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5"/>
        <polygon class="obj-ring" points="42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5"/>
        <text x="42" y="44" class="obj-n">${num}</text>
        <text x="42" y="62" class="obj-l">OBJ</text>
      </svg>`;

      // Make draggable
      hex.style.cursor = 'grab';
      const obj = { idx: i, leftPct: pos.leftPct, topPct: pos.topPct, ringEl: ring, hexEl: hex };
      hex.onmousedown = e => this.startDrag(e, obj);

      container.appendChild(ring);
      container.appendChild(hex);
      C.allObjectives.push(obj);
    });
  },

  startDrag(e, obj) {
    e.stopPropagation(); e.preventDefault();
    Editor.Undo.push();
    const container = document.getElementById('mapWrap');
    const rect = container.getBoundingClientRect();

    const mv = e2 => {
      const x = ((e2.clientX - rect.left) / rect.width * 100);
      const y = ((e2.clientY - rect.top) / rect.height * 100);
      obj.leftPct = Math.max(0, Math.min(100, x));
      obj.topPct = Math.max(0, Math.min(100, y));
      obj.ringEl.style.left = obj.leftPct + '%';
      obj.ringEl.style.top = obj.topPct + '%';
      obj.hexEl.style.left = obj.leftPct + '%';
      obj.hexEl.style.top = obj.topPct + '%';
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      Editor.Persistence.save();
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  // Restore positions from undo/persistence
  restorePositions(positions) {
    const C = Editor.Core;
    if (!positions || !C.allObjectives.length) return;
    positions.forEach(p => {
      const obj = C.allObjectives[p.idx];
      if (!obj) return;
      obj.leftPct = p.leftPct;
      obj.topPct = p.topPct;
      obj.ringEl.style.left = obj.leftPct + '%';
      obj.ringEl.style.top = obj.topPct + '%';
      obj.hexEl.style.left = obj.leftPct + '%';
      obj.hexEl.style.top = obj.topPct + '%';
    });
  },

  serialize() {
    return Editor.Core.allObjectives.map(o => ({ idx: o.idx, leftPct: o.leftPct, topPct: o.topPct }));
  }
};
