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
        layerType: s.layerType || 'floor', hidden: s.hidden,
        flipX: s.flipX || false, flipY: s.flipY || false,
        groupId: s.groupId || null,
        cropL: s.cropL || 0, cropT: s.cropT || 0, cropR: s.cropR || 0, cropB: s.cropB || 0,
        shadowMul: s.shadowMul != null ? s.shadowMul : 1.0
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

  importJSON() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!confirm('This will clear all current sprites, models, and lights. Continue?')) return;
          // If data has the "output" format (layerType on sprites, stroke on models), convert it
          if (data.sprites && data.sprites[0] && ('layerType' in data.sprites[0]) && !('cropL' in data.sprites[0])) {
            // Convert from output JSON to localStorage format
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
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
          location.reload();
        } catch (err) {
          alert('Invalid JSON file: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
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
          // Map old layer names to layerType for backward compat
          let lt = s.layerType || (s.layer === 'spriteTop' ? 'top' : 'floor');
          const sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, lt, true);
          sp.hidden = !!s.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
          sp.flipX = !!s.flipX; sp.flipY = !!s.flipY;
          if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
          if (s.groupId) { sp.groupId = s.groupId; }
          if (s.cropL || s.cropT || s.cropR || s.cropB) {
            sp.cropL = s.cropL; sp.cropT = s.cropT; sp.cropR = s.cropR; sp.cropB = s.cropB;
          }
          sp.shadowMul = s.shadowMul != null ? s.shadowMul : 1.0;
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

      // Migrate any sprites still in old containers to be direct SVG children
      const svgEl = document.getElementById('battlefield');
      const selUIEl = document.getElementById('selUI');
      ['spriteFloor', 'spriteTop'].forEach(cid => {
        const container = document.getElementById(cid);
        if (container) {
          Array.from(container.children).forEach(child => {
            container.removeChild(child);
            svgEl.insertBefore(child, selUIEl);
          });
        }
      });

      // Re-apply crop clips
      Editor.Crop.reapplyAll();

      Editor.Selection.deselect();
    } catch (e) {
      console.warn('Failed to load layout', e);
    }
  }
};
