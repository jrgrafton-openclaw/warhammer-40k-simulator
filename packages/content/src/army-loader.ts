/**
 * Army loader — validates an ArmyList and converts it to engine-ready BlobUnits.
 *
 * Bridges the gap between @wh40k/content (data layer) and @wh40k/engine (simulation layer).
 */

import type { ArmyList, ArmyListUnit } from './schemas.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ArmyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalPoints: number;
  unitCount: number;
}

/**
 * Validate an ArmyList for common issues.
 * Does NOT enforce all matched play rules (e.g. minimum detachment requirements) — 
 * that's the engine's responsibility. This validates data integrity only.
 */
export function validateArmyList(army: ArmyList): ArmyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Points
  if (army.totalPoints > army.pointsLimit) {
    errors.push(
      `Army exceeds points limit: ${army.totalPoints}pts / ${army.pointsLimit}pts`
    );
  }

  if (army.totalPoints < 1) {
    errors.push('Army has no points — is the roster empty?');
  }

  // Units
  if (army.units.length === 0) {
    errors.push('Army has no units');
  }

  const warlords = army.units.filter((u) => u.isWarlord);
  if (warlords.length === 0) {
    warnings.push('No Warlord designated');
  }
  if (warlords.length > 1) {
    errors.push(`Multiple Warlord designations: ${warlords.map((u) => u.name).join(', ')}`);
  }

  // Per-unit checks
  for (const unit of army.units) {
    if (unit.points < 0) {
      errors.push(`Unit "${unit.name}" has negative points: ${unit.points}`);
    }
    if (!unit.datasheet) {
      errors.push(`Unit "${unit.name}" is missing datasheet data`);
      continue;
    }
    if (unit.datasheet.wounds < 1) {
      errors.push(`Unit "${unit.name}" has 0 wounds`);
    }
    if (unit.datasheet.weapons.length === 0) {
      warnings.push(`Unit "${unit.name}" has no weapons defined`);
    }
  }

  // Check pts sum consistency
  const calculatedTotal = army.units.reduce((sum, u) => sum + u.points, 0);
  if (Math.abs(calculatedTotal - army.totalPoints) > 5) {
    warnings.push(
      `Calculated unit points (${calculatedTotal}) don't match army total (${army.totalPoints})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalPoints: army.totalPoints,
    unitCount: army.units.length,
  };
}

// ---------------------------------------------------------------------------
// Summary helpers (for UI / reports)
// ---------------------------------------------------------------------------

export interface ArmySummary {
  name: string;
  faction: string;
  detachment: string;
  totalPoints: number;
  pointsLimit: number;
  warlord: string | null;
  unitBreakdown: { name: string; pts: number; category: string; models: number }[];
}

export function summarizeArmy(army: ArmyList): ArmySummary {
  const warlord = army.units.find((u) => u.isWarlord)?.name ?? null;

  const unitBreakdown = army.units.map((u) => ({
    name: u.name,
    pts: u.points,
    category: u.primaryCategory,
    models: u.datasheet.modelCount,
  }));

  return {
    name: army.name,
    faction: army.faction,
    detachment: army.detachment,
    totalPoints: army.totalPoints,
    pointsLimit: army.pointsLimit,
    warlord,
    unitBreakdown,
  };
}

/**
 * Convert an army list unit to an engine-compatible BlobUnit initialization payload.
 * The caller assigns the unit ID and player ID.
 */
export interface BlobUnitInit {
  datasheetId: string;
  name: string;
  movementInches: number;
  toughness: number;
  save: number;
  invuln: number | null;
  fnp: number | null;
  oc: number;
  wounds: number;
  maxWounds: number;
  radius: number; // auto-computed from model count + base size
}

/**
 * Estimate a unit's blob radius (in inches) based on model count and primary type.
 * This is a simple approximation for Phase 2 — per-model footprints come later.
 */
function estimateRadius(unit: ArmyListUnit): number {
  const count = unit.datasheet.modelCount;
  const cat = unit.primaryCategory.toLowerCase();

  // Vehicle / Monster — single model, large base
  if (cat.includes('vehicle') || cat.includes('monster')) return 2.5;

  // Character — single model
  if (cat.includes('character')) return 1.0;

  // Infantry — scale by model count
  // Each infantry base is ~1" diameter; pack them roughly
  return Math.max(1.5, Math.sqrt(count) * 0.75);
}

export function unitToBlob(unit: ArmyListUnit): BlobUnitInit {
  const ds = unit.datasheet;
  return {
    datasheetId: unit.datasheetId,
    name: unit.name,
    movementInches: ds.movement,
    toughness: ds.toughness,
    save: ds.save,
    invuln: ds.invuln,
    fnp: ds.fnp,
    oc: ds.oc,
    wounds: ds.wounds,
    maxWounds: ds.wounds,
    radius: estimateRadius(unit),
  };
}
