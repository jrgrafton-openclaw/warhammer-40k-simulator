/**
 * collision.js — Pure collision functions (no DOM, no state)
 *
 * Terrain AABB collision:
 *   Ruins → use paths[1] (L-shaped wall structure, NOT the floor)
 *   Scatter → use paths[0] (solid block)
 *   L-shapes decomposed into grid-aligned rectangles via point-in-polygon
 *
 * Each AABB stores: inverse matrix (SVG→local), forward linear (local→SVG),
 * and the local-space bounding box.
 */
(function(B) {
  'use strict';

  // ── Parse SVG path d-attribute into [{x,y}] ───────────────
  function parsePathPoints(d) {
    var pts = [], re = /[ML]\s*([-\d.]+)[\s,]+([-\d.]+)/gi, m;
    while ((m = re.exec(d)) !== null) pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
    return pts;
  }

  // ── Point-in-polygon (ray casting) ────────────────────────
  function pointInPolygon(px, py, poly) {
    var inside = false, n = poly.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = poly[i].x, yi = poly[i].y;
      var xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ── Decompose rectilinear polygon into axis-aligned rectangles ──
  // Uses grid decomposition: find unique x/y coords → test each cell centre
  function decomposeRectilinear(pts) {
    if (pts.length <= 4) {
      // Simple rectangle
      var xs = pts.map(function(p) { return p.x; });
      var ys = pts.map(function(p) { return p.y; });
      return [{ minX: Math.min.apply(null, xs), minY: Math.min.apply(null, ys),
                maxX: Math.max.apply(null, xs), maxY: Math.max.apply(null, ys) }];
    }

    // Get unique coordinates (rounded to avoid float issues)
    var xSet = {}, ySet = {};
    pts.forEach(function(p) {
      xSet[Math.round(p.x * 10) / 10] = true;
      ySet[Math.round(p.y * 10) / 10] = true;
    });
    var uniqueX = Object.keys(xSet).map(Number).sort(function(a,b) { return a - b; });
    var uniqueY = Object.keys(ySet).map(Number).sort(function(a,b) { return a - b; });

    // Remove closing point (duplicate of first) for PIP test
    var testPoly = pts;
    if (pts.length > 1 && Math.abs(pts[0].x - pts[pts.length-1].x) < 0.1
                       && Math.abs(pts[0].y - pts[pts.length-1].y) < 0.1) {
      testPoly = pts.slice(0, -1);
    }

    var rects = [];
    for (var i = 0; i < uniqueX.length - 1; i++) {
      for (var j = 0; j < uniqueY.length - 1; j++) {
        var cx = (uniqueX[i] + uniqueX[i + 1]) / 2;
        var cy = (uniqueY[j] + uniqueY[j + 1]) / 2;
        if (pointInPolygon(cx, cy, testPoly)) {
          rects.push({ minX: uniqueX[i], minY: uniqueY[j],
                       maxX: uniqueX[i + 1], maxY: uniqueY[j + 1] });
        }
      }
    }
    return rects;
  }

  // ── Build terrain AABBs from mapData ──────────────────────
  // Returns array of { iA,iB,iC,iD,iE,iF, fA,fB,fC,fD, minX,minY,maxX,maxY }
  B.buildTerrainAABBs = function(mapData, svgEl) {
    if (!mapData || !svgEl) return [];
    var aabbs = [];

    mapData.terrain.forEach(function(piece) {
      // Only RUINS WALLS are collidable:
      //   ruins  → paths[1] (L-shaped WALL structure) — floor is traversable
      //   scatter → NO collision (models move through at half speed — future mechanic)
      //   area   → NO collision
      if (piece.type !== 'ruins' || piece.paths.length < 2) return; // skip scatter/area
      var collisionPath = piece.paths[1]; // wall only

      var ox = piece.origin[0], oy = piece.origin[1];
      var tfStr = 'translate(' + ox + ',' + oy + ') ' + piece.transform + ' translate(' + (-ox) + ',' + (-oy) + ')';
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', tfStr);
      svgEl.appendChild(g);
      var consolidated = g.transform.baseVal.consolidate();
      svgEl.removeChild(g);
      if (!consolidated) return;

      var mat = consolidated.matrix;
      var det = mat.a * mat.d - mat.b * mat.c;
      if (Math.abs(det) < 0.001) return;

      // Inverse matrix (SVG → local)
      var inv = {
        a:  mat.d / det, b: -mat.b / det,
        c: -mat.c / det, d:  mat.a / det,
        e: (mat.c * mat.f - mat.d * mat.e) / det,
        f: (mat.b * mat.e - mat.a * mat.f) / det
      };

      // Parse path vertices (these ARE local coords)
      var pts = parsePathPoints(collisionPath.d);
      if (pts.length < 3) return;

      // Decompose into axis-aligned rectangles (handles L-shapes)
      var rects = decomposeRectilinear(pts);

      rects.forEach(function(rect) {
        aabbs.push({
          iA: inv.a, iB: inv.b, iC: inv.c, iD: inv.d, iE: inv.e, iF: inv.f,
          fA: mat.a, fB: mat.b, fC: mat.c, fD: mat.d,
          minX: rect.minX, minY: rect.minY, maxX: rect.maxX, maxY: rect.maxY
        });
      });
    });

    return aabbs;
  };

  // ── Resolve terrain collision for a single circle ─────────
  // Pushes model out of all overlapping terrain AABBs
  B.resolveTerrainCollision = function(cx, cy, r, aabbs) {
    var x = cx, y = cy;
    for (var b = 0; b < aabbs.length; b++) {
      var box = aabbs[b];
      // 1. Transform circle centre to terrain LOCAL space
      var lx = box.iA * x + box.iC * y + box.iE;
      var ly = box.iB * x + box.iD * y + box.iF;

      // 2. Closest point in AABB (local space)
      var cpx = Math.max(box.minX, Math.min(box.maxX, lx));
      var cpy = Math.max(box.minY, Math.min(box.maxY, ly));
      var dlx = lx - cpx, dly = ly - cpy;
      var dist = Math.hypot(dlx, dly);
      if (dist >= r) continue; // no overlap

      // 3. Push direction in LOCAL space
      var pushLX, pushLY;
      if (dist < 0.001) {
        // Centre is inside rect — push out along shortest axis
        var dL = lx - box.minX, dR = box.maxX - lx;
        var dT = ly - box.minY, dB = box.maxY - ly;
        var minD = Math.min(dL, dR, dT, dB);
        if      (minD === dL) { pushLX = -(dL + r); pushLY = 0; }
        else if (minD === dR) { pushLX =  (dR + r); pushLY = 0; }
        else if (minD === dT) { pushLX = 0; pushLY = -(dT + r); }
        else                  { pushLX = 0; pushLY =  (dB + r); }
      } else {
        // Approaching from outside — push along normal from closest point
        var nx = dlx / dist, ny = dly / dist;
        pushLX = nx * (r - dist);
        pushLY = ny * (r - dist);
      }

      // 4. Transform push VECTOR to SVG space (linear part only)
      x += box.fA * pushLX + box.fC * pushLY;
      y += box.fB * pushLX + box.fD * pushLY;
    }
    return { x: x, y: y };
  };

  // ── Cross-unit collision for unit drag ────────────────────
  // Pushes the ENTIRE unit back when any of its models overlap models from other units
  B.resolveUnitDragCollisions = function(unit, allUnits) {
    for (var iter = 0; iter < 4; iter++) {
      var anyPush = false;
      for (var mi = 0; mi < unit.models.length; mi++) {
        var m = unit.models[mi];
        for (var ui = 0; ui < allUnits.length; ui++) {
          var other = allUnits[ui];
          if (other.id === unit.id) continue;
          for (var oi = 0; oi < other.models.length; oi++) {
            var otherModel = other.models[oi];
            var minDist = m.r + otherModel.r + 1;
            var dx = m.x - otherModel.x, dy = m.y - otherModel.y;
            var dist = Math.hypot(dx, dy);
            if (dist < minDist && dist > 0.001) {
              var push = (minDist - dist) / dist;
              var px = dx * push, py = dy * push;
              unit.models.forEach(function(um) { um.x += px; um.y += py; });
              anyPush = true;
            }
          }
        }
      }
      if (!anyPush) break;
    }
  };

})(window.BattleUI = window.BattleUI || {});
