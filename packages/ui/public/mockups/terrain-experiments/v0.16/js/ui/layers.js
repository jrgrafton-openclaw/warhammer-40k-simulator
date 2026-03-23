/* ══════════════════════════════════════════════════════════════
   Editor Layers — right sidebar panel with drag-to-reorder.
   All item types (sprites, models-group, lights-group, obj-rings, obj-hexes,
   custom groups) can be reordered via drag in a unified z-order list.
   Models, Lights, and custom sprite groups are expandable/collapsible.
══════════════════════════════════════════════════════════════ */

Editor.Layers = {
  draggedId: null,
  expandedGroups: { modelLayer: false, lightLayer: false, deployZones: false },
  // Custom groups default to expanded (true). Keyed by groupId.
  UI_STORAGE_KEY: 'wh40k-editor-v016-ui',

  /** Save editor UI state (expand/collapse) to localStorage. */
  _saveUIState() {
    try {
      localStorage.setItem(this.UI_STORAGE_KEY, JSON.stringify({
        expandedGroups: this.expandedGroups
      }));
    } catch (e) { /* quota exceeded — ignore */ }
  },

  /** Load editor UI state from localStorage. */
  _loadUIState() {
    try {
      const raw = localStorage.getItem(this.UI_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.expandedGroups) {
        this.expandedGroups = data.expandedGroups;
      }
    } catch (e) { /* corrupt data — ignore */ }
  },

  /* ── Build the unified z-order list ── */
  /* Phase 1: Uses EditorState.zOrder when available, falls back to DOM walk. */
  _buildZOrder() {
    const C = Editor.Core;
    const S = Editor.State;

    // If EditorState has a populated zOrder, use it (Phase 1 path)
    if (S.zOrder.length > 0) {
      return this._buildZOrderFromState(S, C);
    }
    // Fallback: walk the DOM (legacy path)
    return this._buildZOrderFromDOM(C);
  },

  /* Build z-order items from EditorState.zOrder array */
  _buildZOrderFromState(S, C) {
    const groupMeta = {
      deployZones:     { name: 'Deploy Zones', icon: 'deploy' },
      modelLayer:      { name: 'Models',      icon: 'models' },
      lightLayer:      { name: 'Lights',      icon: 'lights' },
      objectiveRings:  { name: 'Obj Rings',   icon: 'obj-rings' },
      objectiveHexes:  { name: 'Obj Hexes',   icon: 'obj-hexes' },
      svgRuins:        { name: 'SVG Ruins',   icon: 'ruins' },
      svgScatter:      { name: 'SVG Scatter', icon: 'scatter' }
    };
    const items = [];
    for (var i = 0; i < S.zOrder.length; i++) {
      var entry = S.zOrder[i];
      if (entry.type === 'sprite') {
        var sp = S.findSprite(entry.id);
        if (sp) items.push({ type: 'sprite', ref: sp, svgEl: S.getSpriteRootEl(sp) });
      } else if (entry.type === 'group') {
        var el = document.getElementById(entry.id);
        if (el) items.push({ type: 'custom-group', groupId: entry.id, svgEl: el });
      } else if (entry.type === 'smokefx') {
        var fx = Editor.Core.allSmokeFx.find(function(f) { return f.id === entry.id; });
        if (fx) items.push({ type: 'smokefx', ref: fx, svgEl: fx.el });
      } else if (entry.type === 'builtin') {
        var el2 = document.getElementById(entry.id);
        if (el2 && groupMeta[entry.id]) {
          items.push({ type: 'group', groupId: entry.id, svgEl: el2, meta: groupMeta[entry.id] });
        }
      }
    }
    return items;
  },

  /* Legacy DOM-walking z-order builder (fallback) */
  _buildZOrderFromDOM(C) {
    const svg = document.getElementById('battlefield');
    const items = [];

    const groupMeta = {
      deployZones:     { name: 'Deploy Zones', icon: 'deploy' },
      modelLayer:      { name: 'Models',      icon: 'models' },
      lightLayer:      { name: 'Lights',      icon: 'lights' },
      objectiveRings:  { name: 'Obj Rings',   icon: 'obj-rings' },
      objectiveHexes:  { name: 'Obj Hexes',   icon: 'obj-hexes' },
      svgRuins:        { name: 'SVG Ruins',   icon: 'ruins' },
      svgScatter:      { name: 'SVG Scatter', icon: 'scatter' }
    };
    const skipIds = new Set(['selUI', 'dragRect', 'bgImg',
      'svgGroundGradient', 'svgGroundWarm', 'svgGroundDual', 'svgGroundHaze',
      'svgGroundConcrete', 'svgGroundTactical', 'cropOverlay']);
    const legacyContainers = new Set(['spriteFloor', 'spriteTop']);

    Array.from(svg.children).forEach(el => {
      if (!el.id && el.tagName === 'rect' && !el.classList.contains('sel-rect')) return;
      if (!el.id && el.tagName === 'defs') return;
      if (skipIds.has(el.id)) return;
      if (legacyContainers.has(el.id)) {
        Array.from(el.children).forEach(child => {
          const sp = C.allSprites.find(s => s.el === child);
          if (sp) items.push({ type: 'sprite', ref: sp, svgEl: child });
        });
        return;
      }
      if (groupMeta[el.id]) {
        items.push({ type: 'group', groupId: el.id, svgEl: el, meta: groupMeta[el.id] });
      } else if (el.id && el.id.startsWith('group-')) {
        items.push({ type: 'custom-group', groupId: el.id, svgEl: el });
      } else if (el.classList && el.classList.contains('smokefx-entity')) {
        const fx = C.allSmokeFx.find(f => f.id === el.id);
        if (fx) items.push({ type: 'smokefx', ref: fx, svgEl: el });
      } else {
        let sp = C.allSprites.find(s => s.el === el);
        if (sp) {
          items.push({ type: 'sprite', ref: sp, svgEl: el });
        } else if (el.tagName === 'g' && el.id && el.id.endsWith('-wrap')) {
          sp = C.allSprites.find(s => s._clipWrap === el);
          if (sp) items.push({ type: 'sprite', ref: sp, svgEl: el });
        }
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
    topZone.style.cssText = 'height:6px;border-radius:2px;margin-bottom:2px;position:relative;z-index:1;';
    topZone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); topZone.style.background = '#00d4ff'; topZone.style.height = '8px'; });
    topZone.addEventListener('dragleave', () => { topZone.style.background = ''; topZone.style.height = '6px'; });
    topZone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); topZone.style.background = ''; topZone.style.height = '6px';
      if (!this.draggedId) return;
      var beforeOrder = Editor.Commands.captureDOMOrder();
      const selUI = document.getElementById('selUI');

      let dragItem = zItems.find(z => this._itemId(z) === this.draggedId);

      // Handle sprite being dragged out of a group (not in zItems as direct SVG child)
      if (!dragItem) {
        const sp = C.allSprites.find(s => s.id === this.draggedId);
        if (!sp) return;
        const elToMove = sp.rootEl;
        if (sp.groupId) {
          const oldGroupEl = document.getElementById(sp.groupId);
          if (oldGroupEl && elToMove.parentNode === oldGroupEl) oldGroupEl.removeChild(elToMove);
          delete sp.groupId;
        }
        svg.insertBefore(elToMove, selUI);
      } else {
        // Multi-select batch move: if dragged sprite is in multiSel, move all
        const dragSp = dragItem.type === 'sprite' ? dragItem.ref : null;
        if (dragSp && C.multiSel.length > 1 && C.multiSel.includes(dragSp)) {
          const selEls = C.multiSel.map(s => s.rootEl).filter(el => el.parentNode === svg);
          const allChildren = Array.from(svg.children);
          selEls.sort((a, b) => allChildren.indexOf(a) - allChildren.indexOf(b));
          selEls.forEach(el => svg.insertBefore(el, selUI));
        } else {
          svg.insertBefore(dragItem.svgEl, selUI);
        }
      }

      const _selUI = document.getElementById('selUI');
      const _dragRect = document.getElementById('dragRect');
      if (_selUI) svg.appendChild(_selUI);
      if (_dragRect) svg.appendChild(_dragRect);
      Editor.State.syncZOrderFromDOM();
      var afterOrder = Editor.Commands.captureDOMOrder();
      Editor.Undo.record(Editor.Commands.Reorder.create(beforeOrder, afterOrder));
      Editor.State.dispatch({ type: 'REORDER' }); this.rebuild();
    });
    list.appendChild(topZone);

    displayItems.forEach(item => {
      let row;
      if (item.type === 'group') {
        row = this._createGroupRow(item, C);
        list.appendChild(row);
        this._setupDrag(row, this._itemId(item), zItems);

        // Expandable children for models, lights, and deploy zones
        if (item.groupId === 'deployZones' && this.expandedGroups.deployZones) {
          const dzEl = document.getElementById('deployZones');
          if (dzEl) {
            Array.from(dzEl.children).filter(c => c.id && c.id.startsWith('deploy-')).forEach(zone => {
              const child = this._createDeployZoneChildRow(zone);
              list.appendChild(child);
            });
          }
        } else if (item.groupId === 'modelLayer' && this.expandedGroups.modelLayer) {
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
        row = this._createCustomGroupRow(item, C, zItems);
        list.appendChild(row);
        // Show child sprites only if group is expanded
        const gId = item.groupId;
        const isExpanded = this.expandedGroups[gId] !== false; // default expanded
        if (isExpanded) {
          const gEl = document.getElementById(gId);
          // Build children: ALL entity types inside this group
          const children = gEl ? Array.from(gEl.children).reverse() : [];
          children.forEach(el => {
            // Check if it's a sprite
            let sp = C.allSprites.find(s => s.el === el);
            if (!sp && el.tagName === 'g' && el.id && el.id.endsWith('-wrap')) {
              sp = C.allSprites.find(s => s._clipWrap === el);
            }
            if (sp) {
              const child = this._createSpriteRow({ type: 'sprite', ref: sp }, C, true);
              this._setupGroupChildDrag(child, sp, gId);
              list.appendChild(child);
              return;
            }
            // Check if it's a smokefx entity
            if (el.classList && el.classList.contains('smokefx-entity')) {
              const fx = C.allSmokeFx.find(f => f.el === el);
              if (fx) {
                const child = this._createSmokeFxRow({ type: 'smokefx', ref: fx, svgEl: fx.el }, C);
                child.classList.add('child-row');
                list.appendChild(child);
              }
              return;
            }
            // Check if it's a light
            const light = C.allLights.find(l => l.el === el);
            if (light) {
              const child = this._createLightChildRow(light, C);
              list.appendChild(child);
            }
          });
        }
      } else if (item.type === 'smokefx') {
        row = this._createSmokeFxRow(item, C);
        list.appendChild(row);
        this._setupDrag(row, this._itemId(item), zItems);
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
      const rect = row.getBoundingClientRect();
      const dropAbove = e.clientY < rect.top + rect.height / 2;
      row.classList.remove('drop-above', 'drop-below');
      if (this.draggedId && this.draggedId !== itemId) {
        this._handleDrop(this.draggedId, itemId, zItems, dropAbove);
      }
    });
  },

  _itemId(item) {
    if (item.type === 'group') return item.groupId;
    if (item.type === 'custom-group') return item.groupId;
    if (item.type === 'smokefx') return item.ref.id;
    return item.ref.id;
  },

  /* ── Create a built-in group row (Models, Lights, Obj) ── */
  _createGroupRow(item, C) {
    const g = item.meta;
    let count, meta, iconSvg;
    const expandable = item.groupId === 'modelLayer' || item.groupId === 'lightLayer' || item.groupId === 'deployZones';
    const expanded = expandable && this.expandedGroups[item.groupId];

    if (item.groupId === 'deployZones') {
      const el = document.getElementById('deployZones');
      const zones = el ? Array.from(el.children).filter(c => c.id && c.id.startsWith('deploy-')) : [];
      count = zones.length;
      meta = `${count} zone${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><rect x="2" y="4" width="8" height="16" rx="1" stroke="#00d4ff" fill="rgba(0,140,200,0.15)"/><rect x="14" y="4" width="8" height="16" rx="1" stroke="#ff4020" fill="rgba(255,64,32,0.15)"/></svg>`;
    } else if (item.groupId === 'modelLayer') {
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
        this._saveUIState();
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
    const isSelected = Editor.Core.selected === l || Editor.Core.multiSel.includes(l);
    row.className = 'layer-row child-row' + (isSelected ? ' sel' : '');
    const hidden = l.el.style.display === 'none';
    row.innerHTML = `<div class="child-icon" style="color:${l.color}">💡</div>
      <div style="flex:1;min-width:0"><div class="lname"${hidden ? ' style="opacity:0.4"' : ''}>Light ${l.color}</div><div class="lmeta">${Math.round(l.x)},${Math.round(l.y)} · r${l.radius}</div></div>
      <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleLightVis('${l.id}')">${hidden ? '🔇' : '👁'}</button>
      <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Lights.removeLight('${l.id}')">🗑</button>`;
    row.onclick = e => {
      if (e.target.closest('.lbtn')) return;
      Editor.Selection.select(l);
      Editor.Lights._showLightControls(l);
    };
    return row;
  },

  /* ── Individual deploy zone child row ── */
  /* ── Individual smoke/fire FX row ── */
  _createSmokeFxRow(item, C) {
    const fx = item.ref;
    const row = document.createElement('div');
    const isSelected = Editor.Core.selected === fx || Editor.Core.multiSel.includes(fx);
    const hidden = fx.el.style.display === 'none';
    const icon = fx.type === 'fire' ? '🔥' : '💨';
    const color = fx.type === 'fire' ? '#ff8844' : '#88aacc';
    const label = fx.type === 'fire' ? 'Fire' : 'Smoke';
    const num = fx.id.replace('fx', '');
    row.className = 'layer-row' + (isSelected ? ' sel' : '');
    row.innerHTML = `<div class="child-icon" style="color:${color};font-size:12px">${icon}</div>
      <div style="flex:1;min-width:0"><div class="lname"${hidden ? ' style="opacity:0.4"' : ''}>${label} #${num}</div><div class="lmeta">${Math.round(fx.x)},${Math.round(fx.y)}</div></div>
      <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleSmokeFxVis('${fx.id}')">${hidden ? '🔇' : '👁'}</button>
      <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Smoke.removeEffect('${fx.id}')">🗑</button>
      <span class="drag-hint" title="Drag to reorder z-level">⠿</span>`;
    row.onclick = e => {
      if (e.target.closest('.lbtn') || e.target.closest('.drag-hint')) return;
      Editor.Selection.select(fx);
    };
    return row;
  },

  toggleSmokeFxVis(id) {
    const fx = Editor.Core.allSmokeFx.find(f => f.id === id); if (!fx) return;
    const wasHidden = fx.el.style.display === 'none';
    fx.el.style.display = wasHidden ? '' : 'none';
    Editor.State.dispatch({ type: 'TOGGLE_FX_VIS' });
    this.rebuild();
  },

  _createDeployZoneChildRow(zoneEl) {
    const row = document.createElement('div');
    const hidden = zoneEl.style.display === 'none';
    const zoneId = zoneEl.id;
    const isImperium = zoneId === 'deploy-imperium';
    const name = isImperium ? 'Imperium' : 'Ork';
    const color = isImperium ? '#00d4ff' : '#ff4020';
    const dotColor = isImperium ? 'rgba(0,140,200,0.6)' : 'rgba(255,64,32,0.6)';
    row.className = 'layer-row child-row';
    row.innerHTML = `<div class="child-icon" style="color:${dotColor}">◼</div>
      <div style="flex:1;min-width:0"><div class="lname"${hidden ? ' style="opacity:0.4"' : ''}>${name} Deploy</div><div class="lmeta">${isImperium ? 'Left (0–240)' : 'Right (480–720)'}</div></div>
      <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleDeployZoneVis('${zoneId}')">${hidden ? '🔇' : '👁'}</button>`;
    return row;
  },

  /* ── Toggle individual deploy zone visibility ── */
  toggleDeployZoneVis(zoneId) {
    const el = document.getElementById(zoneId);
    if (!el) return;
    const wasHidden = el.style.display === 'none';
    el.style.display = wasHidden ? '' : 'none';
    // Update the parent toggle button state based on whether ANY zone is visible
    const parent = document.getElementById('deployZones');
    if (parent) {
      const anyVisible = Array.from(parent.children)
        .filter(c => c.id && c.id.startsWith('deploy-'))
        .some(c => c.style.display !== 'none');
      const btn = document.querySelector('button[onclick*="deployZones"]');
      if (btn) {
        if (anyVisible) btn.classList.add('on');
        else btn.classList.remove('on');
      }
    }
    Editor.State.dispatch({ type: 'TOGGLE_DEPLOY_ZONE_VIS' });
    this.rebuild();
  },

  /* ── Custom sprite group row ── */
  _createCustomGroupRow(item, C, zItems) {
    const gId = item.groupId;
    const group = (C.groups || []).find(g => g.id === gId);
    const name = group ? group.name : gId;
    const opacity = group ? Math.round(group.opacity * 100) : 100;
    const spriteCount = C.allSprites.filter(s => s.groupId === gId).length;
    const fxCount = C.allSmokeFx ? C.allSmokeFx.filter(f => f.groupId === gId).length : 0;
    const lightCount = C.allLights ? C.allLights.filter(l => l.groupId === gId).length : 0;
    const childCount = spriteCount + fxCount + lightCount;
    const isExpanded = this.expandedGroups[gId] !== false; // default expanded

    const row = document.createElement('div');
    row.className = 'layer-row group-row custom-group-row';
    row.innerHTML = `<div class="group-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/></svg></div>
      <div style="flex:1;min-width:0"><div class="lname group-name" data-gid="${gId}"><span class="expand-toggle">${isExpanded ? '▾' : '▸'}</span>${name}</div><div class="lmeta">${childCount} item${childCount !== 1 ? 's' : ''} · ${opacity}%</div></div>
      <button class="lbtn group-rename-btn" title="Rename group" onclick="event.stopPropagation();Editor.Layers._startGroupRename('${gId}',this)">✏️</button>
      <input type="range" min="0" max="100" value="${opacity}" class="group-opacity" title="Group opacity" onclick="event.stopPropagation()" oninput="event.stopPropagation();Editor.Groups.setOpacity('${gId}',this.value/100)" onmousedown="event.stopPropagation();this.parentElement.draggable=false" onmouseup="this.parentElement.draggable=true">
      <button class="lbtn" title="Ungroup" onclick="event.stopPropagation();Editor.Groups.ungroup('${gId}')">📤</button>
      <button class="lbtn" title="Delete group + sprites" onclick="event.stopPropagation();Editor.Groups.deleteGroup('${gId}')">🗑</button>
      <span class="drag-hint" title="Drag to reorder">⠿</span>`;

    // Make group row draggable for z-order reordering
    row.draggable = true;
    row.dataset.layerId = gId;
    row.addEventListener('dragstart', (e) => {
      if (e.target.closest('.group-rename-input')) { e.preventDefault(); return; }
      this.draggedId = gId; row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); this.draggedId = null; });

    // Accept drops: sprites → add to group, groups/built-ins → z-order reorder
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!this.draggedId || this.draggedId === gId) return;
      const isSpriteDrag = !this.draggedId.startsWith('group-') && !this.draggedId.startsWith('model') && !this.draggedId.startsWith('light') && !this.draggedId.startsWith('objective') && !this.draggedId.startsWith('svg') && !this.draggedId.startsWith('deploy');
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.toggle('drop-above', e.clientY < mid);
      row.classList.toggle('drop-below', e.clientY >= mid);
    });
    row.addEventListener('dragleave', () => { row.classList.remove('drop-above', 'drop-below'); });
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const rect = row.getBoundingClientRect();
      const dropAbove = e.clientY < rect.top + rect.height / 2;
      row.classList.remove('drop-above', 'drop-below');
      if (!this.draggedId || this.draggedId === gId) return;
      const isSpriteDrag = !this.draggedId.startsWith('group-') && !this.draggedId.startsWith('model') && !this.draggedId.startsWith('light') && !this.draggedId.startsWith('objective') && !this.draggedId.startsWith('svg') && !this.draggedId.startsWith('deploy');
      if (isSpriteDrag) {
        const sp = C.allSprites.find(s => s.id === this.draggedId);
        const fx = !sp ? C.allSmokeFx.find(f => f.id === this.draggedId) : null;
        if (!sp && !fx) return;
        const elToMove = sp ? sp.rootEl : fx.el;
        const itemGroupId = sp ? sp.groupId : fx.groupId;
        if (dropAbove) {
          // Drop above group row = insert BEFORE the group <g> in SVG (between items, not into group)
          const svg = document.getElementById('battlefield');
          const gEl = document.getElementById(gId);
          if (!gEl) return;
          var beforeOrder = Editor.Commands.captureDOMOrder();
          // Remove from current group if needed
          if (itemGroupId) {
            const oldGroupEl = document.getElementById(itemGroupId);
            if (oldGroupEl && elToMove.parentNode === oldGroupEl) oldGroupEl.removeChild(elToMove);
            if (sp) delete sp.groupId; else delete fx.groupId;
          }
          // "Drop above" in layer panel = in front = after in DOM
          svg.insertBefore(elToMove, gEl.nextElementSibling);
          const selUI = document.getElementById('selUI');
          const dragRect = document.getElementById('dragRect');
          if (selUI) svg.appendChild(selUI);
          if (dragRect) svg.appendChild(dragRect);
          Editor.State.syncZOrderFromDOM();
          var afterOrder = Editor.Commands.captureDOMOrder();
          Editor.Undo.record(Editor.Commands.Reorder.create(beforeOrder, afterOrder));
          Editor.State.dispatch({ type: 'REORDER' }); this.rebuild();
        } else if (itemGroupId !== gId) {
          if (sp) {
            // Drop below/on group = add sprite into group
            Editor.Groups.addToGroup(gId, sp);
          } else {
            // Drop below/on group = add FX into group
            const svg = document.getElementById('battlefield');
            const gEl = document.getElementById(gId);
            if (!gEl) return;
            var beforeOrder = Editor.Commands.captureDOMOrder();
            const oldGroupId = fx.groupId || null;
            if (fx.groupId) {
              const oldGroupEl = document.getElementById(fx.groupId);
              if (oldGroupEl && elToMove.parentNode === oldGroupEl) oldGroupEl.removeChild(elToMove);
            }
            if (elToMove.parentNode) elToMove.parentNode.removeChild(elToMove);
            gEl.appendChild(elToMove);
            fx.groupId = gId;
            Editor.State.syncZOrderFromDOM();
            var afterOrder = Editor.Commands.captureDOMOrder();
            Editor.Undo.record(Editor.Commands.Reorder.create(beforeOrder, afterOrder));
            Editor.State.dispatch({ type: 'ADD_TO_GROUP', id: gId }); this.rebuild();
          }
        }
      } else if (zItems) {
        this._handleDrop(this.draggedId, gId, zItems, dropAbove);
      }
    });

    row.onclick = e => {
      // Ignore clicks on buttons, slider, drag handle
      if (e.target.closest('.lbtn') || e.target.closest('.group-opacity') || e.target.closest('.drag-hint') || e.target.closest('.group-rename-btn')) return;
      // Everything else (expand toggle, group name, row body) → toggle collapse/expand
      this.expandedGroups[gId] = !isExpanded;
      this._saveUIState();
      this.rebuild();
    };

    return row;
  },

  /* ── Start inline rename for a custom group ── */
  _startGroupRename(gId, btn) {
    const row = btn.closest('.layer-row');
    if (!row) return;
    const nameEl = row.querySelector('.group-name');
    if (!nameEl) return;
    const group = (Editor.Core.groups || []).find(g => g.id === gId);
    const oldName = group ? group.name : gId;
    const input = document.createElement('input');
    input.type = 'text'; input.value = oldName;
    input.className = 'group-rename-input';
    input.style.cssText = 'width:100%;background:#0a0e18;color:#00d4ff;border:1px solid #00d4ff;border-radius:2px;font-size:9px;padding:1px 3px;outline:none;';
    row.draggable = false;
    nameEl.replaceWith(input);
    input.focus(); input.select();
    const commit = () => {
      row.draggable = true;
      const newName = input.value.trim() || oldName;
      Editor.Groups.rename(gId, newName);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('mousedown', ev => ev.stopPropagation());
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
      ev.stopPropagation();
    });
  },

  /* ── Create an individual sprite row ── */
  _createSpriteRow(item, C, indented) {
    const sp = item.ref;
    const row = document.createElement('div');
    row.className = 'layer-row' + (C.multiSel.includes(sp) ? ' sel' : '') + (sp.hidden ? ' hidden-sprite' : '') + (indented ? ' child-row' : '');
    const sMul = sp.shadowMul != null ? sp.shadowMul : 1.0;
    const sMulPct = Math.round(sMul * 100);
    const isDataUrl = sp.file.startsWith('data:');
    const thumbSrc = isDataUrl ? sp.file : C.spriteBasePath + sp.file;
    const displayName = isDataUrl ? (sp._fileName || 'Dropped image').replace(/\.(png|jpg|jpeg|webp)$/i, '') : sp.file.replace(/\.(png|jpg)/, '');
    row.innerHTML = `<img src="${thumbSrc}">
      <div style="flex:1;min-width:0"><div class="lname">${displayName}</div><div class="lmeta">${sp.layerType === 'top' ? 'roof' : 'floor'} · ${Math.round(sp.x)},${Math.round(sp.y)}</div>
      <div class="lmeta sprite-shadow-row" style="display:flex;align-items:center;gap:3px;margin-top:2px"><span style="color:#607080;font-size:8px">Shadow</span><input type="range" min="0" max="100" value="${sMulPct}" style="width:50px;height:10px;accent-color:#00d4ff" onclick="event.stopPropagation()" oninput="event.stopPropagation();Editor.Effects.setSpriteShadowMul('${sp.id}',this.value/100);this.nextElementSibling.textContent=this.value+'%'" onmousedown="event.stopPropagation();Editor.Commands.captureShadow('${sp.id}',this.value/100);this.closest('.layer-row').draggable=false" onmouseup="Editor.Commands.commitShadow();this.closest('.layer-row').draggable=true"><span style="font-size:8px;color:#4f6476;width:24px">${sMulPct}%</span></div></div>
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
  /* dropAbove: true = user dropped above target row (= in front visually = after in DOM) */
  _handleDrop(draggedId, targetId, zItems, dropAbove) {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');

    let dragItem = zItems.find(z => this._itemId(z) === draggedId);
    const targetItem = zItems.find(z => this._itemId(z) === targetId);
    if (!targetItem) return;

    // Handle sprites/fx being dragged out of a group (not in zItems as direct SVG children)
    if (!dragItem) {
      const sp = C.allSprites.find(s => s.id === draggedId);
      const fx = !sp ? C.allSmokeFx.find(f => f.id === draggedId) : null;
      const item = sp || fx;
      if (!item || !item.groupId) return;
      // Remove from current group
      var beforeOrder = Editor.Commands.captureDOMOrder();
      const oldGroupEl = document.getElementById(item.groupId);
      let elToMove = sp ? sp.rootEl : fx.el;
      if (oldGroupEl) oldGroupEl.removeChild(elToMove);
      delete item.groupId;
      // Guard: ensure target is a current direct child of svg
      let targetEl = targetItem.svgEl;
      if (targetEl.parentNode !== svg) {
        const tSp = C.allSprites.find(s => s.id === targetId);
        targetEl = tSp ? tSp.rootEl : null;
      }
      if (targetEl && targetEl.parentNode === svg) {
        if (dropAbove) {
          svg.insertBefore(elToMove, targetEl.nextElementSibling);
        } else {
          svg.insertBefore(elToMove, targetEl);
        }
      } else {
        const selUI = document.getElementById('selUI');
        svg.insertBefore(elToMove, selUI);
      }
      const _fix = () => {
        const selUI = document.getElementById('selUI');
        const dragRect = document.getElementById('dragRect');
        if (selUI) svg.appendChild(selUI);
        if (dragRect) svg.appendChild(dragRect);
      };
      _fix();
      Editor.State.syncZOrderFromDOM();
      var afterOrder = Editor.Commands.captureDOMOrder();
      Editor.Undo.record(Editor.Commands.Reorder.create(beforeOrder, afterOrder));
      Editor.State.dispatch({ type: 'REORDER' }); this.rebuild();
      return;
    }

    var beforeOrder = Editor.Commands.captureDOMOrder();

    const _fixTrailingEls = () => {
      const selUI = document.getElementById('selUI');
      const dragRect = document.getElementById('dragRect');
      if (selUI) svg.appendChild(selUI);
      if (dragRect) svg.appendChild(dragRect);
    };

    // All items (sprites and groups) are now direct SVG children.
    // Reordering is just svg.insertBefore.
    if (dragItem.svgEl === targetItem.svgEl) return;

    // Guard: ensure target is a current direct child of svg
    let targetEl = targetItem.svgEl;
    if (targetEl.parentNode !== svg) {
      const tSp = C.allSprites.find(s => s.id === targetId);
      targetEl = tSp ? tSp.rootEl : null;
    }
    if (!targetEl || targetEl.parentNode !== svg) return;

    // Multi-select batch move: if dragged sprite is part of a multi-selection,
    // move all selected sprites as a batch, preserving their relative order
    const dragSp = dragItem.type === 'sprite' ? dragItem.ref : null;
    if (dragSp && C.multiSel.length > 1 && C.multiSel.includes(dragSp)) {
      // Collect SVG elements for all selected sprites
      const selEls = C.multiSel.map(s => s.rootEl).filter(el => el.parentNode === svg);
      // Sort by current DOM position to preserve relative order
      const allChildren = Array.from(svg.children);
      selEls.sort((a, b) => allChildren.indexOf(a) - allChildren.indexOf(b));
      // The layer panel is reversed: top of panel = last in DOM = in front.
      // "Drop above" in UI means "insert after" in DOM.
      const insertRef = dropAbove ? targetEl.nextElementSibling : targetEl;
      selEls.forEach(el => {
        if (el !== targetEl) svg.insertBefore(el, insertRef);
      });
    } else {
      // Single item move
      let dragEl = dragItem.svgEl;
      if (dragEl.parentNode !== svg) {
        const dSp = C.allSprites.find(s => s.id === draggedId);
        dragEl = dSp ? dSp.rootEl : null;
      }
      if (dragEl && dragEl.parentNode === svg) {
        if (dropAbove) {
          // Drop above in layer panel = in front visually = after target in DOM
          svg.insertBefore(dragEl, targetEl.nextElementSibling);
        } else {
          svg.insertBefore(dragEl, targetEl);
        }
      }
    }

    _fixTrailingEls();
    Editor.State.syncZOrderFromDOM();
    var afterOrder = Editor.Commands.captureDOMOrder();
    Editor.Undo.record(Editor.Commands.Reorder.create(beforeOrder, afterOrder));
    Editor.State.dispatch({ type: 'REORDER' }); this.rebuild();
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
      this.draggedId = sp.id; // Also set draggedId so cross-group/out-of-group drops work
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      this._dragGroupChild = null;
      this._dragGroupId = null;
      this.draggedId = null;
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

      var beforeOrder = Editor.Commands.captureDOMOrder();
      const gEl = document.getElementById(groupId);
      if (!gEl) return;

      // Display is reversed (top of list = last in DOM = front),
      // so "drop above" in the UI = insert after in DOM
      const rect = row.getBoundingClientRect();
      const dropAbove = e.clientY < rect.top + rect.height / 2;

      if (dropAbove) {
        // UI above = in front = after in DOM
        var targetRoot = sp.rootEl;
        if (targetRoot.nextElementSibling) {
          gEl.insertBefore(srcSp.rootEl, targetRoot.nextElementSibling);
        } else {
          gEl.appendChild(srcSp.rootEl);
        }
      } else {
        // UI below = behind = before in DOM
        gEl.insertBefore(srcSp.rootEl, sp.rootEl);
      }

      Editor.State.syncZOrderFromDOM();
      var afterOrder = Editor.Commands.captureDOMOrder();
      Editor.Undo.record(Editor.Commands.Reorder.create(beforeOrder, afterOrder));
      Editor.State.dispatch({ type: 'REORDER' });
      this.rebuild();
    });
  },

  reorderBefore(srcId, targetId) {
    const C = Editor.Core;
    const src = C.allSprites.find(s => s.id === srcId);
    const target = C.allSprites.find(s => s.id === targetId);
    if (!src || !target) return;
    var beforeOrder = Editor.Commands.captureDOMOrder();
    // Both sprites are direct SVG children — just reorder
    target.rootEl.parentNode.insertBefore(src.rootEl, target.rootEl);
    C.allSprites = C.allSprites.filter(s => s !== src);
    const idx = C.allSprites.indexOf(target);
    C.allSprites.splice(idx, 0, src);
    Editor.State.syncZOrderFromDOM();
    var afterOrder = Editor.Commands.captureDOMOrder();
    Editor.Undo.record(Editor.Commands.Reorder.create(beforeOrder, afterOrder));
    Editor.State.dispatch({ type: 'REORDER' }); this.rebuild();
  },

  toggleLightVis(id) {
    const C = Editor.Core;
    const l = C.allLights.find(x => x.id === id); if (!l) return;
    const wasHidden = l.el.style.display === 'none';
    l.el.style.display = wasHidden ? '' : 'none';
    Editor.Undo.record(Editor.Commands.ToggleLightVis.create(id, wasHidden));
    Editor.State.dispatch({ type: 'TOGGLE_LIGHT_VIS' });
    this.rebuild();
  },

  toggleVis(id) {
    const C = Editor.Core;
    const sp = C.allSprites.find(s => s.id === id); if (!sp) return;
    const from = { hidden: sp.hidden };
    sp.hidden = !sp.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
    const to = { hidden: sp.hidden };
    Editor.Undo.record(Editor.Commands.SetProperty.create(id, from, to));
    this.rebuild(); Editor.State.dispatch({ type: 'TOGGLE_SPRITE_VIS' });
  },

  dupSprite(id) {
    const s = Editor.Core.allSprites.find(x => x.id === id);
    if (s) {
      const dup = Editor.Sprites.addSprite(s.file, s.x + 15, s.y + 15, s.w, s.h, s.rot, s.layerType);
      Editor.Undo.record(Editor.Commands.AddSprite.create(Editor.Commands._captureSprite(dup)));
      this.rebuild();
    }
  },

  delSprite(id) {
    const C = Editor.Core;
    const sp = C.allSprites.find(s => s.id === id); if (!sp) return;
    const data = Editor.Commands._captureSprite(sp);
    const cmd = Editor.Commands.DeleteSprite.create(data);
    cmd.apply();
    Editor.Undo.record(cmd);
    if (C.selected === sp) Editor.Selection.deselect();
    C.updateDebug(); Editor.State.dispatch({ type: 'DELETE_SPRITE' }); this.rebuild();
  }
};
