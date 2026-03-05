/**
 * DiceExpr — represents a dice expression like "D6", "2D6+1", "D3+2", "5", "D6+2".
 *
 * Format: [count]D[faces][+/-modifier]
 *
 * Examples:
 *   "5"       → { count: 0, faces: 0, modifier: 5 }  (fixed value)
 *   "D6"      → { count: 1, faces: 6, modifier: 0 }
 *   "D3"      → { count: 1, faces: 3, modifier: 0 }
 *   "2D6"     → { count: 2, faces: 6, modifier: 0 }
 *   "D6+2"    → { count: 1, faces: 6, modifier: 2 }
 *   "2D6+1"   → { count: 2, faces: 6, modifier: 1 }
 *   "D6-1"    → { count: 1, faces: 6, modifier: -1 }
 */
export interface DiceExpr {
  /** Number of dice to roll. 0 = fixed value (no dice). */
  count: number;
  /** Number of faces on each die. 0 = no dice (fixed value). */
  faces: number;
  /** Fixed modifier added to the roll result. */
  modifier: number;
}

const DICE_PATTERN = /^(\d*)D(\d+)([+-]\d+)?$/i;
const FIXED_PATTERN = /^-?\d+$/;

/**
 * Parse a dice expression string into a DiceExpr.
 * Throws if the string is not a valid expression.
 */
export function parseDiceExpr(str: string): DiceExpr {
  const s = str.trim();

  // Fixed value
  if (FIXED_PATTERN.test(s)) {
    return { count: 0, faces: 0, modifier: parseInt(s, 10) };
  }

  // Dice expression
  const match = DICE_PATTERN.exec(s);
  if (!match) {
    throw new Error(`Invalid DiceExpr: "${str}"`);
  }

  const countStr = match[1] ?? '';
  const facesStr = match[2] ?? '6';
  const modStr = match[3] ?? '';

  const count = countStr === '' ? 1 : parseInt(countStr, 10);
  const faces = parseInt(facesStr, 10);
  const modifier = modStr === '' ? 0 : parseInt(modStr, 10);

  if (count < 1 || faces < 2) {
    throw new Error(`Invalid DiceExpr values: count=${count}, faces=${faces} in "${str}"`);
  }

  return { count, faces, modifier };
}

/** Try to parse — returns null instead of throwing */
export function tryParseDiceExpr(str: string): DiceExpr | null {
  try {
    return parseDiceExpr(str);
  } catch {
    return null;
  }
}

/** Minimum possible value */
export function diceMin(expr: DiceExpr): number {
  if (expr.count === 0) return expr.modifier;
  return expr.count * 1 + expr.modifier;
}

/** Maximum possible value */
export function diceMax(expr: DiceExpr): number {
  if (expr.count === 0) return expr.modifier;
  return expr.count * expr.faces + expr.modifier;
}

/** Statistical average value */
export function diceAverage(expr: DiceExpr): number {
  if (expr.count === 0) return expr.modifier;
  const avgRoll = (1 + expr.faces) / 2;
  return expr.count * avgRoll + expr.modifier;
}

/** Serialize back to canonical string */
export function diceToString(expr: DiceExpr): string {
  if (expr.count === 0) return String(expr.modifier);
  const countPart = expr.count === 1 ? '' : String(expr.count);
  const dicePart = `${countPart}D${expr.faces}`;
  if (expr.modifier === 0) return dicePart;
  if (expr.modifier > 0) return `${dicePart}+${expr.modifier}`;
  return `${dicePart}${expr.modifier}`; // negative already has '-'
}

/** Roll using a numeric random function (0 <= rand < 1) */
export function diceRoll(expr: DiceExpr, randFn: () => number): number {
  if (expr.count === 0) return expr.modifier;
  let total = expr.modifier;
  for (let i = 0; i < expr.count; i++) {
    total += Math.floor(randFn() * expr.faces) + 1;
  }
  return total;
}
