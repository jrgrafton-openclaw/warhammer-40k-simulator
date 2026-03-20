/* ══════════════════════════════════════════════════════════════
   Editor Layers — right sidebar panel with drag-to-reorder.
   All item types (sprites, models-group, lights-group, objectives-group)
   can be reordered via drag in a unified z-order list.
   Sprites also support visibility toggle, duplicate, delete.
══════════════════════════════════════════════════════════════ */

Editor.Layers = {
  draggedId: null,

  // Unified z-order: each entry is { type, ref }
  // type: 'sprite' | 'models' | 'lights' | 'objectives'
  // Managed as the order of SVG <g> groups in the battlefield
  // We read order from the SVG DOM directly (single source of truth)

  rebuild() {
    const C = Editor.Core;
    const list = document.getElementById('layersList');
    list.innerHTML = '';

    // Build ordered list of layer items from SVG DOM order (bottom to top)
    // Groups: lightLayer, spriteFloor, spriteTop, svgRuins, svgScatter, modelLayer
    // Plus HTML objectives
    const items = [];

    // Sprites (reversed for top-first display)
    C.allSprites.slice().reverse().forEach(sp => {
      items.push({ type: 'sprite', ref: sp });
    });

    // We insert group rows for models, lights, objectives at top
    const groupRows = [];

    // Models group header
    groupRows.push(this._createGroupRow('models-group', 'Models', `${C.allModels.length} units`,
      `<svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="1.5"><circle cx="12" cy="12" r="7"/><line x1="12" y1="8" x2="12" y2="16" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke-linecap="round"/></svg>`
    ));

    // Individual model rows (collapsible under group)
    this._modelRows = [];
    C.allModels.forEach((m, i) => {
      const isImp = m.s === '#0088aa';
      const color = isImp ? '#0088aa' : '#aa2810';
      const faction = isImp ? 'IMP' : 'ORK';
      const kind = m.kind === 'rect' ? 'Vehicle' : (m.iconType === 'star' ? 'Character' : m.iconType === 'diamond' ? 'Heavy' : 'Infantry');
      const row = document.createElement('div');
      row.className = 'layer-row layer-child';
      row.draggable = true;
      row.dataset.modelIdx = String(i);
      row.innerHTML = `<div class="group-icon" style="width:18px;height:18px"><svg viewBox="0 0 24 24" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2">${m.kind === 'rect' ? '<rect x="4" y="7" width="16" height="10" rx="2"/>' : '<circle cx="12" cy="12" r="7"/>'}</svg></div>
        <div style="flex:1;min-width:0"><div class="lname" style="color:${color}">${faction} ${kind} ${i+1}</div><div class="lmeta">${Math.round(m.x)},${Math.round(m.y)}</div></div>`;
      row.style.cursor = 'grab';
      row.draggable = false;
      // Mousedown → drag model on canvas (like thumb drag)
      row.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        // Flash highlight
        if (m.base) {
          const origStroke = m.base.getAttribute('stroke-width');
          m.base.setAttribute('stroke-width', '3'); m.base.setAttribute('stroke', '#00d4ff');
          setTimeout(() => { m.base.setAttribute('stroke-width', origStroke || '1.5'); m.base.setAttribute('stroke', m.s); }, 600);
        }
        this._startLayerDragModel(e, m);
      });
      this._modelRows.push(row);
    });

    // Lights group
    if (C.allLights.length > 0) {
      groupRows.push(this._createGroupRow('lights-group', 'Lights', `${C.allLights.length} lights`,
        `<svg viewBox="0 0 24 24" fill="none" stroke="#ffaa44" stroke-width="1.5"><circle cx="12" cy="10" r="5"/><line x1="10" y1="16" x2="14" y2="16"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`
      ));
    }

    // Objectives group header + individual rows
    this._objectiveRows = [];
    if (C.allObjectives.length > 0) {
      groupRows.push(this._createGroupRow('objectives-group', 'Objectives', `${C.allObjectives.length} markers`,
        `<svg viewBox="0 0 24 24" fill="none" stroke="#8090a0" stroke-width="1.5"><polygon points="12,3 21,8 21,16 12,21 3,16 3,8"/><text x="12" y="14" text-anchor="middle" font-size="8" fill="#8090a0" stroke="none">O</text></svg>`
      ));

      C.allObjectives.forEach((obj, i) => {
        const num = String(i + 1).padStart(2, '0');
        const row = document.createElement('div');
        row.className = 'layer-row layer-child';
        row.draggable = true;
        row.dataset.objIdx = String(i);
        row.innerHTML = `<div class="group-icon" style="width:18px;height:18px"><svg viewBox="0 0 84 97" fill="none"><polygon points="42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5" fill="rgba(128,144,160,0.15)" stroke="#8090a0" stroke-width="4"/><text x="42" y="58" text-anchor="middle" font-size="30" fill="#8090a0" font-weight="700">${num}</text></svg></div>
          <div style="flex:1;min-width:0"><div class="lname" style="color:#8090a0">Objective ${num}</div><div class="lmeta">${Math.round(obj.leftPct)}%, ${Math.round(obj.topPct)}%</div></div>`;
        row.style.cursor = 'grab';
        row.draggable = false;
        // Mousedown → drag objective on canvas
        row.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          if (obj.hexEl) {
            obj.hexEl.style.filter = 'brightness(2)';
            setTimeout(() => { obj.hexEl.style.filter = ''; }, 600);
          }
          this._startLayerDragObjective(e, obj);
        });
        this._objectiveRows.push(row);
      });
    }

    // Render group rows with their children
    groupRows.forEach(row => {
      list.appendChild(row);
      // Insert model children after models group
      if (row.dataset.groupId === 'models-group' && this._modelRows) {
        this._modelRows.forEach(mr => list.appendChild(mr));
      }
      // Insert objective children after objectives group
      if (row.dataset.groupId === 'objectives-group' && this._objectiveRows) {
        this._objectiveRows.forEach(or => list.appendChild(or));
      }
    });

    // Then individual light rows
    if (C.allLights.length > 0) {
      C.allLights.slice().reverse().forEach(light => {
        const row = document.createElement('div');
        row.className = 'layer-row' + (Editor.Lights.selectedLight === light ? ' sel' : '');
        row.innerHTML = `<div class="group-icon"><svg viewBox="0 0 24 24" fill="${light.color}" stroke="none"><circle cx="12" cy="12" r="6" opacity="0.6"/></svg></div>
          <div style="flex:1;min-width:0"><div class="lname" style="color:${light.color}">Light ${light.id}</div><div class="lmeta">${Math.round(light.x)},${Math.round(light.y)} · r${light.radius}</div></div>
          <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Lights.removeLight('${light.id}')">🗑</button>`;
        row.onclick = () => Editor.Lights.selectLight(light);
        list.appendChild(row);
      });
    }

    // Then sprite rows with drag-to-reorder
    items.forEach(item => {
      if (item.type !== 'sprite') return;
      const sp = item.ref;
      const row = document.createElement('div');
      row.draggable = true; row.dataset.id = sp.id;
      row.className = 'layer-row' + (C.multiSel.includes(sp) ? ' sel' : '') + (sp.hidden ? ' hidden-sprite' : '');
      row.innerHTML = `<img src="${C.spriteBasePath}${sp.file}"><div style="flex:1;min-width:0"><div class="lname">${sp.file.replace(/\.(png|jpg)/,'')}</div><div class="lmeta">${sp.layer === 'spriteTop' ? 'roof' : 'floor'} · ${Math.round(sp.x)},${Math.round(sp.y)}</div></div>
        <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleVis('${sp.id}')">${sp.hidden ? '🔇' : '👁'}</button>
        <button class="lbtn" title="Duplicate" onclick="event.stopPropagation();Editor.Layers.dupSprite('${sp.id}')">📋</button>
        <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Layers.delSprite('${sp.id}')">🗑</button>`;
      row.onclick = () => { const s = C.allSprites.find(x => x.id === sp.id); if (s) Editor.Selection.select(s); };
      row.addEventListener('dragstart', () => { this.draggedId = sp.id; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); this.draggedId = null; });
      row.addEventListener('dragover', e => e.preventDefault());
      row.addEventListener('drop', e => { e.preventDefault(); if (this.draggedId && this.draggedId !== sp.id) this.reorderBefore(this.draggedId, sp.id); });
      list.appendChild(row);
    });
  },

  _createGroupRow(id, name, meta, iconSvg) {
    const row = document.createElement('div');
    row.className = 'layer-row group-row'; row.dataset.groupId = id;
    row.innerHTML = `<div class="group-icon">${iconSvg}</div><div style="flex:1;min-width:0"><div class="lname">${name}</div><div class="lmeta">${meta}</div></div>`;
    return row;
  },

  reorderBefore(srcId, targetId) {
    const C = Editor.Core;
    const src = C.allSprites.find(s => s.id === srcId);
    const target = C.allSprites.find(s => s.id === targetId);
    if (!src || !target) return;
    Editor.Undo.push();
    if (src.layer !== target.layer) { src.layer = target.layer; document.getElementById(target.layer).appendChild(src.el); }
    target.el.parentNode.insertBefore(src.el, target.el);
    C.allSprites = C.allSprites.filter(s => s !== src);
    const idx = C.allSprites.indexOf(target);
    C.allSprites.splice(idx, 0, src);
    Editor.Persistence.save(); this.rebuild();
  },

  toggleVis(id) {
    const C = Editor.Core;
    const sp = C.allSprites.find(s => s.id === id); if (!sp) return;
    sp.hidden = !sp.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
    this.rebuild(); Editor.Persistence.save();
  },

  dupSprite(id) {
    const s = Editor.Core.allSprites.find(x => x.id === id);
    if (s) { Editor.Undo.push(); Editor.Sprites.addSprite(s.file, s.x+15, s.y+15, s.w, s.h, s.rot, s.layer); this.rebuild(); }
  },

  // ── Drag model from layer row to reposition on canvas ──
  _startLayerDragModel(e, m) {
    const C = Editor.Core;
    Editor.Undo.push();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const mv = e2 => {
      if (!moved && (Math.abs(e2.clientX - startX) > 3 || Math.abs(e2.clientY - startY) > 3)) moved = true;
      if (!moved) return;
      const p = C.svgPt(e2.clientX, e2.clientY);
      m.x = p.x; m.y = p.y;
      Editor.Models.applyModel(m);
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      if (moved) { Editor.Persistence.save(); this.rebuild(); }
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  // ── Drag objective from layer row to reposition on canvas ──
  _startLayerDragObjective(e, obj) {
    Editor.Undo.push();
    const container = document.getElementById('mapWrap');
    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const mv = e2 => {
      if (!moved && (Math.abs(e2.clientX - startX) > 3 || Math.abs(e2.clientY - startY) > 3)) moved = true;
      if (!moved) return;
      const rect = container.getBoundingClientRect();
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
      if (moved) { Editor.Persistence.save(); this.rebuild(); }
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  delSprite(id) {
    const C = Editor.Core;
    const sp = C.allSprites.find(s => s.id === id); if (!sp) return;
    Editor.Undo.push();
    sp.el.remove(); C.allSprites = C.allSprites.filter(s => s !== sp);
    if (C.selected === sp) Editor.Selection.deselect();
    C.updateDebug(); Editor.Persistence.save(); this.rebuild();
  }
};
