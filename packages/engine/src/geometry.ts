/**
 * Geometry utilities for WH40K spatial calculations.
 * All distances are in inches (continuous, not gridded).
 * Grid overlay in UI is cosmetic only — this is the truth.
 */
import type { BlobUnit, Point } from './state.js';

/** Euclidean distance between two points */
export function pointDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance between two blob units — measured from footprint edge to footprint edge.
 * A negative value means the footprints overlap (units are in engagement range if ≤ 0.5").
 */
export function blobToBlob(a: BlobUnit, b: BlobUnit): number {
  return pointDistance(a.center, b.center) - a.radius - b.radius;
}

/**
 * Distance from blob unit footprint edge to a point.
 */
export function blobToPoint(unit: BlobUnit, point: Point): number {
  return Math.max(0, pointDistance(unit.center, point) - unit.radius);
}

/** WH40K engagement range: units within 0.5" of enemy are engaged */
export const ENGAGEMENT_RANGE = 0.5;

/** Check if two units are within engagement range */
export function isInEngagement(a: BlobUnit, b: BlobUnit): boolean {
  return blobToBlob(a, b) <= ENGAGEMENT_RANGE;
}

/** Check if a unit is within a given range of another unit */
export function isWithinRange(a: BlobUnit, b: BlobUnit, rangeInches: number): boolean {
  return blobToBlob(a, b) <= rangeInches;
}

/** Check if a point is within a circle (used for objectives) */
export function isPointInCircle(point: Point, center: Point, radius: number): boolean {
  return pointDistance(point, center) <= radius;
}

/** Get the legal move radius for a unit (center point of unit can move within this circle) */
export function getLegalMoveRadius(unit: BlobUnit): number {
  return unit.remainingMove;
}

/** Check if a destination is a legal move for a unit */
export function isLegalMove(unit: BlobUnit, destination: Point): boolean {
  const dist = pointDistance(unit.center, destination);
  return dist <= unit.remainingMove;
}

/** Calculate midpoint between two points */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Check if a point is within board bounds */
export function isOnBoard(point: Point, width: number, height: number): boolean {
  return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
}

/** Simple line-segment intersection test (used for LoS) */
export function lineSegmentsIntersect(
  p1: Point, p2: Point,
  p3: Point, p4: Point
): boolean {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel

  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
