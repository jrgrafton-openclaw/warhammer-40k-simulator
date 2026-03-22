/* terrain.js — Terrain rendering (ES module) */

import { mapData, TERRAIN_RULES } from '../state/terrain-data.js';

export function svgTransformWithOrigin(ox, oy, t) {
  return 'translate(' + ox + ',' + oy + ') ' + t + ' translate(' + (-ox) + ',' + (-oy) + ')';
}

/* Helper: parse bounding box from an SVG path d attribute (M/L commands only) */
function pathBounds(d) {
  var nums = d.match(/-?[\d.]+/g);
  if (!nums || nums.length < 2) return null;
  var xs = [], ys = [];
  for (var i = 0; i < nums.length; i += 2) {
    xs.push(parseFloat(nums[i]));
    ys.push(parseFloat(nums[i + 1]));
  }
  return {
    x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
    w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
    h: Math.max.apply(null, ys) - Math.min.apply(null, ys)
  };
}

/* Ensure terrain SVG has ground-patch radial gradient def */
function ensureTerrainDefs(layer) {
  var svg = layer.closest('svg') || layer.ownerSVGElement;
  if (!svg || svg.querySelector('#terrain-ground-grad')) return;
  var NS = 'http://www.w3.org/2000/svg';
  var defs = svg.querySelector('defs') || document.createElementNS(NS, 'defs');
  defs.innerHTML += '<radialGradient id="terrain-ground-grad" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="rgba(40,35,25,0.4)"/>' +
    '<stop offset="100%" stop-color="rgba(40,35,25,0)"/>' +
    '</radialGradient>';
  if (!defs.parentNode) svg.insertBefore(defs, svg.firstChild);
}

/* ── Improvement 4: Inject radial gradient into each objective SVG ── */
export function enhanceObjectives() {
  var objs = document.querySelectorAll('.obj-svg');
  objs.forEach(function(svg) {
    if (svg.querySelector('#obj-glow')) return;
    var NS = 'http://www.w3.org/2000/svg';
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<radialGradient id="obj-glow" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="rgba(74,96,128,0.15)"/>' +
      '<stop offset="100%" stop-color="rgba(8,12,16,0.92)"/>' +
      '</radialGradient>';
    svg.insertBefore(defs, svg.firstChild);
  });
}

export function renderTerrain() {
  var NS = 'http://www.w3.org/2000/svg';
  var layer = document.getElementById('terrain-layer');
  if (!layer) return;

  /* Inject radial gradient def for ground patches */
  ensureTerrainDefs(layer);

  mapData.terrain.forEach(function(piece) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('opacity', '0.92');
    g.setAttribute('transform', svgTransformWithOrigin(piece.origin[0], piece.origin[1], piece.transform));
    g.style.pointerEvents = 'all';
    g.style.cursor = 'default';

    /* ── Improvement 3: Ground texture patch beneath terrain ── */
    var bounds = pathBounds(piece.paths[0].d);
    if (bounds) {
      var pad = 10; /* SVG units of ground bleed */
      var groundRect = document.createElementNS(NS, 'rect');
      groundRect.setAttribute('x', bounds.x - pad);
      groundRect.setAttribute('y', bounds.y - pad);
      groundRect.setAttribute('width', bounds.w + pad * 2);
      groundRect.setAttribute('height', bounds.h + pad * 2);
      groundRect.setAttribute('fill', 'url(#terrain-ground-grad)');
      groundRect.setAttribute('pointer-events', 'none');
      g.appendChild(groundRect);
    }

    piece.paths.forEach(function(p, idx) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', p.d);

      /* ── Improvement 2: Ruins wall tinting (2nd path = walls) ── */
      if (piece.type === 'ruins' && idx === 1) {
        path.setAttribute('fill', 'rgba(86,104,124,0.85)');
        path.setAttribute('stroke', 'rgba(60,80,110,0.45)');
        path.setAttribute('stroke-width', '1.5');
      } else {
        path.setAttribute('fill', p.fill);
        /* ── Improvement 1: Scatter stroke visibility ── */
        if (piece.type === 'scatter') {
          path.setAttribute('stroke', 'rgba(120,95,50,0.5)');
          path.setAttribute('stroke-width', '1.5');
        } else {
          path.setAttribute('stroke', 'rgba(0,0,0,0.35)');
          path.setAttribute('stroke-width', '1');
        }
      }
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(path);
    });
    // Terrain tooltip
    var rules = TERRAIN_RULES[piece.type];
    if (rules) {
      g.addEventListener('mouseenter', function(e) {
        var tip = document.getElementById('global-tooltip');
        if (!tip) return;
        tip.innerHTML = '<strong style="color:var(--gold);font:700 10px/1 \'Rajdhani\',sans-serif;letter-spacing:2px;text-transform:uppercase;">' + rules.title + '</strong><br><br>' +
          rules.rules.map(function(r) { return '· ' + r; }).join('<br>');
        tip.style.left = (e.clientX + 12) + 'px';
        tip.style.top  = (e.clientY - 8) + 'px';
        tip.style.transform = 'none';
        tip.style.visibility = 'visible';
        tip.style.opacity = '1';
      });
      g.addEventListener('mousemove', function(e) {
        var tip = document.getElementById('global-tooltip');
        if (tip) { tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY-8)+'px'; }
      });
      g.addEventListener('mouseleave', function() {
        var tip = document.getElementById('global-tooltip');
        if (tip) { tip.style.visibility='hidden'; tip.style.opacity='0'; }
      });
    }
    layer.appendChild(g);
  });

  /* Also enhance objective markers when terrain renders */
  enhanceObjectives();
}
