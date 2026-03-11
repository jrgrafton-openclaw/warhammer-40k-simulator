/**
 * movement.js — Movement state machine + drag enforcement + UI wiring.
 *
 * Depends on: BattleUI (shared), window._terrainAABBs (from scene.js),
 *             window.rollAdvanceDie (from advance-dice.js)
 */
(function() {
  'use strict';

  var B = BattleUI;
  var simState     = B.simState;
  var UNITS        = B.UNITS;
  var PX_PER_INCH  = B.PX_PER_INCH;
  var renderModels = B.renderModels;

  var ACTIVE_PLAYER_FACTION = 'imp';

  // ── Phase turn-start positions ─────────────────────────
  var phaseTurnStarts = {};

  function captureTurnStarts() {
    simState.units.forEach(function(u) {
      u.models.forEach(function(m) {
        phaseTurnStarts[m.id] = { x: m.x, y: m.y };
      });
    });
  }

  // ── Movement state ─────────────────────────────────────
  var moveState = {
    mode: null,          // null | 'move' | 'advance'
    advanceDie: null,    // 1–6 once ADVANCE declared (current unit's roll)
    unitsMoved: new Set(),
    unitsAdvanced: {}    // unitId → dieResult (persists across deselect/reselect)
  };

  // ── Helpers ────────────────────────────────────────────
  function getMoveRangePx(unitId, isAdvance) {
    var u = UNITS[unitId]; if (!u) return 0;
    if (isAdvance) {
      var bonus = (moveState.advanceDie !== null) ? moveState.advanceDie : 3.5;
      return (u.M + bonus) * PX_PER_INCH;
    }
    return u.M * PX_PER_INCH;
  }

  function getFactionColor(unitId) {
    var u = UNITS[unitId]; if (!u) return '#888';
    return u.faction_side === 'imp' ? '#2266ee' : '#cc2222';
  }

  function resolveTerrainCollision(cx, cy, r) {
    return B.resolveTerrainCollision(cx, cy, r, window._terrainAABBs || []);
  }

  function resolveUnitDragCollisions(unit) {
    B.resolveUnitDragCollisions(unit, simState.units);
  }

  function getDragUnitId() {
    if (!simState.drag) return null;
    if (simState.drag.type === 'unit') return simState.drag.unit.id;
    if (simState.drag.type === 'model') {
      var m = simState.drag.model;
      var unit = simState.units.find(function(u) { return u.models.includes(m); });
      return unit ? unit.id : null;
    }
    return null;
  }

  // ── Enter / Confirm / Cancel ───────────────────────────
  function enterMoveMode(mode) {
    var uid = B.currentUnit;
    if (!uid || moveState.unitsMoved.has(uid)) return;
    clearMoveOverlays();
    moveState.mode = mode;
    updateMoveButtons();
    renderMoveOverlays(uid);
    renderModels();
  }

  function confirmMove() {
    var uid = B.currentUnit;
    var unit = uid ? simState.units.find(function(u) { return u.id === uid; }) : null;
    if (unit) {
      B.checkCohesion(unit);
      if (unit.broken) {
        var btn = document.getElementById('btn-confirm-move');
        if (btn) { btn.classList.add('shake-error'); setTimeout(function() { btn.classList.remove('shake-error'); }, 450); }
        return;
      }
    }
    if (uid) moveState.unitsMoved.add(uid);
    moveState.mode = null;
    moveState.advanceDie = null;
    clearMoveOverlays();
    updateMoveButtons();
    B.selectUnit(null);
  }

  function cancelMove() {
    var uid = B.currentUnit;
    var unit = uid ? simState.units.find(function(u) { return u.id === uid; }) : null;
    if (unit) {
      unit.models.forEach(function(m) {
        var ts = phaseTurnStarts[m.id];
        if (ts) { m.x = ts.x; m.y = ts.y; }
      });
    }
    moveState.mode = null;
    moveState.advanceDie = null;
    clearMoveOverlays();
    updateMoveButtons();
    renderModels();
    origSelectUnit(null);
  }

  // ── Update action bar buttons ──────────────────────────
  function updateMoveButtons() {
    var uid = B.currentUnit;
    var inMode = moveState.mode !== null;
    var alreadyMoved = uid && moveState.unitsMoved.has(uid);
    var unit = uid ? simState.units.find(function(u) { return u.id === uid; }) : null;
    var isEnemy = unit && unit.faction !== ACTIVE_PLAYER_FACTION;

    var btnMove    = document.getElementById('btn-move');
    var btnAdvance = document.getElementById('btn-advance');
    var btnConfirm = document.getElementById('btn-confirm-move');
    var btnCancel  = document.getElementById('btn-cancel-move');
    var modeLabel  = document.getElementById('move-mode-label');

    if (btnMove)    { btnMove.classList.toggle('active', moveState.mode === 'move');
                      btnMove.disabled = isEnemy || alreadyMoved || hasAdvanced || (moveState.mode === 'advance'); }
    var hasAdvanced = uid && moveState.unitsAdvanced[uid] !== undefined;
    if (btnAdvance) { btnAdvance.classList.toggle('active', moveState.mode === 'advance');
                      btnAdvance.disabled = isEnemy || alreadyMoved || hasAdvanced || moveState.mode === 'advance'; }
    if (btnConfirm) btnConfirm.disabled = isEnemy || !inMode;
    if (btnCancel)  btnCancel.disabled  = isEnemy || !inMode;

    if (modeLabel) {
      modeLabel.className = '';
      if (isEnemy)             { modeLabel.textContent = '— ENEMY UNIT —'; }
      else if (alreadyMoved)   { modeLabel.textContent = '✓ MOVED'; }
      else if (moveState.mode === 'move')    { modeLabel.textContent = '◉ MOVING'; modeLabel.className = 'active-move'; }
      else if (moveState.mode === 'advance') {
        var d = moveState.advanceDie;
        modeLabel.textContent = d !== null ? '◉ ADVANCING +' + d + '"' : '◉ ADVANCING +D6"';
        modeLabel.className = 'active-advance';
      } else { modeLabel.textContent = uid ? '— SELECT MOVE —' : '— NO UNIT —'; }
    }
  }

  // ── Render overlays (zones, ghosts, rulers) ────────────
  function renderMoveOverlays(uid) {
    var layerZones  = document.getElementById('layer-move-zones');
    var layerGhosts = document.getElementById('layer-move-ghosts');
    if (!layerZones || !layerGhosts) return;
    layerZones.innerHTML = ''; layerGhosts.innerHTML = '';
    if (!moveState.mode || !uid) return;
    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (!unit || unit.faction !== ACTIVE_PLAYER_FACTION) return;

    var NS = 'http://www.w3.org/2000/svg';
    var isAdvance = moveState.mode === 'advance';
    var rangePx = getMoveRangePx(uid, isAdvance);
    var color = getFactionColor(uid);

    unit.models.forEach(function(m) {
      var start = phaseTurnStarts[m.id]; if (!start) return;

      // Zone circle
      var zone = document.createElementNS(NS, 'circle');
      zone.setAttribute('cx', start.x); zone.setAttribute('cy', start.y); zone.setAttribute('r', rangePx);
      zone.setAttribute('class', isAdvance ? 'move-zone zone-advance' : 'move-zone zone-move');
      zone.style.pointerEvents = 'none';
      layerZones.appendChild(zone);

      // Ghost circle at start
      var ghost;
      if (m.shape === 'rect') {
        ghost = document.createElementNS(NS, 'rect');
        ghost.setAttribute('x', start.x - m.w/2); ghost.setAttribute('y', start.y - m.h/2);
        ghost.setAttribute('width', m.w); ghost.setAttribute('height', m.h);
        ghost.setAttribute('rx', '5'); ghost.setAttribute('ry', '5');
      } else {
        ghost = document.createElementNS(NS, 'circle');
        ghost.setAttribute('cx', start.x); ghost.setAttribute('cy', start.y); ghost.setAttribute('r', m.r);
      }
      ghost.setAttribute('class', 'move-ghost');
      ghost.style.stroke = color; ghost.style.strokeWidth = '1.5'; ghost.style.pointerEvents = 'none';
      layerGhosts.appendChild(ghost);
    });

    renderMoveRulers(uid);
  }

  function renderMoveRulers(uid) {
    var layerRulers = document.getElementById('layer-move-rulers');
    if (!layerRulers) return;
    layerRulers.innerHTML = '';
    if (!moveState.mode || !uid) return;
    var unit = simState.units.find(function(u) { return u.id === uid; });
    if (!unit) return;
    var NS = 'http://www.w3.org/2000/svg';
    var color = getFactionColor(uid);
    var rangePx = getMoveRangePx(uid, moveState.mode === 'advance');

    unit.models.forEach(function(m) {
      var ts = phaseTurnStarts[m.id]; if (!ts) return;
      var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      var overRange = dist > rangePx + 0.5;

      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', ts.x); line.setAttribute('y1', ts.y);
      line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
      line.setAttribute('class', 'move-ruler');
      line.style.stroke = overRange ? '#ff3333' : color;
      layerRulers.appendChild(line);

      var label = document.createElementNS(NS, 'text');
      label.setAttribute('x', (ts.x + m.x) / 2); label.setAttribute('y', (ts.y + m.y) / 2 - 4);
      label.setAttribute('class', 'move-ruler-label'); label.setAttribute('text-anchor', 'middle');
      label.textContent = (dist / PX_PER_INCH).toFixed(1) + '"';
      layerRulers.appendChild(label);
    });
  }

  function clearMoveOverlays() {
    ['layer-move-zones', 'layer-move-ghosts', 'layer-move-rulers'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.innerHTML = '';
    });
  }

  // ── Drag interceptor: block already-moved + enemy ──────
  (function() {
    var _drag = null;
    Object.defineProperty(simState, 'drag', {
      configurable: true,
      get: function() { return _drag; },
      set: function(value) {
        if (value !== null) {
          var unit = null;
          if (value.type === 'unit') unit = value.unit;
          else if (value.type === 'model') unit = simState.units.find(function(u) { return u.models.includes(value.model); });
          if (unit) {
            if (moveState.unitsMoved.has(unit.id)) return;
            if (unit.faction !== ACTIVE_PLAYER_FACTION) return;
          }
        }
        _drag = value;
      }
    });
  })();

  // ── Patch model drag: zone clamp + terrain + re-render ─
  (function() {
    var origRenderModels = B.renderModels;
    B.renderModels = function() {
      origRenderModels();
      if (moveState.mode && B.currentUnit) renderMoveOverlays(B.currentUnit);
      // Lift dragged unit to z-top
      if (simState.drag) {
        var dragUnitId = getDragUnitId();
        if (dragUnitId) {
          ['layer-hulls', 'layer-models'].forEach(function(layerId) {
            var layer = document.getElementById(layerId); if (!layer) return;
            Array.from(layer.children).forEach(function(el) {
              if (el.dataset && el.dataset.unitId === dragUnitId) layer.appendChild(el);
            });
          });
        }
      }
    };

    // bubbling → runs after battle-models.js resolveOverlaps
    window.addEventListener('mousemove', function() {
      var drag = simState.drag;
      if (!drag || !moveState.mode) return;
      var uid = B.currentUnit; if (!uid) return;
      var rangePx = getMoveRangePx(uid, moveState.mode === 'advance');

      if (drag.type === 'model') {
        var m = drag.model, ts = phaseTurnStarts[m.id]; if (!ts) return;
        // Zone clamp from turn-start
        var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > rangePx) {
          var sc = rangePx / dist; m.x = ts.x + dx * sc; m.y = ts.y + dy * sc;
          var reRes = B.resolveOverlaps(m, m.x, m.y); m.x = reRes.x; m.y = reRes.y;
        }
        // Terrain collision (continuous)
        var tr = resolveTerrainCollision(m.x, m.y, m.r); m.x = tr.x; m.y = tr.y;
      }
      else if (drag.type === 'unit') {
        // Cross-unit collision
        resolveUnitDragCollisions(drag.unit);
        // Zone clamp per model
        drag.unit.models.forEach(function(m) {
          var ts = phaseTurnStarts[m.id]; if (!ts) return;
          var dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
          if (dist > rangePx) { var sc = rangePx/dist; m.x = ts.x+dx*sc; m.y = ts.y+dy*sc; }
        });
        // Terrain: push entire unit as block
        var maxPX = 0, maxPY = 0;
        drag.unit.models.forEach(function(m) {
          var tr = resolveTerrainCollision(m.x, m.y, m.r);
          var px = tr.x - m.x, py = tr.y - m.y;
          if (Math.abs(px) > Math.abs(maxPX)) maxPX = px;
          if (Math.abs(py) > Math.abs(maxPY)) maxPY = py;
        });
        if (maxPX !== 0 || maxPY !== 0) {
          drag.unit.models.forEach(function(m) { m.x += maxPX; m.y += maxPY; });
        }
        resolveUnitDragCollisions(drag.unit);
      }
      // Re-render immediately so collision is visible during drag
      B.renderModels();
    });
  })();

  // ── Button wiring ─────────────────────────────────────
  document.getElementById('btn-move').addEventListener('click', function() {
    if (!B.currentUnit || moveState.unitsMoved.has(B.currentUnit)) return;
    enterMoveMode('move');
  });
  document.getElementById('btn-advance').addEventListener('click', function() {
    var uid = B.currentUnit;
    if (!uid || moveState.unitsMoved.has(uid) || moveState.mode === 'advance') return;
    // Cancel any current normal move first (snap back to turn-start before rolling)
    if (moveState.mode === 'move') {
      var unit = simState.units.find(function(u) { return u.id === uid; });
      if (unit) { unit.models.forEach(function(m) { var ts = phaseTurnStarts[m.id]; if (ts) { m.x = ts.x; m.y = ts.y; } }); }
      moveState.mode = null; clearMoveOverlays();
    }
    rollAdvanceDie(uid, function(die) {
      moveState.advanceDie = die;
      moveState.unitsAdvanced[uid] = die; // persist across deselect/reselect
      enterMoveMode('advance');
      updateMoveButtons();
    });
  });
  document.getElementById('btn-confirm-move').addEventListener('click', confirmMove);
  document.getElementById('btn-cancel-move').addEventListener('click', cancelMove);

  // ── Selection override ────────────────────────────────
  var origSelectUnit = B.selectUnit.bind(B);
  B.selectUnit = function(uid) {
    if (moveState.mode !== null && uid !== B.currentUnit) cancelMove();
    origSelectUnit(uid);

    // Selection tone: friendly = cyan, enemy = red
    document.querySelectorAll('.rail-unit').forEach(function(r) { r.classList.remove('active-enemy'); });
    if (uid) {
      var selected = simState.units.find(function(u) { return u.id === uid; });
      var row = document.querySelector('.rail-unit[data-unit="' + uid + '"]');
      if (row && selected && selected.faction !== ACTIVE_PLAYER_FACTION) row.classList.add('active-enemy');
    }

    updateMoveButtons();
    if (uid) {
      var unit = simState.units.find(function(u) { return u.id === uid; });
      if (unit && unit.faction === ACTIVE_PLAYER_FACTION && moveState.mode === null && !moveState.unitsMoved.has(uid)) {
        // If unit already committed to advance, restore advance mode with saved die
        if (moveState.unitsAdvanced[uid] !== undefined) {
          moveState.advanceDie = moveState.unitsAdvanced[uid];
          enterMoveMode('advance');
        } else {
          enterMoveMode('move');
        }
      }
    }
  };
  window.selectUnit = B.selectUnit;

  // ── Click outside: soft-exit ──────────────────────────
  document.getElementById('battlefield').addEventListener('mousedown', function(e) {
    if (e.target.closest('#bf-svg, #bf-svg-terrain, #unit-card, #vp-bar, #action-bar, #phase-header, .obj-hex-wrap, #advance-dice-overlay')) return;
    if (moveState.mode !== null) {
      moveState.mode = null; moveState.advanceDie = null;
      clearMoveOverlays(); updateMoveButtons(); renderModels();
      origSelectUnit(null);
    } else if (B.currentUnit) {
      origSelectUnit(null); updateMoveButtons();
    }
  }, true);

  // ── Init ──────────────────────────────────────────────
  captureTurnStarts();
  renderModels();
  updateMoveButtons();

})();
