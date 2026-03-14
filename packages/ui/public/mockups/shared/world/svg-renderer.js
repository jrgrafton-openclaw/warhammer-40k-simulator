/* svg-renderer.js — Board pan/zoom, model rendering, model interaction (ES module)
 * Merges battle-board.js + battle-models-v23.js (v23 is the sole model renderer).
 */

import { PX_PER_INCH, COHESION_RANGE, simState, activeRangeTypes,
         currentUnit, setCurrentUnit, callbacks } from '../state/store.js';
import { UNITS, buildCard, initAllTooltips, showTip, hideTip } from '../state/units.js';
import { TERRAIN_RULES } from '../state/terrain-data.js';

// ── Pan / Zoom state (module-scoped) ───────────────────
var scale = 0.5;
var tx = 0;
var ty = 0;

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

// ── Apply Transform ────────────────────────────────────
export function applyTx() {
  var inner = document.getElementById('battlefield-inner');
  if (inner) inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
}

// ── Camera access ──────────────────────────────────────
export function getCamera() { return { scale: scale, tx: tx, ty: ty }; }

export function resetCamera(initialScale) {
  scale = initialScale !== undefined ? initialScale : 0.5;
  tx = 0; ty = 0;
  applyTx();
}

// ── initBoard — pan / zoom ─────────────────────────────
export function initBoard(opts) {
  opts = opts || {};
  var initialScale = opts.initialScale !== undefined ? opts.initialScale : 0.5;
  scale = initialScale;
  tx = 0; ty = 0;

  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner || !bf) return;

  applyTx();

  var isDragging = false, startX, startY;
  var zoomEaseTimer = null;
  var zoomSettleTimer = null;
  var RC_IDS = ['range-move','range-advance','range-charge','range-ds','range-move-label','range-advance-label','range-charge-label','range-ds-label'];

  function hideRangeCircles() {
    RC_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.opacity = '0';
    });
  }
  function showRangeCirclesNow() {
    if (!currentUnit || activeRangeTypes.size === 0) return;
    updateRangeCirclesFromUnit(currentUnit);
  }

  bf.addEventListener('wheel', function(e) {
    e.preventDefault();
    if (activeRangeTypes.size > 0) hideRangeCircles();
    inner.classList.add('zoom-easing');
    clearTimeout(zoomEaseTimer);
    zoomEaseTimer = setTimeout(function(){ inner.classList.remove('zoom-easing'); }, 220);
    scale = Math.min(3, Math.max(.35, scale * (e.deltaY>0 ? .9 : 1.1)));
    applyTx();
    clearTimeout(zoomSettleTimer);
    zoomSettleTimer = setTimeout(showRangeCirclesNow, 220);
  }, {passive:false});

  bf.addEventListener('mousedown', function(e) {
    if (e.target.closest('.token,.obj-hex-wrap,#unit-card,#vp-bar,#phase-header,#action-bar,#bf-svg')) return;
    isDragging = true;
    startX = e.clientX - tx;
    startY = e.clientY - ty;
    inner.classList.add('dragging');
    inner.classList.remove('zoom-easing');
  });

  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    applyTx();
    if (currentUnit && activeRangeTypes.size > 0) updateRangeCirclesFromUnit(currentUnit);
  });

  document.addEventListener('mouseup', function() {
    if (!isDragging) return;
    isDragging = false;
    inner.classList.remove('dragging');
    if (currentUnit && activeRangeTypes.size > 0) updateRangeCirclesFromUnit(currentUnit);
  });

  var resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      scale=initialScale; tx=0; ty=0; applyTx();
      if (currentUnit && activeRangeTypes.size > 0) {
        setTimeout(function(){ updateRangeCirclesFromUnit(currentUnit); }, 50);
      }
    });
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
    clearRangeCircles();
    renderModels();
  }
}

// Dispatches to the potentially-wrapped selectUnit (shooting.js may wrap it)
function dispatchSelectUnit(uid) {
  var fn = callbacks.selectUnit || selectUnit;
  fn(uid);
}

