/**
 * pathfinding.js — Grid-based A* pathfinding using the existing collision system.
 *
 * Instead of building a separate geometric model, this module probes the
 * actual resolveTerrainCollision function to build an occupancy grid,
 * then runs A* on it. 100% consistent with what the player sees.
 *
 * ES5-compatible function syntax (var, function — no arrow functions).
 */

// ── Grid settings ──────────────────────────────────────
var GRID_CELL = 4;           // px per grid cell (4px ≈ 1/4 of smallest model radius)
var GRID_W = 0;              // computed from battlefield
var GRID_H = 0;
var BF_W = 720;              // battlefield width in SVG units
var BF_H = 528;              // battlefield height in SVG units

// 8-directional neighbors (dx, dy, cost multiplier)
var DIRS = [
  { dx:  1, dy:  0, cost: 1 },
  { dx: -1, dy:  0, cost: 1 },
  { dx:  0, dy:  1, cost: 1 },
  { dx:  0, dy: -1, cost: 1 },
  { dx:  1, dy:  1, cost: 1.4142 },
  { dx: -1, dy:  1, cost: 1.4142 },
  { dx:  1, dy: -1, cost: 1.4142 },
  { dx: -1, dy: -1, cost: 1.4142 }
];

// ── Grid cache (keyed by radius) ───────────────────────
var _gridCache = {};  // radiusKey → Uint8Array (0=free, 1=blocked)

/**
 * Build an occupancy grid for a given model radius.
 * Probes resolveTerrainCollision at each cell center.
 *
 * @param {Array} terrainAABBs - from window._terrainAABBs
 * @param {number} modelRadius - in SVG px
 * @param {function} resolveCollision - resolveTerrainCollision(cx, cy, r, aabbs) → {x, y}
 * @returns {Uint8Array} grid[row * GRID_W + col] = 0|1
 */
export function buildGrid(terrainAABBs, modelRadius, resolveCollision) {
  GRID_W = Math.ceil(BF_W / GRID_CELL);
  GRID_H = Math.ceil(BF_H / GRID_CELL);
  var grid = new Uint8Array(GRID_W * GRID_H);

  for (var row = 0; row < GRID_H; row++) {
    for (var col = 0; col < GRID_W; col++) {
      var cx = col * GRID_CELL + GRID_CELL / 2;
      var cy = row * GRID_CELL + GRID_CELL / 2;
      var resolved = resolveCollision(cx, cy, modelRadius, terrainAABBs);
      // If collision pushed the point, this cell is blocked
      if (Math.abs(resolved.x - cx) > 0.1 || Math.abs(resolved.y - cy) > 0.1) {
        grid[row * GRID_W + col] = 1;
      }
    }
  }

  return grid;
}

/**
 * Get or build a cached grid for the given radius.
 */
export function getGrid(terrainAABBs, modelRadius, resolveCollision) {
  var key = Math.round(modelRadius * 10);
  if (!_gridCache[key]) {
    _gridCache[key] = buildGrid(terrainAABBs, modelRadius, resolveCollision);
  }
  return _gridCache[key];
}

/**
 * Convert pixel coords to grid cell.
 */
function toGrid(px, py) {
  return {
    col: Math.max(0, Math.min(GRID_W - 1, Math.floor(px / GRID_CELL))),
    row: Math.max(0, Math.min(GRID_H - 1, Math.floor(py / GRID_CELL)))
  };
}

/**
 * Convert grid cell to pixel coords (cell center).
 */
function toPixel(col, row) {
  return {
    x: col * GRID_CELL + GRID_CELL / 2,
    y: row * GRID_CELL + GRID_CELL / 2
  };
}

/**
 * A* shortest path on the occupancy grid.
 *
 * @param {Uint8Array} grid - occupancy grid
 * @param {{x:number, y:number}} start - pixel coords
 * @param {{x:number, y:number}} end - pixel coords
 * @returns {{ path: Array<{x:number,y:number}>, cost: number } | null}
 */
