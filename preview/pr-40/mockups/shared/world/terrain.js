/* terrain.js — Terrain rendering (ES module) */

import { mapData, TERRAIN_RULES } from '../state/terrain-data.js';

export function svgTransformWithOrigin(ox, oy, t) {
  return 'translate(' + ox + ',' + oy + ') ' + t + ' translate(' + (-ox) + ',' + (-oy) + ')';
}

export function renderTerrain() {
  var NS = 'http://www.w3.org/2000/svg';
  var layer = document.getElementById('terrain-layer');
  if (!layer) return;
  mapData.terrain.forEach(function(piece) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('opacity', '0.92');
    g.setAttribute('transform', svgTransformWithOrigin(piece.origin[0], piece.origin[1], piece.transform));
    g.style.pointerEvents = 'all';
    g.style.cursor = 'default';
    piece.paths.forEach(function(p) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', p.d);
      path.setAttribute('fill', p.fill);
      path.setAttribute('stroke', 'rgba(0,0,0,0.35)');
      path.setAttribute('stroke-width', '1');
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
}
