/* WH40K Battle UI — Models v0.23
 * Visual update: v1-D/v2-B/v3-A colour palette.
 * Imp glow: #00d4ff (cyan).  Ork glow: #ff4020 (red-orange).
 * Selected glow: #00d4ff bright.
 * Added: SVG unit-type icons inside model tokens (v3-A language).
 */
(function(B){

  // ── State ──────────────────────────────────────────────
  B.simState = { units: [], drag: null, anim: { liftUnitId: null, liftModelId: null, settleUnitId: null, settleModelId: null, settleUntil: 0, settleDuration: 280, raf: null } };
  B.COHESION_RANGE = 2 * B.PX_PER_INCH;

  // ── Unit icon type → SVG path data (normalised 0 0 24 24) ──
  var ICON_TYPES = {
    infantry: function(x, y, s) {
      // + cross
      return '<line x1="'+(x)+'" y1="'+(y-s*0.45)+'" x2="'+(x)+'" y2="'+(y+s*0.45)+'" stroke="currentColor" stroke-width="'+(s*0.18)+'" stroke-linecap="round"/>' +
             '<line x1="'+(x-s*0.45)+'" y1="'+(y)+'" x2="'+(x+s*0.45)+'" y2="'+(y)+'" stroke="currentColor" stroke-width="'+(s*0.18)+'" stroke-linecap="round"/>';
    },
    character: function(x, y, s) {
      // Star (5-point polygon, scaled)
      var pts = [];
      for (var i = 0; i < 10; i++) {
        var r = (i % 2 === 0) ? s * 0.46 : s * 0.20;
        var a = (i * 36 - 90) * Math.PI / 180;
        pts.push((x + Math.cos(a)*r).toFixed(2) + ',' + (y + Math.sin(a)*r).toFixed(2));
      }
      return '<polygon points="' + pts.join(' ') + '" stroke="currentColor" stroke-width="'+(s*0.1)+'" fill="none"/>';
    },
    elite: function(x, y, s) {
      // Diamond
      var h = s * 0.47, w = h * 0.8;
      return '<polygon points="'+x+','+(y-h)+' '+(x+w)+','+y+' '+x+','+(y+h)+' '+(x-w)+','+y+'" stroke="currentColor" stroke-width="'+(s*0.15)+'" fill="none"/>';
    },
    vehicle: function(x, y, s) {
      // Rectangle with horizontal divider
      var hw = s * 0.44, hh = s * 0.3;
      return '<rect x="'+(x-hw)+'" y="'+(y-hh)+'" width="'+(hw*2)+'" height="'+(hh*2)+'" rx="'+(s*0.08)+'" stroke="currentColor" stroke-width="'+(s*0.14)+'" fill="none"/>' +
             '<line x1="'+(x-hw)+'" y1="'+y+'" x2="'+(x+hw)+'" y2="'+y+'" stroke="currentColor" stroke-width="'+(s*0.09)+'"/>';
    }
  };

  // ── Map unit ID → icon type ───────────────────────────
  function getIconType(unitId) {
    var map = {
      'assault-intercessors': 'infantry',
      'intercessor-squad-a':  'infantry',
      'hellblasters':         'elite',
      'primaris-lieutenant':  'character',
      'redemptor-dreadnought':'vehicle',
      'boss-nob':             'character',
      'boyz-mob':             'infantry',
      'mekboy':               'elite'
    };
    return map[unitId] || 'infantry';
  }

  // ── Cohesion ───────────────────────────────────────────
  B.checkCohesion = function(unit) {
    if (unit.models.length <= 1) { unit.broken = false; return false; }
    var broken = false;
    unit.models.forEach(function(m1) {
      var hasFriend = false;
      unit.models.forEach(function(m2) {
        if (m1 === m2) return;
        var dist = Math.hypot(m1.x - m2.x, m1.y - m2.y);
        if (dist - m1.r - m2.r <= B.COHESION_RANGE) hasFriend = true;
      });
      m1.broken = !hasFriend;
      if (!hasFriend) broken = true;
    });
    unit.broken = broken;
    return broken;
  };

  // ── Hull ───────────────────────────────────────────────
  B.getCurvedHullPath = function(models) {
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
    var hullPoints = d3.polygonHull(extents);
    if (!hullPoints) return '';
    var line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));
    return line(hullPoints);
  };

  // ── Overlap resolution ────────────────────────────────
  B.resolveOverlaps = function(draggedModel, proposedX, proposedY) {
    var x = proposedX, y = proposedY;
    for (var iter = 0; iter < 4; iter++) {
      var moved = false;
      B.simState.units.forEach(function(unit) {
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
  };

  // ── Mouse Position (SVG coords) ───────────────────────
  B.getMousePos = function(evt) {
    var svg = document.getElementById('bf-svg');
    var CTM = svg.getScreenCTM();
    if (!CTM || !CTM.a) {
      var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
      var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      return {x: loc.x, y: loc.y};
    }
    return { x: (evt.clientX - CTM.e) / CTM.a, y: (evt.clientY - CTM.f) / CTM.d };
  };

  // ── SVG Defs — v0.23 palette ──────────────────────────
  function ensureSVGDefs() {
    var svg = document.getElementById('bf-svg');
    if (!svg || svg.querySelector('#mg-fill')) return;
    var NS = 'http://www.w3.org/2000/svg';
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = [
      /* Base fill — cooler deep blue-black */
      '<radialGradient id="mg-fill" cx="38%" cy="32%" r="62%">',
        '<stop offset="0%" stop-color="#0a1020"/>',
        '<stop offset="60%" stop-color="#060c14"/>',
        '<stop offset="100%" stop-color="#030609"/>',
      '</radialGradient>',

      /* Imp glow — #00d4ff cyan */
      '<filter id="mf-imp" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
        '<feFlood flood-color="#00d4ff" flood-opacity="0.7" result="col"/>',
        '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
        '<feGaussianBlur in="clipped" stdDeviation="2.2" result="blur"/>',
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',

      /* Ork glow — #ff4020 red-orange */
      '<filter id="mf-ork" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
        '<feFlood flood-color="#ff4020" flood-opacity="0.7" result="col"/>',
        '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
        '<feGaussianBlur in="clipped" stdDeviation="2.2" result="blur"/>',
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',

      /* Selected glow — bright #00d4ff */
      '<filter id="mf-sel" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
        '<feFlood flood-color="#00d4ff" flood-opacity="0.9" result="col"/>',
        '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
        '<feGaussianBlur in="clipped" stdDeviation="2.8" result="blur"/>',
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',

      /* Broken cohesion */
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
  B.renderModels = function() {
    var layerHulls  = document.getElementById('layer-hulls');
    var layerModels = document.getElementById('layer-models');
    if (!layerHulls || !layerModels) return;

    layerHulls.innerHTML  = '';
    layerModels.innerHTML = '';
    var anyBroken = false;

    B.simState.units.forEach(function(unit) {
      B.checkCohesion(unit);
      if (unit.broken) anyBroken = true;

      var isSel = (window.activeUnitId === unit.id);
      var isImp = unit.faction === 'imp';
      var now = Date.now();
      var isLiftedUnit = B.simState.anim && B.simState.anim.liftUnitId === unit.id;
      var isSettlingUnit = B.simState.anim && B.simState.anim.settleUnitId === unit.id && now < B.simState.anim.settleUntil;

      /* ── Hull ── */
      var hullStroke = unit.broken ? '#cc2020' : isSel ? '#00d4ff' : isImp ? '#00d4ff' : '#ff4020';
      var hullOpacity = unit.broken ? 0.9 : isSel ? 0.9 : 0.5;
      var hullFill    = unit.broken ? 'rgba(204,32,32,0.07)' : isSel ? 'rgba(0,212,255,0.1)' : isImp ? 'rgba(0,212,255,0.04)' : 'rgba(255,64,32,0.04)';

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', B.getCurvedHullPath(unit.models));
      path.setAttribute('class', 'unit-hull' + (isSel ? ' selected' : '') + (unit.broken ? ' broken' : '') + (isLiftedUnit ? ' is-lifted' : '') + (isSettlingUnit ? ' is-settling' : ''));
      path.dataset.unitId = unit.id;
      path.style.fill            = hullFill;
      path.style.stroke          = hullStroke;
      path.style.strokeWidth     = isSel ? '2' : '1.5';
      path.style.strokeDasharray = (isSel || unit.broken) ? 'none' : '5 3';
      path.style.strokeOpacity   = String(hullOpacity);
      layerHulls.appendChild(path);

      /* ── Model bases ── */
      var iconType = getIconType(unit.id);
      var glyphColor = unit.broken ? '#cc2020'
                     : isSel       ? '#00d4ff'
                     : isImp       ? '#006688'
                                   : '#882010';

      unit.models.forEach(function(model) {
        var glowFilter, strokeCol, strokeW;
        if (model.broken) {
          glowFilter = 'url(#mf-broken)'; strokeCol = '#cc2020'; strokeW = '1.5';
        } else if (isSel) {
          glowFilter = 'url(#mf-sel)';    strokeCol = '#00d4ff'; strokeW = '1.5';
        } else if (isImp) {
          glowFilter = 'url(#mf-imp)';    strokeCol = '#0088aa'; strokeW = '1.5';
        } else {
          glowFilter = 'url(#mf-ork)';    strokeCol = '#aa2810'; strokeW = '1.5';
        }

        var NS = 'http://www.w3.org/2000/svg';
        var isLiftedModel = B.simState.anim && B.simState.anim.liftModelId === model.id;
        var isSettlingModel = B.simState.anim && B.simState.anim.settleModelId === model.id && now < B.simState.anim.settleUntil;
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

        /* ── v3-A unit icon inside the token ── */
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

    /* Cohesion banner */
    var banner = document.getElementById('cohesion-banner');
    if (banner) banner.style.display = anyBroken ? 'block' : 'none';

    /* Update range circles */
    if (window.activeUnitId && B.activeRangeTypes && B.activeRangeTypes.size > 0) {
      B.updateRangeCirclesFromUnit(window.activeUnitId);
    }
  };

  // ── initModelInteraction ──────────────────────────────
  B.initModelInteraction = function() {
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
      /* Walk up to find .model-base group */
      var baseEl = trg;
      while (baseEl && !baseEl.classList.contains('model-base')) baseEl = baseEl.parentElement;
      var pt = B.getMousePos(e);

      if (baseEl && baseEl.classList.contains('model-base')) {
        var uId  = baseEl.dataset.unitId;
        var mId  = baseEl.dataset.modelId;
        var unit = B.simState.units.find(function(u){ return u.id===uId; });
        if (!unit) return;
        var model = unit.models.find(function(m){ return m.id===mId; });
        if (!model) return;
        if (window.activeUnitId !== uId) B.selectUnit(uId);
        if (e.shiftKey) {
          B.simState.drag = { type:'rotate', pivot:pt, unit:unit, origins:unit.models.map(function(m){ return {x:m.x,y:m.y}; }) };
        } else {
          B.simState.drag = { type:'model', model:model, offsetX:model.x-pt.x, offsetY:model.y-pt.y };
        }
        if (B.simState.drag) {
          if (B.simState.drag.type === 'model') {
            B.simState.anim.liftModelId = model.id;
            B.simState.anim.liftUnitId = null;
          } else {
            B.simState.anim.liftUnitId = unit.id;
            B.simState.anim.liftModelId = null;
          }
          B.simState.anim.settleUnitId = null;
          B.simState.anim.settleModelId = null;
          B.simState.anim.settleUntil = 0;
        }
        e.stopPropagation();
        B.renderModels();
      }
      else if (trg.classList && trg.classList.contains('unit-hull')) {
        var uId2  = trg.dataset.unitId;
        var unit2 = B.simState.units.find(function(u){ return u.id===uId2; });
        if (!unit2) return;
        if (window.activeUnitId !== uId2) B.selectUnit(uId2);
        if (e.shiftKey) {
          B.simState.drag = { type:'rotate', pivot:pt, unit:unit2, origins:unit2.models.map(function(m){ return {x:m.x,y:m.y}; }) };
        } else {
          B.simState.drag = { type:'unit', unit:unit2, offsets:unit2.models.map(function(m){ return {m:m,dx:m.x-pt.x,dy:m.y-pt.y}; }) };
        }
        if (B.simState.drag) {
          B.simState.anim.liftUnitId = unit2.id;
          B.simState.anim.liftModelId = null;
          B.simState.anim.settleUnitId = null;
          B.simState.anim.settleModelId = null;
          B.simState.anim.settleUntil = 0;
        }
        e.stopPropagation();
        B.renderModels();
      } else {
        B.selectUnit(null);
        e.stopPropagation();
      }
    });

    window.addEventListener('mousemove', function(e) {
      if (!B.simState.drag) return;
      var pt = B.getMousePos(e);

      if (B.simState.drag.type === 'unit') {
        B.simState.drag.offsets.forEach(function(o) { o.m.x = pt.x + o.dx; o.m.y = pt.y + o.dy; });
      }
      else if (B.simState.drag.type === 'model') {
        var rawX    = pt.x + B.simState.drag.offsetX;
        var rawY    = pt.y + B.simState.drag.offsetY;
        var resolved = B.resolveOverlaps(B.simState.drag.model, rawX, rawY);
        B.simState.drag.model.x = resolved.x;
        B.simState.drag.model.y = resolved.y;
      }
      else if (B.simState.drag.type === 'rotate') {
        var pivot    = B.simState.drag.pivot;
        var currAngle = Math.atan2(pt.y - pivot.y, pt.x - pivot.x);
        if (B.simState.drag.startAngle === undefined) {
          B.simState.drag.startAngle   = currAngle;
          B.simState.drag.origRotations = B.simState.drag.unit.models.map(function(m){ return m.rotation || 0; });
        }
        var angleDiff = currAngle - B.simState.drag.startAngle;
        var angleDeg  = angleDiff * 180 / Math.PI;
        B.simState.drag.unit.models.forEach(function(m, i) {
          var orig = B.simState.drag.origins[i];
          var dx = orig.x - pivot.x; var dy = orig.y - pivot.y;
          m.x = pivot.x + dx * Math.cos(angleDiff) - dy * Math.sin(angleDiff);
          m.y = pivot.y + dx * Math.sin(angleDiff) + dy * Math.cos(angleDiff);
          m.rotation = (B.simState.drag.origRotations[i] || 0) + angleDeg;
        });
      }
      B.renderModels();
    });

    window.addEventListener('mouseup', function() {
      if (!B.simState.drag) return;

      var draggedUnitId = null;
      var draggedModelId = null;
      if (B.simState.drag.type === 'model' && B.simState.drag.model) {
        draggedModelId = B.simState.drag.model.id;
      } else if (B.simState.drag.unit) {
        draggedUnitId = B.simState.drag.unit.id;
      } else {
        draggedUnitId = B.simState.anim.liftUnitId;
        draggedModelId = B.simState.anim.liftModelId;
      }

      B.simState.drag = null;
      B.simState.anim.liftUnitId = null;
      B.simState.anim.liftModelId = null;
      B.simState.anim.settleUnitId = draggedUnitId;
      B.simState.anim.settleModelId = draggedModelId;

      if (draggedUnitId || draggedModelId) {
        B.simState.anim.settleUntil = Date.now() + B.simState.anim.settleDuration;
        setTimeout(function() {
          if (Date.now() >= B.simState.anim.settleUntil) {
            B.simState.anim.settleUnitId = null;
            B.simState.anim.settleModelId = null;
            B.renderModels();
          }
        }, B.simState.anim.settleDuration + 20);
      }
      B.renderModels();
    });

    setTimeout(B.renderModels, 300);
  };

})(window.BattleUI = window.BattleUI || {});
