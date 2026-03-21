/* ══════════════════════════════════════════════════════════════
   Editor Commands — Command-pattern objects for granular undo/redo.
   Each command: { type, apply(), reverse(), description }

   Phase 4: replaces full-snapshot undo with per-operation commands.
══════════════════════════════════════════════════════════════ */

window.Editor = window.Editor || {};

Editor.Commands = {
  // Temp state for slider interactions
  _shadow: null,

  // ═══════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════

  _findSprite: function(id) {
    return Editor.Core.allSprites.find(function(s) { return s.id === id; });
  },

  _captureSprite: function(sp) {
    return {
      id: sp.id, file: sp.file, x: sp.x, y: sp.y, w: sp.w, h: sp.h, rot: sp.rot,
      layerType: sp.layerType || 'floor', hidden: sp.hidden || false,
      flipX: sp.flipX || false, flipY: sp.flipY || false,
      shadowMul: sp.shadowMul != null ? sp.shadowMul : 1,
      cropL: sp.cropL || 0, cropT: sp.cropT || 0, cropR: sp.cropR || 0, cropB: sp.cropB || 0,
      groupId: sp.groupId || null
    };
  },

  _captureLight: function(l) {
    return { id: l.id, x: l.x, y: l.y, color: l.color, radius: l.radius, intensity: l.intensity };
  },

  _captureModel: function(m) {
    return m.kind === 'circle'
      ? { id: m.id, kind: 'circle', x: m.x, y: m.y, r: m.r, s: m.s, f: m.f, iconType: m.iconType }
      : { id: m.id, kind: 'rect', x: m.x, y: m.y, w: m.w, h: m.h, s: m.s, f: m.f };
  },

  /** Restore a sprite from captured data */
  _restoreSprite: function(d) {
    var sp = Editor.Sprites.addSprite(d.file, d.x, d.y, d.w, d.h, d.rot, d.layerType, true, d.id);
    sp.flipX = d.flipX || false;
    sp.flipY = d.flipY || false;
    sp.hidden = d.hidden || false;
    sp.el.style.display = sp.hidden ? 'none' : '';
    sp.shadowMul = d.shadowMul != null ? d.shadowMul : 1;
    sp.cropL = d.cropL || 0; sp.cropT = d.cropT || 0; sp.cropR = d.cropR || 0; sp.cropB = d.cropB || 0;
    if (sp.flipX || sp.flipY) Editor.Sprites.apply(sp);
    if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) Editor.Crop._applyClip(sp);
    if (d.groupId) {
      sp.groupId = d.groupId;
      var gEl = document.getElementById(d.groupId);
      if (gEl) {
        var el = sp.rootEl;
        if (el.parentNode) el.parentNode.removeChild(el);
        gEl.appendChild(el);
      }
    }
    if (Editor.Effects && Editor.Effects._ready) Editor.Effects._applyToSprite(sp);
    return sp;
  },

  /** Remove a sprite by ID */
  _removeSprite: function(id) {
    var sp = Editor.Core.allSprites.find(function(s) { return s.id === id; });
    if (!sp) return;
    if (sp._clipId || sp._clipWrap) Editor.Crop._removeClip(sp);
    sp.el.remove();
    Editor.Core.allSprites = Editor.Core.allSprites.filter(function(s) { return s.id !== id; });
    Editor.State.removeFromZOrder(id);
  },

  /** Capture the full DOM z-order snapshot (for REORDER commands) */
  captureDOMOrder: function() {
    var svg = document.getElementById('battlefield');
    if (!svg) return { dom: [], spriteGroups: {} };
    var snapshot = [];
    Array.from(svg.children).forEach(function(el) {
      if (!el.id) return;
      if (el.id === 'selUI' || el.id === 'dragRect') return;
      var entry = { id: el.id };
      if (el.tagName === 'g' && el.id.startsWith('group-')) {
        entry.children = Array.from(el.children).map(function(c) { return c.id; }).filter(Boolean);
      }
      snapshot.push(entry);
    });
    var groups = {};
    Editor.Core.allSprites.forEach(function(sp) {
      if (sp.groupId) groups[sp.id] = sp.groupId;
    });
    return { dom: snapshot, spriteGroups: groups };
  },

  /** Restore DOM order from snapshot */
  _restoreDOMOrder: function(snap) {
    var svg = document.getElementById('battlefield');
    var selUI = document.getElementById('selUI');
    var dragRect = document.getElementById('dragRect');

    // Restore sprite→group assignments
    Editor.Core.allSprites.forEach(function(sp) {
      if (snap.spriteGroups[sp.id]) {
        sp.groupId = snap.spriteGroups[sp.id];
      } else {
        delete sp.groupId;
      }
    });

    // Restore DOM order
    snap.dom.forEach(function(entry) {
      var el = document.getElementById(entry.id);
      if (!el) return;
      svg.insertBefore(el, selUI);
      if (entry.children) {
        entry.children.forEach(function(childId) {
          var child = document.getElementById(childId);
          if (child) el.appendChild(child);
        });
      }
    });

    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);
    Editor.State.syncZOrderFromDOM();
  },

  /** Restore a light from captured data */
  _restoreLight: function(d) {
    return Editor.Lights.addLight(d.x, d.y, d.color, d.radius, d.intensity, true, d.id);
  },

  /** Remove a light by ID */
  _removeLight: function(id) {
    var C = Editor.Core;
    var idx = C.allLights.findIndex(function(l) { return l.id === id; });
    if (idx === -1) return;
    var light = C.allLights[idx];
    light.el.remove();
    light.grad.remove();
    C.allLights.splice(idx, 1);
    if (Editor.Lights.selectedLight === light) Editor.Lights.deselectLight();
  },

  /** Restore a model from captured data */
  _restoreModel: function(d) {
    if (d.kind === 'circle') return Editor.Models.addCircle(d.x, d.y, d.r, d.s, d.f, d.iconType, d.id);
    else return Editor.Models.addRect(d.x, d.y, d.w, d.h, d.s, d.f, d.id);
  },

  /** Remove a model by ID */
  _removeModel: function(id) {
    var C = Editor.Core;
    var idx = C.allModels.findIndex(function(m) { return m.id === id; });
    if (idx === -1) return;
    var m = C.allModels[idx];
    m.el.remove();
    C.allModels.splice(idx, 1);
    if (Editor.Models.selectedModel === m) Editor.Models.deselectModel();
  },

  // ═══════════════════════════════════════════════════════════
  // Slider helpers (for inline HTML handlers)
  // ═══════════════════════════════════════════════════════════

  captureShadow: function(spriteId, value) {
    this._shadow = { id: spriteId, v: value };
  },

  commitShadow: function() {
    if (!this._shadow) return;
    var sp = this._findSprite(this._shadow.id);
    if (sp && sp.shadowMul !== this._shadow.v) {
      Editor.Undo.record(this.SetProperty.create(this._shadow.id,
        { shadowMul: this._shadow.v }, { shadowMul: sp.shadowMul }));
    }
    this._shadow = null;
  },

  // ═══════════════════════════════════════════════════════════
  // Command Factories
  // ═══════════════════════════════════════════════════════════

  /** MOVE — sprite position change */
  Move: {
    create: function(spriteId, fromX, fromY, toX, toY) {
      return {
        type: 'MOVE',
        description: 'Move ' + spriteId,
        apply: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          sp.x = toX; sp.y = toY;
          Editor.Sprites.apply(sp);
        },
        reverse: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          sp.x = fromX; sp.y = fromY;
          Editor.Sprites.apply(sp);
        }
      };
    }
  },

  /** RESIZE — sprite dimension change */
  Resize: {
    create: function(spriteId, from, to) {
      // from/to = { x, y, w, h }
      return {
        type: 'RESIZE',
        description: 'Resize ' + spriteId,
        apply: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          sp.x = to.x; sp.y = to.y; sp.w = to.w; sp.h = to.h;
          Editor.Sprites.apply(sp);
        },
        reverse: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          sp.x = from.x; sp.y = from.y; sp.w = from.w; sp.h = from.h;
          Editor.Sprites.apply(sp);
        }
      };
    }
  },

  /** ROTATE — sprite rotation change */
  Rotate: {
    create: function(spriteId, fromRot, toRot) {
      return {
        type: 'ROTATE',
        description: 'Rotate ' + spriteId,
        apply: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          sp.rot = toRot;
          Editor.Sprites.apply(sp);
        },
        reverse: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          sp.rot = fromRot;
          Editor.Sprites.apply(sp);
        }
      };
    }
  },

  /** ADD_SPRITE — create a new sprite */
  AddSprite: {
    create: function(spriteData) {
      return {
        type: 'ADD_SPRITE',
        description: 'Add sprite ' + spriteData.id,
        apply: function() {
          Editor.Commands._restoreSprite(spriteData);
        },
        reverse: function() {
          Editor.Commands._removeSprite(spriteData.id);
        }
      };
    }
  },

  /** DELETE_SPRITE — remove a sprite */
  DeleteSprite: {
    create: function(spriteData) {
      return {
        type: 'DELETE_SPRITE',
        description: 'Delete sprite ' + spriteData.id,
        apply: function() {
          Editor.Commands._removeSprite(spriteData.id);
        },
        reverse: function() {
          Editor.Commands._restoreSprite(spriteData);
        }
      };
    }
  },

  /** CROP — change crop values */
  Crop: {
    create: function(spriteId, from, to) {
      // from/to = { cropL, cropT, cropR, cropB }
      return {
        type: 'CROP',
        description: 'Crop ' + spriteId,
        apply: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          Editor.Crop._removeClip(sp);
          sp.cropL = to.cropL; sp.cropT = to.cropT; sp.cropR = to.cropR; sp.cropB = to.cropB;
          if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) Editor.Crop._applyClip(sp);
          else Editor.Sprites.apply(sp);
        },
        reverse: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          Editor.Crop._removeClip(sp);
          sp.cropL = from.cropL; sp.cropT = from.cropT; sp.cropR = from.cropR; sp.cropB = from.cropB;
          if (sp.cropL || sp.cropT || sp.cropR || sp.cropB) Editor.Crop._applyClip(sp);
          else Editor.Sprites.apply(sp);
        }
      };
    }
  },

  /** GROUP — create a group from sprites */
  Group: {
    create: function(groupId, groupName, opacity, spriteIds, beforeDOMOrder) {
      return {
        type: 'GROUP',
        description: 'Group ' + spriteIds.length + ' sprites',
        apply: function() {
          var C = Editor.Core;
          var svg = document.getElementById('battlefield');
          var g = document.createElementNS(C.NS, 'g');
          g.id = groupId;
          g.setAttribute('opacity', opacity != null ? opacity : 1);
          var selUI = document.getElementById('selUI');
          svg.insertBefore(g, selUI);

          spriteIds.forEach(function(sid) {
            var sp = Editor.Commands._findSprite(sid);
            if (!sp) return;
            var el = sp.rootEl;
            if (el.parentNode) el.parentNode.removeChild(el);
            g.appendChild(el);
            sp.groupId = groupId;
          });

          var dragRect = document.getElementById('dragRect');
          if (selUI) svg.appendChild(selUI);
          if (dragRect) svg.appendChild(dragRect);

          C.groups.push({ id: groupId, name: groupName, opacity: opacity != null ? opacity : 1 });
        },
        reverse: function() {
          var C = Editor.Core;
          var svg = document.getElementById('battlefield');
          var gEl = document.getElementById(groupId);
          if (!gEl) return;

          var selUI = document.getElementById('selUI');
          spriteIds.forEach(function(sid) {
            var sp = Editor.Commands._findSprite(sid);
            if (!sp) return;
            var el = sp.rootEl;
            if (el.parentNode) el.parentNode.removeChild(el);
            svg.insertBefore(el, selUI);
            delete sp.groupId;
          });

          gEl.remove();
          C.groups = C.groups.filter(function(g) { return g.id !== groupId; });

          // Restore original DOM order if available
          if (beforeDOMOrder) Editor.Commands._restoreDOMOrder(beforeDOMOrder);
        }
      };
    }
  },

  /** UNGROUP — dissolve a group */
  Ungroup: {
    create: function(groupId, groupName, opacity, spriteIds, beforeDOMOrder) {
      return {
        type: 'UNGROUP',
        description: 'Ungroup ' + groupId,
        apply: function() {
          var C = Editor.Core;
          var svg = document.getElementById('battlefield');
          var gEl = document.getElementById(groupId);
          if (!gEl) return;

          var selUI = document.getElementById('selUI');
          var insertRef = gEl.nextElementSibling;
          spriteIds.forEach(function(sid) {
            var sp = Editor.Commands._findSprite(sid);
            if (!sp) return;
            var el = sp.rootEl;
            if (el.parentNode) el.parentNode.removeChild(el);
            svg.insertBefore(el, insertRef);
            delete sp.groupId;
          });

          gEl.remove();
          C.groups = C.groups.filter(function(g) { return g.id !== groupId; });
        },
        reverse: function() {
          // Re-create the group
          var C = Editor.Core;
          var svg = document.getElementById('battlefield');
          var g = document.createElementNS(C.NS, 'g');
          g.id = groupId;
          g.setAttribute('opacity', opacity != null ? opacity : 1);
          var selUI = document.getElementById('selUI');
          svg.insertBefore(g, selUI);

          spriteIds.forEach(function(sid) {
            var sp = Editor.Commands._findSprite(sid);
            if (!sp) return;
            var el = sp.rootEl;
            if (el.parentNode) el.parentNode.removeChild(el);
            g.appendChild(el);
            sp.groupId = groupId;
          });

          var dragRect = document.getElementById('dragRect');
          if (selUI) svg.appendChild(selUI);
          if (dragRect) svg.appendChild(dragRect);

          C.groups.push({ id: groupId, name: groupName, opacity: opacity != null ? opacity : 1 });

          if (beforeDOMOrder) Editor.Commands._restoreDOMOrder(beforeDOMOrder);
        }
      };
    }
  },

  /** ADD_TO_GROUP — move a sprite into a group */
  AddToGroup: {
    create: function(spriteId, oldGroupId, newGroupId, beforeDOMOrder) {
      return {
        type: 'ADD_TO_GROUP',
        description: 'Add ' + spriteId + ' to ' + newGroupId,
        apply: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          var gEl = document.getElementById(newGroupId);
          if (!gEl) return;
          var el = sp.rootEl;
          if (el.parentNode) el.parentNode.removeChild(el);
          gEl.appendChild(el);
          sp.groupId = newGroupId;
        },
        reverse: function() {
          if (beforeDOMOrder) {
            Editor.Commands._restoreDOMOrder(beforeDOMOrder);
          } else {
            var sp = Editor.Commands._findSprite(spriteId);
            if (!sp) return;
            var el = sp.rootEl;
            if (el.parentNode) el.parentNode.removeChild(el);
            if (oldGroupId) {
              var oldGEl = document.getElementById(oldGroupId);
              if (oldGEl) { oldGEl.appendChild(el); sp.groupId = oldGroupId; }
              else {
                var svg = document.getElementById('battlefield');
                var selUI = document.getElementById('selUI');
                svg.insertBefore(el, selUI); delete sp.groupId;
              }
            } else {
              var svg = document.getElementById('battlefield');
              var selUI = document.getElementById('selUI');
              svg.insertBefore(el, selUI); delete sp.groupId;
            }
          }
        }
      };
    }
  },

  /** REORDER — z-order change */
  Reorder: {
    create: function(beforeDOMOrder, afterDOMOrder) {
      return {
        type: 'REORDER',
        description: 'Reorder layers',
        apply: function() {
          Editor.Commands._restoreDOMOrder(afterDOMOrder);
        },
        reverse: function() {
          Editor.Commands._restoreDOMOrder(beforeDOMOrder);
        }
      };
    }
  },

  /** SET_PROPERTY — generic sprite property change */
  SetProperty: {
    create: function(spriteId, from, to) {
      // from/to = { propName: value, ... }
      return {
        type: 'SET_PROPERTY',
        description: 'Set property on ' + spriteId,
        apply: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          Object.keys(to).forEach(function(k) { sp[k] = to[k]; });
          if ('hidden' in to) sp.el.style.display = sp.hidden ? 'none' : '';
          Editor.Sprites.apply(sp);
        },
        reverse: function() {
          var sp = Editor.Commands._findSprite(spriteId);
          if (!sp) return;
          Object.keys(from).forEach(function(k) { sp[k] = from[k]; });
          if ('hidden' in from) sp.el.style.display = sp.hidden ? 'none' : '';
          Editor.Sprites.apply(sp);
        }
      };
    }
  },

  /** SET_SETTING — editor setting change (bg, ruinsOpacity, roofOpacity) */
  SetSetting: {
    create: function(prop, fromVal, toVal) {
      return {
        type: 'SET_SETTING',
        description: 'Set ' + prop,
        apply: function() {
          Editor.State.settings[prop] = toVal;
          if (prop === 'bg' && Editor.Core.setBg) Editor.Core.setBg(toVal);
        },
        reverse: function() {
          Editor.State.settings[prop] = fromVal;
          if (prop === 'bg' && Editor.Core.setBg) Editor.Core.setBg(fromVal);
        }
      };
    }
  },

  /** SET_EFFECT — effect parameters change */
  SetEffect: {
    create: function(effectType, fromParams, toParams) {
      return {
        type: 'SET_EFFECT',
        description: 'Set ' + effectType + ' effect',
        apply: function() {
          var effect = Editor.Effects[effectType];
          Object.keys(toParams).forEach(function(k) { effect[k] = toParams[k]; });
          Editor.Effects._flush();
        },
        reverse: function() {
          var effect = Editor.Effects[effectType];
          Object.keys(fromParams).forEach(function(k) { effect[k] = fromParams[k]; });
          Editor.Effects._flush();
        }
      };
    }
  },

  /** ADD_LIGHT — create a light */
  AddLight: {
    create: function(lightData) {
      return {
        type: 'ADD_LIGHT',
        description: 'Add light ' + lightData.id,
        apply: function() {
          Editor.Commands._restoreLight(lightData);
        },
        reverse: function() {
          Editor.Commands._removeLight(lightData.id);
        }
      };
    }
  },

  /** DELETE_LIGHT — remove a light */
  DeleteLight: {
    create: function(lightData) {
      return {
        type: 'DELETE_LIGHT',
        description: 'Delete light ' + lightData.id,
        apply: function() {
          Editor.Commands._removeLight(lightData.id);
        },
        reverse: function() {
          Editor.Commands._restoreLight(lightData);
        }
      };
    }
  },

  /** MOVE_LIGHT — light position change */
  MoveLight: {
    create: function(lightId, fromX, fromY, toX, toY) {
      return {
        type: 'MOVE_LIGHT',
        description: 'Move light ' + lightId,
        apply: function() {
          var l = Editor.Core.allLights.find(function(x) { return x.id === lightId; });
          if (!l) return;
          l.x = toX; l.y = toY;
          Editor.Lights.applyLight(l);
        },
        reverse: function() {
          var l = Editor.Core.allLights.find(function(x) { return x.id === lightId; });
          if (!l) return;
          l.x = fromX; l.y = fromY;
          Editor.Lights.applyLight(l);
        }
      };
    }
  },

  /** LIGHT_PROPERTY — light property change */
  LightProperty: {
    create: function(lightId, from, to) {
      return {
        type: 'LIGHT_PROPERTY',
        description: 'Change light ' + lightId,
        apply: function() {
          var l = Editor.Core.allLights.find(function(x) { return x.id === lightId; });
          if (!l) return;
          Object.keys(to).forEach(function(k) { l[k] = to[k]; });
          Editor.Lights.applyLight(l);
          if (Editor.Lights.selectedLight === l) Editor.Lights.refreshControls();
        },
        reverse: function() {
          var l = Editor.Core.allLights.find(function(x) { return x.id === lightId; });
          if (!l) return;
          Object.keys(from).forEach(function(k) { l[k] = from[k]; });
          Editor.Lights.applyLight(l);
          if (Editor.Lights.selectedLight === l) Editor.Lights.refreshControls();
        }
      };
    }
  },

  /** TOGGLE_LIGHT_VIS — light visibility toggle */
  ToggleLightVis: {
    create: function(lightId, wasHidden) {
      return {
        type: 'TOGGLE_LIGHT_VIS',
        description: 'Toggle light visibility',
        apply: function() {
          var l = Editor.Core.allLights.find(function(x) { return x.id === lightId; });
          if (!l) return;
          l.el.style.display = wasHidden ? '' : 'none';
        },
        reverse: function() {
          var l = Editor.Core.allLights.find(function(x) { return x.id === lightId; });
          if (!l) return;
          l.el.style.display = wasHidden ? 'none' : '';
        }
      };
    }
  },

  /** ADD_MODEL — create a model */
  AddModel: {
    create: function(modelData) {
      return {
        type: 'ADD_MODEL',
        description: 'Add model ' + modelData.id,
        apply: function() {
          Editor.Commands._restoreModel(modelData);
        },
        reverse: function() {
          Editor.Commands._removeModel(modelData.id);
        }
      };
    }
  },

  /** DELETE_MODEL — remove a model */
  DeleteModel: {
    create: function(modelData) {
      return {
        type: 'DELETE_MODEL',
        description: 'Delete model ' + modelData.id,
        apply: function() {
          Editor.Commands._removeModel(modelData.id);
        },
        reverse: function() {
          Editor.Commands._restoreModel(modelData);
        }
      };
    }
  },

  /** MOVE_MODEL — model position change */
  MoveModel: {
    create: function(modelId, fromX, fromY, toX, toY) {
      return {
        type: 'MOVE_MODEL',
        description: 'Move model ' + modelId,
        apply: function() {
          var m = Editor.Core.allModels.find(function(x) { return x.id === modelId; });
          if (!m) return;
          m.x = toX; m.y = toY;
          Editor.Models.applyModel(m);
        },
        reverse: function() {
          var m = Editor.Core.allModels.find(function(x) { return x.id === modelId; });
          if (!m) return;
          m.x = fromX; m.y = fromY;
          Editor.Models.applyModel(m);
        }
      };
    }
  },

  /** BATCH — compound command */
  Batch: {
    create: function(commands, description) {
      return {
        type: 'BATCH',
        description: description || 'Batch (' + commands.length + ' operations)',
        apply: function() {
          commands.forEach(function(cmd) { cmd.apply(); });
        },
        reverse: function() {
          for (var i = commands.length - 1; i >= 0; i--) {
            commands[i].reverse();
          }
        }
      };
    }
  }
};
