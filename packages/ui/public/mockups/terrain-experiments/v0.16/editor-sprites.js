/* ══════════════════════════════════════════════════════════════
   Editor Sprites — add, move, resize, rotate, delete, drag-from-toolbox
══════════════════════════════════════════════════════════════ */

Editor.Sprites = {
  // Determine layer: top sprites go to spriteTop, floor sprites go to spriteFloor
  getLayer(file, cat) { return cat === 'tRuinsTop' ? 'spriteTop' : 'spriteFloor'; },

  // ── Drag from thumbnail grid ──
  startThumbDrag(e, file, cat) {
    e.preventDefault();
    const C = Editor.Core;
    let ghostEl = document.createElement('img');
    ghostEl.src = C.spriteBasePath + file; ghostEl.className = 'ghost'; ghostEl.style.width = '72px';
    document.body.appendChild(ghostEl);
    ghostEl.style.left = e.clientX - 36 + 'px'; ghostEl.style.top = e.clientY - 36 + 'px';

    const mv = e2 => { ghostEl.style.left = e2.clientX - 36 + 'px'; ghostEl.style.top = e2.clientY - 36 + 'px'; };
    const up = e2 => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      ghostEl.remove(); ghostEl = null;
      const pt = C.svgPt(e2.clientX, e2.clientY);
      if (pt.x >= 0 && pt.x <= 720 && pt.y >= 0 && pt.y <= 528) {
        Editor.Undo.push();
        this.addSprite(file, pt.x - 50, pt.y - 40, 100, 80, 0, this.getLayer(file, cat));
      }
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Add sprite to SVG ──
  addSprite(file, x, y, w, h, rot, layer, skipSelect) {
    const C = Editor.Core, NS = C.NS;
    const id = 's' + (C.sid++);
    const img = document.createElementNS(NS, 'image');
    img.setAttribute('href', C.spriteBasePath + file);
    img.setAttribute('x', x); img.setAttribute('y', y); img.setAttribute('width', w); img.setAttribute('height', h);
    img.setAttribute('preserveAspectRatio', 'none');
    if (rot) img.setAttribute('transform', `rotate(${rot},${x+w/2},${y+h/2})`);
    img.dataset.id = id; img.style.cursor = 'pointer';
    document.getElementById(layer).appendChild(img);

    const sp = { id, file, x, y, w, h, rot, el: img, layer, hidden: false };
    C.allSprites.push(sp);

    img.onmousedown = e => {
      e.stopPropagation();
      if (!C.multiSel.includes(sp)) Editor.Selection.select(sp);
      Editor.Selection.startMoveMulti(e, sp);
    };

    if (!skipSelect) Editor.Selection.select(sp);
    C.updateDebug();
    Editor.Persistence.save();
    Editor.Layers.rebuild();
    return sp;
  },

  // ── Apply position/size/rotation to SVG element ──
  apply(sp) {
    const el = sp.el, cx = sp.x + sp.w/2, cy = sp.y + sp.h/2;
    el.setAttribute('x', sp.x); el.setAttribute('y', sp.y);
    el.setAttribute('width', sp.w); el.setAttribute('height', sp.h);
    el.setAttribute('transform', sp.rot ? `rotate(${sp.rot},${cx},${cy})` : '');
  },

  // ── Resize handle ──
  startResize(e, sp, corner) {
    e.preventDefault();
    const C = Editor.Core;
    Editor.Undo.push();
    const o = { x: sp.x, y: sp.y, w: sp.w, h: sp.h }, ar = o.w / o.h;
    const p0 = C.svgPt(e.clientX, e.clientY);
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY), dx = p.x - p0.x, dy = p.y - p0.y;
      if (e2.shiftKey) {
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy * ar;
        if (corner.includes('e')) sp.w = Math.max(20, o.w + d);
        if (corner.includes('w')) { sp.x = o.x + d; sp.w = Math.max(20, o.w - d); }
        sp.h = sp.w / ar; if (corner.includes('n')) sp.y = o.y + o.h - sp.h;
      } else {
        if (corner.includes('e')) sp.w = Math.max(20, o.w + dx);
        if (corner.includes('w')) { sp.x = o.x + dx; sp.w = Math.max(20, o.w - dx); }
        if (corner.includes('s')) sp.h = Math.max(20, o.h + dy);
        if (corner.includes('n')) { sp.y = o.y + dy; sp.h = Math.max(20, o.h - dy); }
      }
      this.apply(sp); Editor.Selection.drawSelectionUI(); C.updateDebug();
    };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Persistence.save(); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Rotate handle ──
  startRotate(e, sp) {
    e.preventDefault();
    const C = Editor.Core;
    Editor.Undo.push();
    const cx = sp.x + sp.w/2, cy = sp.y + sp.h/2;
    const mv = e2 => { const p = C.svgPt(e2.clientX, e2.clientY); sp.rot = Math.round(Math.atan2(p.x-cx, -(p.y-cy))*180/Math.PI); this.apply(sp); Editor.Selection.drawSelectionUI(); C.updateDebug(); };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Persistence.save(); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
};
