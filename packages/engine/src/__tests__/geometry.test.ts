import { describe, it, expect } from 'vitest';
import { fc } from '@fast-check/vitest';
import { pointDistance, blobToBlob, blobToPoint, isInEngagement, isLegalMove, ENGAGEMENT_RANGE } from '../index.js';
import type { BlobUnit, Point } from '../index.js';

function makeBlob(x: number, y: number, radius = 1): BlobUnit {
  return {
    id: 'test', datasheetId: 'test', name: 'Test', playerId: 'p1',
    center: { x, y }, radius,
    movementInches: 6, toughness: 4, save: 3, invuln: null, fnp: null, oc: 2,
    wounds: 10, maxWounds: 10, remainingMove: 6,
    hasFired: false, hasCharged: false, hasFought: false, hasAdvanced: false, isInEngagement: false, movedThisPhase: false,
    weapons: [],
  };
}

describe('geometry', () => {
  describe('pointDistance', () => {
    it('distance from point to itself is 0', () => {
      expect(pointDistance({ x: 5, y: 10 }, { x: 5, y: 10 })).toBe(0);
    });

    it('3-4-5 right triangle', () => {
      expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    });

    it('is symmetric', () => {
      const a = { x: 1, y: 2 };
      const b = { x: 4, y: 6 };
      expect(pointDistance(a, b)).toBeCloseTo(pointDistance(b, a));
    });
  });

  describe('blobToBlob', () => {
    it('two adjacent blobs with no gap', () => {
      // Two blobs of radius 1 whose centers are 2" apart → edge-to-edge = 0
      const a = makeBlob(0, 0, 1);
      const b = makeBlob(2, 0, 1);
      expect(blobToBlob(a, b)).toBeCloseTo(0);
    });

    it('overlapping blobs return negative distance', () => {
      const a = makeBlob(0, 0, 1);
      const b = makeBlob(0, 0, 1);
      expect(blobToBlob(a, b)).toBeLessThan(0);
    });

    it('blobs 5" apart (center) with radius 1 each → 3" gap', () => {
      const a = makeBlob(0, 0, 1);
      const b = makeBlob(5, 0, 1);
      expect(blobToBlob(a, b)).toBeCloseTo(3);
    });
  });

  describe('isInEngagement', () => {
    it('adjacent blobs (edge to edge 0") are in engagement', () => {
      const a = makeBlob(0, 0, 1);
      const b = makeBlob(2, 0, 1); // 0" gap
      expect(isInEngagement(a, b)).toBe(true);
    });

    it('blobs 0.3" apart are in engagement', () => {
      const a = makeBlob(0, 0, 1);
      const b = makeBlob(2.3, 0, 1); // 0.3" gap
      expect(isInEngagement(a, b)).toBe(true);
    });

    it('blobs 1" apart are NOT in engagement', () => {
      const a = makeBlob(0, 0, 1);
      const b = makeBlob(3, 0, 1); // 1" gap
      expect(isInEngagement(a, b)).toBe(false);
    });
  });

  describe('isLegalMove', () => {
    it('move within range is legal', () => {
      const unit = makeBlob(10, 10, 1);
      unit.remainingMove = 6;
      expect(isLegalMove(unit, { x: 14, y: 10 })).toBe(true); // 4" move
    });

    it('move exactly at limit is legal', () => {
      const unit = makeBlob(0, 0, 1);
      unit.remainingMove = 6;
      expect(isLegalMove(unit, { x: 6, y: 0 })).toBe(true);
    });

    it('move beyond range is illegal', () => {
      const unit = makeBlob(0, 0, 1);
      unit.remainingMove = 6;
      expect(isLegalMove(unit, { x: 7, y: 0 })).toBe(false);
    });
  });

  describe('property tests (fast-check)', () => {
    it('pointDistance is always non-negative', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -100, max: 100, noNaN: true }),
          fc.float({ min: -100, max: 100, noNaN: true }),
          fc.float({ min: -100, max: 100, noNaN: true }),
          fc.float({ min: -100, max: 100, noNaN: true }),
          (x1, y1, x2, y2) => {
            return pointDistance({ x: x1, y: y1 }, { x: x2, y: y2 }) >= 0;
          }
        )
      );
    });

    it('a unit can never move more than its remaining move', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 50, noNaN: true }),
          fc.float({ min: 0, max: 50, noNaN: true }),
          fc.float({ min: 1, max: 12, noNaN: true }),
          fc.float({ min: 0, max: 60, noNaN: true }),
          fc.float({ min: 0, max: 44, noNaN: true }),
          (startX, startY, movement, destX, destY) => {
            const unit = makeBlob(startX, startY, 1);
            unit.remainingMove = movement;
            const dest = { x: destX, y: destY };
            const distance = pointDistance(unit.center, dest);
            const legal = isLegalMove(unit, dest);
            // If legal, distance must be ≤ movement; if over movement, must not be legal
            if (distance > movement + 0.001) return !legal;
            return true;
          }
        )
      );
    });
  });
});