// ── initBattleControls ─────────────────────────────────
export function initBattleControls() {
  // Rail unit clicks
  document.querySelectorAll('.rail-unit').forEach(function(r) {
    r.addEventListener('click', function() { dispatchSelectUnit(r.dataset.unit); });
  });

  // Card close
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

  // Range toggles
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

  // Roster collapse
  var rosterBtn = document.getElementById('roster-btn');
  if (rosterBtn) {
    rosterBtn.addEventListener('click', function() {
      var app = document.getElementById('app');
      if (app) app.classList.toggle('collapsed');
    });
  }

  // Action buttons
  var btnMove    = document.getElementById('btn-move');
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

  // Stratagem modal
  var modalBg   = document.getElementById('modal-bg');
  var btnStrat  = document.getElementById('btn-strat');
  var modalClose = document.getElementById('modal-close');
  if (btnStrat && modalBg)   btnStrat.addEventListener('click', function(){ modalBg.classList.add('open'); });
  if (modalClose && modalBg) modalClose.addEventListener('click', function(){ modalBg.classList.remove('open'); });
  if (modalBg) modalBg.addEventListener('click', function(e){ if(e.target===modalBg) modalBg.classList.remove('open'); });

  // Keyboard shortcuts
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

  // Expose selectUnit globally (for inline onclick handlers in HTML)
  window.selectUnit = function(uid) { dispatchSelectUnit(uid); };

  // Terrain tip helper
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

  // Faction toggles (global helpers referenced by inline HTML)
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

// ── Unit icon type → SVG path data (v23 tokens) ───────
var ICON_TYPES = {
  infantry: function(x, y, s) {
    return '<line x1="'+(x)+'" y1="'+(y-s*0.45)+'" x2="'+(x)+'" y2="'+(y+s*0.45)+'" stroke="currentColor" stroke-width="'+(s*0.18)+'" stroke-linecap="round"/>' +
           '<line x1="'+(x-s*0.45)+'" y1="'+(y)+'" x2="'+(x+s*0.45)+'" y2="'+(y)+'" stroke="currentColor" stroke-width="'+(s*0.18)+'" stroke-linecap="round"/>';
  },
  character: function(x, y, s) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var r = (i % 2 === 0) ? s * 0.46 : s * 0.20;
      var a = (i * 36 - 90) * Math.PI / 180;
      pts.push((x + Math.cos(a)*r).toFixed(2) + ',' + (y + Math.sin(a)*r).toFixed(2));
    }
    return '<polygon points="' + pts.join(' ') + '" stroke="currentColor" stroke-width="'+(s*0.1)+'" fill="none"/>';
  },
  elite: function(x, y, s) {
    var h = s * 0.47, w = h * 0.8;
    return '<polygon points="'+x+','+(y-h)+' '+(x+w)+','+y+' '+x+','+(y+h)+' '+(x-w)+','+y+'" stroke="currentColor" stroke-width="'+(s*0.15)+'" fill="none"/>';
  },
  vehicle: function(x, y, s) {
    var hw = s * 0.44, hh = s * 0.3;
    return '<rect x="'+(x-hw)+'" y="'+(y-hh)+'" width="'+(hw*2)+'" height="'+(hh*2)+'" rx="'+(s*0.08)+'" stroke="currentColor" stroke-width="'+(s*0.14)+'" fill="none"/>' +
           '<line x1="'+(x-hw)+'" y1="'+y+'" x2="'+(x+hw)+'" y2="'+y+'" stroke="currentColor" stroke-width="'+(s*0.09)+'"/>';
  }
};

function getIconType(unitId) {
  var map = {
    'assault-intercessors': 'infantry',
    'intercessor-squad-a':  'infantry',
    'hellblasters':         'elite',
    'primaris-lieutenant':  'character',
    'redemptor-dreadnought':'vehicle',
    'boss-nob':             'character',
    'boyz-mob':             'infantry',
    'mekboy':               'elite',
    'nobz-mob':             'elite'
  };
  return map[unitId] || 'infantry';
}

// ── Cohesion ───────────────────────────────────────────
export function checkCohesion(unit) {
  if (unit.models.length <= 1) { unit.broken = false; return false; }
  var broken = false;
  unit.models.forEach(function(m1) {
    var hasFriend = false;
    unit.models.forEach(function(m2) {
      if (m1 === m2) return;
      var dist = Math.hypot(m1.x - m2.x, m1.y - m2.y);
      if (dist - m1.r - m2.r <= COHESION_RANGE) hasFriend = true;
    });
    m1.broken = !hasFriend;
    if (!hasFriend) broken = true;
  });
  unit.broken = broken;
  return broken;
}

