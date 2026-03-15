/**
 * pathfinding.js — Visibility-graph pathfinding around 2D obstacle polygons.
 *
 * Pure geometry, no DOM dependencies.
 * ES5-compatible function syntax (var, function — no arrow functions, no const/let).
 */

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

var EPSILON = 1e-6;

/**
 * Transform a local-space point to world-space using the inverse matrix fields.
 * World→Local: lx = iA*wx + iC*wy + iE,  ly = iB*wx + iD*wy + iF
 * Invert:  det = iA*iD - iB*iC
 *   wx = (iD*(lx-iE) - iC*(ly-iF)) / det
 *   wy = (-iB*(lx-iE) + iA*(ly-iF)) / det
 */
function localToWorld(lx, ly, aabb) {
  var det = aabb.iA * aabb.iD - aabb.iB * aabb.iC;
  var dlx = lx - aabb.iE;
  var dly = ly - aabb.iF;
  return {
    x: (aabb.iD * dlx - aabb.iC * dly) / det,
    y: (-aabb.iB * dlx + aabb.iA * dly) / det
  };
}

/** Euclidean distance between two points. */
function dist(a, b) {
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Cross product of vectors (b-a) × (c-a). */
function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Test if segments (p1,p2) and (p3,p4) intersect properly
 * (endpoints touching does NOT count — we use strict inequality).
 * Returns true if segments cross each other's interior.
 */
function segmentsIntersectStrict(p1, p2, p3, p4) {
  var d1 = cross(p3, p4, p1);
  var d2 = cross(p3, p4, p2);
  var d3 = cross(p1, p2, p3);
  var d4 = cross(p1, p2, p4);

  if (((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
      ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))) {
    return true;
  }
  return false;
}

/**
 * Check if point p is inside a convex polygon (given as array of {x,y} in order).
 * Uses winding / cross-product sign consistency.
 */
function pointInConvexPolygon(p, poly) {
  var n = poly.length;
  var sign = 0;
  for (var i = 0; i < n; i++) {
    var j = (i + 1) % n;
    var c = cross(poly[i], poly[j], p);
    if (Math.abs(c) < EPSILON) continue; // on edge — treat as not inside
    if (sign === 0) {
      sign = c > 0 ? 1 : -1;
    } else if ((c > 0 ? 1 : -1) !== sign) {
      return false;
    }
  }
  return true;
}

/**
 * Ensure polygon vertices are in counter-clockwise order.
 * If clockwise, reverse them.
 */
function ensureCCW(poly) {
  var area = 0;
  for (var i = 0; i < poly.length; i++) {
    var j = (i + 1) % poly.length;
    area += (poly[j].x - poly[i].x) * (poly[j].y + poly[i].y);
  }
  if (area > 0) {
    poly.reverse();
  }
  return poly;
}

/**
 * Expand a convex polygon outward by `radius`.
 * Offsets each edge outward along its outward normal, then computes
 * new vertices at the intersection of consecutive offset edges.
 */
function expandPolygon(poly, radius) {
  var n = poly.length;
  // Ensure CCW so outward normals point away from interior
  poly = ensureCCW(poly.slice());

  // Compute offset lines for each edge
  var offLines = [];
  for (var i = 0; i < n; i++) {
    var j = (i + 1) % n;
    var dx = poly[j].x - poly[i].x;
    var dy = poly[j].y - poly[i].y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < EPSILON) continue;
    // Outward normal for CCW polygon: (dy, -dx) / len  → points right of edge direction
    // For CCW winding, the outward normal is actually (-dy, dx) ... let me think:
    // Edge from A to B: direction = (dx, dy). Left normal = (-dy, dx), Right normal = (dy, -dx).
    // For CCW polygon, interior is to the left, so OUTWARD is to the RIGHT = (dy, -dx).
    var nx = dy / len;
    var ny = -dx / len;
    // Offset both endpoints of the edge
    offLines.push({
      p: { x: poly[i].x + nx * radius, y: poly[i].y + ny * radius },
      d: { x: dx, y: dy }
    });
  }

  // Intersect consecutive offset lines to get expanded vertices
  var expanded = [];
  var m = offLines.length;
  for (var i = 0; i < m; i++) {
    var j = (i + 1) % m;
    var pt = lineLineIntersection(offLines[i], offLines[j]);
    if (pt) {
      expanded.push(pt);
    }
  }
  return expanded;
}

