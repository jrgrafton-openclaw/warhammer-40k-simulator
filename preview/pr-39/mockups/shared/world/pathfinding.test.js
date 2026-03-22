/**
 * pathfinding.test.js — Tests for pathfinding module.
 * Run: node pathfinding.test.js
 */

import { aabbsToWorldPolygons, buildNavGraph, findShortestPath } from './pathfinding.js';

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  ✗ FAIL: ' + msg);
  }
}

function assertApprox(a, b, tol, msg) {
  assert(Math.abs(a - b) < (tol || 0.01), msg + ' (got ' + a + ', expected ~' + b + ')');
}

// Helper: identity-transform AABB (no rotation)
function makeAABB(minX, minY, maxX, maxY) {
  return {
    iA: 1, iB: 0, iC: 0, iD: 1, iE: 0, iF: 0,
    fA: 1, fB: 0, fC: 0, fD: 1,
    minX: minX, minY: minY, maxX: maxX, maxY: maxY
  };
}

// ─── Test 1: aabbsToWorldPolygons (identity transform) ───
console.log('\nTest 1: aabbsToWorldPolygons (identity)');
(function() {
  var aabbs = [makeAABB(10, 20, 30, 40)];
  var polys = aabbsToWorldPolygons(aabbs);
  assert(polys.length === 1, 'one polygon');
  assert(polys[0].length === 4, 'four vertices');
  assertApprox(polys[0][0].x, 10, 0.01, 'corner 0 x');
  assertApprox(polys[0][0].y, 20, 0.01, 'corner 0 y');
  assertApprox(polys[0][1].x, 30, 0.01, 'corner 1 x');
  assertApprox(polys[0][1].y, 20, 0.01, 'corner 1 y');
  assertApprox(polys[0][2].x, 30, 0.01, 'corner 2 x');
  assertApprox(polys[0][2].y, 40, 0.01, 'corner 2 y');
  assertApprox(polys[0][3].x, 10, 0.01, 'corner 3 x');
  assertApprox(polys[0][3].y, 40, 0.01, 'corner 3 y');
})();

// ─── Test 2: aabbsToWorldPolygons (45° rotation) ───
console.log('\nTest 2: aabbsToWorldPolygons (rotated)');
(function() {
  // 45° rotation around origin. 
  // Forward: fA=cos45, fB=sin45, fC=-sin45, fD=cos45
  // Inverse: iA=cos45, iB=-sin45, iC=sin45, iD=cos45
  var c = Math.cos(Math.PI / 4);
  var s = Math.sin(Math.PI / 4);
  var aabbs = [{
    iA: c, iB: -s, iC: s, iD: c, iE: 0, iF: 0,
    fA: c, fB: s, fC: -s, fD: c,
    minX: -5, minY: -5, maxX: 5, maxY: 5
  }];
  var polys = aabbsToWorldPolygons(aabbs);
  assert(polys.length === 1, 'one polygon');
  // Local (-5,-5) → world: should be rotated. With identity translation and 45° rotation inverse:
  // det = c*c - (-s)*s = c² + s² = 1
  // wx = (c*(-5-0) - s*(-5-0))/1 = -5(c-s) = -5*0 ≈ 0
  // wy = (-(-s)*(-5) + c*(-5))/1 = -5s - 5c = -5(s+c) ≈ -5*√2 ≈ -7.07
  assertApprox(polys[0][0].x, 0, 0.1, 'rotated corner 0 x ≈ 0');
  assertApprox(polys[0][0].y, -5 * Math.SQRT2, 0.1, 'rotated corner 0 y ≈ -7.07');
})();

// ─── Test 3: Clear line of sight → direct path ───
console.log('\nTest 3: Clear LOS → direct path');
(function() {
  // Wall at x=[45,55], y=[0,100] — but points are both on the same side
  var aabbs = [makeAABB(45, 0, 55, 100)];
  var polys = aabbsToWorldPolygons(aabbs);
  var radius = 5;
  var graph = buildNavGraph(polys, radius);

  var start = { x: 10, y: 50 };
  var end = { x: 30, y: 50 };
  var result = findShortestPath(graph, polys, start, end, radius);

  assert(result !== null, 'path found');
  assert(result.path.length === 2, 'direct path (2 points)');
  assertApprox(result.cost, 20, 0.01, 'cost = 20');
})();

