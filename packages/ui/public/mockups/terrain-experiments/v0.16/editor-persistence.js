/* ══════════════════════════════════════════════════════════════
   Editor Persistence — localStorage save/load
══════════════════════════════════════════════════════════════ */

Editor.Persistence = {
  STORAGE_KEY: 'wh40k-editor-v016-layout',

  save() {
    const C = Editor.Core;
    C.updateDebug();
    const ranges = document.querySelectorAll('input[type=range]');
    const data = {
      sprites: C.allSprites.map(s => ({
        file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot,
        layer: s.originalLayer || s.layer, hidden: s.hidden,
        flipX: s.flipX || false, flipY: s.flipY || false,
        groupId: s.groupId || null, originalLayer: s.originalLayer || null,
        cropL: s.cropL || 0, cropT: s.cropT || 0, cropR: s.cropR || 0, cropB: s.cropB || 0,
        _fullX: s._fullX, _fullY: s._fullY, _fullW: s._fullW, _fullH: s._fullH
      })),
      models: C.allModels.map(m => m.kind === 'circle'
        ? { kind: m.kind, x: m.x, y: m.y, r: m.r, s: m.s, f: m.f, iconType: m.iconType }
        : { kind: m.kind, x: m.x, y: m.y, w: m.w, h: m.h, s: m.s, f: m.f }),
      lights: Editor.Lights.serialize(),
      objectives: Editor.Objectives.serialize(),
      groups: (C.groups || []).map(g => ({ id: g.id, name: g.name, opacity: g.opacity })),
      bg: document.getElementById('bgSel').value,
      ruinsOpacity: ranges[0]?.value || 92,
      roofOpacity: ranges[1]?.value || 85,
      layerOrder: Array.from(document.getElementById('battlefield').children)
        .map(el => el.id).filter(id => id)
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  load() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const C = Editor.Core;

      if (data.bg) { document.getElementById('bgSel').value = data.bg; C.setBg(data.bg); }

      const ranges = document.querySelectorAll('input[type=range]');
      if (data.ruinsOpacity && ranges[0]) {
        ranges[0].value = data.ruinsOpacity;
        document.getElementById('svgRuins').style.opacity = data.ruinsOpacity / 100;
        ranges[0].nextElementSibling.textContent = data.ruinsOpacity + '%';
      }
      if (data.roofOpacity && ranges[1]) {
        ranges[1].value = data.roofOpacity;
        document.getElementById('spriteTop').style.opacity = data.roofOpacity / 100;
        ranges[1].nextElementSibling.textContent = data.roofOpacity + '%';
      }

      // Restore sprites
      if (data.sprites) {
        data.sprites.forEach(s => {
          const layerForAdd = s.originalLayer || s.layer || 'spriteFloor';
          const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, layerForAdd, true);
          sp.hidden = !!s.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
          sp.flipX = !!s.flipX; sp.flipY = !!s.flipY;
          if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
          if (s.groupId) { sp.groupId = s.groupId; sp.originalLayer = s.originalLayer || layerForAdd; }
          if (s.cropL || s.cropT || s.cropR || s.cropB) {
            sp.cropL = s.cropL; sp.cropT = s.cropT; sp.cropR = s.cropR; sp.cropB = s.cropB;
            sp._fullX = s._fullX != null ? s._fullX : sp.x;
            sp._fullY = s._fullY != null ? s._fullY : sp.y;
            sp._fullW = s._fullW != null ? s._fullW : sp.w;
            sp._fullH = s._fullH != null ? s._fullH : sp.h;
          }
        });
      }

      // Restore models (replace defaults)
      if (data.models) {
        document.getElementById('modelLayer').innerHTML = '';
        C.allModels = [];
        data.models.forEach(m => {
          if (m.kind === 'circle') Editor.Models.addCircle(m.x, m.y, m.r, m.s, m.f, m.iconType);
          else Editor.Models.addRect(m.x, m.y, m.w, m.h, m.s, m.f);
        });
      }

      // Restore lights
      if (data.lights) {
        data.lights.forEach(l => Editor.Lights.addLight(l.x, l.y, l.color, l.radius, l.intensity, true));
      }

      // Restore custom groups
      if (data.groups && data.groups.length) {
        Editor.Groups.restore(data.groups);
      }

      // Restore objective positions
      if (data.objectives) {
        Editor.Objectives.restorePositions(data.objectives);
      }

      // Restore SVG layer z-order
      if (data.layerOrder) {
        const svg = document.getElementById('battlefield');
        data.layerOrder.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.parentNode === svg) svg.appendChild(el);
        });
      }

      // Re-apply crop clips
      Editor.Crop.reapplyAll();

      Editor.Selection.deselect();
    } catch (e) {
      console.warn('Failed to load layout', e);
    }
  }
};
