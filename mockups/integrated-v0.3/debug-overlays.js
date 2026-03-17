/**
 * debug-overlays.js — Visual debug overlays for the integrated prototype.
 * Collision grid, ruin footprints, models-in-ruins highlight, LoS enhancement,
 * move validation overlay.
 */

import { callbacks } from '../shared/state/store.js';

// ── State ────────────────────────────────────────────────
var _collisionGridVisible = false;
var _ruinFootprintsVisible = false;
var _modelsInRuinsVisible = false;

// ── Collision Grid ───────────────────────────────────────
export function toggleCollisionGrid() {
  _collisionGridVisible = !_collisionGridVisible;
  var layer = document.getElementById('layer-debug-grid');
  if (!layer) return;
  if (!_collisionGridVisible) { layer.innerHTML = ''; return; }

  var aabbs = window._terrainAABBs || [];
  var NS = 'http://www.w3.org/2000/svg';
  layer.innerHTML = '';

  aabbs.forEach(function(box) {
    var corners = [
      { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }
    ];
    var det = box.iA * box.iD - box.iB * box.iC;
    if (Math.abs(det) < 0.001) return;
    var fA =  box.iD / det, fB = -box.iB / det;
    var fC = -box.iC / det, fD =  box.iA / det;
    var fE = (box.iC * box.iF - box.iD * box.iE) / det;
    var fF = (box.iB * box.iE - box.iA * box.iF) / det;

    var svgCorners = corners.map(function(c) {
      return { x: fA * c.x + fC * c.y + fE, y: fB * c.x + fD * c.y + fF };
    });
    var pts = svgCorners.map(function(c) { return c.x + ',' + c.y; }).join(' ');
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'rgba(255,200,60,0.08)');
    poly.setAttribute('stroke', 'rgba(255,200,60,0.35)');
    poly.setAttribute('stroke-width', '1');
    poly.setAttribute('pointer-events', 'none');
    layer.appendChild(poly);
  });
}

// ── Ruin Footprints ──────────────────────────────────────
export function toggleRuinFootprints() {
  _ruinFootprintsVisible = !_ruinFootprintsVisible;
  var layer = document.getElementById('layer-debug-grid');
  if (!layer) return;
  layer.querySelectorAll('.debug-ruin-footprint').forEach(function(el) { el.remove(); });
  if (!_ruinFootprintsVisible) return;

  var NS = 'http://www.w3.org/2000/svg';
  var blockers = window._losBlockers || [];
  blockers.forEach(function(b) {
    if (b.kind !== 'tall-ruin') return;
    var svgPts = b.polygon.map(function(p) {
      return { x: b.fA * p.x + b.fC * p.y + b.fE, y: b.fB * p.x + b.fD * p.y + b.fF };
    });
    var pts = svgPts.map(function(c) { return c.x + ',' + c.y; }).join(' ');
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('class', 'debug-ruin-footprint');
    layer.appendChild(poly);
  });
}

// ── Models in Ruins ──────────────────────────────────────
export function toggleModelsInRuins() {
  _modelsInRuinsVisible = !_modelsInRuinsVisible;
  document.querySelectorAll('#layer-models .model-base.debug-in-ruin').forEach(function(el) {
    el.classList.remove('debug-in-ruin');
  });
  if (!_modelsInRuinsVisible) return;
  applyModelsInRuinsHighlight();
}

