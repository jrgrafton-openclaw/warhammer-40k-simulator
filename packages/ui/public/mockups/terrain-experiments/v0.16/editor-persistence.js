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
        file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot, layer: s.layer, hidden: s.hidden
      })),
      models: C.allModels.map(m => m.kind === 'circle'
        ? { kind: m.kind, x: m.x, y: m.y, r: m.r, s: m.s, f: m.f, iconType: m.iconType }
        : { kind: m.kind, x: m.x, y: m.y, w: m.w, h: m.h, s: m.s, f: m.f }),
      lights: Editor.Lights.serialize(),
      objectives: Editor.Objectives.serialize(),
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
          const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, s.layer, true);
          sp.hidden = !!s.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
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

      Editor.Selection.deselect();
    } catch (e) {
      console.warn('Failed to load layout', e);
    }
  }
};
