/* ══════════════════════════════════════════════════════════════
   Editor Selection — single/multi select, drag-rect, arrow-key move,
   selection UI (handles, rotation), multi-rotate
══════════════════════════════════════════════════════════════ */

Editor.Selection = {
  isDragSelecting: false,
  dragStart: null,

  init() {
    const C = Editor.Core;
    const svg = C.svg;
    const dragRectEl = document.getElementById('dragRect');

    // Click empty area → deselect + start drag-select
    svg.addEventListener('mousedown', e => {
      if (e.target === svg || e.target.id === 'bgImg' || (e.target.tagName === 'rect' && !e.target.classList.contains('sel-handle'))) {
        const clickedSprite = C.allSprites.find(sp => sp.el === e.target);
        if (!clickedSprite) {
          this.deselect();
          // Start drag-select
          this.isDragSelecting = true;
          this.dragStart = C.svgPt(e.clientX, e.clientY);
          dragRectEl.setAttribute('x', this.dragStart.x); dragRectEl.setAttribute('y', this.dragStart.y);
          dragRectEl.setAttribute('width', 0); dragRectEl.setAttribute('height', 0);
          dragRectEl.style.display = '';

          const mv = e2 => {
            if (!this.isDragSelecting) return;
            const p = C.svgPt(e2.clientX, e2.clientY);
            dragRectEl.setAttribute('x', Math.min(this.dragStart.x, p.x));
            dragRectEl.setAttribute('y', Math.min(this.dragStart.y, p.y));
            dragRectEl.setAttribute('width', Math.abs(p.x - this.dragStart.x));
            dragRectEl.setAttribute('height', Math.abs(p.y - this.dragStart.y));
          };
          const up = e2 => {
            document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
            this.isDragSelecting = false; dragRectEl.style.display = 'none';
            const p = C.svgPt(e2.clientX, e2.clientY);
            const rx = Math.min(this.dragStart.x, p.x), ry = Math.min(this.dragStart.y, p.y);
            const rw = Math.abs(p.x - this.dragStart.x), rh = Math.abs(p.y - this.dragStart.y);
            if (rw < 5 && rh < 5) return;
            C.multiSel = C.allSprites.filter(sp => !sp.hidden && sp.x+sp.w > rx && sp.x < rx+rw && sp.y+sp.h > ry && sp.y < ry+rh);
            if (C.multiSel.length > 0) { C.selected = C.multiSel[0]; this.drawMultiSel(); Editor.Layers.rebuild(); }
          };
          document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
        }
      }
    });

    // Keyboard handler
    document.addEventListener('keydown', e => this.onKey(e));
  },

  select(sp) {
    const C = Editor.Core;
    C.selected = sp; C.multiSel = [sp];
    Editor.Lights.deselectLight();
    this.drawSelectionUI(); Editor.Layers.rebuild();
  },

  deselect() {
    const C = Editor.Core;
    C.selected = null; C.multiSel = [];
    C.selUI.style.display = 'none'; C.selUI.innerHTML = '';
    Editor.Layers.rebuild();
  },

  drawSelectionUI() {
    const C = Editor.Core;
    if (C.multiSel.length > 1) this.drawMultiSel(); else this.drawSel();
  },

  drawSel() {
    const C = Editor.Core, NS = C.NS, s = C.selected;
    if (!s) { C.selUI.style.display = 'none'; return; }
    C.selUI.style.display = ''; C.selUI.innerHTML = '';
    const cx = s.x + s.w/2, cy = s.y + s.h/2;

    // Bounding rect
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', s.x-2); r.setAttribute('y', s.y-2); r.setAttribute('width', s.w+4); r.setAttribute('height', s.h+4);
    r.setAttribute('fill', 'none'); r.setAttribute('stroke', '#00d4ff'); r.setAttribute('stroke-dasharray', '4,3'); r.setAttribute('stroke-width', '1.5');
    if (s.rot) r.setAttribute('transform', `rotate(${s.rot},${cx},${cy})`);
    C.selUI.appendChild(r);

    // Corner handles
    [[s.x, s.y, 'nw'], [s.x+s.w, s.y, 'ne'], [s.x, s.y+s.h, 'sw'], [s.x+s.w, s.y+s.h, 'se']].forEach(([hx, hy, pos]) => {
      const h = document.createElementNS(NS, 'rect');
      h.setAttribute('x', hx-3); h.setAttribute('y', hy-3); h.setAttribute('width', 6); h.setAttribute('height', 6);
      h.setAttribute('fill', '#00d4ff'); h.style.cursor = pos + '-resize';
      if (s.rot) h.setAttribute('transform', `rotate(${s.rot},${cx},${cy})`);
      h.onmousedown = e => { e.stopPropagation(); Editor.Sprites.startResize(e, s, pos); };
      C.selUI.appendChild(h);
    });

    // Rotate handle
    const rh = document.createElementNS(NS, 'circle');
    rh.setAttribute('cx', cx); rh.setAttribute('cy', s.y - 16); rh.setAttribute('r', 4);
    rh.setAttribute('fill', '#00d4ff'); rh.style.cursor = 'grab';
    if (s.rot) rh.setAttribute('transform', `rotate(${s.rot},${cx},${cy})`);
    rh.onmousedown = e => { e.stopPropagation(); Editor.Sprites.startRotate(e, s); };
    C.selUI.appendChild(rh);
  },

  drawMultiSel() {
    const C = Editor.Core, NS = C.NS;
    if (C.multiSel.length <= 1) { if (C.selected) this.drawSel(); return; }
    C.selUI.style.display = ''; C.selUI.innerHTML = '';

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    C.multiSel.forEach(s => { minX = Math.min(minX, s.x); minY = Math.min(minY, s.y); maxX = Math.max(maxX, s.x+s.w); maxY = Math.max(maxY, s.y+s.h); });

    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', minX-3); r.setAttribute('y', minY-3); r.setAttribute('width', maxX-minX+6); r.setAttribute('height', maxY-minY+6);
    r.setAttribute('fill', 'none'); r.setAttribute('stroke', '#00d4ff'); r.setAttribute('stroke-dasharray', '6,3'); r.setAttribute('stroke-width', '1.5');
    C.selUI.appendChild(r);

    C.multiSel.forEach(s => {
      const h = document.createElementNS(NS, 'rect');
      h.setAttribute('x', s.x); h.setAttribute('y', s.y); h.setAttribute('width', s.w); h.setAttribute('height', s.h);
      h.setAttribute('fill', 'rgba(0,212,255,0.05)'); h.setAttribute('stroke', '#00d4ff'); h.setAttribute('stroke-width', '0.5'); h.setAttribute('stroke-dasharray', '3,2');
      if (s.rot) h.setAttribute('transform', `rotate(${s.rot},${s.x+s.w/2},${s.y+s.h/2})`);
      C.selUI.appendChild(h);
    });

    // Multi-rotate handle
    const cx = (minX+maxX)/2;
    const rh = document.createElementNS(NS, 'circle');
    rh.setAttribute('cx', cx); rh.setAttribute('cy', minY-18); rh.setAttribute('r', 4);
    rh.setAttribute('fill', '#00d4ff'); rh.style.cursor = 'grab';
    rh.onmousedown = e => { e.stopPropagation(); this.startRotateMulti(e); };
    C.selUI.appendChild(rh);
  },

  // ── Move (single sprite) ──
  startMove(e, sp) {
    const C = Editor.Core;
    Editor.Undo.push();
    const pt = C.svgPt(e.clientX, e.clientY), ox = pt.x - sp.x, oy = pt.y - sp.y;
    const mv = e2 => { const p = C.svgPt(e2.clientX, e2.clientY); sp.x = p.x-ox; sp.y = p.y-oy; Editor.Sprites.apply(sp); this.drawSelectionUI(); C.updateDebug(); };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Persistence.save(); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Move multi-select or single ──
  startMoveMulti(e, sp) {
    const C = Editor.Core;
    if (C.multiSel.length > 1 && C.multiSel.includes(sp)) {
      Editor.Undo.push();
      const pt = C.svgPt(e.clientX, e.clientY);
      const offsets = C.multiSel.map(s => ({ s, ox: pt.x - s.x, oy: pt.y - s.y }));
      const mv = e2 => { const p = C.svgPt(e2.clientX, e2.clientY); offsets.forEach(({s, ox, oy}) => { s.x = p.x-ox; s.y = p.y-oy; Editor.Sprites.apply(s); }); this.drawSelectionUI(); C.updateDebug(); };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Persistence.save(); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    } else {
      C.multiSel = [sp]; this.startMove(e, sp);
    }
  },

  // ── Multi-rotate ──
  startRotateMulti(e) {
    const C = Editor.Core;
    if (C.multiSel.length <= 1) return;
    e.preventDefault();
    Editor.Undo.push();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    C.multiSel.forEach(s => { minX = Math.min(minX, s.x); minY = Math.min(minY, s.y); maxX = Math.max(maxX, s.x+s.w); maxY = Math.max(maxY, s.y+s.h); });
    const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
    const a0 = Math.atan2(C.svgPt(e.clientX, e.clientY).y - cy, C.svgPt(e.clientX, e.clientY).x - cx);
    const start = C.multiSel.map(s => ({ s, x: s.x, y: s.y, rot: s.rot, cx: s.x+s.w/2, cy: s.y+s.h/2 }));
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY), a1 = Math.atan2(p.y-cy, p.x-cx), da = a1-a0;
      const snap = e2.shiftKey ? Math.PI/4 : Math.PI/12, ang = Math.round(da/snap)*snap;
      start.forEach(o => {
        const dx = o.cx-cx, dy = o.cy-cy;
        o.s.x = cx + dx*Math.cos(ang) - dy*Math.sin(ang) - o.s.w/2;
        o.s.y = cy + dx*Math.sin(ang) + dy*Math.cos(ang) - o.s.h/2;
        o.s.rot = o.rot + ang*180/Math.PI;
        Editor.Sprites.apply(o.s);
      });
      this.drawSelectionUI(); C.updateDebug();
    };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Persistence.save(); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Keyboard ──
  onKey(e) {
    const C = Editor.Core;

    // Undo: Ctrl/Cmd+Z
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); Editor.Undo.pop(); return; }

    // Copy (sprites or lights)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      if (C.multiSel.length) {
        C.clipboardSprites = C.multiSel.map(s => ({ file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot, layer: s.layer, hidden: s.hidden }));
        C.clipboardLights = [];
        e.preventDefault(); return;
      }
      if (Editor.Lights.selectedLight) {
        const l = Editor.Lights.selectedLight;
        C.clipboardLights = [{ x: l.x, y: l.y, color: l.color, radius: l.radius, intensity: l.intensity }];
        C.clipboardSprites = [];
        e.preventDefault(); return;
      }
      return;
    }
    // Paste (sprites or lights)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
      if (C.clipboardSprites.length) {
        Editor.Undo.push();
        this.deselect();
        C.multiSel = C.clipboardSprites.map(s => Editor.Sprites.addSprite(s.file, s.x+20, s.y+20, s.w, s.h, s.rot, s.layer, true));
        C.selected = C.multiSel[0]; this.drawSelectionUI(); Editor.Persistence.save(); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
      if (C.clipboardLights.length) {
        Editor.Undo.push();
        C.clipboardLights.forEach(l => {
          Editor.Lights.addLight(l.x + 20, l.y + 20, l.color, l.radius, l.intensity);
        });
        Editor.Persistence.save(); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
      return;
    }

    if (e.key === 'Escape') { this.deselect(); Editor.Lights.deselectLight(); return; }

    // Delete (sprites or selected light)
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (Editor.Lights.selectedLight) {
        Editor.Undo.push();
        Editor.Lights.removeLight(Editor.Lights.selectedLight.id);
        Editor.Persistence.save(); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
      if (C.selected) {
        Editor.Undo.push();
        const toDelete = C.multiSel.length > 1 ? C.multiSel : [C.selected];
        toDelete.forEach(s => { s.el.remove(); C.allSprites = C.allSprites.filter(x => x !== s); });
        this.deselect(); C.updateDebug(); Editor.Persistence.save(); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
    }

    if (!C.selected) return;

    // Duplicate
    if (e.key === 'd') {
      Editor.Undo.push();
      C.multiSel = (C.multiSel.length ? C.multiSel : [C.selected]).map(s => Editor.Sprites.addSprite(s.file, s.x+15, s.y+15, s.w, s.h, s.rot, s.layer, true));
      C.selected = C.multiSel[0]; this.drawSelectionUI(); Editor.Layers.rebuild();
    }

    // Rotate
    if (e.key === 'r' || e.key === 'R') {
      Editor.Undo.push();
      const step = e.shiftKey ? 45 : 15;
      (C.multiSel.length > 1 ? C.multiSel : [C.selected]).forEach(s => { s.rot = (s.rot + step) % 360; Editor.Sprites.apply(s); });
      this.drawSelectionUI(); C.updateDebug(); Editor.Persistence.save();
    }

    // Z-order
    if (e.key === '=' || e.key === '+') {
      const layer = document.getElementById(C.selected.layer);
      const next = C.selected.el.nextElementSibling;
      if (next) layer.insertBefore(next, C.selected.el);
      Editor.Persistence.save(); Editor.Layers.rebuild();
    }
    if (e.key === '-') {
      const layer = document.getElementById(C.selected.layer);
      const prev = C.selected.el.previousElementSibling;
      if (prev) layer.insertBefore(C.selected.el, prev);
      Editor.Persistence.save(); Editor.Layers.rebuild();
    }

    // Arrow keys — move selected sprites
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const targets = C.multiSel.length > 0 ? C.multiSel : [C.selected];
      if (targets[0]) {
        Editor.Undo.push();
        targets.forEach(s => {
          if (e.key === 'ArrowUp') s.y -= step;
          if (e.key === 'ArrowDown') s.y += step;
          if (e.key === 'ArrowLeft') s.x -= step;
          if (e.key === 'ArrowRight') s.x += step;
          Editor.Sprites.apply(s);
        });
        this.drawSelectionUI(); C.updateDebug(); Editor.Persistence.save();
      }
    }
  }
};
