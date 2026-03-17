/* svg-renderer.js — Board controls, range UI, selection, and model interaction.
 * Main entry point that re-exports camera.js and model-renderer.js.
 */

import { simState, activeRangeTypes, currentUnit, setCurrentUnit, callbacks } from '../state/store.js';
import { UNITS, buildCard, showTip, hideTip } from '../state/units.js';
import { TERRAIN_RULES } from '../state/terrain-data.js';
import { ensureSVGDefs, renderModels as renderModelsCore,
         getCurvedHullPath, checkCohesion, resolveOverlaps } from './model-renderer.js';

export { applyTx, getCamera, setCamera, resetCamera, initBoard } from './camera.js';
export { getCurvedHullPath, checkCohesion, resolveOverlaps } from './model-renderer.js';

// ── Range helpers ──────────────────────────────────────
export function getRangeInches(unit) {
  return { move: unit.M, advance: unit.M + 3.5, charge: unit.M + 7, ds: 9 };
}

export function clearRangeCircles() {
  ['move','advance','charge','ds'].forEach(function(type) {
    var c = document.getElementById('range-' + type);
    var l = document.getElementById('range-' + type + '-label');
    if (c) c.style.display = 'none';
    if (l) l.style.display = 'none';
  });
}

export function updateRangeCirclesFromUnit(uid) {
  if (!uid) return;
  var unit = simState.units.find(function(u){ return u.id===uid; });
  if (!unit || unit.models.length === 0) return;
  var u = UNITS[uid]; if (!u) return;

  var cx = unit.models.reduce(function(s,m){ return s+m.x; }, 0) / unit.models.length;
  var cy = unit.models.reduce(function(s,m){ return s+m.y; }, 0) / unit.models.length;

  var svg = document.getElementById('bf-svg');
  if (!svg) return;
  var ctm = svg.getScreenCTM();
  if (!ctm) return;
  var screenX = ctm.e + cx * ctm.a;
  var screenY = ctm.f + cy * ctm.d;

  var bf = document.getElementById('battlefield');
  var bfRect = bf.getBoundingClientRect();
  var tcx = screenX - bfRect.left;
  var tcy = screenY - bfRect.top;

  var inner = document.getElementById('battlefield-inner');
  var matrix = new DOMMatrixReadOnly(window.getComputedStyle(inner).transform);
  var sc = matrix.a || 1;
  var ppi = (bfRect.width / 60) * sc;

  var radii = getRangeInches(u);
  ['move','advance','charge','ds'].forEach(function(type) {
    var circle = document.getElementById('range-' + type);
    var label  = document.getElementById('range-' + type + '-label');
    var R_px   = radii[type] * ppi;
    var diam   = R_px * 2;
    if (circle) {
      circle.style.left   = (tcx - R_px) + 'px';
      circle.style.top    = (tcy - R_px) + 'px';
      circle.style.width  = diam + 'px';
      circle.style.height = diam + 'px';
    }
    if (label) { label.style.left = tcx + 'px'; label.style.top = (tcy - R_px - 18) + 'px'; }
    var isActive = activeRangeTypes.has(type);
    if (circle) { circle.style.display = isActive ? 'block' : 'none'; circle.style.opacity = isActive ? '1' : '0'; }
    if (label) { label.style.display = isActive ? 'block' : 'none'; label.style.opacity = isActive ? '1' : '0'; }
  });
}
callbacks.updateRangeCircles = updateRangeCirclesFromUnit;

// ── renderModels wrapper ───────────────────────────────
export function renderModels() {
  renderModelsCore();
  if (currentUnit && activeRangeTypes.size > 0) {
    updateRangeCirclesFromUnit(currentUnit);
  }
  if (typeof callbacks.afterRender === 'function') {
    callbacks.afterRender();
  }
}

// ── selectUnit ─────────────────────────────────────────
export function selectUnit(uid) {
  setCurrentUnit(uid);
  document.querySelectorAll('.rail-unit').forEach(function(r) {
    r.classList.toggle('active', r.dataset.unit===uid);
  });
  if (uid) {
    buildCard(uid);
    renderModels();
    if (activeRangeTypes.size > 0) {
      setTimeout(function(){ updateRangeCirclesFromUnit(uid); }, 0);
    }
  } else {
    var card = document.getElementById('unit-card');
    if (card) card.classList.remove('visible');
    clearRangeCircles();
    renderModels();
  }
}

function dispatchSelectUnit(uid) {
  var fn = callbacks.selectUnit || selectUnit;
  fn(uid);
}

