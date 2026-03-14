/**
 * collision.js — Pure collision functions (no DOM deps beyond SVG transform)
 * ES module version.
 */

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
function decomposeRectilinear(pts) {
  if (pts.length <= 4) {
    var xs = pts.map(function(p) { return p.x; });
    var ys = pts.map(function(p) { return p.y; });
    return [{ minX: Math.min.apply(null, xs), minY: Math.min.apply(null, ys),
              maxX: Math.max.apply(null, xs), maxY: Math.max.apply(null, ys) }];
  }

  var xSet = {}, ySet = {};
  pts.forEach(function(p) {
    xSet[Math.round(p.x * 10) / 10] = true;
    ySet[Math.round(p.y * 10) / 10] = true;
  });
  var uniqueX = Object.keys(xSet).map(Number).sort(function(a,b) { return a - b; });
  var uniqueY = Object.keys(ySet).map(Number).sort(function(a,b) { return a - b; });

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
export function buildTerrainAABBs(mapData, svgEl) {
  if (!mapData || !svgEl) return [];
  var aabbs = [];

  mapData.terrain.forEach(function(piece) {
    if (piece.type !== 'ruins' || piece.paths.length < 2) return;
    var collisionPath = piece.paths[1];

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

    var inv = {
      a:  mat.d / det, b: -mat.b / det,
      c: -mat.c / det, d:  mat.a / det,
      e: (mat.c * mat.f - mat.d * mat.e) / det,
      f: (mat.b * mat.e - mat.a * mat.f) / det
    };

    var pts = parsePathPoints(collisionPath.d);
    if (pts.length < 3) return;

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
}

// ── Resolve terrain collision for a single circle ─────────
export function resolveTerrainCollision(cx, cy, r, aabbs) {
  var x = cx, y = cy;
  for (var b = 0; b < aabbs.length; b++) {
    var box = aabbs[b];
    var lx = box.iA * x + box.iC * y + box.iE;
    var ly = box.iB * x + box.iD * y + box.iF;

    var cpx = Math.max(box.minX, Math.min(box.maxX, lx));
    var cpy = Math.max(box.minY, Math.min(box.maxY, ly));
    var dlx = lx - cpx, dly = ly - cpy;
    var dist = Math.hypot(dlx, dly);
    if (dist >= r) continue;

    var pushLX, pushLY;
    if (dist < 0.001) {
      var dL = lx - box.minX, dR = box.maxX - lx;
      var dT = ly - box.minY, dB = box.maxY - ly;
      var minD = Math.min(dL, dR, dT, dB);
      if      (minD === dL) { pushLX = -(dL + r); pushLY = 0; }
      else if (minD === dR) { pushLX =  (dR + r); pushLY = 0; }
      else if (minD === dT) { pushLX = 0; pushLY = -(dT + r); }
      else                  { pushLX = 0; pushLY =  (dB + r); }
    } else {
      var nx = dlx / dist, ny = dly / dist;
      pushLX = nx * (r - dist);
      pushLY = ny * (r - dist);
    }

    x += box.fA * pushLX + box.fC * pushLY;
    y += box.fB * pushLX + box.fD * pushLY;
  }
  return { x: x, y: y };
}

// ── Breachable terrain check ──────────────────────────
// Infantry, Beasts, and Swarms can move through ruin walls (WH40K 10e Breachable rule)
var BREACHABLE_KEYWORDS = ['Infantry', 'Beast', 'Swarm'];

export function canBreachTerrain(unit) {
  if (!unit || !unit.keywords) return false;
  for (var i = 0; i < unit.keywords.length; i++) {
    if (BREACHABLE_KEYWORDS.indexOf(unit.keywords[i]) !== -1) return true;
  }
  return false;
}

// ── Cross-unit collision for unit drag ────────────────────
export function resolveUnitDragCollisions(unit, allUnits) {
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
}
