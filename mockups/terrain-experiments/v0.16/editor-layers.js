/* ══════════════════════════════════════════════════════════════
   Editor Layers — right sidebar panel with drag-to-reorder.
   All item types (sprites, models-group, lights-group, obj-rings, obj-hexes,
   custom groups) can be reordered via drag in a unified z-order list.
   Models and Lights groups are expandable to show individual items.
══════════════════════════════════════════════════════════════ */

Editor.Layers = {
  draggedId: null,
  expandedGroups: { modelLayer: false, lightLayer: false },

  /* ── Build the unified z-order list from SVG DOM ── */
  _buildZOrder() {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');
    const items = [];

    const groupMeta = {
      modelLayer:      { name: 'Models',      icon: 'models' },
      lightLayer:      { name: 'Lights',      icon: 'lights' },
      objectiveRings:  { name: 'Obj Rings',   icon: 'obj-rings' },
      objectiveHexes:  { name: 'Obj Hexes',   icon: 'obj-hexes' },
      svgRuins:        { name: 'SVG Ruins',   icon: 'ruins' },
      svgScatter:      { name: 'SVG Scatter', icon: 'scatter' }
    };
    const spriteContainers = new Set(['spriteFloor', 'spriteTop']);

    // Also recognize custom group <g> elements
    Array.from(svg.children).forEach(el => {
      if (groupMeta[el.id]) {
        items.push({ type: 'group', groupId: el.id, svgEl: el, meta: groupMeta[el.id] });
      } else if (spriteContainers.has(el.id)) {
        Array.from(el.children).forEach(sprEl => {
          const sp = C.allSprites.find(s => s.el === sprEl);
          if (sp) items.push({ type: 'sprite', ref: sp, svgEl: sprEl, parentId: el.id });
        });
      } else if (el.id && el.id.startsWith('group-')) {
        // Custom sprite group
        items.push({ type: 'custom-group', groupId: el.id, svgEl: el });
      }
    });

    return items;
  },

  /* ── Render the layers panel ── */
  rebuild() {
    const C = Editor.Core;
    const list = document.getElementById('layersList');
    const svg = document.getElementById('battlefield');
    list.innerHTML = '';

    const zItems = this._buildZOrder();
    const displayItems = zItems.slice().reverse();

    // Drop zone at top — dragging a group here puts it in front of everything
    const topZone = document.createElement('div');
    topZone.className = 'layer-drop-top';
    topZone.style.cssText = 'height:4px;border-radius:2px;margin-bottom:2px;';
    topZone.addEventListener('dragover', e => { e.preventDefault(); topZone.style.background = '#00d4ff'; topZone.style.height = '8px'; });
    topZone.addEventListener('dragleave', () => { topZone.style.background = ''; topZone.style.height = '4px'; });
    topZone.addEventListener('drop', e => {
      e.preventDefault(); topZone.style.background = ''; topZone.style.height = '4px';
      if (!this.draggedId) return;
      const dragItem = zItems.find(z => this._itemId(z) === this.draggedId);
      if (!dragItem) return;
      const isGroup = dragItem.type === 'group' || dragItem.type === 'custom-group';
      if (isGroup) {
        Editor.Undo.push();
        const selUI = document.getElementById('selUI');
        svg.insertBefore(dragItem.svgEl, selUI);
        const _selUI = document.getElementById('selUI');
        const _dragRect = document.getElementById('dragRect');
        if (_selUI) svg.appendChild(_selUI);
        if (_dragRect) svg.appendChild(_dragRect);
        Editor.Persistence.save(); this.rebuild();
      }
    });
    list.appendChild(topZone);

    displayItems.forEach(item => {
      let row;
      if (item.type === 'group') {
        row = this._createGroupRow(item, C);
        list.appendChild(row);
        this._setupDrag(row, this._itemId(item), zItems);

        // Expandable children for models and lights
        if (item.groupId === 'modelLayer' && this.expandedGroups.modelLayer) {
          C.allModels.forEach(m => {
            const child = this._createModelChildRow(m, C);
            list.appendChild(child);
          });
        } else if (item.groupId === 'lightLayer' && this.expandedGroups.lightLayer) {
          C.allLights.forEach(l => {
            const child = this._createLightChildRow(l, C);
            list.appendChild(child);
          });
        }
      } else if (item.type === 'custom-group') {
        row = this._createCustomGroupRow(item, C);
        list.appendChild(row);
        this._setupDrag(row, this._itemId(item), zItems);
        // Show child sprites (in DOM order = z-order)
        const gId = item.groupId;
        const gEl = document.getElementById(gId);
        const childSprites = gEl
          ? Array.from(gEl.children).map(el => C.allSprites.find(s => s.el === el)).filter(Boolean).reverse()
          : C.allSprites.filter(s => s.groupId === gId);
        childSprites.forEach(sp => {
          const child = this._createSpriteRow({ type: 'sprite', ref: sp }, C, true);
          this._setupGroupChildDrag(child, sp, gId);
          list.appendChild(child);
        });
      } else {
        // Ungrouped sprite
        if (!item.ref.groupId) {
          row = this._createSpriteRow(item, C, false);
          list.appendChild(row);
          this._setupDrag(row, this._itemId(item), zItems);
        }
      }
    });
  },

  _setupDrag(row, itemId, zItems) {
    row.draggable = true;
    row.dataset.layerId = itemId;
    row.addEventListener('dragstart', () => { this.draggedId = itemId; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); this.draggedId = null; });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.toggle('drop-above', e.clientY < mid);
      row.classList.toggle('drop-below', e.clientY >= mid);
    });
    row.addEventListener('dragleave', () => { row.classList.remove('drop-above', 'drop-below'); });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drop-above', 'drop-below');
      if (this.draggedId && this.draggedId !== itemId) {
        this._handleDrop(this.draggedId, itemId, zItems);
      }
    });
  },

  _itemId(item) {
    if (item.type === 'group') return item.groupId;
    if (item.type === 'custom-group') return item.groupId;
    return item.ref.id;
  },

  /* ── Create a built-in group row (Models, Lights, Obj) ── */
  _createGroupRow(item, C) {
    const g = item.meta;
    let count, meta, iconSvg;
    const expandable = item.groupId === 'modelLayer' || item.groupId === 'lightLayer';
    const expanded = expandable && this.expandedGroups[item.groupId];

    if (item.groupId === 'modelLayer') {
      count = C.allModels.length;
      meta = `${count} unit${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="1.5"><circle cx="12" cy="12" r="7"/><line x1="12" y1="8" x2="12" y2="16" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke-linecap="round"/></svg>`;
    } else if (item.groupId === 'lightLayer') {
      count = C.allLights.length;
      meta = `${count} light${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#ffaa44" stroke-width="1.5"><circle cx="12" cy="10" r="5"/><line x1="10" y1="16" x2="14" y2="16"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`;
    } else if (item.groupId === 'objectiveRings') {
      count = C.allObjectives.length;
      meta = `${count} ring${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#8090a0" stroke-width="1.5"><circle cx="12" cy="12" r="8" stroke-dasharray="3,2"/></svg>`;
    } else if (item.groupId === 'objectiveHexes') {
      count = C.allObjectives.length;
      meta = `${count} hex${count !== 1 ? 'es' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#8090a0" stroke-width="1.5"><polygon points="12,3 21,8 21,16 12,21 3,16 3,8"/><text x="12" y="14" text-anchor="middle" font-size="8" fill="#8090a0" stroke="none">O</text></svg>`;
    } else if (item.groupId === 'svgRuins') {
      const el = document.getElementById('svgRuins');
      count = el ? el.children.length : 0;
      meta = `${count} ruin${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#6a7272" stroke-width="1.5"><rect x="4" y="8" width="16" height="12" rx="1"/><rect x="6" y="4" width="4" height="4"/><rect x="14" y="6" width="4" height="2"/></svg>`;
    } else if (item.groupId === 'svgScatter') {
      const el = document.getElementById('svgScatter');
      count = el ? el.children.length : 0;
      meta = `${count} piece${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#3a3018" stroke-width="1.5"><rect x="6" y="6" width="5" height="8" rx="1"/><rect x="14" y="10" width="4" height="6" rx="1"/></svg>`;
    } else {
      count = 0; meta = ''; iconSvg = '';
    }

    const row = document.createElement('div');
    row.className = 'layer-row group-row';
    const expandIcon = expandable ? `<span class="expand-toggle">${expanded ? '▾' : '▸'}</span>` : '';
    row.innerHTML = `<div class="group-icon">${iconSvg}</div>
      <div style="flex:1;min-width:0"><div class="lname">${expandIcon}${g.name}</div><div class="lmeta">${meta}</div></div>
      <span class="drag-hint" title="Drag to reorder z-level">⠿</span>`;

    if (expandable) {
      row.style.cursor = 'pointer';
      row.onclick = e => {
        if (e.target.closest('.drag-hint')) return;
        this.expandedGroups[item.groupId] = !this.expandedGroups[item.groupId];
        this.rebuild();
      };
    }

    return row;
  },

  /* ── Individual model child row ── */
  _createModelChildRow(m, C) {
    const row = document.createElement('div');
    const isSelected = Editor.Models.selectedModel === m;
    const faction = m.s === '#0088aa' ? 'imp' : 'ork';
    const color = m.s === '#0088aa' ? '#0088aa' : '#aa2810';
    row.className = 'layer-row child-row' + (isSelected ? ' sel' : '');
    row.innerHTML = `<div class="child-icon" style="color:${color}">●</div>
      <div style="flex:1;min-width:0"><div class="lname">${m.kind} (${faction}${m.iconType ? ' · ' + m.iconType : ''})</div><div class="lmeta">${Math.round(m.x)},${Math.round(m.y)}</div></div>
      <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Models.removeModel('${m.id}')">🗑</button>`;
    row.onclick = e => {
      if (e.target.closest('.lbtn')) return;
      Editor.Models.selectModel(m);
    };
    return row;
  },

  /* ── Individual light child row ── */
  _createLightChildRow(l, C) {
    const row = document.createElement('div');
    const isSelected = Editor.Lights.selectedLight === l;
    row.className = 'layer-row child-row' + (isSelected ? ' sel' : '');
    const hidden = l.el.style.display === 'none';
    row.innerHTML = `<div class="child-icon" style="color:${l.color}">💡</div>
      <div style="flex:1;min-width:0"><div class="lname"${hidden ? ' style="opacity:0.4"' : ''}>Light ${l.color}</div><div class="lmeta">${Math.round(l.x)},${Math.round(l.y)} · r${l.radius}</div></div>
      <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleLightVis('${l.id}')">${hidden ? '🔇' : '👁'}</button>
      <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Lights.removeLight('${l.id}')">🗑</button>`;
    row.onclick = e => {
      if (e.target.closest('.lbtn')) return;
      Editor.Lights.selectLight(l);
      Editor.Layers.rebuild();
    };
    return row;
  },

  /* ── Custom sprite group row ── */
  _createCustomGroupRow(item, C) {
    const gId = item.groupId;
    const group = (C.groups || []).find(g => g.id === gId);
    const name = group ? group.name : gId;
    const opacity = group ? Math.round(group.opacity * 100) : 100;
    const childCount = C.allSprites.filter(s => s.groupId === gId).length;

    const row = document.createElement('div');
    row.className = 'layer-row group-row custom-group-row';
    row.innerHTML = `<div class="group-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/></svg></div>
      <div style="flex:1;min-width:0"><div class="lname group-name" data-gid="${gId}" title="Double-click to rename">${name}</div><div class="lmeta">${childCount} sprite${childCount !== 1 ? 's' : ''} · ${opacity}%</div></div>
      <input type="range" min="0" max="100" value="${opacity}" class="group-opacity" title="Group opacity" onclick="event.stopPropagation()" oninput="event.stopPropagation();Editor.Groups.setOpacity('${gId}',this.value/100)" onmousedown="event.stopPropagation();this.parentElement.draggable=false" onmouseup="this.parentElement.draggable=true">
      <button class="lbtn" title="Ungroup" onclick="event.stopPropagation();Editor.Groups.ungroup('${gId}')">📤</button>
      <button class="lbtn" title="Delete group + sprites" onclick="event.stopPropagation();Editor.Groups.deleteGroup('${gId}')">🗑</button>
      <span class="drag-hint" title="Drag to reorder">⠿</span>`;

    // Double-click to rename
    const nameEl = row.querySelector('.group-name');
    nameEl.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text'; input.value = name;
      input.className = 'group-rename-input';
      input.style.cssText = 'width:100%;background:#0a0e18;color:#00d4ff;border:1px solid #00d4ff;border-radius:2px;font-size:9px;padding:1px 3px;outline:none;';
      nameEl.replaceWith(input);
      input.focus(); input.select();
      const commit = () => {
        const newName = input.value.trim() || name;
        Editor.Groups.rename(gId, newName);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = name; input.blur(); }
        ev.stopPropagation();
      });
    });

    // Accept sprite drops to add to this group
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (this.draggedId && !this.draggedId.startsWith('group-')) {
        row.classList.add('drop-above');
      }
    });
    row.addEventListener('dragleave', () => { row.classList.remove('drop-above'); });
    row.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      row.classList.remove('drop-above');
      if (this.draggedId && !this.draggedId.startsWith('group-')) {
        const sp = C.allSprites.find(s => s.id === this.draggedId);
        if (sp && sp.groupId !== gId) {
          Editor.Groups.addToGroup(gId, sp);
        }
      }
    });

    row.onclick = e => {
      if (e.target.closest('.lbtn') || e.target.closest('.group-opacity') || e.target.closest('.drag-hint') || e.target.closest('.group-name')) return;
      const sprites = C.allSprites.filter(s => s.groupId === gId);
      if (sprites.length) {
        C.multiSel = sprites;
        C.selected = sprites[0];
        Editor.Selection.drawSelectionUI();
        this.rebuild();
      }
    };

    return row;
  },

  /* ── Create an individual sprite row ── */
  _createSpriteRow(item, C, indented) {
    const sp = item.ref;
    const row = document.createElement('div');
    row.className = 'layer-row' + (C.multiSel.includes(sp) ? ' sel' : '') + (sp.hidden ? ' hidden-sprite' : '') + (indented ? ' child-row' : '');
    const sMul = sp.shadowMul != null ? sp.shadowMul : 1.0;
    const sMulPct = Math.round(sMul * 100);
    row.innerHTML = `<img src="${C.spriteBasePath}${sp.file}">
      <div style="flex:1;min-width:0"><div class="lname">${sp.file.replace(/\.(png|jpg)/, '')}</div><div class="lmeta">${sp.layer === 'spriteTop' ? 'roof' : 'floor'} · ${Math.round(sp.x)},${Math.round(sp.y)}</div>
      <div class="lmeta sprite-shadow-row" style="display:flex;align-items:center;gap:3px;margin-top:2px"><span style="color:#607080;font-size:8px">Shadow</span><input type="range" min="0" max="100" value="${sMulPct}" style="width:50px;height:10px;accent-color:#00d4ff" onclick="event.stopPropagation()" oninput="event.stopPropagation();Editor.Effects.setSpriteShadowMul('${sp.id}',this.value/100);this.nextElementSibling.textContent=this.value+'%'" onmousedown="event.stopPropagation()"><span style="font-size:8px;color:#4f6476;width:24px">${sMulPct}%</span></div></div>
      <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleVis('${sp.id}')">${sp.hidden ? '🔇' : '👁'}</button>
      ${(sp.cropL || sp.cropT || sp.cropR || sp.cropB) ? `<button class="lbtn" title="Reset crop" onclick="event.stopPropagation();Editor.Crop.resetCrop(Editor.Core.allSprites.find(s=>s.id==='${sp.id}'))">✂️</button>` : ''}
      <button class="lbtn" title="Duplicate" onclick="event.stopPropagation();Editor.Layers.dupSprite('${sp.id}')">📋</button>
      <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Layers.delSprite('${sp.id}')">🗑</button>`;
    row.onclick = (e) => {
      const s = C.allSprites.find(x => x.id === sp.id); if (!s) return;
      if (e.shiftKey) {
        if (C.multiSel.includes(s)) { C.multiSel = C.multiSel.filter(x => x !== s); C.selected = C.multiSel[0] || null; }
        else { C.multiSel.push(s); C.selected = s; }
        Editor.Selection.drawSelectionUI(); this.rebuild();
      } else { Editor.Selection.select(s); }
    };
    return row;
  },

  /* ── Handle drop: reorder sprites and/or groups ── */
  _handleDrop(draggedId, targetId, zItems) {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');

    const dragItem = zItems.find(z => this._itemId(z) === draggedId);
    const targetItem = zItems.find(z => this._itemId(z) === targetId);
    if (!dragItem || !targetItem) return;

    Editor.Undo.push();

    const dragIsGroup = dragItem.type === 'group' || dragItem.type === 'custom-group';
    const targetIsGroup = targetItem.type === 'group' || targetItem.type === 'custom-group';

    const _fixTrailingEls = () => {
      const selUI = document.getElementById('selUI');
      const dragRect = document.getElementById('dragRect');
      if (selUI) svg.appendChild(selUI);
      if (dragRect) svg.appendChild(dragRect);
    };

    // Sprite on sprite, same container → reorder within
    if (!dragIsGroup && !targetIsGroup &&
        dragItem.svgEl.parentNode === targetItem.svgEl.parentNode) {
      this.reorderBefore(dragItem.ref.id, targetItem.ref.id);
      return;
    }

    // Sprite on sprite, different container → move sprite to other container
    if (!dragIsGroup && !targetIsGroup &&
        dragItem.svgEl.parentNode !== targetItem.svgEl.parentNode) {
      const src = dragItem.ref;
      const targetParent = targetItem.svgEl.parentNode;
      targetParent.insertBefore(dragItem.svgEl, targetItem.svgEl);
      src.layer = targetParent.id;
      C.allSprites = C.allSprites.filter(s => s !== src);
      const idx = C.allSprites.indexOf(targetItem.ref);
      C.allSprites.splice(idx, 0, src);
      Editor.Persistence.save(); this.rebuild();
      return;
    }

    // Group on group → reorder groups in SVG DOM
    if (dragIsGroup && targetIsGroup) {
      if (dragItem.svgEl === targetItem.svgEl) return;
      svg.insertBefore(dragItem.svgEl, targetItem.svgEl);
      _fixTrailingEls();
      Editor.Persistence.save(); this.rebuild();
      return;
    }

    // Group on sprite → resolve to sprite's container, insert before it
    if (dragIsGroup && !targetIsGroup) {
      const targetContainer = targetItem.svgEl.parentNode;
      if (targetContainer === dragItem.svgEl) return;
      svg.insertBefore(dragItem.svgEl, targetContainer);
      _fixTrailingEls();
      Editor.Persistence.save(); this.rebuild();
      return;
    }

    // Sprite on group → just select the sprite (don't move containers)
    // Use addToGroup for custom groups instead (handled separately in custom group drop handler)
    if (!dragIsGroup && targetIsGroup) {
      // Don't move the sprite's entire container
      Editor.Persistence.save(); this.rebuild();
    }
  },

  /* ── Drag reorder within a custom group ── */
  _setupGroupChildDrag(row, sp, groupId) {
    row.draggable = true;
    row.dataset.groupChildId = sp.id;
    row.dataset.groupId = groupId;

    row.addEventListener('dragstart', e => {
      e.stopPropagation();
      this._dragGroupChild = sp.id;
      this._dragGroupId = groupId;
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      this._dragGroupChild = null;
      this._dragGroupId = null;
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!this._dragGroupChild || this._dragGroupId !== groupId) return;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.toggle('drop-above', e.clientY < mid);
      row.classList.toggle('drop-below', e.clientY >= mid);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drop-above', 'drop-below');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drop-above', 'drop-below');
      if (!this._dragGroupChild || this._dragGroupChild === sp.id) return;
      if (this._dragGroupId !== groupId) return;

      const C = Editor.Core;
      const srcSp = C.allSprites.find(s => s.id === this._dragGroupChild);
      if (!srcSp) return;

      Editor.Undo.push();
      const gEl = document.getElementById(groupId);
      if (!gEl) return;

      // Display is reversed (top of list = last in DOM = front),
      // so "drop above" in the UI = insert after in DOM
      const rect = row.getBoundingClientRect();
      const dropAbove = e.clientY < rect.top + rect.height / 2;

      if (dropAbove) {
        // UI above = in front = after in DOM
        if (sp.el.nextElementSibling) {
          gEl.insertBefore(srcSp.el, sp.el.nextElementSibling);
        } else {
          gEl.appendChild(srcSp.el);
        }
      } else {
        // UI below = behind = before in DOM
        gEl.insertBefore(srcSp.el, sp.el);
      }

      Editor.Persistence.save();
      this.rebuild();
    });
  },

  reorderBefore(srcId, targetId) {
    const C = Editor.Core;
    const src = C.allSprites.find(s => s.id === srcId);
    const target = C.allSprites.find(s => s.id === targetId);
    if (!src || !target) return;
    Editor.Undo.push();
    if (src.layer !== target.layer) {
      src.layer = target.layer;
      document.getElementById(target.layer).appendChild(src.el);
    }
    target.el.parentNode.insertBefore(src.el, target.el);
    C.allSprites = C.allSprites.filter(s => s !== src);
    const idx = C.allSprites.indexOf(target);
    C.allSprites.splice(idx, 0, src);
    Editor.Persistence.save(); this.rebuild();
  },

  toggleLightVis(id) {
    const C = Editor.Core;
    const l = C.allLights.find(x => x.id === id); if (!l) return;
    const hidden = l.el.style.display === 'none';
    l.el.style.display = hidden ? '' : 'none';
    this.rebuild();
  },

  toggleVis(id) {
    const C = Editor.Core;
    const sp = C.allSprites.find(s => s.id === id); if (!sp) return;
    sp.hidden = !sp.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
    this.rebuild(); Editor.Persistence.save();
  },

  dupSprite(id) {
    const s = Editor.Core.allSprites.find(x => x.id === id);
    if (s) {
      Editor.Undo.push();
      Editor.Sprites.addSprite(s.file, s.x + 15, s.y + 15, s.w, s.h, s.rot, s.layer);
      this.rebuild();
    }
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
