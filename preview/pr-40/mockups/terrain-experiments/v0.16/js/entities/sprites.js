/* ══════════════════════════════════════════════════════════════
   Editor Sprites — add, move, resize, rotate, delete, drag-from-toolbox
══════════════════════════════════════════════════════════════ */

Editor.Sprites = {
  // Determine layer type for a sprite
  getLayerType(file, cat) { return cat === 'tRuinsTop' ? 'top' : 'floor'; },

  // ── Drag from thumbnail grid ──
  startThumbDrag(e, file, cat) {
    e.preventDefault();
    const C = Editor.Core;
    let ghostEl = document.createElement('img');
    ghostEl.src = C.spriteBasePath + file; ghostEl.className = 'ghost'; ghostEl.style.width = '72px';
    document.body.appendChild(ghostEl);
    ghostEl.style.left = e.clientX - 36 + 'px'; ghostEl.style.top = e.clientY - 36 + 'px';

    const mv = e2 => { ghostEl.style.left = e2.clientX - 36 + 'px'; ghostEl.style.top = e2.clientY - 36 + 'px'; };
    // Probe actual image dimensions for correct aspect ratio
    const probe = new Image();
    probe.src = C.spriteBasePath + file;
    const up = e2 => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      ghostEl.remove(); ghostEl = null;
      const pt = C.svgPt(e2.clientX, e2.clientY);
      if (pt.x >= 0 && pt.x <= 720 && pt.y >= 0 && pt.y <= 528) {
        const pw = probe.naturalWidth || 1024, ph = probe.naturalHeight || 1024;
        const scale = Math.min(100 / pw, 100 / ph);
        const w = Math.round(pw * scale), h = Math.round(ph * scale);
        const sp = this.addSprite(file, pt.x - w/2, pt.y - h/2, w, h, 0, this.getLayerType(file, cat));
        // Scatter terrain defaults to no drop shadow
        if (cat === 'tScatter' && sp) {
          sp.shadowMul = 0;
          if (Editor.Effects) Editor.Effects._applyToSprite(sp);
          Editor.Layers.rebuild();
        }
        if (sp) Editor.Undo.record(Editor.Commands.AddSprite.create(Editor.Commands._captureSprite(sp)));
      }
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Add sprite to SVG ──
  // layerType: 'floor' or 'top' (for roof opacity). Sprites are direct SVG children.
  addSprite(file, x, y, w, h, rot, layerType, skipSelect, _forceId) {
    const C = Editor.Core, NS = C.NS;
    const id = _forceId || ('s' + (C.sid++));
    const img = document.createElementNS(NS, 'image');
    const isDataUrl = file.startsWith('data:');
    img.setAttribute('href', isDataUrl ? file : C.spriteBasePath + file);
    img.setAttribute('x', x); img.setAttribute('y', y); img.setAttribute('width', w); img.setAttribute('height', h);
    img.setAttribute('preserveAspectRatio', 'none');
    if (rot) img.setAttribute('transform', `rotate(${rot},${x+w/2},${y+h/2})`);
    img.dataset.id = id; img.id = id; img.style.cursor = 'pointer';
    // Insert directly into SVG before selUI for true z-order independence
    const svg = C.svg;
    const selUI = document.getElementById('selUI');
    svg.insertBefore(img, selUI);

    const sp = { id, file, x, y, w, h, rot, el: img, layerType: layerType || 'floor', hidden: false, flipX: false, flipY: false, shadowMul: 1.0 };
    Object.defineProperty(sp, 'rootEl', {
      get() { return this._clipWrap || this.el; },
      enumerable: false, configurable: true
    });
    C.allSprites.push(sp);

    img.onmousedown = e => {
      e.stopPropagation();
      if (e.shiftKey) {
        // Toggle sprite in/out of multi-selection
        if (C.multiSel.includes(sp)) {
          C.multiSel = C.multiSel.filter(s => s !== sp);
          C.selected = C.multiSel[0] || null;
        } else {
          C.multiSel.push(sp);
          C.selected = sp;
        }
        Editor.Lights.deselectLight();
        Editor.Models.deselectModel();
        Editor.Selection.drawSelectionUI();
        Editor.Layers.rebuild();
        return;
      }
      if (!C.multiSel.includes(sp)) Editor.Selection.select(sp);
      Editor.Selection.startMoveMulti(e, sp);
    };

    if (!skipSelect) Editor.Selection.select(sp);
    // Apply sprite grounding effects (guard: skip during persistence load, Effects.init runs after)
    if (Editor.Effects && Editor.Effects._ready) Editor.Effects._applyToSprite(sp);
    C.updateDebug();
    Editor.State.dispatch({ type: 'ADD_SPRITE', id: sp.id });
    Editor.Layers.rebuild();
    return sp;
  },

  // ── File drag-and-drop onto canvas ──
  initFileDrop() {
    const wrap = document.getElementById('mapWrap');
    if (!wrap) return;

    // Accept drops on the entire page body too (redirect to canvas)
    const targets = [wrap, document.body];
    targets.forEach(target => {
      target.addEventListener('dragover', e => {
        // Only accept file drags, not internal layer reorder drags
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          wrap.classList.add('drop-active');
        }
      });
    });

    wrap.addEventListener('dragleave', e => {
      // Only remove if leaving the wrapper entirely
      if (!wrap.contains(e.relatedTarget)) {
        wrap.classList.remove('drop-active');
      }
    });

    // Prevent browser default file open on body drops
    document.body.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        // Redirect to the canvas drop handler
        wrap.dispatchEvent(new DragEvent('drop', { dataTransfer: e.dataTransfer, clientX: e.clientX, clientY: e.clientY }));
      }
    });

    wrap.addEventListener('drop', e => {
      e.preventDefault();
      wrap.classList.remove('drop-active');
      const allFiles = Array.from(e.dataTransfer.files);

      // Check for JSON layout files first
      const jsonFiles = allFiles.filter(f => f.name.endsWith('.json') || f.type === 'application/json');
      if (jsonFiles.length) {
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const data = JSON.parse(ev.target.result);
            if (data.sprites && Array.isArray(data.sprites)) {
              // Route through import logic (save to localStorage + reload)
              if (!confirm(`Import layout with ${data.sprites.length} sprites? This will replace the current scene.`)) return;
              // Use the same import conversion as importJSON
              if (data.sprites[0] && ('layerType' in data.sprites[0]) && !('cropL' in data.sprites[0])) {
                data.sprites = data.sprites.map(s => ({
                  file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot || 0,
                  layerType: s.layerType || 'floor', hidden: s.hidden || false,
                  flipX: s.flipX || false, flipY: s.flipY || false,
                  groupId: s.groupId || null,
                  cropL: s.crop?.l || 0, cropT: s.crop?.t || 0, cropR: s.crop?.r || 0, cropB: s.crop?.b || 0,
                  shadowMul: s.shadowMul != null ? s.shadowMul : 1.0
                }));
                if (data.models) {
                  data.models = data.models.map(m => m.kind === 'circle'
                    ? { kind: m.kind, x: m.x, y: m.y, r: m.r, s: m.stroke || m.s, f: (m.stroke || m.s) === '#0088aa' ? 'url(#mf-imp)' : 'url(#mf-ork)', iconType: m.icon || m.iconType }
                    : { kind: m.kind, x: m.x, y: m.y, w: m.w, h: m.h, s: m.stroke || m.s, f: (m.stroke || m.s) === '#0088aa' ? 'url(#mf-imp)' : 'url(#mf-ork)' });
                }
                if (data.settings) {
                  data.bg = data.settings.bg;
                  data.ruinsOpacity = data.settings.ruinsOpacity;
                  data.roofOpacity = data.settings.roofOpacity;
                }
              }
              // Auto-create groups from sprite groupId references if missing
              if (data.sprites) {
                const groupIds = new Set(data.sprites.filter(s => s.groupId).map(s => s.groupId));
                if (!data.groups) data.groups = [];
                groupIds.forEach(gId => {
                  if (!data.groups.find(g => g.id === gId)) {
                    const num = parseInt(gId.replace('group-g', '')) || 0;
                    data.groups.push({ id: gId, name: 'Group ' + (num + 1), opacity: 1 });
                  }
                });
              }
              localStorage.setItem(Editor.Persistence.STORAGE_KEY, JSON.stringify(data));
              location.reload();
            } else {
              alert('JSON file does not contain a valid layout (missing sprites array).');
            }
          } catch (err) {
            alert('Invalid JSON file: ' + err.message);
          }
        };
        reader.readAsText(jsonFiles[0]);
        return;
      }

      const files = allFiles.filter(f => f.type.startsWith('image/'));
      if (!files.length) return;

      const C = Editor.Core;
      const pt = C.svgPt(e.clientX, e.clientY);

      // Process files in parallel, stagger placement
      const promises = files.map((file, idx) => {
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = ev => {
            const dataUrl = ev.target.result;
            // Probe image dimensions
            const probe = new Image();
            probe.onload = () => {
              // Scale to fit ~120px wide, maintain aspect ratio
              const scale = Math.min(200 / probe.width, 200 / probe.height, 1);
              const w = Math.round(probe.width * scale);
              const h = Math.round(probe.height * scale);
              // Stagger placement so multiple files don't stack exactly
              const offsetX = idx * 20;
              const offsetY = idx * 20;
              const sp = this.addSprite(
                dataUrl, // data URL as file reference
                Math.max(0, Math.min(720 - w, pt.x - w/2 + offsetX)),
                Math.max(0, Math.min(528 - h, pt.y - h/2 + offsetY)),
                w, h, 0, 'floor', true
              );
              // Store original filename for display
              sp._fileName = file.name;
              resolve(sp);
            };
            probe.onerror = () => resolve(null);
            probe.src = dataUrl;
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then(sprites => {
        const valid = sprites.filter(Boolean);
        if (valid.length) {
          C.multiSel = valid;
          C.selected = valid[0];
          Editor.Selection.drawSelectionUI();
          const cmds = valid.map(s => Editor.Commands.AddSprite.create(Editor.Commands._captureSprite(s)));
          Editor.Undo.record(cmds.length === 1 ? cmds[0] : Editor.Commands.Batch.create(cmds, 'Drop files'));
          Editor.State.dispatch({ type: 'ADD_SPRITE' });
          Editor.Layers.rebuild();
        }
      });
    });
  },

  // ── Apply position/size/rotation/flip to SVG element ──
  apply(sp) {
    const el = sp.el, cx = sp.x + sp.w/2, cy = sp.y + sp.h/2;
    el.setAttribute('x', sp.x); el.setAttribute('y', sp.y);
    el.setAttribute('width', sp.w); el.setAttribute('height', sp.h);
    let t = '';
    if (sp.rot) t += `rotate(${sp.rot},${cx},${cy}) `;
    if (sp.flipX || sp.flipY) {
      const sx = sp.flipX ? -1 : 1, sy = sp.flipY ? -1 : 1;
      t += `translate(${cx},${cy}) scale(${sx},${sy}) translate(${-cx},${-cy})`;
    }
    el.setAttribute('transform', t.trim());
    // Sync crop clipPath with current position
    if (sp._clipId && Editor.Crop) Editor.Crop.updateClipPosition(sp);
    // Re-apply filter with updated rotation (shadow direction is rotation-dependent)
    if (Editor.Effects && Editor.Effects._ready) Editor.Effects._applyToSprite(sp);
  },

  // ── Resize handle ──
  startResize(e, sp, corner) {
    e.preventDefault();
    const C = Editor.Core;
    const _before = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
    const o = { x: sp.x, y: sp.y, w: sp.w, h: sp.h }, ar = o.w / o.h;
    const p0 = C.svgPt(e.clientX, e.clientY);
    const rotRad = (sp.rot || 0) * Math.PI / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const rad = -rotRad; // for local-space conversion
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY), gdx = p.x - p0.x, gdy = p.y - p0.y;
      if (e2.shiftKey) {
        // Shift-constrained: proportional resize in local space
        const dx = gdx * Math.cos(rad) - gdy * Math.sin(rad);
        const dy = gdx * Math.sin(rad) + gdy * Math.cos(rad);
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy * ar;
        if (corner.includes('e')) sp.w = Math.max(20, o.w + d);
        if (corner.includes('w')) { sp.x = o.x + d; sp.w = Math.max(20, o.w - d); }
        sp.h = sp.w / ar; if (corner.includes('n')) sp.y = o.y + o.h - sp.h;
      } else if (corner.length === 1) {
        // ── EDGE handle: single-axis resize in visual space ──
        // Project drag onto the edge's visual outward normal
        // SVG rotate(θ): local (x,y) → (x·cosθ - y·sinθ, x·sinθ + y·cosθ)
        // East normal (1,0) → (cosR, sinR), South normal (0,1) → (-sinR, cosR)
        let d;
        switch (corner) {
          case 's': d = -gdx * sinR + gdy * cosR; break;
          case 'n': d =  gdx * sinR - gdy * cosR; break;
          case 'e': d =  gdx * cosR + gdy * sinR; break;
          case 'w': d = -gdx * cosR - gdy * sinR; break;
        }
        // Resize the appropriate dimension
        if (corner === 's' || corner === 'n') sp.h = Math.max(20, o.h + d);
        else sp.w = Math.max(20, o.w + d);
        // Anchor the opposite edge by adjusting x,y (closed-form for rotated center shift)
        const dd = (corner === 's' || corner === 'n') ? (sp.h - o.h) : (sp.w - o.w);
        switch (corner) {
          case 's': // anchor north edge
            sp.x = o.x - dd/2 * sinR;
            sp.y = o.y - dd/2 * (1 - cosR);
            break;
          case 'n': // anchor south edge
            sp.x = o.x + dd/2 * sinR;
            sp.y = o.y - dd + dd/2 * (1 - cosR);
            break;
          case 'e': // anchor west edge
            sp.x = o.x - dd/2 * (1 - cosR);
            sp.y = o.y + dd/2 * sinR;
            break;
          case 'w': // anchor east edge
            sp.x = o.x - dd + dd/2 * (1 - cosR);
            sp.y = o.y - dd/2 * sinR;
            break;
        }
      } else {
        // ── CORNER handle: visual-space resize for both dimensions ──
        // Project drag onto each edge's visual outward normal
        const dE =  gdx * cosR + gdy * sinR;  // east outward
        const dS = -gdx * sinR + gdy * cosR;  // south outward
        if (corner.includes('e')) sp.w = Math.max(20, o.w + dE);
        if (corner.includes('w')) sp.w = Math.max(20, o.w - dE);
        if (corner.includes('s')) sp.h = Math.max(20, o.h + dS);
        if (corner.includes('n')) sp.h = Math.max(20, o.h - dS);
        // Anchor the opposite corner: combine edge anchor formulas
        const ddW = sp.w - o.w, ddH = sp.h - o.h;
        let ax = 0, ay = 0;
        if (corner.includes('s')) { ax -= ddH/2 * sinR; ay -= ddH/2 * (1 - cosR); }
        if (corner.includes('n')) { ax += ddH/2 * sinR; ay += -ddH + ddH/2 * (1 - cosR); }
        if (corner.includes('e')) { ax -= ddW/2 * (1 - cosR); ay += ddW/2 * sinR; }
        if (corner.includes('w')) { ax += -ddW + ddW/2 * (1 - cosR); ay -= ddW/2 * sinR; }
        sp.x = o.x + ax; sp.y = o.y + ay;
      }
      this.apply(sp); Editor.Selection.drawSelectionUI(); C.updateDebug();
    };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Undo.record(Editor.Commands.Resize.create(sp.id, _before, { x: sp.x, y: sp.y, w: sp.w, h: sp.h })); Editor.State.dispatch({ type: 'RESIZE_SPRITE' }); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  // ── Rotate handle ──
  startRotate(e, sp) {
    e.preventDefault();
    const C = Editor.Core;
    const _beforeRot = sp.rot;
    const cx = sp.x + sp.w/2, cy = sp.y + sp.h/2;
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      let deg = Math.atan2(p.x-cx, -(p.y-cy))*180/Math.PI;
      if (e2.shiftKey) deg = Math.round(deg / 45) * 45;
      else deg = Math.round(deg);
      sp.rot = deg;
      this.apply(sp); Editor.Selection.drawSelectionUI(); C.updateDebug();
    };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Undo.record(Editor.Commands.Rotate.create(sp.id, _beforeRot, sp.rot)); Editor.State.dispatch({ type: 'ROTATE_SPRITE' }); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
};