export function findPath(grid, start, end) {
  GRID_W = Math.ceil(BF_W / GRID_CELL);
  GRID_H = Math.ceil(BF_H / GRID_CELL);

  var s = toGrid(start.x, start.y);
  var e = toGrid(end.x, end.y);

  // If start or end is blocked, return null
  if (grid[s.row * GRID_W + s.col] === 1) return null;
  if (grid[e.row * GRID_W + e.col] === 1) return null;

  // Same cell → trivial
  if (s.col === e.col && s.row === e.row) {
    return { path: [start, end], cost: Math.hypot(end.x - start.x, end.y - start.y) };
  }

  // A* with binary heap
  var totalCells = GRID_W * GRID_H;
  var gScore = new Float32Array(totalCells);
  var fScore = new Float32Array(totalCells);
  var cameFrom = new Int32Array(totalCells);
  var closed = new Uint8Array(totalCells);

  for (var i = 0; i < totalCells; i++) {
    gScore[i] = Infinity;
    fScore[i] = Infinity;
    cameFrom[i] = -1;
  }

  var startIdx = s.row * GRID_W + s.col;
  var endIdx = e.row * GRID_W + e.col;
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(e.col - s.col, e.row - s.row) * GRID_CELL;

  // Binary min-heap on fScore
  var heap = [startIdx];

  function heapPush(idx) {
    heap.push(idx);
    var i = heap.length - 1;
    while (i > 0) {
      var parent = (i - 1) >> 1;
      if (fScore[heap[parent]] <= fScore[heap[i]]) break;
      var tmp = heap[parent]; heap[parent] = heap[i]; heap[i] = tmp;
      i = parent;
    }
  }

  function heapPop() {
    if (heap.length === 0) return -1;
    var top = heap[0];
    var last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      var i = 0;
      while (true) {
        var l = 2 * i + 1, r = 2 * i + 2, smallest = i;
        if (l < heap.length && fScore[heap[l]] < fScore[heap[smallest]]) smallest = l;
        if (r < heap.length && fScore[heap[r]] < fScore[heap[smallest]]) smallest = r;
        if (smallest === i) break;
        var tmp = heap[smallest]; heap[smallest] = heap[i]; heap[i] = tmp;
        i = smallest;
      }
    }
    return top;
  }

  while (heap.length > 0) {
    var ci = heapPop();
    if (ci === endIdx) break;
    if (closed[ci]) continue;
    closed[ci] = 1;

    var crow = (ci / GRID_W) | 0;
    var ccol = ci % GRID_W;

    for (var d = 0; d < 8; d++) {
      var nr = crow + DIRS[d].dy;
      var nc = ccol + DIRS[d].dx;
      if (nr < 0 || nr >= GRID_H || nc < 0 || nc >= GRID_W) continue;
      var ni = nr * GRID_W + nc;
      if (grid[ni] === 1 || closed[ni]) continue;

      // For diagonal moves, also check that both cardinal neighbors are free
      // (prevents cutting corners through walls)
      if (DIRS[d].dx !== 0 && DIRS[d].dy !== 0) {
        if (grid[crow * GRID_W + nc] === 1 || grid[nr * GRID_W + ccol] === 1) continue;
      }

      var tentG = gScore[ci] + DIRS[d].cost * GRID_CELL;
      if (tentG < gScore[ni]) {
        cameFrom[ni] = ci;
        gScore[ni] = tentG;
        fScore[ni] = tentG + Math.hypot(e.col - nc, e.row - nr) * GRID_CELL;
        heapPush(ni);
      }
    }
  }

  // No path found
  if (cameFrom[endIdx] === -1 && startIdx !== endIdx) return null;

  // Reconstruct grid path
  var rawPath = [];
  var node = endIdx;
  while (node !== -1) {
    var r = (node / GRID_W) | 0;
    var c = node % GRID_W;
    rawPath.push(toPixel(c, r));
    node = cameFrom[node];
  }
  rawPath.reverse();

  // Replace first/last with actual start/end coords for precision
  rawPath[0] = { x: start.x, y: start.y };
  rawPath[rawPath.length - 1] = { x: end.x, y: end.y };

  // Smooth path: remove unnecessary waypoints that have clear LOS
  var smoothed = smoothPath(rawPath, grid);

  // Compute total cost along smoothed path
  var totalCost = 0;
  for (var i = 1; i < smoothed.length; i++) {
    totalCost += Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].y - smoothed[i - 1].y);
  }

  return { path: smoothed, cost: totalCost };
}

