/* ══════════════════════════════════════════════════════════════
   Editor Layers — right sidebar panel with drag-to-reorder.
   All item types (sprites, models-group, lights-group, objectives-group)
   can be reordered via drag in a unified z-order list.
   Groups (Models, Lights, Objectives) move as whole units.
   Sprites support visibility toggle, duplicate, delete.
══════════════════════════════════════════════════════════════ */

Editor.Layers = {
  draggedId: null,

  /* ── Build the unified z-order list from SVG DOM ── */
  _buildZOrder() {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');
    const items = []; // bottom-to-top (SVG DOM order)

    // Walk SVG children, expand sprite containers, collect groups
    const groupMeta = {
      modelLayer:  { name: 'Models',     icon: 'models' },
      lightLayer:  { name: 'Lights',     icon: 'lights' }
    };
    const spriteContainers = new Set(['spriteFloor', 'spriteTop']);

    Array.from(svg.children).forEach(el => {
      if (groupMeta[el.id]) {
        items.push({ type: 'group', groupId: el.id, svgEl: el, meta: groupMeta[el.id] });
      } else if (spriteContainers.has(el.id)) {
        // Expand individual sprites (DOM order = bottom to top)
        Array.from(el.children).forEach(sprEl => {
          const sp = C.allSprites.find(s => s.el === sprEl);
          if (sp) items.push({ type: 'sprite', ref: sp, svgEl: sprEl, parentId: el.id });
        });
      }
      // Skip backgrounds, deployZones, svgRuins, svgScatter, selUI, dragRect
    });

    // Add objectives as a virtual group (HTML overlay, always visually on top)
    if (C.allObjectives.length > 0) {
      items.push({ type: 'group', groupId: 'objectives-group', svgEl: null,
        meta: { name: 'Objectives', icon: 'objectives' } });
    }

    return items; // bottom-to-top
  },

  /* ── Render the layers panel ── */
  rebuild() {
    const C = Editor.Core;
    const list = document.getElementById('layersList');
    list.innerHTML = '';

    const zItems = this._buildZOrder();
    // Reverse for display: top of list = visually in front (last in SVG DOM)
    const displayItems = zItems.slice().reverse();

    displayItems.forEach(item => {
      const row = item.type === 'group'
        ? this._createGroupRow(item, C)
        : this._createSpriteRow(item, C);

      const itemId = this._itemId(item);
      row.draggable = true;
      row.dataset.layerId = itemId;

      row.addEventListener('dragstart', () => {
        this.draggedId = itemId; row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging'); this.draggedId = null;
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        // Visual drop indicator
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
        row.classList.remove('drop-above', 'drop-below');
        if (this.draggedId && this.draggedId !== itemId) {
          this._handleDrop(this.draggedId, itemId, zItems);
        }
      });

      list.appendChild(row);
    });
  },

  _itemId(item) {
    return item.type === 'group' ? item.groupId : item.ref.id;
  },

  /* ── Create a group summary row ── */
  _createGroupRow(item, C) {
    const g = item.meta;
    let count, meta, iconSvg;

    if (item.groupId === 'modelLayer') {
      count = C.allModels.length;
      meta = `${count} unit${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="1.5"><circle cx="12" cy="12" r="7"/><line x1="12" y1="8" x2="12" y2="16" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke-linecap="round"/></svg>`;
    } else if (item.groupId === 'lightLayer') {
      count = C.allLights.length;
      meta = `${count} light${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#ffaa44" stroke-width="1.5"><circle cx="12" cy="10" r="5"/><line x1="10" y1="16" x2="14" y2="16"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`;
    } else {
      count = C.allObjectives.length;
      meta = `${count} marker${count !== 1 ? 's' : ''}`;
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#8090a0" stroke-width="1.5"><polygon points="12,3 21,8 21,16 12,21 3,16 3,8"/><text x="12" y="14" text-anchor="middle" font-size="8" fill="#8090a0" stroke="none">O</text></svg>`;
    }

    const row = document.createElement('div');
    row.className = 'layer-row group-row';
    row.innerHTML = `<div class="group-icon">${iconSvg}</div>
      <div style="flex:1;min-width:0"><div class="lname">${g.name}</div><div class="lmeta">${meta}</div></div>
      <span class="drag-hint" title="Drag to reorder z-level">⠿</span>`;
    return row;
  },

  /* ── Create an individual sprite row ── */
  _createSpriteRow(item, C) {
    const sp = item.ref;
    const row = document.createElement('div');
    row.className = 'layer-row' + (C.multiSel.includes(sp) ? ' sel' : '') + (sp.hidden ? ' hidden-sprite' : '');
    row.innerHTML = `<img src="${C.spriteBasePath}${sp.file}">
      <div style="flex:1;min-width:0"><div class="lname">${sp.file.replace(/\.(png|jpg)/, '')}</div><div class="lmeta">${sp.layer === 'spriteTop' ? 'roof' : 'floor'} · ${Math.round(sp.x)},${Math.round(sp.y)}</div></div>
      <button class="lbtn" title="Toggle visibility" onclick="event.stopPropagation();Editor.Layers.toggleVis('${sp.id}')">${sp.hidden ? '🔇' : '👁'}</button>
      <button class="lbtn" title="Duplicate" onclick="event.stopPropagation();Editor.Layers.dupSprite('${sp.id}')">📋</button>
      <button class="lbtn" title="Delete" onclick="event.stopPropagation();Editor.Layers.delSprite('${sp.id}')">🗑</button>`;
    row.onclick = () => { const s = C.allSprites.find(x => x.id === sp.id); if (s) Editor.Selection.select(s); };
    return row;
  },

  /* ── Handle drop: reorder sprites and/or groups ── */
  _handleDrop(draggedId, targetId, zItems) {
    const C = Editor.Core;
    const svg = document.getElementById('battlefield');

    // Find items in the z-order list (bottom-to-top order)
    const dragItem = zItems.find(z => this._itemId(z) === draggedId);
    const targetItem = zItems.find(z => this._itemId(z) === targetId);
    if (!dragItem || !targetItem) return;

    Editor.Undo.push();

    const dragIsGroup = dragItem.type === 'group';
    const targetIsGroup = targetItem.type === 'group';

    // Case 1: Sprite on sprite, same container → reorder within
    if (!dragIsGroup && !targetIsGroup &&
        dragItem.svgEl.parentNode === targetItem.svgEl.parentNode) {
      this.reorderBefore(dragItem.ref.id, targetItem.ref.id);
      return;
    }

    // Case 2: Sprite on sprite, different container → move sprite to other container + layer
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

    // Case 3: Group on anything → move the group's SVG <g> in DOM
    if (dragIsGroup && dragItem.svgEl) {
      const targetSvgRef = targetIsGroup
        ? targetItem.svgEl
        : targetItem.svgEl.parentNode; // sprite's container <g>

      if (!targetSvgRef) { Editor.Persistence.save(); this.rebuild(); return; }

      // Insert dragged group just before the target's SVG element
      // (before in DOM = behind in z-order = below in visual stack)
      svg.insertBefore(dragItem.svgEl, targetSvgRef);

      // Ensure selUI stays last
      const selUI = document.getElementById('selUI');
      const dragRect = document.getElementById('dragRect');
      if (selUI) svg.appendChild(selUI);
      if (dragRect) svg.appendChild(dragRect);

      Editor.Persistence.save(); this.rebuild();
      return;
    }

    // Case 4: Sprite on group → move sprite's container before the group
    if (!dragIsGroup && targetIsGroup && targetItem.svgEl) {
      const spriteContainer = dragItem.svgEl.parentNode;
      svg.insertBefore(spriteContainer, targetItem.svgEl);

      // Ensure selUI stays last
      const selUI = document.getElementById('selUI');
      const dragRect = document.getElementById('dragRect');
      if (selUI) svg.appendChild(selUI);
      if (dragRect) svg.appendChild(dragRect);

      Editor.Persistence.save(); this.rebuild();
    }
  },

  /* ── Sprite-to-sprite reorder within same container ── */
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
