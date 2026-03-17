/**
 * model-renderer.js — SVG model rendering, cohesion, hull paths, overlap resolution.
 *
 * Split from svg-renderer.js for maintainability.
 */

import { COHESION_RANGE, simState, currentUnit, activeRangeTypes, callbacks } from '../state/store.js';

// ── Unit icon type → SVG path data (v23 tokens) ───────
export var ICON_TYPES = {
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

export function getIconType(unitId) {
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

// ── SVG Defs — v0.23 palette ──────────────────────────
export function ensureSVGDefs() {
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

// ── renderModels (core — no afterRender or range circle update) ──
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
    if (typeof callbacks.updateRangeCircles === 'function') callbacks.updateRangeCircles(currentUnit);
  }

  // Post-render callback for phase-specific overlays (e.g. fight highlights)
  if (typeof callbacks.afterRender === 'function') {
    callbacks.afterRender();
  }
}