// ── Hull path ──────────────────────────────────────────
export function getCurvedHullPath(models) {
  if (models.length === 0) return '';
  if (models.length === 1) {
    var m = models[0];
    var r = m.r + 6;
    return 'M ' + m.x + ' ' + (m.y - r) + ' A ' + r + ' ' + r + ' 0 1 1 ' + m.x + ' ' + (m.y + r) + ' A ' + r + ' ' + r + ' 0 1 1 ' + m.x + ' ' + (m.y - r);
  }
  if (models.length === 2) {
    var m1 = models[0]; var m2 = models[1];
    var rr = m1.r + 6;
    var dx = m2.x - m1.x; var dy = m2.y - m1.y;
    var len = Math.hypot(dx, dy);
    if (len === 0) return '';
    var nx = dx/len; var ny = dy/len;
    var px = -ny * rr; var py = nx * rr;
    return 'M ' + (m1.x+px) + ',' + (m1.y+py) + ' L ' + (m2.x+px) + ',' + (m2.y+py) + ' A ' + rr + ' ' + rr + ' 0 0 1 ' + (m2.x-px) + ',' + (m2.y-py) + ' L ' + (m1.x-px) + ',' + (m1.y-py) + ' A ' + rr + ' ' + rr + ' 0 0 1 ' + (m1.x+px) + ',' + (m1.y+py);
  }
  var extents = [];
  models.forEach(function(m) {
    var r = m.r + 6;
    for (var i = 0; i < 12; i++) {
      var angle = (Math.PI * 2 * i) / 12;
      extents.push([m.x + Math.cos(angle)*r, m.y + Math.sin(angle)*r]);
    }
  });
  if (typeof d3 === 'undefined') return '';
  var hullPoints = window.d3.polygonHull(extents);
  if (!hullPoints) return '';
  var line = window.d3.line().curve(window.d3.curveCatmullRomClosed.alpha(0.5));
  return line(hullPoints);
}