/**
 * Intersect two lines, each given as { p: {x,y}, d: {x,y} } (point + direction).
 * Returns intersection point or null if parallel.
 */
function lineLineIntersection(l1, l2) {
  var denom = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(denom) < EPSILON) return null;
  var dx = l2.p.x - l1.p.x;
  var dy = l2.p.y - l1.p.y;
  var t = (dx * l2.d.y - dy * l2.d.x) / denom;
  return {
    x: l1.p.x + t * l1.d.x,
    y: l1.p.y + t * l1.d.y
  };
}

/**
 * Check if segment (a, b) intersects any edge of the expanded polygon at index `skipIdx`,
 * or any edge of other expanded polygons.
 * expandedPolys: array of expanded polygon vertex arrays
 * polyOwnership: for each vertex index in the flat vertex list, which polygon it belongs to
 *
 * We check against ALL expanded polygon edges. If the segment's two endpoints both
 * belong to the same polygon, we skip that polygon's edges.
 */
function segmentBlockedByExpandedPolys(a, b, expandedPolys, skipPolyA, skipPolyB) {
  for (var pi = 0; pi < expandedPolys.length; pi++) {
    // Skip edges of polygons that own either endpoint
    if (pi === skipPolyA || pi === skipPolyB) continue;
    var poly = expandedPolys[pi];
    var n = poly.length;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      if (segmentsIntersectStrict(a, b, poly[i], poly[j])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if segment (a, b) is blocked by any expanded polygon.
 * For start/end points (not belonging to any polygon), check all polygons.
 */
function segmentBlockedByAllExpandedPolys(a, b, expandedPolys) {
  for (var pi = 0; pi < expandedPolys.length; pi++) {
    var poly = expandedPolys[pi];
    var n = poly.length;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      if (segmentsIntersectStrict(a, b, poly[i], poly[j])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a point is inside any of the original (non-expanded) polygons.
 */
function pointInsideAnyPolygon(p, polygons) {
  for (var i = 0; i < polygons.length; i++) {
    if (pointInConvexPolygon(p, polygons[i])) {
      return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────
// Exported functions
// ──────────────────────────────────────────────

/**
 * Convert terrain AABBs to world-space convex polygons (rectangles).
 * Each polygon is an array of 4 {x,y} points in world space.
 * @param {Array} aabbs - terrain AABB objects with iA-iF, fA-fD, minX/Y, maxX/Y
 * @returns {Array<Array<{x:number, y:number}>>} world-space polygons
 */
export function aabbsToWorldPolygons(aabbs) {
  var polygons = [];
  for (var i = 0; i < aabbs.length; i++) {
    var b = aabbs[i];
    // 4 corners in local space
    var corners = [
      { lx: b.minX, ly: b.minY },
      { lx: b.maxX, ly: b.minY },
      { lx: b.maxX, ly: b.maxY },
      { lx: b.minX, ly: b.maxY }
    ];
    var worldCorners = [];
    for (var c = 0; c < 4; c++) {
      worldCorners.push(localToWorld(corners[c].lx, corners[c].ly, b));
    }
    polygons.push(worldCorners);
  }
  return polygons;
}

/**
 * Build a visibility graph for pathfinding around obstacles.
 * Expands each polygon outward by `radius` so paths keep clearance from walls.
 *
 * @param {Array<Array<{x:number, y:number}>>} polygons - world-space obstacle polygons
 * @param {number} radius - clearance radius in pixels
 * @returns {Object} navGraph - { vertices, edges, _expandedPolys, _polyOwnership }
 */
export function buildNavGraph(polygons, radius) {
  // 1. Expand each polygon
  var expandedPolys = [];
  for (var i = 0; i < polygons.length; i++) {
    expandedPolys.push(expandPolygon(polygons[i], radius));
  }

  // 2. Collect all expanded vertices, tracking which polygon each belongs to
  var vertices = [];
  var polyOwnership = []; // polyOwnership[vertexIdx] = polygon index
  for (var pi = 0; pi < expandedPolys.length; pi++) {
    var ep = expandedPolys[pi];
    for (var vi = 0; vi < ep.length; vi++) {
      polyOwnership.push(pi);
      vertices.push(ep[vi]);
    }
  }

  // 3. Build visibility edges
  var edges = new Map();
  var n = vertices.length;

  // Initialize adjacency lists
  for (var i = 0; i < n; i++) {
    edges.set(i, []);
  }

  // For each pair, check line of sight
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      var a = vertices[i];
      var b = vertices[j];
      var polyA = polyOwnership[i];
      var polyB = polyOwnership[j];

      // Check if segment crosses any expanded polygon edge (skip owning polygons)
      if (!segmentBlockedByExpandedPolys(a, b, expandedPolys, polyA, polyB)) {
        // Also verify the midpoint isn't inside any expanded polygon
        // (handles cases where segment passes through polygon interior without crossing edges)
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        var midBlocked = false;
        for (var pi = 0; pi < expandedPolys.length; pi++) {
          if (pi === polyA || pi === polyB) continue;
          if (pointInConvexPolygon(mid, expandedPolys[pi])) {
            midBlocked = true;
            break;
          }
        }
        if (!midBlocked) {
          var cost = dist(a, b);
          edges.get(i).push({ to: j, cost: cost });
          edges.get(j).push({ to: i, cost: cost });
        }
      }
    }
  }

  // Also add edges between consecutive vertices on the same expanded polygon
  // (polygon perimeter edges — always valid)
  for (var pi = 0; pi < expandedPolys.length; pi++) {
    var ep = expandedPolys[pi];
    // Find the starting vertex index for this polygon
    var startIdx = 0;
    for (var k = 0; k < pi; k++) {
      startIdx += expandedPolys[k].length;
    }
    for (var vi = 0; vi < ep.length; vi++) {
      var ni = (vi + 1) % ep.length;
      var idxA = startIdx + vi;
      var idxB = startIdx + ni;
      // Check if this edge already exists
      var existing = edges.get(idxA);
      var found = false;
      for (var e = 0; e < existing.length; e++) {
        if (existing[e].to === idxB) { found = true; break; }
      }
      if (!found) {
        var cost = dist(vertices[idxA], vertices[idxB]);
        edges.get(idxA).push({ to: idxB, cost: cost });
        edges.get(idxB).push({ to: idxA, cost: cost });
      }
    }
  }

  return {
    vertices: vertices,
    edges: edges,
    _expandedPolys: expandedPolys,
    _polyOwnership: polyOwnership
  };
}

/**
 * Find shortest path from start to end using A* on the visibility graph.
 *
 * @param {Object} navGraph - from buildNavGraph
 * @param {Array<Array<{x,y}>>} polygons - original world polygons for inside-check
 * @param {{x:number, y:number}} start
 * @param {{x:number, y:number}} end
 * @param {number} radius - clearance radius
 * @returns {{ path: Array<{x,y}>, cost: number } | null}
 */
export function findShortestPath(navGraph, polygons, start, end, radius) {
  // If start or end is inside an obstacle, return null
  if (pointInsideAnyPolygon(start, polygons) || pointInsideAnyPolygon(end, polygons)) {
    return null;
  }

  var vertices = navGraph.vertices;
  var edges = navGraph.edges;
  var expandedPolys = navGraph._expandedPolys;
  var n = vertices.length;

  // Temporary vertex indices for start and end
  var startIdx = n;
  var endIdx = n + 1;

  // Build temporary adjacency for start and end
  var tempEdges = new Map();
  // Copy existing edges (by reference is fine — we won't mutate them)
  for (var i = 0; i < n; i++) {
    tempEdges.set(i, edges.get(i));
  }
  tempEdges.set(startIdx, []);
  tempEdges.set(endIdx, []);

  // Temp vertices array
  var allVerts = vertices.slice();
  allVerts.push(start);
  allVerts.push(end);

  // Check direct start→end visibility
  if (!segmentBlockedByAllExpandedPolys(start, end, expandedPolys)) {
    var directCost = dist(start, end);
    return { path: [start, end], cost: directCost };
  }

  // Connect start and end to visible graph vertices
  for (var i = 0; i < n; i++) {
    var v = vertices[i];
    // start → vertex
    if (!segmentBlockedByAllExpandedPolys(start, v, expandedPolys)) {
      var c = dist(start, v);
      tempEdges.get(startIdx).push({ to: i, cost: c });
      // Add reverse edge — need to copy array to avoid mutating original
      var arr = tempEdges.get(i);
      if (arr === edges.get(i)) {
        arr = arr.slice();
        tempEdges.set(i, arr);
      }
      arr.push({ to: startIdx, cost: c });
    }
    // vertex → end
    if (!segmentBlockedByAllExpandedPolys(v, end, expandedPolys)) {
      var c = dist(v, end);
      tempEdges.get(endIdx).push({ to: i, cost: c });
      var arr = tempEdges.get(i);
      if (arr === edges.get(i)) {
        arr = arr.slice();
        tempEdges.set(i, arr);
      }
      arr.push({ to: endIdx, cost: c });
    }
  }

  // A* search
  var totalVerts = n + 2;

  // Simple binary-heap priority queue (min-heap on f-score)
  var openSet = []; // array of { idx, f }
  var gScore = {};
  var fScore = {};
  var cameFrom = {};
  var closed = {};

  gScore[startIdx] = 0;
  fScore[startIdx] = dist(start, end);
  openSet.push({ idx: startIdx, f: fScore[startIdx] });

  function heapPush(item) {
    openSet.push(item);
    // Bubble up
    var i = openSet.length - 1;
    while (i > 0) {
      var parent = (i - 1) >> 1;
      if (openSet[parent].f <= openSet[i].f) break;
      var tmp = openSet[parent];
      openSet[parent] = openSet[i];
      openSet[i] = tmp;
      i = parent;
    }
  }

  function heapPop() {
    if (openSet.length === 0) return null;
    var top = openSet[0];
    var last = openSet.pop();
    if (openSet.length > 0) {
      openSet[0] = last;
      // Bubble down
      var i = 0;
      while (true) {
        var left = 2 * i + 1;
        var right = 2 * i + 2;
        var smallest = i;
        if (left < openSet.length && openSet[left].f < openSet[smallest].f) smallest = left;
        if (right < openSet.length && openSet[right].f < openSet[smallest].f) smallest = right;
        if (smallest === i) break;
        var tmp = openSet[smallest];
        openSet[smallest] = openSet[i];
        openSet[i] = tmp;
        i = smallest;
      }
    }
    return top;
  }

  while (openSet.length > 0) {
    var current = heapPop();
    var ci = current.idx;

    if (ci === endIdx) {
      // Reconstruct path
      var path = [];
      var node = endIdx;
      while (node !== undefined) {
        path.push(allVerts[node]);
        node = cameFrom[node];
      }
      path.reverse();
      return { path: path, cost: gScore[endIdx] };
    }

    if (closed[ci]) continue;
    closed[ci] = true;

    var neighbors = tempEdges.get(ci);
    if (!neighbors) continue;

    for (var ni = 0; ni < neighbors.length; ni++) {
      var nb = neighbors[ni];
      if (closed[nb.to]) continue;
      var tentG = gScore[ci] + nb.cost;
      if (gScore[nb.to] === undefined || tentG < gScore[nb.to]) {
        cameFrom[nb.to] = ci;
        gScore[nb.to] = tentG;
        fScore[nb.to] = tentG + dist(allVerts[nb.to], end);
        heapPush({ idx: nb.to, f: fScore[nb.to] });
      }
    }
  }

  // No path found
  return null;
}
