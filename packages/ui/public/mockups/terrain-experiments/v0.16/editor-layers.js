/* ══════════════════════════════════════════════════════════════
   Editor Layers — right sidebar panel with drag-to-reorder,
   visibility toggle, duplicate, delete. Includes Models + Lights groups.
══════════════════════════════════════════════════════════════ */

Editor.Layers = {
  draggedLayerId: null,

  rebuild() {
    const C = Editor.Core;
    const list = document.getElementById('layersList');
    list.innerHTML = '';

    // Models group row
    const modelsRow = this._createGroupRow('models-group', 'Models', `${C.allModels.length} units`,
      `<svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="1.5"><circle cx="12" cy="12" r="7"/><line x1="12" y1="8" x2="12" y2="16" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke-linecap="round"/></svg>`
    );
    list.appendChild(modelsRow);

    // Lights group row
    if (C.allLights.length > 0) {
      const lightsRow = this._createGroupRow('lights-group', 'Lights', `${C.allLights.length} lights`,
        `<svg viewBox="0 0 24 24" fill="none" stroke="#ffaa44" stroke-width="1.5"><circle cx="12" cy="10" r="5"/><line x1="10" y1="16" x2="14" y2="16"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`
      );
      list.appendChild(lightsRow);

      // Individual light rows
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

    // Sprite rows (reversed = top layer first)
    C.allSprites.slice().reverse().forEach(sp => {
      const row = document.createElement('div');
      row.draggable = true; row.dataset.id = sp.id;
      row.className = 'layer-row' + (C.multiSel.includes(sp) ? ' sel' : '') + (sp.hidden ? ' hidden-sprite' : '');
      row.innerHTML = `<img src="${C.spriteBasePath}${sp.file}"><div style="flex:1;min-width:0"><div class="lname">${sp.file.replace(/\.(png|jpg)/,'')}</div><div class="lmeta">${sp.layer === 'spriteTop' ? 'roof' : 'floor'} · ${Math.round(sp.x)},${Math.round(sp.y)}</div></div>
        <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleVis('${sp.id}')">${sp.hidden ? '🔇' : '👁'}</button>
        <button class="lbtn" title="Duplicate" onclick="event.stopPropagation();Editor.Layers.dupSprite('${sp.id}')">📋</button>
        <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Layers.delSprite('${sp.id}')">🗑</button>`;
      row.onclick = () => { const s = C.allSprites.find(x => x.id === sp.id); if (s) Editor.Selection.select(s); };
      row.addEventListener('dragstart', () => { this.draggedLayerId = sp.id; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); this.draggedLayerId = null; });
      row.addEventListener('dragover', e => e.preventDefault());
      row.addEventListener('drop', e => { e.preventDefault(); if (this.draggedLayerId && this.draggedLayerId !== sp.id) this.reorderBefore(this.draggedLayerId, sp.id); });
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

  delSprite(id) {
    const C = Editor.Core;
    const sp = C.allSprites.find(s => s.id === id); if (!sp) return;
    Editor.Undo.push();
    sp.el.remove(); C.allSprites = C.allSprites.filter(s => s !== sp);
    if (C.selected === sp) Editor.Selection.deselect();
    C.updateDebug(); Editor.Persistence.save(); this.rebuild();
  }
};
