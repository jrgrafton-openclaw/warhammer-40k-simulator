/* WH40K Battle UI — Models & Simulation module v1 */
(function(B){

  // ── State ──────────────────────────────────────────────
  B.simState = { units: [], drag: null };
  B.COHESION_RANGE = 2 * B.PX_PER_INCH; // 24px

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
      var steps = 12;
      for (var i = 0; i < steps; i++) {
        var angle = (Math.PI * 2 * i) / steps;
        extents.push([m.x + Math.cos(angle)*r, m.y + Math.sin(angle)*r]);
      }
    });
    if (typeof d3 === 'undefined') return '';
    var hullPoints = d3.polygonHull(extents);
    if (!hullPoints) return '';
    var line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));
    return line(hullPoints);
  };

  // ── Overlap Resolution ────────────────────────────────
  B.resolveOverlaps = function(draggedModel, proposedX, proposedY) {
    var x = proposedX, y = proposedY;
    for (var iter = 0; iter < 4; iter++) {
      var moved = false;
      B.simState.units.forEach(function(unit) {
        unit.models.forEach(function(other) {
          if (other === draggedModel) return;
          var minDist = draggedModel.r + other.r + 1;
          var dx = x - other.x;
          var dy = y - other.y;
          var dist = Math.hypot(dx, dy);
          if (dist < minDist && dist > 0.001) {
            var push = (minDist - dist) / dist;
            x += dx * push;
            y += dy * push;
            moved = true;
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
      var pt = svg.createSVGPoint();
      pt.x = evt.clientX; pt.y = evt.clientY;
      var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      return {x: loc.x, y: loc.y};
    }
    return {
      x: (evt.clientX - CTM.e) / CTM.a,
      y: (evt.clientY - CTM.f) / CTM.d
    };
  };

  // ── SVG Defs injection ────────────────────────────────
  function ensureSVGDefs() {
    var svg = document.getElementById('bf-svg');
    if (!svg || svg.querySelector('#mg-fill')) return; // already injected
    var NS = 'http://www.w3.org/2000/svg';
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = [
      '<radialGradient id="mg-fill" cx="38%" cy="32%" r="62%">',
        '<stop offset="0%" stop-color="#1a1c2e"/>',
        '<stop offset="60%" stop-color="#0d0e18"/>',
        '<stop offset="100%" stop-color="#060508"/>',
      '</radialGradient>',
      '<filter id="mf-imp" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
        '<feFlood flood-color="#2266ee" flood-opacity="0.85" result="col"/>',
        '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
        '<feGaussianBlur in="clipped" stdDeviation="2.2" result="blur"/>',
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',
      '<filter id="mf-ork" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
        '<feFlood flood-color="#cc2222" flood-opacity="0.85" result="col"/>',
        '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
        '<feGaussianBlur in="clipped" stdDeviation="2.2" result="blur"/>',
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',
      '<filter id="mf-sel" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
        '<feFlood flood-color="#00c8a8" flood-opacity="0.9" result="col"/>',
        '<feComposite in="col" in2="SourceGraphic" operator="in" result="clipped"/>',
        '<feGaussianBlur in="clipped" stdDeviation="2.8" result="blur"/>',
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',
      '<filter id="mf-broken" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">',
        '<feFlood flood-color="#ff2222" flood-opacity="0.95" result="col"/>',
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

      var isSel  = (window.activeUnitId === unit.id);
      var isImp  = unit.faction === 'imp';

      // Hull
      var hullStroke = unit.broken ? '#ff3333' : isSel ? '#00c8a8' : isImp ? '#2266ee' : '#cc2222';
      var hullFill   = unit.broken ? 'rgba(255,50,50,0.07)' : isSel ? 'rgba(0,200,168,0.1)' : isImp ? 'rgba(34,102,238,0.06)' : 'rgba(204,34,34,0.06)';

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', B.getCurvedHullPath(unit.models));
      path.setAttribute('class', 'unit-hull' + (isSel ? ' selected' : '') + (unit.broken ? ' broken' : ''));
      path.dataset.unitId = unit.id;
      path.style.fill            = hullFill;
      path.style.stroke          = hullStroke;
      path.style.strokeWidth     = isSel ? '2' : '1.5';
      path.style.strokeDasharray = (isSel || unit.broken) ? 'none' : '5 3';
      path.style.strokeOpacity   = isSel ? '0.85' : '0.55';
      layerHulls.appendChild(path);

      // Model bases
      unit.models.forEach(function(model) {
        var glowFilter, strokeCol, strokeW;
        if (model.broken) {
          glowFilter = 'url(#mf-broken)'; strokeCol = '#ff3333'; strokeW = '1.5';
        } else if (isSel) {
          glowFilter = 'url(#mf-sel)';    strokeCol = '#00c8a8'; strokeW = '1.5';
        } else if (isImp) {
          glowFilter = 'url(#mf-imp)';    strokeCol = '#2266ee'; strokeW = '1.5';
        } else {
          glowFilter = 'url(#mf-ork)';    strokeCol = '#cc2222'; strokeW = '1.5';
        }

        var NS = 'http://www.w3.org/2000/svg';
        var el;
        if (model.shape === 'rect') {
          el = document.createElementNS(NS, 'rect');
          el.setAttribute('x',      model.x - model.w / 2);
          el.setAttribute('y',      model.y - model.h / 2);
          el.setAttribute('width',  model.w);
          el.setAttribute('height', model.h);
          el.setAttribute('rx', '5'); el.setAttribute('ry', '5');
        } else {
          el = document.createElementNS(NS, 'circle');
          el.setAttribute('cx', model.x);
          el.setAttribute('cy', model.y);
          el.setAttribute('r',  model.r);
        }

        el.setAttribute('class', 'model-base' + (model.broken ? ' broken-cohesion' : ''));
        el.dataset.unitId  = unit.id;
        el.dataset.modelId = model.id;
        el.setAttribute('fill',         'url(#mg-fill)');
        el.setAttribute('stroke',       strokeCol);
        el.setAttribute('stroke-width', strokeW);
        el.setAttribute('filter',       glowFilter);

        layerModels.appendChild(el);
      });
    });

    var banner = document.getElementById('cohesion-banner');
    if (banner) banner.style.display = anyBroken ? 'block' : 'none';

    // Update range circles if a unit is selected
    if (window.activeUnitId && B.activeRangeTypes && B.activeRangeTypes.size > 0) {
      B.updateRangeCirclesFromUnit(window.activeUnitId);
    }
  };

  // ── initModelInteraction ──────────────────────────────
  B.initModelInteraction = function() {
    // Inject SVG defs
    ensureSVGDefs();

    // Add cohesion banner if not present
    if (!document.getElementById('cohesion-banner')) {
      var bdiv = document.createElement('div');
      bdiv.id = 'cohesion-banner';
      bdiv.innerHTML = '⚠️ UNIT COHESION BROKEN';
      bdiv.style.cssText = "position:absolute;top:60px;left:50%;transform:translateX(-50%);background:rgba(204,34,34,0.95);color:white;padding:10px 20px;border-radius:4px;font:700 14px/1 'Rajdhani',sans-serif;letter-spacing:2px;z-index:1000;display:none;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.5);border:2px solid #ff4444;";
      var bf = document.getElementById('battlefield');
      if (bf) bf.appendChild(bdiv);
    }

    var svg = document.getElementById('bf-svg');
    if (!svg) return;

    svg.addEventListener('mousedown', function(e) {
      var trg = e.target;
      var pt = B.getMousePos(e);

      if (trg.classList && trg.classList.contains('model-base')) {
        var uId = trg.dataset.unitId;
        var mId = trg.dataset.modelId;
        var unit = B.simState.units.find(function(u){ return u.id===uId; });
        if (!unit) return;
        var model = unit.models.find(function(m){ return m.id===mId; });
        if (!model) return;
        if (window.activeUnitId !== uId) B.selectUnit(uId);
        B.simState.drag = { type:'model', model:model, offsetX:model.x-pt.x, offsetY:model.y-pt.y };
        e.stopPropagation();
        B.renderModels();
      }
      else if (trg.classList && trg.classList.contains('unit-hull')) {
        var uId2 = trg.dataset.unitId;
        var unit2 = B.simState.units.find(function(u){ return u.id===uId2; });
        if (!unit2) return;
        if (window.activeUnitId !== uId2) B.selectUnit(uId2);
        if (e.shiftKey) {
          B.simState.drag = { type:'rotate', pivot:pt, unit:unit2, origins:unit2.models.map(function(m){ return {x:m.x,y:m.y}; }) };
        } else {
          B.simState.drag = { type:'unit', unit:unit2, offsets:unit2.models.map(function(m){ return {m:m,dx:m.x-pt.x,dy:m.y-pt.y}; }) };
        }
        e.stopPropagation();
        B.renderModels();
      } else {
        // Clicked empty ground — deselect
        B.selectUnit(null);
        e.stopPropagation();
      }
    });

    window.addEventListener('mousemove', function(e) {
      if (!B.simState.drag) return;
      var pt = B.getMousePos(e);

      if (B.simState.drag.type === 'unit') {
        B.simState.drag.offsets.forEach(function(o) {
          o.m.x = pt.x + o.dx;
          o.m.y = pt.y + o.dy;
        });
      }
      else if (B.simState.drag.type === 'model') {
        var rawX = pt.x + B.simState.drag.offsetX;
        var rawY = pt.y + B.simState.drag.offsetY;
        var resolved = B.resolveOverlaps(B.simState.drag.model, rawX, rawY);
        B.simState.drag.model.x = resolved.x;
        B.simState.drag.model.y = resolved.y;
      }
      else if (B.simState.drag.type === 'rotate') {
        var pivot = B.simState.drag.pivot;
        var currentAngle = Math.atan2(pt.y - pivot.y, pt.x - pivot.x);
        if (B.simState.drag.startAngle === undefined) B.simState.drag.startAngle = currentAngle;
        var angleDiff = currentAngle - B.simState.drag.startAngle;
        B.simState.drag.unit.models.forEach(function(m, i) {
          var orig = B.simState.drag.origins[i];
          var dx = orig.x - pivot.x;
          var dy = orig.y - pivot.y;
          m.x = pivot.x + dx * Math.cos(angleDiff) - dy * Math.sin(angleDiff);
          m.y = pivot.y + dx * Math.sin(angleDiff) + dy * Math.cos(angleDiff);
        });
      }
      B.renderModels();
    });

    window.addEventListener('mouseup', function() {
      if (B.simState.drag) {
        B.simState.drag = null;
        B.renderModels();
      }
    });

    // Initial render
    setTimeout(B.renderModels, 300);
  };

})(window.BattleUI = window.BattleUI || {});
