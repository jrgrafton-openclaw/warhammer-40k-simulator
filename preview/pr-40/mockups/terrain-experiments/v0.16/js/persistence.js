/* ══════════════════════════════════════════════════════════════
   Editor Persistence — localStorage save/load
   Phase 1: Uses EditorState as the serialization source.
   zOrder is now an explicit array — no more DOM-walking heuristics.
══════════════════════════════════════════════════════════════ */

Editor.Persistence = {
  STORAGE_KEY: 'wh40k-editor-v016-pr40-layout',

  save() {
    const C = Editor.Core;
    const S = Editor.State;
    C.updateDebug();

    // Sync EditorState from Core before serializing
    S.syncFromCore();
    S.syncZOrderFromDOM();

    const ruinsSlider = document.getElementById('ruinsOpacitySlider');

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
          id: s.id,
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
        grade: Object.assign({}, S.effects.grade),
        modelShadow: Object.assign({}, S.effects.modelShadow)
      },
      bg: document.getElementById('bgSel').value,
      ruinsOpacity: ruinsSlider ? ruinsSlider.value : 92,
      // Explicit zOrder array (Phase 1)
      zOrder: S.zOrder.slice(),
      // Keep layerOrder for backward compat with older versions
      layerOrder: S.zOrder.map(function(entry) { return entry.id; }),
      // Toggle visibility states
      toggles: {
        svgRuins: document.getElementById('svgRuins')?.style.display !== 'none',
        svgScatter: document.getElementById('svgScatter')?.style.display !== 'none',
        deployZones: document.getElementById('deployZones')?.style.display !== 'none',
        'deploy-imperium': document.getElementById('deploy-imperium')?.style.display !== 'none',
        'deploy-ork': document.getElementById('deploy-ork')?.style.display !== 'none',
        modelLayer: document.getElementById('modelLayer')?.style.display !== 'none',
        objectives: document.getElementById('objectiveRings')?.style.display !== 'none',
        lightLayer: document.getElementById('lightLayer')?.style.display !== 'none',
      }
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
          data = Editor.Persistence._normalize(data);
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
      data = this._normalize(data);
      var S = Editor.State;
      S._loading = true;
      this._restoreSettings(data);
      this._restoreSprites(data);
      this._restoreModels(data);
      this._restoreLights(data);
      this._restoreGroups(data);
      Editor.Crop.reapplyAll();
      this._restoreZOrder(data);
      S._loading = false;
      Editor.Effects.rebuildAll();
      S.syncFromCore();
      S.syncZOrderFromDOM();
      this._syncEffectSliders(Editor.Effects);
      Editor.Layers._loadUIState();
      Editor.Layers.rebuild();
      this._restoreToggles(data);
      Editor.Selection.deselect();
    } catch (e) {
      console.warn('Failed to load layout', e);
    }
  },

  _restoreSettings(data) {
    var C = Editor.Core;
    if (data.bg) { document.getElementById('bgSel').value = data.bg; C.setBg(data.bg); }
    var ruinsSlider = document.getElementById('ruinsOpacitySlider');
    if (data.ruinsOpacity != null && ruinsSlider) {
      ruinsSlider.value = data.ruinsOpacity;
      document.getElementById('svgRuins').style.opacity = data.ruinsOpacity / 100;
      document.getElementById('svgScatter').style.opacity = data.ruinsOpacity / 100;
      ruinsSlider.nextElementSibling.textContent = data.ruinsOpacity + '%';
    }
    if (data.effects) {
      var E = Editor.Effects;
      if (data.effects.shadow) Object.assign(E.shadow, data.effects.shadow);
      if (data.effects.feather) Object.assign(E.feather, data.effects.feather);
      if (data.effects.grade) Object.assign(E.grade, data.effects.grade);
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
      if (data.effects.modelShadow) Object.assign(E.modelShadow, data.effects.modelShadow);
      var modelShadowBtn = document.getElementById('fxModelShadowBtn');
      if (modelShadowBtn) modelShadowBtn.classList.toggle('on', E.modelShadow.on);
      var fxModelShadowControls = document.getElementById('fxModelShadowControls');
      if (fxModelShadowControls) fxModelShadowControls.style.display = E.modelShadow.on ? '' : 'none';
    }
  },

  _restoreSprites(data) {
    if (!data.sprites) return;
    var C = Editor.Core;
    data.sprites.forEach(function(s) {
      var sp = Editor.Sprites.addSprite(s.file, s.x, s.y, s.w, s.h, s.rot, s.layerType, true, s.id || undefined);
      sp.hidden = !!s.hidden; sp.el.style.display = sp.hidden ? 'none' : '';
      sp.flipX = !!s.flipX; sp.flipY = !!s.flipY;
      if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
      if (s.groupId) { sp.groupId = s.groupId; }
      if (s.cropL || s.cropT || s.cropR || s.cropB) {
        sp.cropL = s.cropL; sp.cropT = s.cropT; sp.cropR = s.cropR; sp.cropB = s.cropB;
      }
      sp.shadowMul = s.shadowMul;
      if (s._fileName) sp._fileName = s._fileName;
    });
    // Update sid counter to avoid ID collisions with future sprites
    var maxSid = 0;
    C.allSprites.forEach(function(sp) {
      var num = parseInt(sp.id.replace('s', ''));
      if (!isNaN(num) && num >= maxSid) maxSid = num + 1;
    });
    C.sid = maxSid;
  },

  _restoreModels(data) {
    if (!data.models) return;
    var C = Editor.Core;
    document.getElementById('modelLayer').innerHTML = '';
    C.allModels = [];
    data.models.forEach(function(m) {
      if (m.kind === 'circle') Editor.Models.addCircle(m.x, m.y, m.r, m.s, m.f, m.iconType);
      else Editor.Models.addRect(m.x, m.y, m.w, m.h, m.s, m.f);
    });
  },

  _restoreLights(data) {
    if (!data.lights) return;
    data.lights.forEach(function(l) {
      Editor.Lights.addLight(l.x, l.y, l.color, l.radius, l.intensity, true);
    });
  },

  _restoreGroups(data) {
    if (data.groups && data.groups.length) {
      Editor.Groups.restore(data.groups);
    }
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
  },

  _restoreZOrder(data) {
    var C = Editor.Core;
    if (data.zOrder && data.zOrder.length) {
      this._restoreZOrderFromExplicit(data.zOrder, C);
    } else if (data.layerOrder) {
      this._restoreZOrderFromLayerOrder(data.layerOrder, C);
    }
  },

  _restoreToggles(data) {
    if (!data.toggles) return;
    ['svgRuins','svgScatter','deployZones','modelLayer','lightLayer'].forEach(function(id) {
      if (data.toggles[id] === false) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
        var btn = document.querySelector('button[onclick*="' + id + '"]');
        if (btn) btn.classList.remove('on');
      }
    });
    // Restore individual deploy zone visibility
    ['deploy-imperium','deploy-ork'].forEach(function(id) {
      if (data.toggles[id] === false) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
    });
    if (data.toggles.objectives === false) {
      ['objectiveRings','objectiveHexes'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      var objBtn = document.querySelector('button[onclick*="objectiveRings"]');
      if (objBtn) objBtn.classList.remove('on');
    }
  },

  /** Normalize any JSON format (output or internal) to the internal format used by load(). */
  _normalize(data) {
    // Sprites: convert crop.l → cropL, ensure all fields present
    if (data.sprites) {
      data.sprites = data.sprites.map(function(s) {
        var cL = s.cropL || (s.crop ? s.crop.l || 0 : 0);
        var cT = s.cropT || (s.crop ? s.crop.t || 0 : 0);
        var cR = s.cropR || (s.crop ? s.crop.r || 0 : 0);
        var cB = s.cropB || (s.crop ? s.crop.b || 0 : 0);
        return {
          id: s.id || undefined,
          file: s.file, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot || 0,
          layerType: s.layerType || (s.layer === 'spriteTop' ? 'top' : 'floor'),
          hidden: s.hidden || false,
          flipX: s.flipX || false, flipY: s.flipY || false,
          groupId: s.groupId || null,
          cropL: cL, cropT: cT, cropR: cR, cropB: cB,
          shadowMul: s.shadowMul != null ? s.shadowMul : 1.0,
          _fileName: s._fileName || null
        };
      });
    }
    // Models: convert stroke → s, icon → iconType, derive fill
    if (data.models) {
      data.models = data.models.map(function(m) {
        var stroke = m.s || m.stroke;
        var fill = m.f || (stroke ? (stroke === '#0088aa' ? 'url(#mf-imp)' : 'url(#mf-ork)') : 'url(#mf-imp)');
        var iconType = m.iconType || m.icon;
        return m.kind === 'circle'
          ? { kind: m.kind, x: m.x, y: m.y, r: m.r, s: stroke, f: fill, iconType: iconType }
          : { kind: m.kind, x: m.x, y: m.y, w: m.w, h: m.h, s: stroke, f: fill };
      });
    }
    // Settings: flatten data.settings into top-level
    if (data.settings) {
      if (data.settings.bg && !data.bg) data.bg = data.settings.bg;
      if (data.settings.ruinsOpacity != null && data.ruinsOpacity == null) data.ruinsOpacity = data.settings.ruinsOpacity;
    }
    // Groups: ensure array exists, auto-create from sprite groupId refs
    if (!data.groups) data.groups = [];
    if (data.sprites) {
      var groupIds = new Set(data.sprites.filter(function(s) { return s.groupId; }).map(function(s) { return s.groupId; }));
      groupIds.forEach(function(gId) {
        if (!data.groups.find(function(g) { return g.id === gId; })) {
          var num = parseInt(gId.replace('group-g', '')) || 0;
          data.groups.push({ id: gId, name: 'Group ' + (num + 1), opacity: 1 });
        }
      });
    }
    // Settings: flatten nested settings to top-level
    if (data.settings) {
      if (!data.bg && data.settings.bg) data.bg = data.settings.bg;
      if (data.ruinsOpacity == null && data.settings.ruinsOpacity != null) data.ruinsOpacity = data.settings.ruinsOpacity;
    }
    return data;
  },

  /** Sync effect slider DOM values from restored params. */
  _syncEffectSliders(E) {
    // Shadow sliders
    var shadowControls = document.getElementById('fxShadowControls');
    if (shadowControls) {
      var sliders = shadowControls.querySelectorAll('input[type=range]');
      // Order: blur, opacity, dx, dy, distance (matches index.html)
      if (sliders[0]) { sliders[0].value = E.shadow.blur; var sp = sliders[0].nextElementSibling; if (sp) sp.textContent = E.shadow.blur + 'px'; }
      if (sliders[1]) { sliders[1].value = Math.round(E.shadow.opacity * 100); var sp = sliders[1].nextElementSibling; if (sp) sp.textContent = Math.round(E.shadow.opacity * 100) + '%'; }
      if (sliders[2]) { sliders[2].value = E.shadow.dx; var sp = sliders[2].nextElementSibling; if (sp) sp.textContent = E.shadow.dx + 'px'; }
      if (sliders[3]) { sliders[3].value = E.shadow.dy; var sp = sliders[3].nextElementSibling; if (sp) sp.textContent = E.shadow.dy + 'px'; }
      var dist = E.shadow.distance != null ? E.shadow.distance : 1.0;
      if (sliders[4]) { sliders[4].value = Math.round(dist * 100); var sp = sliders[4].nextElementSibling; if (sp) sp.textContent = Math.round(dist * 100) + '%'; }
    }
    // Feather slider
    var featherControls = document.getElementById('fxFeatherControls');
    if (featherControls) {
      var sliders = featherControls.querySelectorAll('input[type=range]');
      if (sliders[0]) { sliders[0].value = E.feather.radius; var sp = sliders[0].nextElementSibling; if (sp) sp.textContent = E.feather.radius + 'px'; }
    }
    // Grade sliders
    var gradeControls = document.getElementById('fxGradeControls');
    if (gradeControls) {
      var sliders = gradeControls.querySelectorAll('input[type=range]');
      // Order: brightness, saturation, sepia (matches index.html)
      if (sliders[0]) { sliders[0].value = Math.round(E.grade.brightness * 100); var sp = sliders[0].nextElementSibling; if (sp) sp.textContent = Math.round(E.grade.brightness * 100) + '%'; }
      if (sliders[1]) { sliders[1].value = Math.round(E.grade.saturation * 100); var sp = sliders[1].nextElementSibling; if (sp) sp.textContent = Math.round(E.grade.saturation * 100) + '%'; }
      if (sliders[2]) { sliders[2].value = Math.round(E.grade.sepia * 100); var sp = sliders[2].nextElementSibling; if (sp) sp.textContent = Math.round(E.grade.sepia * 100) + '%'; }
    }
    // Model shadow sliders
    var msControls = document.getElementById('fxModelShadowControls');
    if (msControls && E.modelShadow) {
      var sliders = msControls.querySelectorAll('input[type=range]');
      // Order: opacity, blur, dx, dy (matches index.html)
      if (sliders[0]) { sliders[0].value = Math.round(E.modelShadow.opacity * 100); var sp = sliders[0].nextElementSibling; if (sp) sp.textContent = Math.round(E.modelShadow.opacity * 100) + '%'; }
      if (sliders[1]) { sliders[1].value = Math.round(E.modelShadow.blur * 2); var sp = sliders[1].nextElementSibling; if (sp) sp.textContent = E.modelShadow.blur + 'px'; }
      if (sliders[2]) { sliders[2].value = E.modelShadow.dx; var sp = sliders[2].nextElementSibling; if (sp) sp.textContent = E.modelShadow.dx + 'px'; }
      if (sliders[3]) { sliders[3].value = E.modelShadow.dy; var sp = sliders[3].nextElementSibling; if (sp) sp.textContent = E.modelShadow.dy + 'px'; }
    }
  },

  /** Restore z-order from explicit zOrder array (Phase 1 format). */
  _restoreZOrderFromExplicit(zOrder, C) {
    var svg = document.getElementById('battlefield');
    zOrder.forEach(function(entry) {
      var el;
      if (entry.type === 'sprite') {
        var sp = C.allSprites.find(function(s) { return s.id === entry.id; });
        if (!sp) return;
        el = sp.rootEl;
        // Skip sprites inside groups — their order is managed by the group
        if (sp.groupId) return;
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
