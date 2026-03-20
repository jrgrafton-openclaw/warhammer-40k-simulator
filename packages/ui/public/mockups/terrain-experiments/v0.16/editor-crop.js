/* ══════════════════════════════════════════════════════════════
   Editor Crop — crop sprites by defining a sub-region.
   Press C or click "Crop" to enter crop mode on a selected sprite.
   Enter confirms, Escape cancels.
   Stores crop as { cropL, cropT, cropR, cropB } (0-1 percentages).
══════════════════════════════════════════════════════════════ */

Editor.Crop = {
  active: false,
  sprite: null,
  original: null,   // { x, y, w, h } before crop mode
  cropRect: null,    // current crop in pixels { x, y, w, h }
  overlayG: null,    // SVG group for crop UI
  clipId: 0,

  /* ── Enter crop mode ── */
  enter(sp) {
    if (this.active) this.cancel();
    if (!sp) return;

    this.active = true;
    this.sprite = sp;

    // Store original full-image bounds (before any existing crop)
    if (sp._fullX != null) {
      this.original = { x: sp._fullX, y: sp._fullY, w: sp._fullW, h: sp._fullH };
    } else {
      this.original = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
    }

    // Restore to full bounds for editing
    sp.x = this.original.x;
    sp.y = this.original.y;
    sp.w = this.original.w;
    sp.h = this.original.h;

    // Remove any existing clip
    this._removeClip(sp);
    Editor.Sprites.apply(sp);

    // Init crop rect to current crop or full bounds
    if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) {
      const o = this.original;
      this.cropRect = {
        x: o.x + o.w * (sp.cropL || 0),
        y: o.y + o.h * (sp.cropT || 0),
        w: o.w * (1 - (sp.cropL || 0) - (sp.cropR || 0)),
        h: o.h * (1 - (sp.cropT || 0) - (sp.cropB || 0))
      };
    } else {
      this.cropRect = { x: this.original.x, y: this.original.y, w: this.original.w, h: this.original.h };
    }

    this._drawOverlay();
    Editor.Selection.drawSelectionUI();
  },

  /* ── Draw crop overlay: dimmed outer area + bright crop rect + handles ── */
  _drawOverlay() {
    const C = Editor.Core;
    const NS = C.NS;

    if (this.overlayG) this.overlayG.remove();
    this.overlayG = document.createElementNS(NS, 'g');
    this.overlayG.id = 'cropOverlay';

    const o = this.original;
    const cr = this.cropRect;
    const sp = this.sprite;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;

    // Semi-transparent overlay on the full image (outside crop area)
    // Use a path with a hole (even-odd) for the dimmed area
    const dimPath = document.createElementNS(NS, 'path');
    const outer = `M${o.x},${o.y} L${o.x+o.w},${o.y} L${o.x+o.w},${o.y+o.h} L${o.x},${o.y+o.h}Z`;
    const inner = `M${cr.x},${cr.y} L${cr.x+cr.w},${cr.y} L${cr.x+cr.w},${cr.y+cr.h} L${cr.x},${cr.y+cr.h}Z`;
    dimPath.setAttribute('d', outer + ' ' + inner);
    dimPath.setAttribute('fill', 'rgba(0,0,0,0.5)');
    dimPath.setAttribute('fill-rule', 'evenodd');
    if (sp.rot) dimPath.setAttribute('transform', `rotate(${sp.rot},${cx},${cy})`);
    this.overlayG.appendChild(dimPath);

    // Crop rect border
    const border = document.createElementNS(NS, 'rect');
    border.setAttribute('x', cr.x); border.setAttribute('y', cr.y);
    border.setAttribute('width', cr.w); border.setAttribute('height', cr.h);
    border.setAttribute('fill', 'none');
    border.setAttribute('stroke', '#00ff88');
    border.setAttribute('stroke-width', '1.5');
    border.setAttribute('stroke-dasharray', '4,2');
    if (sp.rot) border.setAttribute('transform', `rotate(${sp.rot},${cx},${cy})`);
    this.overlayG.appendChild(border);

    // Edge handles for crop
    const handles = [
      { x: cr.x + cr.w / 2, y: cr.y, edge: 'n', w: 10, h: 4, cursor: 'ns-resize' },
      { x: cr.x + cr.w / 2, y: cr.y + cr.h, edge: 's', w: 10, h: 4, cursor: 'ns-resize' },
      { x: cr.x, y: cr.y + cr.h / 2, edge: 'w', w: 4, h: 10, cursor: 'ew-resize' },
      { x: cr.x + cr.w, y: cr.y + cr.h / 2, edge: 'e', w: 4, h: 10, cursor: 'ew-resize' },
      // Corner handles
      { x: cr.x, y: cr.y, edge: 'nw', w: 6, h: 6, cursor: 'nw-resize' },
      { x: cr.x + cr.w, y: cr.y, edge: 'ne', w: 6, h: 6, cursor: 'ne-resize' },
      { x: cr.x, y: cr.y + cr.h, edge: 'sw', w: 6, h: 6, cursor: 'sw-resize' },
      { x: cr.x + cr.w, y: cr.y + cr.h, edge: 'se', w: 6, h: 6, cursor: 'se-resize' },
    ];

    handles.forEach(h => {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', h.x - h.w / 2);
      rect.setAttribute('y', h.y - h.h / 2);
      rect.setAttribute('width', h.w);
      rect.setAttribute('height', h.h);
      rect.setAttribute('fill', '#00ff88');
      rect.style.cursor = h.cursor;
      if (sp.rot) rect.setAttribute('transform', `rotate(${sp.rot},${cx},${cy})`);
      rect.onmousedown = e => { e.stopPropagation(); this._startResize(e, h.edge); };
      this.overlayG.appendChild(rect);
    });

    // Insert after selUI
    C.selUI.parentNode.insertBefore(this.overlayG, C.selUI);
  },

  /* ── Drag crop edge/corner ── */
  _startResize(e, edge) {
    e.preventDefault();
    const C = Editor.Core;
    const o = this.original;
    const cr0 = { ...this.cropRect };
    const p0 = C.svgPt(e.clientX, e.clientY);
    const rad = -(this.sprite.rot || 0) * Math.PI / 180;

    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      const gdx = p.x - p0.x, gdy = p.y - p0.y;
      const dx = gdx * Math.cos(rad) - gdy * Math.sin(rad);
      const dy = gdx * Math.sin(rad) + gdy * Math.cos(rad);

      const cr = { ...cr0 };
      if (edge.includes('n')) { cr.y = Math.max(o.y, Math.min(cr0.y + cr0.h - 10, cr0.y + dy)); cr.h = cr0.h - (cr.y - cr0.y); }
      if (edge.includes('s')) { cr.h = Math.max(10, Math.min(o.y + o.h - cr0.y, cr0.h + dy)); }
      if (edge.includes('w')) { cr.x = Math.max(o.x, Math.min(cr0.x + cr0.w - 10, cr0.x + dx)); cr.w = cr0.w - (cr.x - cr0.x); }
      if (edge.includes('e')) { cr.w = Math.max(10, Math.min(o.x + o.w - cr0.x, cr0.w + dx)); }

      this.cropRect = cr;
      this._drawOverlay();
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  /* ── Confirm crop ── */
  confirm() {
    if (!this.active) return;
    const sp = this.sprite;
    const o = this.original;
    const cr = this.cropRect;

    // Calculate crop percentages
    sp.cropL = Math.max(0, (cr.x - o.x) / o.w);
    sp.cropT = Math.max(0, (cr.y - o.y) / o.h);
    sp.cropR = Math.max(0, 1 - (cr.x + cr.w - o.x) / o.w);
    sp.cropB = Math.max(0, 1 - (cr.y + cr.h - o.y) / o.h);

    // Store full-image bounds
    sp._fullX = o.x;
    sp._fullY = o.y;
    sp._fullW = o.w;
    sp._fullH = o.h;

    // Apply the clip
    this._applyClip(sp);

    this._cleanup();
    Editor.Selection.drawSelectionUI();
    Editor.Persistence.save();
    Editor.Core.updateDebug();
    Editor.Layers.rebuild();
  },

  /* ── Cancel crop ── */
  cancel() {
    if (!this.active) return;
    const sp = this.sprite;

    // If sprite had an existing crop, re-apply it
    if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) {
      this._applyClip(sp);
    }

    this._cleanup();
    Editor.Selection.drawSelectionUI();
  },

  /* ── Apply SVG clipPath to sprite ── */
  _applyClip(sp) {
    this._removeClip(sp);

    const o = { x: sp._fullX != null ? sp._fullX : sp.x, y: sp._fullY != null ? sp._fullY : sp.y,
                w: sp._fullW != null ? sp._fullW : sp.w, h: sp._fullH != null ? sp._fullH : sp.h };

    // Restore full image bounds on the element
    sp.x = o.x; sp.y = o.y; sp.w = o.w; sp.h = o.h;

    const cL = sp.cropL || 0, cT = sp.cropT || 0, cR = sp.cropR || 0, cB = sp.cropB || 0;
    if (cL === 0 && cT === 0 && cR === 0 && cB === 0) {
      Editor.Sprites.apply(sp);
      return;
    }

    const NS = Editor.Core.NS;
    const clipId = 'crop-clip-' + (this.clipId++);
    const defs = Editor.Core.svg.querySelector('defs');

    const clipPath = document.createElementNS(NS, 'clipPath');
    clipPath.id = clipId;
    const clipRect = document.createElementNS(NS, 'rect');
    clipRect.setAttribute('x', o.x + o.w * cL);
    clipRect.setAttribute('y', o.y + o.h * cT);
    clipRect.setAttribute('width', o.w * (1 - cL - cR));
    clipRect.setAttribute('height', o.h * (1 - cT - cB));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);

    sp.el.setAttribute('clip-path', `url(#${clipId})`);
    sp._clipId = clipId;

    Editor.Sprites.apply(sp);
  },

  /* ── Remove existing clip from sprite ── */
  _removeClip(sp) {
    sp.el.removeAttribute('clip-path');
    if (sp._clipId) {
      const el = document.getElementById(sp._clipId);
      if (el) el.remove();
      sp._clipId = null;
    }
  },

  /* ── Reset crop back to full image ── */
  resetCrop(sp) {
    if (!sp) return;
    Editor.Undo.push();
    this._removeClip(sp);
    if (sp._fullX != null) {
      sp.x = sp._fullX; sp.y = sp._fullY; sp.w = sp._fullW; sp.h = sp._fullH;
    }
    sp.cropL = 0; sp.cropT = 0; sp.cropR = 0; sp.cropB = 0;
    delete sp._fullX; delete sp._fullY; delete sp._fullW; delete sp._fullH;
    Editor.Sprites.apply(sp);
    Editor.Selection.drawSelectionUI();
    Editor.Persistence.save();
    Editor.Core.updateDebug();
  },

  /* ── Cleanup crop mode ── */
  _cleanup() {
    if (this.overlayG) { this.overlayG.remove(); this.overlayG = null; }
    this.active = false;
    this.sprite = null;
    this.original = null;
    this.cropRect = null;
  },

  /* ── Re-apply clips after load ── */
  reapplyAll() {
    Editor.Core.allSprites.forEach(sp => {
      if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) {
        this._applyClip(sp);
      }
    });
  }
};
