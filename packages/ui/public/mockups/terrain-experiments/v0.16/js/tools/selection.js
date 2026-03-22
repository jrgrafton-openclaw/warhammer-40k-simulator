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
    if (!s || (Editor.Crop && Editor.Crop.active)) { C.selUI.style.display = 'none'; return; }
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

    // Edge-midpoint handles (stretch in one dimension)
    const edgeHandleSize = 8;
    [
      [s.x + s.w/2, s.y,       'n', edgeHandleSize, 4, 'ns-resize'],   // top edge
      [s.x + s.w/2, s.y + s.h, 's', edgeHandleSize, 4, 'ns-resize'],   // bottom edge
      [s.x,         s.y + s.h/2,'w', 4, edgeHandleSize, 'ew-resize'],   // left edge
      [s.x + s.w,   s.y + s.h/2,'e', 4, edgeHandleSize, 'ew-resize'],   // right edge
    ].forEach(([hx, hy, pos, hw, hh, cursor]) => {
      const h = document.createElementNS(NS, 'rect');
      h.setAttribute('x', hx - hw/2); h.setAttribute('y', hy - hh/2);
      h.setAttribute('width', hw); h.setAttribute('height', hh);
      h.setAttribute('fill', '#00d4ff'); h.style.cursor = cursor;
      h.classList.add('sel-handle');
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
    r.style.pointerEvents = 'none'; // Let clicks pass through to sprites
    C.selUI.appendChild(r);

    C.multiSel.forEach(s => {
      const h = document.createElementNS(NS, 'rect');
      h.setAttribute('x', s.x); h.setAttribute('y', s.y); h.setAttribute('width', s.w); h.setAttribute('height', s.h);
      h.setAttribute('fill', 'rgba(0,212,255,0.05)'); h.setAttribute('stroke', '#00d4ff'); h.setAttribute('stroke-width', '0.5'); h.setAttribute('stroke-dasharray', '3,2');
      h.style.pointerEvents = 'none'; // Let clicks pass through to actual sprites
      if (s.rot) h.setAttribute('transform', `rotate(${s.rot},${s.x+s.w/2},${s.y+s.h/2})`);
      C.selUI.appendChild(h);
    });

    // Corner resize handles for multi-select
    [[minX, minY, 'nw'], [maxX, minY, 'ne'], [minX, maxY, 'sw'], [maxX, maxY, 'se']].forEach(([hx, hy, pos]) => {
      const h = document.createElementNS(NS, 'rect');
      h.setAttribute('x', hx-3); h.setAttribute('y', hy-3); h.setAttribute('width', 6); h.setAttribute('height', 6);
      h.setAttribute('fill', '#00d4ff'); h.style.cursor = pos + '-resize';
      h.onmousedown = e => { e.stopPropagation(); this.startResizeMulti(e, pos, minX, minY, maxX, maxY); };
      C.selUI.appendChild(h);
    });

    // Edge midpoint resize handles for multi-select
    const midHandles = [
      [(minX+maxX)/2, minY, 'n', 10, 4, 'ns-resize'],
      [(minX+maxX)/2, maxY, 's', 10, 4, 'ns-resize'],
      [minX, (minY+maxY)/2, 'w', 4, 10, 'ew-resize'],
      [maxX, (minY+maxY)/2, 'e', 4, 10, 'ew-resize'],
    ];
    midHandles.forEach(([hx, hy, pos, hw, hh, cursor]) => {
      const h = document.createElementNS(NS, 'rect');
      h.setAttribute('x', hx-hw/2); h.setAttribute('y', hy-hh/2);
      h.setAttribute('width', hw); h.setAttribute('height', hh);
      h.setAttribute('fill', '#00d4ff'); h.style.cursor = cursor;
      h.onmousedown = e => { e.stopPropagation(); this.startResizeMulti(e, pos, minX, minY, maxX, maxY); };
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
    const _bx = sp.x, _by = sp.y;
    const pt = C.svgPt(e.clientX, e.clientY), ox = pt.x - sp.x, oy = pt.y - sp.y;
    const mv = e2 => { const p = C.svgPt(e2.clientX, e2.clientY); sp.x = p.x-ox; sp.y = p.y-oy; Editor.Sprites.apply(sp); this.drawSelectionUI(); C.updateDebug(); };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Undo.record(Editor.Commands.Move.create(sp.id, _bx, _by, sp.x, sp.y)); Editor.State.dispatch({ type: 'SET_PROPERTY' }); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Move multi-select or single ──
  startMoveMulti(e, sp) {
    const C = Editor.Core;
    if (C.multiSel.length > 1 && C.multiSel.includes(sp)) {
      const befores = C.multiSel.map(s => ({ id: s.id, x: s.x, y: s.y }));
      const pt = C.svgPt(e.clientX, e.clientY);
      const offsets = C.multiSel.map(s => ({ s, ox: pt.x - s.x, oy: pt.y - s.y }));
      const mv = e2 => { const p = C.svgPt(e2.clientX, e2.clientY); offsets.forEach(({s, ox, oy}) => { s.x = p.x-ox; s.y = p.y-oy; Editor.Sprites.apply(s); }); this.drawSelectionUI(); C.updateDebug(); };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); const cmds = befores.map(b => { const s = Editor.Commands._findSprite(b.id); return s ? Editor.Commands.Move.create(b.id, b.x, b.y, s.x, s.y) : null; }).filter(Boolean); Editor.Undo.record(Editor.Commands.Batch.create(cmds, 'Multi-move')); Editor.State.dispatch({ type: 'SET_PROPERTY' }); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    } else {
      C.multiSel = [sp]; this.startMove(e, sp);
    }
  },

  // ── Multi-resize (proportional scale from bounding box edge/corner) ──
  startResizeMulti(e, handle, bMinX, bMinY, bMaxX, bMaxY) {
    const C = Editor.Core;
    if (C.multiSel.length <= 1) return;
    e.preventDefault();
    const _befores = C.multiSel.map(s => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h }));

    const bW = bMaxX - bMinX, bH = bMaxY - bMinY;
    const p0 = C.svgPt(e.clientX, e.clientY);

    // Store original state for each sprite (relative to bounding box)
    const starts = C.multiSel.map(s => ({
      s,
      relX: (s.x - bMinX) / (bW || 1),
      relY: (s.y - bMinY) / (bH || 1),
      relW: s.w / (bW || 1),
      relH: s.h / (bH || 1),
    }));

    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      const dx = p.x - p0.x, dy = p.y - p0.y;

      // Calculate new bounding box based on which handle is dragged
      let nMinX = bMinX, nMinY = bMinY, nMaxX = bMaxX, nMaxY = bMaxY;
      if (handle.includes('e')) nMaxX = Math.max(bMinX + 20, bMaxX + dx);
      if (handle.includes('w')) nMinX = Math.min(bMaxX - 20, bMinX + dx);
      if (handle.includes('s')) nMaxY = Math.max(bMinY + 20, bMaxY + dy);
      if (handle.includes('n')) nMinY = Math.min(bMaxY - 20, bMinY + dy);

      const nW = nMaxX - nMinX, nH = nMaxY - nMinY;

      // Scale all sprites proportionally within new bounds
      starts.forEach(({ s, relX, relY, relW, relH }) => {
        s.x = nMinX + relX * nW;
        s.y = nMinY + relY * nH;
        s.w = Math.max(5, relW * nW);
        s.h = Math.max(5, relH * nH);
        Editor.Sprites.apply(s);
      });

      this.drawSelectionUI();
      C.updateDebug();
    };

    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      const cmds = _befores.map(b => { const s = Editor.Commands._findSprite(b.id); return s ? Editor.Commands.Resize.create(b.id, b, { x: s.x, y: s.y, w: s.w, h: s.h }) : null; }).filter(Boolean);
      Editor.Undo.record(Editor.Commands.Batch.create(cmds, 'Multi-resize'));
      Editor.State.dispatch({ type: 'SET_PROPERTY' });
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  // ── Multi-rotate ──
  startRotateMulti(e) {
    const C = Editor.Core;
    if (C.multiSel.length <= 1) return;
    e.preventDefault();
    const _befores = C.multiSel.map(s => ({ id: s.id, x: s.x, y: s.y, rot: s.rot }));
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
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); const cmds = _befores.map(b => { const s = Editor.Commands._findSprite(b.id); if (!s) return null; const subcmds = []; if (s.x !== b.x || s.y !== b.y) subcmds.push(Editor.Commands.Move.create(b.id, b.x, b.y, s.x, s.y)); if (s.rot !== b.rot) subcmds.push(Editor.Commands.Rotate.create(b.id, b.rot, s.rot)); return subcmds; }).filter(Boolean).flat(); Editor.Undo.record(Editor.Commands.Batch.create(cmds, 'Multi-rotate')); Editor.State.dispatch({ type: 'SET_PROPERTY' }); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Keyboard ──
  onKey(e) {
    const C = Editor.Core;

    // Undo: Ctrl/Cmd+Z (without Shift)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); Editor.Undo.undo(); return; }
    // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); Editor.Undo.redo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); Editor.Undo.redo(); return; }

    // Group/Ungroup: Ctrl/Cmd+G
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (C.multiSel.length >= 2) {
        // If all selected are in the same group, ungroup
        const gid = C.multiSel[0].groupId;
        if (gid && C.multiSel.every(s => s.groupId === gid)) {
          Editor.Groups.ungroup(gid);
        } else {
          Editor.Groups.createGroup(C.multiSel);
        }
      } else if (C.selected && C.selected.groupId) {
        Editor.Groups.ungroup(C.selected.groupId);
      }
      return;
    }

    // Copy (sprites or lights)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      if (C.multiSel.length) {
        C.clipboardSprites = C.multiSel.map(s => ({ file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot, layerType: s.layerType, hidden: s.hidden, flipX: s.flipX, flipY: s.flipY }));
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
        this.deselect();
        C.multiSel = C.clipboardSprites.map(s => Editor.Sprites.addSprite(s.file, s.x+20, s.y+20, s.w, s.h, s.rot, s.layerType || "floor", true));
        C.selected = C.multiSel[0]; this.drawSelectionUI();
        const cmds = C.multiSel.map(s => Editor.Commands.AddSprite.create(Editor.Commands._captureSprite(s)));
        Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Paste'));
        Editor.State.dispatch({ type: 'SET_PROPERTY' }); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
      if (C.clipboardLights.length) {
        const newLights = C.clipboardLights.map(l => Editor.Lights.addLight(l.x + 20, l.y + 20, l.color, l.radius, l.intensity));
        const cmds = newLights.filter(Boolean).map(l => Editor.Commands.AddLight.create(Editor.Commands._captureLight(l)));
        Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Paste lights'));
        Editor.State.dispatch({ type: 'SET_PROPERTY' }); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
      return;
    }

    // Crop mode keys
    if (Editor.Crop.active) {
      if (e.key === 'Enter') { e.preventDefault(); Editor.Crop.confirm(); return; }
      if (e.key === 'Escape') { Editor.Crop.cancel(); return; }
      return; // Block other keys while cropping
    }

    if (e.key === 'Escape') { this.deselect(); Editor.Lights.deselectLight(); Editor.Models.deselectModel(); return; }

    // Toggle light center indicators
    if (e.key === 'l' || e.key === 'L') { Editor.Lights.toggleCenters(); return; }

    // Reset zoom
    if (e.key === '0') { Editor.Zoom.reset(); return; }

    // Toggle shortcuts help
    if (e.key === '?') { Editor.Shortcuts.toggle(); return; }

    // Delete (sprites or selected light)
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (Editor.Lights.selectedLight) {
        const lData = Editor.Commands._captureLight(Editor.Lights.selectedLight);
        Editor.Commands._removeLight(Editor.Lights.selectedLight.id);
        Editor.Undo.record(Editor.Commands.DeleteLight.create(lData));
        Editor.State.dispatch({ type: 'DELETE_LIGHT' }); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
      if (C.selected) {
        const toDelete = C.multiSel.length > 1 ? [...C.multiSel] : [C.selected];
        const cmds = toDelete.map(s => Editor.Commands.DeleteSprite.create(Editor.Commands._captureSprite(s)));
        toDelete.forEach(s => { if (s._clipId || s._clipWrap) Editor.Crop._removeClip(s); s.el.remove(); C.allSprites = C.allSprites.filter(x => x !== s); Editor.State.removeFromZOrder(s.id); });
        Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Delete sprites'));
        this.deselect(); C.updateDebug(); Editor.State.dispatch({ type: 'DELETE_SPRITE' }); Editor.Layers.rebuild();
        e.preventDefault(); return;
      }
    }

    if (!C.selected) return;

    // Duplicate
    if (e.key === 'd') {
      C.multiSel = (C.multiSel.length ? C.multiSel : [C.selected]).map(s => Editor.Sprites.addSprite(s.file, s.x+15, s.y+15, s.w, s.h, s.rot, s.layerType || "floor", true));
      C.selected = C.multiSel[0];
      const cmds = C.multiSel.map(s => Editor.Commands.AddSprite.create(Editor.Commands._captureSprite(s)));
      Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Duplicate'));
      this.drawSelectionUI(); Editor.Layers.rebuild();
    }

    // Crop
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
      if (C.selected && C.multiSel.length <= 1) { Editor.Crop.enter(C.selected); }
      return;
    }

    // Flip
    if (e.key === 'f' || e.key === 'F') {
      const targets = C.multiSel.length > 1 ? C.multiSel : [C.selected];
      const prop = e.shiftKey ? 'flipY' : 'flipX';
      const cmds = targets.map(s => {
        const from = {}; from[prop] = s[prop];
        const to = {}; to[prop] = !s[prop];
        return Editor.Commands.SetProperty.create(s.id, from, to);
      });
      targets.forEach(s => {
        if (e.shiftKey) s.flipY = !s.flipY;
        else s.flipX = !s.flipX;
        Editor.Sprites.apply(s);
      });
      Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Flip'));
      this.drawSelectionUI(); C.updateDebug(); Editor.State.dispatch({ type: 'SET_PROPERTY' });
    }

    // Rotate (skip if Cmd/Ctrl held — e.g. Cmd+R = refresh, not rotate)
    if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
      const step = e.shiftKey ? 45 : 15;
      const targets = C.multiSel.length > 1 ? C.multiSel : [C.selected];
      const cmds = targets.map(s => {
        const fromRot = s.rot;
        return Editor.Commands.Rotate.create(s.id, fromRot, (fromRot + step) % 360);
      });
      targets.forEach(s => { s.rot = (s.rot + step) % 360; Editor.Sprites.apply(s); });
      Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Rotate'));
      this.drawSelectionUI(); C.updateDebug(); Editor.State.dispatch({ type: 'SET_PROPERTY' });
    }

    // Z-order (sprites are direct SVG children, may be inside crop wrapper)
    if (e.key === '=' || e.key === '+') {
      const beforeDOM = Editor.Commands.captureDOMOrder();
      const el = C.selected.rootEl;
      const parent = el.parentNode;
      const next = el.nextElementSibling;
      if (next && next.id !== 'selUI' && next.id !== 'dragRect') {
        parent.insertBefore(next, el);
        const afterDOM = Editor.Commands.captureDOMOrder();
        Editor.Undo.record(Editor.Commands.Reorder.create(beforeDOM, afterDOM));
      }
      Editor.State.dispatch({ type: 'REORDER' }); Editor.Layers.rebuild();
    }
    if (e.key === '-') {
      const beforeDOM = Editor.Commands.captureDOMOrder();
      const el = C.selected.rootEl;
      const parent = el.parentNode;
      const prev = el.previousElementSibling;
      if (prev) {
        parent.insertBefore(el, prev);
        const afterDOM = Editor.Commands.captureDOMOrder();
        Editor.Undo.record(Editor.Commands.Reorder.create(beforeDOM, afterDOM));
      }
      Editor.State.dispatch({ type: 'REORDER' }); Editor.Layers.rebuild();
    }

    // Arrow keys — move selected sprites
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const targets = C.multiSel.length > 0 ? C.multiSel : [C.selected];
      if (targets[0]) {
        const befores = targets.map(s => ({ id: s.id, x: s.x, y: s.y }));
        targets.forEach(s => {
          if (e.key === 'ArrowUp') s.y -= step;
          if (e.key === 'ArrowDown') s.y += step;
          if (e.key === 'ArrowLeft') s.x -= step;
          if (e.key === 'ArrowRight') s.x += step;
          Editor.Sprites.apply(s);
        });
        const cmds = befores.map(b => { const s = Editor.Commands._findSprite(b.id); return s ? Editor.Commands.Move.create(b.id, b.x, b.y, s.x, s.y) : null; }).filter(Boolean);
        Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Arrow move'));
        this.drawSelectionUI(); C.updateDebug(); Editor.State.dispatch({ type: 'SET_PROPERTY' });
      }
    }
  }
};
