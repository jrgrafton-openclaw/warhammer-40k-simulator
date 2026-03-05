/**
 * Dice expression evaluator — engine-internal.
 * Supports expressions like "D6", "2D6+1", "D3", "5", "-1".
 * All randomness flows through SeededRng (never Math.random()).
 */
import { SeededRng } from './rng.js';

const DICE_RE = /^(\d*)D(\d+)([+-]\d+)?$/i;

/** Roll a dice expression using the provided RNG. Returns an integer >= 0. */
export function rollDiceExpr(expr: string, rng: SeededRng): number {
  if (/^-?\d+$/.test(expr)) return Math.max(0, parseInt(expr, 10));
  const m = DICE_RE.exec(expr);
  if (!m) throw new Error(`Invalid dice expression: "${expr}"`);
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2]!, 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  return Math.max(0, rng.rollMultiple(count, sides) + mod);
}

/** Minimum possible result of a dice expression (all dice roll 1). */
export function minDiceExpr(expr: string): number {
  if (/^-?\d+$/.test(expr)) return parseInt(expr, 10);
  const m = DICE_RE.exec(expr);
  if (!m) throw new Error(`Invalid dice expression: "${expr}"`);
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  return Math.max(0, count + mod);
}

/** Maximum possible result of a dice expression (all dice roll max). */
export function maxDiceExpr(expr: string): number {
  if (/^-?\d+$/.test(expr)) return parseInt(expr, 10);
  const m = DICE_RE.exec(expr);
  if (!m) throw new Error(`Invalid dice expression: "${expr}"`);
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2]!, 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  return Math.max(0, count * sides + mod);
}