// ── initBattleControls ─────────────────────────────────
export function initBattleControls() {
  document.querySelectorAll('.rail-unit').forEach(function(r) {
    r.addEventListener('click', function() { dispatchSelectUnit(r.dataset.unit); });
  });

  var cardClose = document.getElementById('card-close');
  if (cardClose) {
    cardClose.addEventListener('click', function() {
      var card = document.getElementById('unit-card');
      if (card) card.classList.remove('visible');
      document.querySelectorAll('.rail-unit').forEach(function(e){ e.classList.remove('active'); });
      activeRangeTypes.clear();
      clearRangeCircles();
      ['move','advance','charge','ds'].forEach(function(t) {
        var btn = document.getElementById('rt-'+t);
        if (btn) btn.classList.remove('active');
      });
      setCurrentUnit(null);
      renderModels();
    });
  }

  ['move','advance','charge','ds'].forEach(function(type) {
    var btn = document.getElementById('rt-' + type);
    if (!btn) return;
    btn.addEventListener('click', function() {
      if (activeRangeTypes.has(type)) {
        activeRangeTypes.delete(type);
        btn.classList.remove('active');
      } else {
        activeRangeTypes.add(type);
        btn.classList.add('active');
      }
      if (currentUnit) updateRangeCirclesFromUnit(currentUnit);
    });
  });

  var rosterBtn = document.getElementById('roster-btn');
  if (rosterBtn) {
    rosterBtn.addEventListener('click', function() {
      var app = document.getElementById('app');
      if (app) app.classList.toggle('collapsed');
    });
  }

  var btnMove = document.getElementById('btn-move');
  var btnAdvance = document.getElementById('btn-advance');
  if (btnMove) {
    btnMove.addEventListener('click', function() {
      btnMove.classList.add('active');
      if (btnAdvance) btnAdvance.classList.remove('active');
    });
  }
  if (btnAdvance) {
    btnAdvance.addEventListener('click', function() {
      btnAdvance.classList.add('active');
      if (btnMove) btnMove.classList.remove('active');
    });
  }

  var modalBg = document.getElementById('modal-bg');
  var btnStrat = document.getElementById('btn-strat');
  var modalClose = document.getElementById('modal-close');
  if (btnStrat && modalBg) btnStrat.addEventListener('click', function(){ modalBg.classList.add('open'); });
  if (modalClose && modalBg) modalClose.addEventListener('click', function(){ modalBg.classList.remove('open'); });
  if (modalBg) modalBg.addEventListener('click', function(e){ if(e.target===modalBg) modalBg.classList.remove('open'); });

  document.addEventListener('keydown', function(e) {
    if (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var key = e.key.toLowerCase();
    if (key === 'escape') {
      dispatchSelectUnit(null);
      return;
    }
    var shortcutTargets = {
      'm': ['btn-move'],
      'a': ['btn-advance'],
      's': ['btn-strat'],
      'e': ['btn-end', 'btn-end-shoot'],
      'r': ['reset-btn']
    };
    var ids = shortcutTargets[key];
    if (!ids) return;
    for (var i = 0; i < ids.length; i++) {
      var b = document.getElementById(ids[i]);
      if (b) { b.click(); break; }
    }
  });

  window.selectUnit = function(uid) { dispatchSelectUnit(uid); };

  function buildTerrainTip(key) {
    var t = TERRAIN_RULES[key];
    if (!t) return '';
    var rules = t.rules.map(function(r){ return '<li>' + r + '</li>'; }).join('');
    return '<div class="tip-title">' + (t.title||key) + '</div><ul>' + rules + '</ul>';
  }
  document.querySelectorAll('[data-tip-key]').forEach(function(el) {
    el.addEventListener('mouseenter', function(){ showTip(el, buildTerrainTip(el.dataset.tipKey)); });
    el.addEventListener('mouseleave', function(){ hideTip(); });
  });

  window.toggleFaction = function(hdr) {
    var body = hdr.nextElementSibling;
    var chev = hdr.querySelector('.faction-chevron');
    if (!chev) return;
    var closed = body.classList.toggle('closed');
    chev.style.transform = closed ? 'rotate(-90deg)' : '';
  };
  window.toggleAA = function(hdr) {
    var body = hdr.nextElementSibling;
    var chev = hdr.querySelector('.aa-chev');
    var open = body.classList.toggle('open');
    if (chev) chev.style.transform = open ? 'rotate(90deg)' : '';
  };
}

// ── Mouse position (SVG coords) ───────────────────────
export function getMousePos(evt) {
  var svg = document.getElementById('bf-svg');
  var CTM = svg.getScreenCTM();
  if (!CTM || !CTM.a) {
    var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    return {x: loc.x, y: loc.y};
  }
  return { x: (evt.clientX - CTM.e) / CTM.a, y: (evt.clientY - CTM.f) / CTM.d };
}

// ── initModelInteraction ──────────────────────────────
export function initModelInteraction() {
  ensureSVGDefs();

  if (!document.getElementById('cohesion-banner')) {
    var bdiv = document.createElement('div');
    bdiv.id = 'cohesion-banner';
    bdiv.innerHTML = '⚠ UNIT COHESION BROKEN';
    bdiv.style.display = 'none';
    var bf = document.getElementById('battlefield');
    if (bf) bf.appendChild(bdiv);
  }

  var svg = document.getElementById('bf-svg');
  if (!svg) return;

  svg.addEventListener('mousedown', function(e) {
    var trg = e.target;
    var baseEl = trg;
    while (baseEl && !baseEl.classList.contains('model-base')) baseEl = baseEl.parentElement;
    var pt = getMousePos(e);

    if (baseEl && baseEl.classList.contains('model-base')) {
      var uId = baseEl.dataset.unitId;
      var mId = baseEl.dataset.modelId;
      var unit = simState.units.find(function(u){ return u.id===uId; });
      if (!unit) return;
      var model = unit.models.find(function(m){ return m.id===mId; });
      if (!model) return;
      if (currentUnit !== uId) dispatchSelectUnit(uId);
      if (e.shiftKey) {
        simState.drag = { type:'rotate', pivot:pt, unit:unit, origins:unit.models.map(function(m){ return {x:m.x,y:m.y}; }) };
      } else {
        simState.drag = { type:'model', model:model, offsetX:model.x-pt.x, offsetY:model.y-pt.y };
      }
      if (simState.drag) {
        if (simState.drag.type === 'model') {
          simState.anim.liftModelId = model.id;
          simState.anim.liftUnitId = null;
        } else {
          simState.anim.liftUnitId = unit.id;
          simState.anim.liftModelId = null;
        }
        simState.anim.settleUnitId = null;
        simState.anim.settleModelId = null;
        simState.anim.settleUntil = 0;
      }
      e.stopPropagation();
      renderModels();
    }
    else if (trg.classList && trg.classList.contains('unit-hull')) {
      var uId2 = trg.dataset.unitId;
      var unit2 = simState.units.find(function(u){ return u.id===uId2; });
      if (!unit2) return;
      if (currentUnit !== uId2) dispatchSelectUnit(uId2);
      if (e.shiftKey) {
        simState.drag = { type:'rotate', pivot:pt, unit:unit2, origins:unit2.models.map(function(m){ return {x:m.x,y:m.y}; }) };
      } else {
        simState.drag = { type:'unit', unit:unit2, offsets:unit2.models.map(function(m){ return {m:m,dx:m.x-pt.x,dy:m.y-pt.y}; }) };
      }
      if (simState.drag) {
        simState.anim.liftUnitId = unit2.id;
        simState.anim.liftModelId = null;
        simState.anim.settleUnitId = null;
        simState.anim.settleModelId = null;
        simState.anim.settleUntil = 0;
      }
      e.stopPropagation();
      renderModels();
    } else {
      dispatchSelectUnit(null);
      e.stopPropagation();
    }
  });

  window.addEventListener('mousemove', function(e) {
    if (!simState.drag) return;
    var pt = getMousePos(e);

    if (simState.drag.type === 'unit') {
      simState.drag.offsets.forEach(function(o) { o.m.x = pt.x + o.dx; o.m.y = pt.y + o.dy; });
    }
    else if (simState.drag.type === 'model') {
      var rawX = pt.x + simState.drag.offsetX;
      var rawY = pt.y + simState.drag.offsetY;
      var resolved = resolveOverlaps(simState.drag.model, rawX, rawY);
      simState.drag.model.x = resolved.x;
      simState.drag.model.y = resolved.y;
    }
    else if (simState.drag.type === 'rotate') {
      var pivot = simState.drag.pivot;
      var currAngle = Math.atan2(pt.y - pivot.y, pt.x - pivot.x);
      if (simState.drag.startAngle === undefined) {
        simState.drag.startAngle = currAngle;
        simState.drag.origRotations = simState.drag.unit.models.map(function(m){ return m.rotation || 0; });
      }
      var angleDiff = currAngle - simState.drag.startAngle;
      var angleDeg = angleDiff * 180 / Math.PI;
      simState.drag.unit.models.forEach(function(m, i) {
        var orig = simState.drag.origins[i];
        var dx = orig.x - pivot.x; var dy = orig.y - pivot.y;
        m.x = pivot.x + dx * Math.cos(angleDiff) - dy * Math.sin(angleDiff);
        m.y = pivot.y + dx * Math.sin(angleDiff) + dy * Math.cos(angleDiff);
        m.rotation = (simState.drag.origRotations[i] || 0) + angleDeg;
      });
    }
    renderModels();
  });

  window.addEventListener('mouseup', function() {
    if (!simState.drag) return;

    var draggedUnitId = null;
    var draggedModelId = null;
    if (simState.drag.type === 'model' && simState.drag.model) {
      draggedModelId = simState.drag.model.id;
    } else if (simState.drag.unit) {
      draggedUnitId = simState.drag.unit.id;
    } else {
      draggedUnitId = simState.anim.liftUnitId;
      draggedModelId = simState.anim.liftModelId;
    }

    simState.drag = null;
    simState.anim.liftUnitId = null;
    simState.anim.liftModelId = null;
    simState.anim.settleUnitId = draggedUnitId;
    simState.anim.settleModelId = draggedModelId;

    if (draggedUnitId || draggedModelId) {
      simState.anim.settleUntil = Date.now() + simState.anim.settleDuration;
      setTimeout(function() {
        if (Date.now() >= simState.anim.settleUntil) {
          simState.anim.settleUnitId = null;
          simState.anim.settleModelId = null;
          renderModels();
        }
      }, simState.anim.settleDuration + 20);
    }
    renderModels();
  });

  setTimeout(renderModels, 300);
}