/**
 * Smooth a grid path by removing intermediate points when there's clear LOS.
 * Uses Bresenham-like line check on the grid.
 */
function smoothPath(path, grid) {
  if (path.length <= 2) return path;

  var result = [path[0]];
  var anchor = 0;

  for (var i = 2; i < path.length; i++) {
    // Check LOS from anchor to i
    if (!gridLineOfSight(grid, path[anchor], path[i])) {
      // Can't skip — keep i-1 as waypoint
      result.push(path[i - 1]);
      anchor = i - 1;
    }
  }

  result.push(path[path.length - 1]);
  return result;
}

/**
 * Check if there's a clear line-of-sight on the grid between two pixel positions.
 * Uses DDA (Digital Differential Analyzer) to walk grid cells.
 */
function gridLineOfSight(grid, a, b) {
  var ga = toGrid(a.x, a.y);
  var gb = toGrid(b.x, b.y);

  var x0 = ga.col, y0 = ga.row;
  var x1 = gb.col, y1 = gb.row;

  var dx = Math.abs(x1 - x0);
  var dy = Math.abs(y1 - y0);
  var sx = x0 < x1 ? 1 : -1;
  var sy = y0 < y1 ? 1 : -1;
  var err = dx - dy;

  while (true) {
    if (grid[y0 * GRID_W + x0] === 1) return false;

    if (x0 === x1 && y0 === y1) break;

    var e2 = 2 * err;
    // Check diagonal corner-cutting
    if (e2 > -dy && e2 < dx) {
      // Diagonal step — check both cardinal neighbors
      if (grid[y0 * GRID_W + (x0 + sx)] === 1) return false;
      if (grid[(y0 + sy) * GRID_W + x0] === 1) return false;
    }
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
  }

  return true;
}

/**
 * Render the occupancy grid as an SVG overlay for debugging.
 * Blocked cells are drawn as small red squares.
 *
 * @param {Uint8Array} grid
 * @param {SVGElement} svgLayer - an SVG <g> element to render into
 */
export function renderGridDebug(grid, svgLayer) {
  if (!svgLayer) return;
  svgLayer.innerHTML = '';
  var NS = 'http://www.w3.org/2000/svg';
  GRID_W = Math.ceil(BF_W / GRID_CELL);
  GRID_H = Math.ceil(BF_H / GRID_CELL);

  for (var row = 0; row < GRID_H; row++) {
    for (var col = 0; col < GRID_W; col++) {
      if (grid[row * GRID_W + col] === 1) {
        var rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', col * GRID_CELL);
        rect.setAttribute('y', row * GRID_CELL);
        rect.setAttribute('width', GRID_CELL);
        rect.setAttribute('height', GRID_CELL);
        rect.setAttribute('fill', 'rgba(255,50,50,0.35)');
        rect.setAttribute('pointer-events', 'none');
        svgLayer.appendChild(rect);
      }
    }
  }
}

/**
 * Render a path as an SVG polyline overlay for debugging.
 *
 * @param {Array<{x:number,y:number}>} pathPoints
 * @param {SVGElement} svgLayer
 * @param {string} color
 */
export function renderPathDebug(pathPoints, svgLayer, color) {
  if (!svgLayer || !pathPoints || pathPoints.length < 2) return;
  var NS = 'http://www.w3.org/2000/svg';
  var points = pathPoints.map(function(p) { return p.x + ',' + p.y; }).join(' ');
  var polyline = document.createElementNS(NS, 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', color || '#ff0');
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-dasharray', '4,3');
  polyline.setAttribute('pointer-events', 'none');
  svgLayer.appendChild(polyline);
}

// ── Exports for backward compat ────────────────────────
// Keep old function names as no-ops so import doesn't break during transition
export function aabbsToWorldPolygons() { return []; }
export function buildNavGraph() { return { vertices: [], edges: new Map() }; }
export function findShortestPath() { return null; }