function _pointInPoly(px, py, poly) {
  var inside = false;
  for (var j = 0, k = poly.length - 1; j < poly.length; k = j++) {
    var xi = poly[j].x, yi = poly[j].y;
    var xk = poly[k].x, yk = poly[k].y;
    if (((yi > py) !== (yk > py)) && (px < (xk - xi) * (py - yi) / (yk - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function applyModelsInRuinsHighlight() {
  if (!_modelsInRuinsVisible) return;
  var blockers = window._losBlockers || [];
  if (!blockers.length) return;

  document.querySelectorAll('#layer-models .model-base').forEach(function(g) {
    var mx = 0, my = 0;
    var circle = g.querySelector('circle');
    var rect = g.querySelector('rect');
    if (circle) {
      mx = parseFloat(circle.getAttribute('cx'));
      my = parseFloat(circle.getAttribute('cy'));
    } else if (rect) {
      mx = parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width')) / 2;
      my = parseFloat(rect.getAttribute('y')) + parseFloat(rect.getAttribute('height')) / 2;
    }
    var inside = false;
    for (var i = 0; i < blockers.length; i++) {
      var b = blockers[i];
      var lx = b.iA * mx + b.iC * my + b.iE;
      var ly = b.iB * mx + b.iD * my + b.iF;
      if (_pointInPoly(lx, ly, b.polygon)) { inside = true; break; }
    }
    g.classList.toggle('debug-in-ruin', inside);
  });
}

// ── Move Validation Overlay ──────────────────────────────
var _moveValTimer = null;

export function startMoveValidationLoop() {
  if (_moveValTimer) return;
  _moveValTimer = setInterval(_renderMoveValidation, 200);
}

export function stopMoveValidationLoop() {
  if (_moveValTimer) { clearInterval(_moveValTimer); _moveValTimer = null; }
  var svg = document.getElementById('bf-svg');
  if (svg) svg.querySelectorAll('.dbg-move-label').forEach(function(el) { el.remove(); });
  var panel = document.getElementById('dbg-move-info');
  if (panel) panel.remove();
}

function _renderMoveValidation() {
  if (!window.__debugMoveValidation) return;
  import('../phases/move/v0.23/movement.js').then(function(mod) {
    if (!mod.debugMoveValidation) return;
    import('../shared/state/store.js').then(function(storeModule) {
      var uid = storeModule.currentUnit;
      if (!uid) { _clearMoveOverlayLabels(); return; }
      var result = mod.debugMoveValidation(uid);
      if (!result || !result.models) { _clearMoveOverlayLabels(); return; }

      var NS = 'http://www.w3.org/2000/svg';
      var svg = document.getElementById('bf-svg');
      if (!svg) return;
      svg.querySelectorAll('.dbg-move-label').forEach(function(el) { el.remove(); });

      result.models.forEach(function(m) {
        var g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'dbg-move-label');
        var hasIssues = m.issues.length > 0;
        var color = hasIssues ? '#ff4020' : '#00ff88';

        var bg = document.createElementNS(NS, 'rect');
        bg.setAttribute('x', m.x - 30); bg.setAttribute('y', m.y + 14);
        bg.setAttribute('width', '60');
        bg.setAttribute('height', hasIssues ? String(12 + m.issues.length * 10) : '14');
        bg.setAttribute('rx', '3');
        bg.setAttribute('fill', 'rgba(0,0,0,0.85)');
        bg.setAttribute('stroke', color); bg.setAttribute('stroke-width', '0.5');
        g.appendChild(bg);

        if (hasIssues) {
          m.issues.forEach(function(issue, idx) {
            var t = document.createElementNS(NS, 'text');
            t.setAttribute('x', m.x); t.setAttribute('y', m.y + 24 + idx * 10);
            t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', color);
            t.setAttribute('font-size', '7'); t.setAttribute('font-family', 'monospace');
            t.setAttribute('pointer-events', 'none');
            t.textContent = issue;
            g.appendChild(t);
          });
        } else {
          var t = document.createElementNS(NS, 'text');
          t.setAttribute('x', m.x); t.setAttribute('y', m.y + 24);
          t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', color);
          t.setAttribute('font-size', '8'); t.setAttribute('font-family', 'monospace');
          t.setAttribute('pointer-events', 'none');
          t.textContent = '✓ OK';
          g.appendChild(t);
        }
        svg.appendChild(g);
      });
      _updateMoveInfoPanel(result);
    });
  });
}

function _clearMoveOverlayLabels() {
  var svg = document.getElementById('bf-svg');
  if (svg) svg.querySelectorAll('.dbg-move-label').forEach(function(el) { el.remove(); });
  var panel = document.getElementById('dbg-move-info');
  if (panel) panel.remove();
}

function _updateMoveInfoPanel(result) {
  var existing = document.getElementById('dbg-move-info');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'dbg-move-info';
    existing.style.cssText = 'position:fixed;bottom:52px;left:228px;z-index:900;background:rgba(16,20,26,0.95);border:1px solid rgba(138,170,255,0.3);border-radius:6px;padding:6px 10px;font:10px/1.4 monospace;color:#aac;max-width:350px;pointer-events:none;';
    document.body.appendChild(existing);
  }
  var lines = [
    'Mode: ' + (result.mode || 'none') + ' | Range: ' + result.rangeIn + '" | PathCost: ' + (result.usePathCost ? 'YES' : 'no'),
    'Legal: ' + (result.legal ? '✓' : '✗') + (result.broken ? ' | COHESION BROKEN' : '')
  ];
  result.models.forEach(function(m) {
    var status = m.issues.length ? '✗ ' + m.issues.join(', ') : '✓ OK';
    lines.push(m.id + ': ' + m.straightDistIn + '" ' + status);
  });
  existing.innerHTML = lines.join('<br>');
}