// ── Overlap resolution ────────────────────────────────
export function resolveOverlaps(draggedModel, proposedX, proposedY) {
  var x = proposedX, y = proposedY;
  for (var iter = 0; iter < 4; iter++) {
    var moved = false;
    simState.units.forEach(function(unit) {
      unit.models.forEach(function(other) {
        if (other === draggedModel) return;
        var minDist = draggedModel.r + other.r + 1;
        var dx = x - other.x; var dy = y - other.y;
        var dist = Math.hypot(dx, dy);
        if (dist < minDist && dist > 0.001) {
          var push = (minDist - dist) / dist;
          x += dx * push; y += dy * push; moved = true;
        }
      });
    });
    if (!moved) break;
  }
  return { x: x, y: y };
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

// ── SVG Defs — v0.23 palette ──────────────────────────
function ensureSVGDefs() {
  var svg = document.getElementById('bf-svg');
  if (!svg || svg.querySelector('#mg-fill')) return;
  var NS = 'http://www.w3.org/2000/svg';
  var defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = [
    '<radialGradient id="mg-fill" cx="38%" cy="32%" r="62%">',
      '<stop offset="0%" stop-color="#0a1020"/>',
      '<stop offset="60%" stop-color="#060c14"/>',
      '<stop offset="100%" stop-color="#030609"/>',
    '</radialGradient>',
    '<filter id="mf-imp" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
      '<feFlood flood-color="#00d4ff" flood-opacity="0.7" result="col"/>',
      '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
      '<feGaussianBlur in="clipped" stdDeviation="2.2" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '<filter id="mf-ork" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
      '<feFlood flood-color="#ff4020" flood-opacity="0.7" result="col"/>',
      '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
      '<feGaussianBlur in="clipped" stdDeviation="2.2" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '<filter id="mf-sel" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
      '<feFlood flood-color="#00d4ff" flood-opacity="0.9" result="col"/>',
      '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
      '<feGaussianBlur in="clipped" stdDeviation="2.8" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '<filter id="mf-broken" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
      '<feFlood flood-color="#cc2020" flood-opacity="0.95" result="col"/>',
      '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
      '<feGaussianBlur in="clipped" stdDeviation="3" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
  ].join('');
  svg.insertBefore(defs, svg.firstChild);
}

// ── renderModels ──────────────────────────────────────
export function renderModels() {
  var layerHulls  = document.getElementById('layer-hulls');
  var layerModels = document.getElementById('layer-models');
  if (!layerHulls || !layerModels) return;

  layerHulls.innerHTML  = '';
  layerModels.innerHTML = '';
  var anyBroken = false;

  simState.units.forEach(function(unit) {
    checkCohesion(unit);
    if (unit.broken) anyBroken = true;

    var isSel   = (currentUnit === unit.id);
    var isImp   = unit.faction === 'imp';
    var isSpent = !!(window.__spentUnitIds && window.__spentUnitIds.has && window.__spentUnitIds.has(unit.id));
    var isMoved = !!(window.__movedUnitIds && window.__movedUnitIds.has && window.__movedUnitIds.has(unit.id));
    var isUsed  = isSpent || isMoved;
    var now = Date.now();
    var isLiftedUnit   = simState.anim && simState.anim.liftUnitId === unit.id;
    var isSettlingUnit = simState.anim && simState.anim.settleUnitId === unit.id && now < simState.anim.settleUntil;

    var hullStroke = unit.broken
      ? '#cc2020'
      : isUsed
        ? '#8a98ab'
        : isSel ? (isImp ? '#00d4ff' : '#ff4020') : isImp ? '#00d4ff' : '#ff4020';
    var hullOpacity = unit.broken ? 0.9 : isUsed ? 0.72 : isSel ? 0.9 : 0.5;
    var hullFill    = unit.broken
      ? 'rgba(204,32,32,0.07)'
      : isUsed
        ? 'rgba(138,152,171,0.08)'
        : isSel ? (isImp ? 'rgba(0,212,255,0.1)' : 'rgba(255,64,32,0.1)') : isImp ? 'rgba(0,212,255,0.04)' : 'rgba(255,64,32,0.04)';

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', getCurvedHullPath(unit.models));
    path.setAttribute('class', 'unit-hull' + (isSel ? ' selected' : '') + (unit.broken ? ' broken' : '') + (isLiftedUnit ? ' is-lifted' : '') + (isSettlingUnit ? ' is-settling' : ''));
    path.dataset.unitId = unit.id;
    path.style.fill            = hullFill;
    path.style.stroke          = hullStroke;
    path.style.strokeWidth     = isSel ? '2' : (isUsed ? '1.75' : '1.5');
    path.style.strokeDasharray = (isSel || unit.broken) ? 'none' : (isUsed ? '8 5' : '5 3');
    path.style.strokeOpacity   = String(hullOpacity);
    layerHulls.appendChild(path);

    var iconType = getIconType(unit.id);
    var glyphColor = unit.broken ? '#cc2020'
                   : isUsed      ? '#8a98ab'
                   : isSel       ? (isImp ? '#00d4ff' : '#ff4020')
                   : isImp       ? '#006688'
                                 : '#882010';

    unit.models.forEach(function(model) {
      var glowFilter, strokeCol, strokeW;
      if (model.broken) {
        glowFilter = 'url(#mf-broken)'; strokeCol = '#cc2020'; strokeW = '1.5';
      } else if (isUsed) {
        glowFilter = 'url(#mf-imp)'; strokeCol = '#6f7f93'; strokeW = '1.25';
      } else if (isSel) {
        glowFilter = isImp ? 'url(#mf-sel)' : 'url(#mf-ork)';
        strokeCol = isImp ? '#00d4ff' : '#ff4020';
        strokeW = '1.5';
      } else if (isImp) {
        glowFilter = 'url(#mf-imp)';    strokeCol = '#0088aa'; strokeW = '1.5';
      } else {
        glowFilter = 'url(#mf-ork)';    strokeCol = '#aa2810'; strokeW = '1.5';
      }

      var NS = 'http://www.w3.org/2000/svg';
      var isLiftedModel = simState.anim && simState.anim.liftModelId === model.id;
      var isSettlingModel = simState.anim && simState.anim.settleModelId === model.id && now < simState.anim.settleUntil;
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'model-base' + (model.broken ? ' broken-cohesion' : '') + ((isLiftedUnit || isLiftedModel) ? ' is-lifted' : '') + ((isSettlingUnit || isSettlingModel) ? ' is-settling' : ''));
      g.dataset.unitId  = unit.id;
      g.dataset.modelId = model.id;

      var el;
      if (model.shape === 'rect') {
        el = document.createElementNS(NS, 'rect');
        el.setAttribute('x',      model.x - model.w / 2);
        el.setAttribute('y',      model.y - model.h / 2);
        el.setAttribute('width',  model.w);
        el.setAttribute('height', model.h);
        el.setAttribute('rx', '4'); el.setAttribute('ry', '4');
        if (model.rotation) {
          el.setAttribute('transform', 'rotate(' + model.rotation + ',' + model.x + ',' + model.y + ')');
        }
      } else {
        el = document.createElementNS(NS, 'circle');
        el.setAttribute('cx', model.x);
        el.setAttribute('cy', model.y);
        el.setAttribute('r',  model.r);
      }
      el.setAttribute('fill',         'url(#mg-fill)');
      el.setAttribute('stroke',       strokeCol);
      el.setAttribute('stroke-width', strokeW);
      el.setAttribute('filter',       glowFilter);
      g.appendChild(el);

      var iconSize = model.shape === 'rect'
        ? Math.min(model.w, model.h) * 0.55
        : model.r * 0.85;
      var iconFn = ICON_TYPES[iconType];
      if (iconFn) {
        var iconHTML = iconFn(model.x, model.y, iconSize);
        var iconG = document.createElementNS(NS, 'g');
        iconG.setAttribute('color', glyphColor);
        iconG.setAttribute('fill',  'none');
        iconG.setAttribute('pointer-events', 'none');
        iconG.innerHTML = iconHTML;
        g.appendChild(iconG);
      }

      layerModels.appendChild(g);
    });
  });

  var banner = document.getElementById('cohesion-banner');
  if (banner) banner.style.display = anyBroken ? 'block' : 'none';

  if (currentUnit && activeRangeTypes.size > 0) {
    updateRangeCirclesFromUnit(currentUnit);
  }

  // Post-render callback for phase-specific overlays (e.g. fight highlights)
  if (typeof callbacks.afterRender === 'function') {
    callbacks.afterRender();
  }
}

