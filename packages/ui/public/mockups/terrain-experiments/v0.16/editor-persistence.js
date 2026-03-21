/* ══════════════════════════════════════════════════════════════
   Editor Persistence — localStorage save/load
   Phase 1: Uses EditorState as the serialization source.
   zOrder is now an explicit array — no more DOM-walking heuristics.
══════════════════════════════════════════════════════════════ */

Editor.Persistence = {
  STORAGE_KEY: 'wh40k-editor-v016-layout',

  save() {
    const C = Editor.Core;
    const S = Editor.State;
    C.updateDebug();

    // Sync EditorState from Core before serializing
    S.syncFromCore();
    S.syncZOrderFromDOM();

    const ranges = document.querySelectorAll('input[type=range]');

    // Build sprites in z-order using EditorState.zOrder
    const orderedSprites = [];
    for (var i = 0; i < S.zOrder.length; i++) {
      var entry = S.zOrder[i];
      if (entry.type === 'sprite') {
        var sp = S.findSprite(entry.id);
        if (sp) orderedSprites.push(sp);
      } else if (entry.type === 'group') {
        // Collect group children in DOM order
        var gEl = document.getElementById(entry.id);
        if (gEl) {
          Array.from(gEl.children).forEach(function(child) {
            var gSp = S.sprites.find(function(s) { return s.el === child; });
            if (!gSp && child.tagName === 'g' && child.id && child.id.endsWith('-wrap')) {
              gSp = S.sprites.find(function(s) { return s._clipWrap === child; });
            }
            if (gSp) orderedSprites.push(gSp);
          });
        }
      }
    }
    // Fallback: add any sprites not found via zOrder
    S.sprites.forEach(function(sp) {
      if (orderedSprites.indexOf(sp) === -1) orderedSprites.push(sp);
    });

    var data = {
      sprites: orderedSprites.map(function(s) {
        return {
          file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot,
          layerType: s.layerType || 'floor', hidden: s.hidden,
          flipX: s.flipX || false, flipY: s.flipY || false,
          groupId: s.groupId || null,
          cropL: s.cropL || 0, cropT: s.cropT || 0, cropR: s.cropR || 0, cropB: s.cropB || 0,
          shadowMul: s.shadowMul != null ? s.shadowMul : 1.0,
          _fileName: s._fileName || null
        };
      }),
      models: S.models.map(function(m) {
        return m.kind === 'circle'
          ? { kind: m.kind, x: m.x, y: m.y, r: m.r, s: m.s, f: m.f, iconType: m.iconType }
          : { kind: m.kind, x: m.x, y: m.y, w: m.w, h: m.h, s: m.s, f: m.f };
      }),
      lights: Editor.Lights.serialize(),
      objectives: Editor.Objectives.serialize(),
      groups: S.groups.map(function(g) { return { id: g.id, name: g.name, opacity: g.opacity }; }),
      effects: {
        shadow: Object.assign({}, S.effects.shadow),
        feather: Object.assign({}, S.effects.feather),
        grade: Object.assign({}, S.effects.grade)
      },
      bg: document.getElementById('bgSel').value,
      ruinsOpacity: ranges[0] ? ranges[0].value : 92,
      roofOpacity: ranges[1] ? ranges[1].value : 85,
      // Explicit zOrder array (Phase 1)
      zOrder: S.zOrder.slice(),
      // Keep layerOrder for backward compat with older versions
      layerOrder: S.zOrder.map(function(entry) { return entry.id; })
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  importJSON() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = JSON.parse(ev.target.result);
          if (!confirm('This will clear all current sprites, models, and lights. Continue?')) return;
          // If data has the "output" format (layerType on sprites, stroke on models), convert it
          if (data.sprites && data.sprites[0] && ('layerType' in data.sprites[0]) && !('cropL' in data.sprites[0])) {
            data.sprites = data.sprites.map(function(s) {
              return {
                file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot || 0,
                layerType: s.layerType || 'floor', hidden: s.hidden || false,
                flipX: s.flipX || false, flipY: s.flipY || false,
                groupId: s.groupId || null,
                cropL: s.crop ? s.crop.l || 0 : 0, cropT: s.crop ? s.crop.t || 0 : 0,
                cropR: s.crop ? s.crop.r || 0 : 0, cropB: s.crop ? s.crop.b || 0 : 0,
                shadowMul: s.shadowMul != null ? s.shadowMul : 1.0
              };
            });
            if (data.models) {
              data.models = data.models.map(function(m) {
                return m.kind === 'circle'
                  ? { kind: m.kind, x: m.x, y: m.y, r: m.r, s: m.stroke || m.s, f: (m.stroke || m.s) === '#0088aa' ? 'url(#mf-imp)' : 'url(#mf-ork)', iconType: m.icon || m.iconType }
                  : { kind: m.kind, x: m.x, y: m.y, w: m.w, h: m.h, s: m.stroke || m.s, f: (m.stroke || m.s) === '#0088aa' ? 'url(#mf-imp)' : 'url(#mf-ork)' };
              });
            }
            if (data.settings) {
              data.bg = data.settings.bg;
              data.ruinsOpacity = data.settings.ruinsOpacity;
              data.roofOpacity = data.settings.roofOpacity;
            }
          }
          // Auto-create groups from sprite groupId references if missing
          if (data.sprites) {
            var groupIds = new Set(data.sprites.filter(function(s) { return s.groupId; }).map(function(s) { return s.groupId; }));
            if (!data.groups) data.groups = [];
            groupIds.forEach(function(gId) {
              if (!data.groups.find(function(g) { return g.id === gId; })) {
                var num = parseInt(gId.replace('group-g', '')) || 0;
                data.groups.push({ id: gId, name: 'Group ' + (num + 1), opacity: 1 });
              }
            });
          }
          localStorage.setItem(Editor.Persistence.STORAGE_KEY, JSON.stringify(data));
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
    var raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return;
    try {
      var data = JSON.parse(raw);
      var C = Editor.Core;
      var S = Editor.State;

      if (data.bg) { document.getElementById('bgSel').value = data.bg; C.setBg(data.bg); }

      var ranges = document.querySelectorAll('input[type=range]');
      if (data.ruinsOpacity && ranges[0]) {
        ranges[0].value = data.ruinsOpacity;
        document.getElementById('svgRuins').style.opacity = data.ruinsOpacity / 100;
        ranges[0].nextElementSibling.textContent = data.ruinsOpacity + '%';
      }
      if (data.roofOpacity && ranges[1]) {
        ranges[1].value = data.roofOpacity;
        C._savedRoofOpacity = data.roofOpacity / 100;
        ranges[1].nextElementSibling.textContent = data.roofOpacity + '%';
      }

      // Restore effects state
      if (data.effects) {
        var E = Editor.Effects;
        if (data.effects.shadow) Object.assign(E.shadow, data.effects.shadow);
        if (data.effects.feather) Object.assign(E.feather, data.effects.feather);
        if (data.effects.grade) Object.assign(E.grade, data.effects.grade);
        // Update DOM controls if they exist
        var shadowBtn = document.querySelector('[onclick*="toggleShadow"]');
        if (shadowBtn) shadowBtn.classList.toggle('on', E.shadow.on);
        var featherBtn = document.querySelector('[onclick*="toggleFeather"]');
        if (featherBtn) featherBtn.classList.toggle('on', E.feather.on);
        var gradeBtn = document.querySelector('[onclick*="toggleGrade"]');
        if (gradeBtn) gradeBtn.classList.toggle('on', E.grade.on);
        var fxShadowControls = document.getElementById('fxShadowControls');
        if (fxShadowControls) fxShadowControls.style.display = E.shadow.on ? '' : 'none';
        var fxFeatherControls = document.getElementById('fxFeatherControls');
        if (fxFeatherControls) fxFeatherControls.style.display = E.feather.on ? '' : 'none';
        var fxGradeControls = document.getElementById('fxGradeControls');
        if (fxGradeControls) fxGradeControls.style.display = E.grade.on ? '' : 'none';
        if (E._ready) E._flush();
      }

      // Restore sprites
      if (data.sprites) {
        data.sprites.forEach(function(s) {
          var lt = s.layerType || (s.layer === 'spriteTop' ? 'top' : 'floor');
          var sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, lt, true);
          sp.hidden = !!s.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
          sp.flipX = !!s.flipX; sp.flipY = !!s.flipY;
          if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
          if (s.groupId) { sp.groupId = s.groupId; }
          // Handle both internal format (cropL/T/R/B) and output format (crop: {l,t,r,b})
          var cL = s.cropL || (s.crop ? s.crop.l || 0 : 0);
          var cT = s.cropT || (s.crop ? s.crop.t || 0 : 0);
          var cR = s.cropR || (s.crop ? s.crop.r || 0 : 0);
          var cB = s.cropB || (s.crop ? s.crop.b || 0 : 0);
          if (cL || cT || cR || cB) {
            sp.cropL = cL; sp.cropT = cT; sp.cropR = cR; sp.cropB = cB;
          }
          sp.shadowMul = s.shadowMul != null ? s.shadowMul : 1.0;
          if (s._fileName) sp._fileName = s._fileName;
        });
      }

      // Restore models (replace defaults)
      if (data.models) {
        document.getElementById('modelLayer').innerHTML = '';
        C.allModels = [];
        data.models.forEach(function(m) {
          if (m.kind === 'circle') Editor.Models.addCircle(m.x, m.y, m.r, m.s, m.f, m.iconType);
          else Editor.Models.addRect(m.x, m.y, m.w, m.h, m.s, m.f);
        });
      }

      // Restore lights
      if (data.lights) {
        data.lights.forEach(function(l) {
          Editor.Lights.addLight(l.x, l.y, l.color, l.radius, l.intensity, true);
        });
      }

      // Auto-create groups from sprite groupId references if missing from groups array
      if (data.sprites) {
        var groupIds = new Set(data.sprites.filter(function(s) { return s.groupId; }).map(function(s) { return s.groupId; }));
        if (!data.groups) data.groups = [];
        groupIds.forEach(function(gId) {
          if (!data.groups.find(function(g) { return g.id === gId; })) {
            var num = parseInt(gId.replace('group-g', '')) || 0;
            data.groups.push({ id: gId, name: 'Group ' + (num + 1), opacity: 1 });
          }
        });
      }

      // Restore custom groups
      if (data.groups && data.groups.length) {
        Editor.Groups.restore(data.groups);
      }

      // Restore objective positions
      if (data.objectives) {
        Editor.Objectives.restorePositions(data.objectives);
      }

      // Migrate any sprites still in old containers to be direct SVG children
      var svgEl = document.getElementById('battlefield');
      var selUIEl = document.getElementById('selUI');
      ['spriteFloor', 'spriteTop'].forEach(function(cid) {
        var container = document.getElementById(cid);
        if (container) {
          Array.from(container.children).forEach(function(child) {
            container.removeChild(child);
            svgEl.insertBefore(child, selUIEl);
          });
        }
      });

      // Re-apply crop clips BEFORE layer order restore (creates wrappers)
      Editor.Crop.reapplyAll();

      // Apply saved roof opacity per-sprite (after sprites are created)
      if (C._savedRoofOpacity != null) {
        C.allSprites.filter(function(s) { return s.layerType === 'top'; }).forEach(function(s) {
          s.el.style.opacity = C._savedRoofOpacity;
        });
        delete C._savedRoofOpacity;
      }

      // Restore z-order: prefer explicit zOrder array (Phase 1), fallback to layerOrder
      if (data.zOrder && data.zOrder.length) {
        // Phase 1 format — explicit zOrder with type/id entries
        this._restoreZOrderFromExplicit(data.zOrder, C);
      } else if (data.layerOrder) {
        // Legacy format — flat ID list
        this._restoreZOrderFromLayerOrder(data.layerOrder, C);
      }

      // Sync EditorState after load
      S.syncFromCore();
      S.syncZOrderFromDOM();

      Editor.Selection.deselect();
    } catch (e) {
      console.warn('Failed to load layout', e);
    }
  },

  /** Restore z-order from explicit zOrder array (Phase 1 format). */
  _restoreZOrderFromExplicit(zOrder, C) {
    var svg = document.getElementById('battlefield');
    zOrder.forEach(function(entry) {
      var el;
      if (entry.type === 'sprite') {
        var sp = C.allSprites.find(function(s) { return s.id === entry.id; });
        el = sp ? sp.rootEl : null;
      } else {
        el = document.getElementById(entry.id);
      }
      if (el && el.parentNode === svg) svg.appendChild(el);
    });
    var _selUI = document.getElementById('selUI');
    var _dragRect = document.getElementById('dragRect');
    if (_selUI) svg.appendChild(_selUI);
    if (_dragRect) svg.appendChild(_dragRect);
  },

  /** Restore z-order from legacy layerOrder (flat ID list). */
  _restoreZOrderFromLayerOrder(layerOrder, C) {
    var svg = document.getElementById('battlefield');
    layerOrder.forEach(function(id) {
      var el = document.getElementById(id);
      var sp = C.allSprites.find(function(s) { return s.id === id; });
      if (sp) el = sp.rootEl;
      if (el && el.parentNode === svg) svg.appendChild(el);
    });
    var _selUI = document.getElementById('selUI');
    var _dragRect = document.getElementById('dragRect');
    if (_selUI) svg.appendChild(_selUI);
    if (_dragRect) svg.appendChild(_dragRect);
  }
};
