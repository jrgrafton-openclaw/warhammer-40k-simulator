import { describe, it, expect } from 'vitest';
import {
  parseDiceExpr,
  tryParseDiceExpr,
  diceMin,
  diceMax,
  diceAverage,
  diceToString,
  diceRoll,
} from '../dice-expr.js';

describe('parseDiceExpr', () => {
  it('parses fixed integer', () => {
    expect(parseDiceExpr('5')).toEqual({ count: 0, faces: 0, modifier: 5 });
    expect(parseDiceExpr('1')).toEqual({ count: 0, faces: 0, modifier: 1 });
    expect(parseDiceExpr('0')).toEqual({ count: 0, faces: 0, modifier: 0 });
  });

  it('parses D6', () => {
    expect(parseDiceExpr('D6')).toEqual({ count: 1, faces: 6, modifier: 0 });
    expect(parseDiceExpr('d6')).toEqual({ count: 1, faces: 6, modifier: 0 });
  });

  it('parses D3', () => {
    expect(parseDiceExpr('D3')).toEqual({ count: 1, faces: 3, modifier: 0 });
  });

  it('parses 2D6', () => {
    expect(parseDiceExpr('2D6')).toEqual({ count: 2, faces: 6, modifier: 0 });
  });

  it('parses D6+2', () => {
    expect(parseDiceExpr('D6+2')).toEqual({ count: 1, faces: 6, modifier: 2 });
  });

  it('parses 2D6+1', () => {
    expect(parseDiceExpr('2D6+1')).toEqual({ count: 2, faces: 6, modifier: 1 });
  });

  it('parses D6-1', () => {
    expect(parseDiceExpr('D6-1')).toEqual({ count: 1, faces: 6, modifier: -1 });
  });

  it('parses D3+2 (Twin arachnus heavy blaze cannon format)', () => {
    // "D6+2" format from Caladius
    expect(parseDiceExpr('D6+2')).toEqual({ count: 1, faces: 6, modifier: 2 });
  });

  it('throws on invalid expressions', () => {
    expect(() => parseDiceExpr('D')).toThrow();
    expect(() => parseDiceExpr('foo')).toThrow();
    expect(() => parseDiceExpr('1.5')).toThrow();
  });

  it('tryParseDiceExpr returns null on invalid', () => {
    expect(tryParseDiceExpr('foo')).toBeNull();
    expect(tryParseDiceExpr('D6')).not.toBeNull();
  });
});

describe('diceMin', () => {
  it('fixed value', () => expect(diceMin(parseDiceExpr('5'))).toBe(5));
  it('D6', () => expect(diceMin(parseDiceExpr('D6'))).toBe(1));
  it('2D6', () => expect(diceMin(parseDiceExpr('2D6'))).toBe(2));
  it('D6+2', () => expect(diceMin(parseDiceExpr('D6+2'))).toBe(3));
  it('D3', () => expect(diceMin(parseDiceExpr('D3'))).toBe(1));
});

describe('diceMax', () => {
  it('fixed value', () => expect(diceMax(parseDiceExpr('5'))).toBe(5));
  it('D6', () => expect(diceMax(parseDiceExpr('D6'))).toBe(6));
  it('2D6', () => expect(diceMax(parseDiceExpr('2D6'))).toBe(12));
  it('D6+2', () => expect(diceMax(parseDiceExpr('D6+2'))).toBe(8));
  it('D3', () => expect(diceMax(parseDiceExpr('D3'))).toBe(3));
});

describe('diceAverage', () => {
  it('fixed value', () => expect(diceAverage(parseDiceExpr('5'))).toBe(5));
  it('D6', () => expect(diceAverage(parseDiceExpr('D6'))).toBe(3.5));
  it('2D6', () => expect(diceAverage(parseDiceExpr('2D6'))).toBe(7));
  it('D6+2', () => expect(diceAverage(parseDiceExpr('D6+2'))).toBe(5.5));
});

describe('diceToString', () => {
  it('round-trips all formats', () => {
    const exprs = ['5', 'D6', '2D6', 'D6+2', 'D6-1', 'D3', '2D6+1'];
    for (const expr of exprs) {
      expect(diceToString(parseDiceExpr(expr))).toBe(expr);
    }
  });
});

describe('diceRoll', () => {
  it('fixed value always returns that value', () => {
    const expr = parseDiceExpr('5');
    for (let i = 0; i < 20; i++) {
      expect(diceRoll(expr, Math.random)).toBe(5);
    }
  });

  it('D6 result is within [1, 6]', () => {
    const expr = parseDiceExpr('D6');
    for (let i = 0; i < 100; i++) {
      const result = diceRoll(expr, Math.random);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(6);
    }
  });

  it('D6+2 result is within [3, 8]', () => {
    const expr = parseDiceExpr('D6+2');
    for (let i = 0; i < 100; i++) {
      const result = diceRoll(expr, Math.random);
      expect(result).toBeGreaterThanOrEqual(3);
      expect(result).toBeLessThanOrEqual(8);
    }
  });

  it('deterministic with seeded random', () => {
    const expr = parseDiceExpr('D6');
    let seed = 42;
    const seededRandom = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const r1 = diceRoll(expr, seededRandom);
    seed = 42;
    const seededRandom2 = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const r2 = diceRoll(expr, seededRandom2);
    expect(r1).toBe(r2);
  });
});