// ── initModelInteraction ──────────────────────────────
export function initModelInteraction() {
  ensureSVGDefs();

  if (!document.getElementById('cohesion-banner')) {
    var bdiv = document.createElement('div');
    bdiv.id = 'cohesion-banner';
    bdiv.innerHTML = '⚠ UNIT COHESION BROKEN';
    bdiv.style.cssText = "position:absolute;top:60px;left:50%;transform:translateX(-50%);background:rgba(204,32,32,.96);color:#fff;padding:8px 20px;font:700 11px/1 'Rajdhani',sans-serif;letter-spacing:2px;z-index:1000;display:none;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.5);border:2px solid #ff4040;";
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
      var uId  = baseEl.dataset.unitId;
      var mId  = baseEl.dataset.modelId;
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
      var uId2  = trg.dataset.unitId;
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
      var rawX    = pt.x + simState.drag.offsetX;
      var rawY    = pt.y + simState.drag.offsetY;
      var resolved = resolveOverlaps(simState.drag.model, rawX, rawY);
      simState.drag.model.x = resolved.x;
      simState.drag.model.y = resolved.y;
    }
    else if (simState.drag.type === 'rotate') {
      var pivot    = simState.drag.pivot;
      var currAngle = Math.atan2(pt.y - pivot.y, pt.x - pivot.x);
      if (simState.drag.startAngle === undefined) {
        simState.drag.startAngle   = currAngle;
        simState.drag.origRotations = simState.drag.unit.models.map(function(m){ return m.rotation || 0; });
      }
      var angleDiff = currAngle - simState.drag.startAngle;
      var angleDeg  = angleDiff * 180 / Math.PI;
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