// ─── Test 4: Wall between points → path goes around ───
console.log('\nTest 4: Wall between points → path around');
(function() {
  // Vertical wall at x=[48,52], y=[20,80]
  var aabbs = [makeAABB(48, 20, 52, 80)];
  var polys = aabbsToWorldPolygons(aabbs);
  var radius = 3;
  var graph = buildNavGraph(polys, radius);

  var start = { x: 30, y: 50 };
  var end = { x: 70, y: 50 };
  var result = findShortestPath(graph, polys, start, end, radius);

  assert(result !== null, 'path found');
  var directDist = 40;
  assert(result.cost > directDist, 'cost > direct distance (' + result.cost.toFixed(2) + ' > ' + directDist + ')');
  assert(result.path.length >= 3, 'path has intermediate waypoints (' + result.path.length + ' points)');
  assertApprox(result.path[0].x, 30, 0.01, 'starts at start');
  assertApprox(result.path[result.path.length - 1].x, 70, 0.01, 'ends at end');
})();

// ─── Test 5: L-shaped wall → navigate around the L ───
console.log('\nTest 5: L-shaped wall');
(function() {
  // L-shape made of two AABBs:
  // Vertical part: x=[48,52], y=[20,80]
  // Horizontal part: x=[48,80], y=[48,52]
  var aabbs = [
    makeAABB(48, 20, 52, 80),
    makeAABB(48, 48, 80, 52)
  ];
  var polys = aabbsToWorldPolygons(aabbs);
  var radius = 3;
  var graph = buildNavGraph(polys, radius);

  // Start is to the left of vertical wall, below horizontal wall
  var start = { x: 30, y: 60 };
  // End is to the right of vertical wall, above horizontal wall
  var end = { x: 70, y: 30 };
  var result = findShortestPath(graph, polys, start, end, radius);

  assert(result !== null, 'path found');
  var directDist = Math.sqrt(40 * 40 + 30 * 30);
  assert(result.cost > directDist, 'cost > direct (' + result.cost.toFixed(2) + ' > ' + directDist.toFixed(2) + ')');
  assert(result.path.length >= 3, 'path navigates around L (' + result.path.length + ' points)');
})();

// ─── Test 6: Point inside obstacle → null ───
console.log('\nTest 6: Point inside obstacle → null');
(function() {
  var aabbs = [makeAABB(40, 40, 60, 60)];
  var polys = aabbsToWorldPolygons(aabbs);
  var radius = 3;
  var graph = buildNavGraph(polys, radius);

  var start = { x: 50, y: 50 }; // inside the polygon
  var end = { x: 100, y: 100 };
  var result = findShortestPath(graph, polys, start, end, radius);

  assert(result === null, 'returns null for start inside obstacle');
})();

// ─── Test 7: Path must not pass through wall corner (vertex pass-through) ───
console.log('\nTest 7: Path must not pass through wall corner');
(function() {
  // Two walls forming a gap. A direct path would pass exactly through a wall corner.
  // Wall 1: x=[40,50], y=[0,50]
  // Wall 2: x=[50,60], y=[50,100]
  // Corner at (50,50) — a direct path from (20,20) to (80,80) passes through it
  var aabbs = [
    makeAABB(40, 0, 50, 50),
    makeAABB(50, 50, 60, 100)
  ];
  var polys = aabbsToWorldPolygons(aabbs);
  var radius = 3;
  var graph = buildNavGraph(polys, radius);

  var start = { x: 20, y: 20 };
  var end = { x: 80, y: 80 };
  var result = findShortestPath(graph, polys, start, end, radius);

  assert(result !== null, 'path found');
  var directDist = Math.hypot(60, 60);
  assert(result.cost > directDist, 'path avoids corner (' + result.cost.toFixed(2) + ' > ' + directDist.toFixed(2) + ')');
  // Path should not be direct (2 points) — it must go around
  assert(result.path.length >= 3, 'path routes around corner (' + result.path.length + ' points)');
})();

// ─── Test 8: Two thin walls close together — path must go around both ───
console.log('\nTest 8: Two close parallel thin walls');
(function() {
  // Two thin vertical walls with a narrow gap between them
  var aabbs = [
    makeAABB(48, 20, 52, 80),  // wall 1
    makeAABB(58, 20, 62, 80)   // wall 2, 6px gap
  ];
  var polys = aabbsToWorldPolygons(aabbs);
  var radius = 5; // radius larger than the gap
  var graph = buildNavGraph(polys, radius);

  var start = { x: 30, y: 50 };
  var end = { x: 80, y: 50 };
  var result = findShortestPath(graph, polys, start, end, radius);

  assert(result !== null, 'path found');
  assert(result.cost > 50, 'path goes around both walls (' + result.cost.toFixed(2) + ' > 50)');
})();

// ─── Summary ───
console.log('\n─── Results: ' + passed + ' passed, ' + failed + ' failed ───');
if (failed > 0) {
  process.exit(1);
}
