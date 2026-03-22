/* ══════════════════════════════════════════════════════════════
   Editor Crop — crop sprites by defining a sub-region.
   Press C or click "Crop" to enter crop mode on a selected sprite.
   Enter confirms, Escape cancels.

   Design: sprite x/y/w/h ALWAYS = full image bounds.
   Crop is purely visual via SVG <clipPath>.
   cropL/T/R/B are 0-1 percentages trimmed from each side.
══════════════════════════════════════════════════════════════ */

Editor.Crop = {
  active: false,
  sprite: null,
  original: null,   // { x, y, w, h } snapshot at enter
  cropRect: null,    // current crop in pixels { x, y, w, h }
  overlayG: null,    // SVG group for crop UI
  clipId: 0,

  /* ── Enter crop mode ── */
  enter(sp) {
    if (this.active) this.cancel();
    if (!sp) return;

    this.active = true;
    this.sprite = sp;
    this.original = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };

    // Remove existing clip while editing
    this._removeClip(sp);
    Editor.Sprites.apply(sp);

    // Init crop rect from existing crop data or full bounds
    if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) {
      const o = this.original;
      this.cropRect = {
        x: o.x + o.w * (sp.cropL || 0),
        y: o.y + o.h * (sp.cropT || 0),
        w: o.w * (1 - (sp.cropL || 0) - (sp.cropR || 0)),
        h: o.h * (1 - (sp.cropT || 0) - (sp.cropB || 0))
      };
    } else {
      this.cropRect = { ...this.original };
    }

    this._drawOverlay();
    Editor.Selection.drawSelectionUI(); // will hide handles due to active check
  },

  /* ── Draw crop overlay: dimmed outer area + bright crop rect + handles ── */
  _drawOverlay() {
    const C = Editor.Core, NS = C.NS;
    if (this.overlayG) this.overlayG.remove();
    this.overlayG = document.createElementNS(NS, 'g');
    this.overlayG.id = 'cropOverlay';

    const o = this.original;
    const cr = this.cropRect;
    const sp = this.sprite;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;

    // Build the full sprite transform (rotation + flip) for overlay elements
    const t = this._spriteTransform(sp);

    // Dimmed area (path with hole)
    const dimPath = document.createElementNS(NS, 'path');
    const outer = `M${o.x},${o.y} L${o.x+o.w},${o.y} L${o.x+o.w},${o.y+o.h} L${o.x},${o.y+o.h}Z`;
    const inner = `M${cr.x},${cr.y} L${cr.x+cr.w},${cr.y} L${cr.x+cr.w},${cr.y+cr.h} L${cr.x},${cr.y+cr.h}Z`;
    dimPath.setAttribute('d', outer + ' ' + inner);
    dimPath.setAttribute('fill', 'rgba(0,0,0,0.5)');
    dimPath.setAttribute('fill-rule', 'evenodd');
    if (t) dimPath.setAttribute('transform', t);
    this.overlayG.appendChild(dimPath);

    // Crop rect border
    const border = document.createElementNS(NS, 'rect');
    border.setAttribute('x', cr.x); border.setAttribute('y', cr.y);
    border.setAttribute('width', cr.w); border.setAttribute('height', cr.h);
    border.setAttribute('fill', 'none'); border.setAttribute('stroke', '#00ff88');
    border.setAttribute('stroke-width', '1.5'); border.setAttribute('stroke-dasharray', '4,2');
    if (t) border.setAttribute('transform', t);
    this.overlayG.appendChild(border);

    // Handles
    [
      { x: cr.x + cr.w/2, y: cr.y,       edge: 'n', w: 10, h: 4, cursor: 'ns-resize' },
      { x: cr.x + cr.w/2, y: cr.y + cr.h, edge: 's', w: 10, h: 4, cursor: 'ns-resize' },
      { x: cr.x,           y: cr.y + cr.h/2, edge: 'w', w: 4, h: 10, cursor: 'ew-resize' },
      { x: cr.x + cr.w,   y: cr.y + cr.h/2, edge: 'e', w: 4, h: 10, cursor: 'ew-resize' },
      { x: cr.x,           y: cr.y,       edge: 'nw', w: 6, h: 6, cursor: 'nw-resize' },
      { x: cr.x + cr.w,   y: cr.y,       edge: 'ne', w: 6, h: 6, cursor: 'ne-resize' },
      { x: cr.x,           y: cr.y + cr.h, edge: 'sw', w: 6, h: 6, cursor: 'sw-resize' },
      { x: cr.x + cr.w,   y: cr.y + cr.h, edge: 'se', w: 6, h: 6, cursor: 'se-resize' },
    ].forEach(h => {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', h.x - h.w/2); rect.setAttribute('y', h.y - h.h/2);
      rect.setAttribute('width', h.w); rect.setAttribute('height', h.h);
      rect.setAttribute('fill', '#00ff88'); rect.style.cursor = h.cursor;
      if (t) rect.setAttribute('transform', t);
      rect.onmousedown = e => { e.stopPropagation(); this._startResize(e, h.edge); };
      this.overlayG.appendChild(rect);
    });

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
    const fxSign = this.sprite.flipX ? -1 : 1;
    const fySign = this.sprite.flipY ? -1 : 1;

    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      const gdx = p.x - p0.x, gdy = p.y - p0.y;
      // Rotate into local space, then account for flip
      // (crop overlay has flip transform, so visual drag direction is inverted)
      const dx = (gdx * Math.cos(rad) - gdy * Math.sin(rad)) * fxSign;
      const dy = (gdx * Math.sin(rad) + gdy * Math.cos(rad)) * fySign;

      const cr = { ...cr0 };
      if (edge.includes('n')) { cr.y = Math.max(o.y, Math.min(cr0.y + cr0.h - 10, cr0.y + dy)); cr.h = cr0.h - (cr.y - cr0.y); }
      if (edge.includes('s')) { cr.h = Math.max(10, Math.min(o.y + o.h - cr0.y, cr0.h + dy)); }
      if (edge.includes('w')) { cr.x = Math.max(o.x, Math.min(cr0.x + cr0.w - 10, cr0.x + dx)); cr.w = cr0.w - (cr.x - cr0.x); }
      if (edge.includes('e')) { cr.w = Math.max(10, Math.min(o.x + o.w - cr0.x, cr0.w + dx)); }

      this.cropRect = cr;
      this._drawOverlay();
    };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  /* ── Confirm crop ── */
  confirm() {
    if (!this.active) return;
    const sp = this.sprite;
    const o = this.original;
    const cr = this.cropRect;

    // Capture before state
    const beforeCrop = { cropL: sp.cropL || 0, cropT: sp.cropT || 0, cropR: sp.cropR || 0, cropB: sp.cropB || 0 };

    // Calculate crop percentages from full bounds
    sp.cropL = Math.max(0, (cr.x - o.x) / o.w);
    sp.cropT = Math.max(0, (cr.y - o.y) / o.h);
    sp.cropR = Math.max(0, 1 - (cr.x + cr.w - o.x) / o.w);
    sp.cropB = Math.max(0, 1 - (cr.y + cr.h - o.y) / o.h);

    // Snap near-zero values to zero
    if (sp.cropL < 0.005) sp.cropL = 0;
    if (sp.cropT < 0.005) sp.cropT = 0;
    if (sp.cropR < 0.005) sp.cropR = 0;
    if (sp.cropB < 0.005) sp.cropB = 0;

    const afterCrop = { cropL: sp.cropL, cropT: sp.cropT, cropR: sp.cropR, cropB: sp.cropB };

    // Apply the clip (sprite x/y/w/h stays as full bounds)
    this._applyClip(sp);

    this._cleanup();
    Editor.Selection.drawSelectionUI();
    Editor.Undo.record(Editor.Commands.Crop.create(sp.id, beforeCrop, afterCrop));
    Editor.State.dispatch({ type: 'CROP' });
    Editor.Core.updateDebug();
    Editor.Layers.rebuild();
  },

  /* ── Cancel crop ── */
  cancel() {
    if (!this.active) return;
    const sp = this.sprite;

    // Re-apply existing crop if any
    if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) {
      this._applyClip(sp);
    }

    this._cleanup();
    Editor.Selection.drawSelectionUI();
  },

  /* ── Build the full transform (rotation + flip) matching the sprite ── */
  _spriteTransform(sp) {
    const cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2;
    let t = '';
    if (sp.rot) t += `rotate(${sp.rot},${cx},${cy}) `;
    if (sp.flipX || sp.flipY) {
      const sx = sp.flipX ? -1 : 1, sy = sp.flipY ? -1 : 1;
      t += `translate(${cx},${cy}) scale(${sx},${sy}) translate(${-cx},${-cy})`;
    }
    return t.trim();
  },

  /* ── Build rotation-only transform for the clip rect ── */
  _clipTransform(sp) {
    if (!sp.rot) return '';
    const cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2;
    return `rotate(${sp.rot},${cx},${cy})`;
  },

  /* ── Apply SVG clipPath to sprite ── */
  // Double-wrapper architecture:
  //   <g id="...-wrap">              ← outer: receives filter (shadow extends freely)
  //     <g clip-path="url(#...)">    ← inner: clips image content only
  //       <image/>                   ← sprite image (no filter on it)
  //     </g>
  //   </g>
  // This ensures shadows are NOT clipped at crop boundaries.
  _applyClip(sp) {
    this._removeClip(sp);

    let cL = sp.cropL || 0, cT = sp.cropT || 0, cR = sp.cropR || 0, cB = sp.cropB || 0;
    // Swap crop sides for flipped sprites so clip maps to correct visual side
    if (sp.flipX) { const tmp = cL; cL = cR; cR = tmp; }
    if (sp.flipY) { const tmp = cT; cT = cB; cB = tmp; }
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
    clipRect.setAttribute('x', sp.x + sp.w * cL);
    clipRect.setAttribute('y', sp.y + sp.h * cT);
    clipRect.setAttribute('width', sp.w * (1 - cL - cR));
    clipRect.setAttribute('height', sp.h * (1 - cT - cB));
    const ct = this._clipTransform(sp);
    if (ct) clipRect.setAttribute('transform', ct);
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);

    // Double-wrapper: outer <g> for filter, inner <g> for clip
    const parent = sp.el.parentNode;
    const wrapper = document.createElementNS(NS, 'g');
    wrapper.id = clipId + '-wrap';
    // Move filter from <image> to outer wrapper so shadow extends beyond clip
    const existingFilter = sp.el.getAttribute('filter');
    if (existingFilter) {
      wrapper.setAttribute('filter', existingFilter);
      sp.el.removeAttribute('filter');
    }
    const clipGroup = document.createElementNS(NS, 'g');
    clipGroup.setAttribute('clip-path', `url(#${clipId})`);
    parent.insertBefore(wrapper, sp.el);
    wrapper.appendChild(clipGroup);
    clipGroup.appendChild(sp.el);

    sp._clipId = clipId;
    sp._clipWrap = wrapper;
    sp._clipGroup = clipGroup;

    Editor.Sprites.apply(sp);
  },

  /* ── Update clip position when sprite moves/resizes ── */
  updateClipPosition(sp) {
    if (!sp._clipId) return;
    const clipPath = document.getElementById(sp._clipId);
    if (!clipPath) return;
    const clipRect = clipPath.querySelector('rect');
    if (!clipRect) return;

    let cL = sp.cropL || 0, cT = sp.cropT || 0, cR = sp.cropR || 0, cB = sp.cropB || 0;
    // Swap crop sides for flipped sprites
    if (sp.flipX) { const tmp = cL; cL = cR; cR = tmp; }
    if (sp.flipY) { const tmp = cT; cT = cB; cB = tmp; }
    clipRect.setAttribute('x', sp.x + sp.w * cL);
    clipRect.setAttribute('y', sp.y + sp.h * cT);
    clipRect.setAttribute('width', sp.w * (1 - cL - cR));
    clipRect.setAttribute('height', sp.h * (1 - cT - cB));
    // Sync rotation (but not flip) so clip rotates with the image
    const ct = this._clipTransform(sp);
    if (ct) clipRect.setAttribute('transform', ct);
    else clipRect.removeAttribute('transform');
  },

  /* ── Remove existing clip from sprite ── */
  _removeClip(sp) {
    sp.el.removeAttribute('clip-path');
    // Unwrap the double-wrapper if present
    if (sp._clipWrap) {
      const wrapper = sp._clipWrap;
      const parent = wrapper.parentNode;
      // Move filter back from wrapper to <image>
      const wrapperFilter = wrapper.getAttribute('filter');
      if (wrapperFilter) {
        sp.el.setAttribute('filter', wrapperFilter);
      }
      if (parent) {
        parent.insertBefore(sp.el, wrapper);
        wrapper.remove();
      }
      sp._clipWrap = null;
      sp._clipGroup = null;
    }
    if (sp._clipId) {
      const el = document.getElementById(sp._clipId);
      if (el) el.remove();
      sp._clipId = null;
    }
  },

  /* ── Reset crop back to full image ── */
  resetCrop(sp) {
    if (!sp) return;
    const beforeCrop = { cropL: sp.cropL || 0, cropT: sp.cropT || 0, cropR: sp.cropR || 0, cropB: sp.cropB || 0 };
    const afterCrop = { cropL: 0, cropT: 0, cropR: 0, cropB: 0 };
    this._removeClip(sp);
    sp.cropL = 0; sp.cropT = 0; sp.cropR = 0; sp.cropB = 0;
    Editor.Sprites.apply(sp);
    Editor.Selection.drawSelectionUI();
    Editor.Undo.record(Editor.Commands.Crop.create(sp.id, beforeCrop, afterCrop));
    Editor.State.dispatch({ type: 'RESET_CROP' });
    Editor.Core.updateDebug();
    Editor.Layers.rebuild();
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
