/**
 * Army spawner — converts ArmyList units into engine-ready BlobUnit objects.
 * Handles deployment zone placement for both players.
 */

import type { ArmyList, ArmyListUnit, WeaponProfile } from './schemas.js';
import type { BlobUnit, EngineWeapon } from '@wh40k/engine';

function weaponToEngine(w: WeaponProfile): EngineWeapon {
  return { id: w.id, name: w.name, type: w.type, range: w.range, attacks: w.attacks, skill: w.skill, strength: w.strength, ap: w.ap, damage: w.damage, keywords: w.keywords };
}

// ---------------------------------------------------------------------------
// Radius estimation (inches)
// ---------------------------------------------------------------------------

function estimateRadius(unit: ArmyListUnit): number {
  const cat = unit.primaryCategory.toLowerCase();
  const count = unit.datasheet.modelCount;

  if (cat.includes('vehicle') || cat.includes('monster')) return 2.5;
  if (cat.includes('character')) return 1.0;
  // Infantry: roughly sqrt(n) * 0.75", minimum 1.5"
  return Math.max(1.5, Math.sqrt(count) * 0.75);
}

// ---------------------------------------------------------------------------
// Deployment zone layout
// ---------------------------------------------------------------------------

export type PlayerSide = 'bottom' | 'top';

interface DeploymentZone {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function deploymentZone(side: PlayerSide, boardWidth: number, boardHeight: number): DeploymentZone {
  const depth = 12; // 12" deployment zone (standard Strike Force)
  if (side === 'bottom') {
    return { xMin: 6, xMax: boardWidth - 6, yMin: 3, yMax: 3 + depth };
  }
  return { xMin: 6, xMax: boardWidth - 6, yMin: boardHeight - 3 - depth, yMax: boardHeight - 3 };
}

/**
 * Lay out units in a deployment zone, left to right in rows.
 * Returns a list of starting center positions for each unit.
 */
function layoutUnitsInZone(
  units: ArmyListUnit[],
  zone: DeploymentZone
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const zoneWidth = zone.xMax - zone.xMin;
  const padding = 1.5;

  // Calculate total width needed
  const totalWidth = units.reduce((sum, u) => sum + estimateRadius(u) * 2 + padding, -padding);
  const scale = totalWidth > zoneWidth ? zoneWidth / totalWidth : 1;

  // Place units in a single row, centered in the zone
  let x = zone.xMin + (zoneWidth - totalWidth * scale) / 2;
  const y = (zone.yMin + zone.yMax) / 2;

  for (const unit of units) {
    const r = estimateRadius(unit) * scale;
    positions.push({ x: x + r, y });
    x += r * 2 + padding * scale;
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Main spawner
// ---------------------------------------------------------------------------

/**
 * Convert an ArmyList into an array of BlobUnits, positioned in a deployment zone.
 *
 * @param army      The imported army list
 * @param playerId  Player ID to assign to all units
 * @param side      Which deployment zone to place units in ('bottom' | 'top')
 * @param boardWidth   Board width in inches (default 60)
 * @param boardHeight  Board height in inches (default 44)
 */
export function spawnArmy(
  army: ArmyList,
  playerId: string,
  side: PlayerSide,
  boardWidth = 60,
  boardHeight = 44
): BlobUnit[] {
  // Filter out config units — only spawn actual combat units
  const combatUnits = army.units.filter((u) => {
    const cat = u.primaryCategory.toLowerCase();
    return cat !== 'configuration' && cat !== 'allied units' && u.points > 0;
  });

  const zone = deploymentZone(side, boardWidth, boardHeight);
  const positions = layoutUnitsInZone(combatUnits, zone);

  return combatUnits.map((unit, i): BlobUnit => {
    const ds = unit.datasheet;
    const pos = positions[i] ?? { x: zone.xMin + 5, y: (zone.yMin + zone.yMax) / 2 };
    const radius = estimateRadius(unit);

    return {
      id: `${playerId}-${unit.selectionId}`,
      datasheetId: unit.datasheetId,
      name: unit.name,
      playerId,
      center: pos,
      radius,
      movementInches: ds.movement,
      toughness: ds.toughness,
      save: ds.save,
      invuln: ds.invuln,
      fnp: ds.fnp,
      oc: ds.oc,
      wounds: ds.wounds,
      maxWounds: ds.wounds,
      remainingMove: ds.movement,
      hasFired: false,
      hasCharged: false,
      hasFought: false,
      hasAdvanced: false,
      isInEngagement: false,
      movedThisPhase: false,
      weapons: ds.weapons.map(weaponToEngine),
    };
  });
}

/**
 * Create a placeholder opponent army — simple infantry for testing.
 * Used for demo/Phase 3 when no second army file is available.
 */
export function createPlaceholderOpponent(
  playerId: string,
  side: PlayerSide,
  boardWidth = 60,
  boardHeight = 44
): BlobUnit[] {
  interface PlaceholderDef {
    id: string;
    name: string;
    m: number;
    t: number;
    sv: number;
    w: number;
    oc: number;
    radius: number;
    count: number;
  }

  const unitDefs: PlaceholderDef[] = [
    { id: 'chaos-lord', name: 'Chaos Lord', m: 6, t: 5, sv: 2, w: 6, oc: 2, radius: 1.0, count: 1 },
    { id: 'chaos-warriors-a', name: 'Chaos Warriors', m: 6, t: 4, sv: 3, w: 2, oc: 2, radius: 3.0, count: 10 },
    { id: 'chaos-warriors-b', name: 'Chaos Warriors', m: 6, t: 4, sv: 3, w: 2, oc: 2, radius: 3.0, count: 10 },
    { id: 'chaos-terminators', name: 'Chaos Terminators', m: 5, t: 5, sv: 2, w: 3, oc: 2, radius: 2.5, count: 5 },
  ];

  const zone = deploymentZone(side, boardWidth, boardHeight);
  const padding = 1.5;
  const zoneWidth = zone.xMax - zone.xMin;
  const totalWidth = unitDefs.reduce((s, u) => s + u.radius * 2 + padding, -padding);
  const scale = totalWidth > zoneWidth ? zoneWidth / totalWidth : 1;

  let x = zone.xMin + (zoneWidth - totalWidth * scale) / 2;
  const y = (zone.yMin + zone.yMax) / 2;

  return unitDefs.map((def): BlobUnit => {
    const r = def.radius * scale;
    const pos = { x: x + r, y };
    x += r * 2 + padding * scale;

    return {
      id: `${playerId}-${def.id}`,
      datasheetId: def.id,
      name: def.name,
      playerId,
      center: pos,
      radius: r,
      movementInches: def.m,
      toughness: def.t,
      save: def.sv,
      invuln: null,
      fnp: null,
      oc: def.oc,
      wounds: def.w,
      maxWounds: def.w,
      remainingMove: def.m,
      hasFired: false,
      hasCharged: false,
      hasFought: false,
      hasAdvanced: false,
      isInEngagement: false,
      movedThisPhase: false,
      weapons: [],
    };
  });
}
