/**
 * Zod schemas for WH40K 10th edition content.
 * These are the canonical internal types — distinct from source formats (BattleScribe, etc.).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// DiceExpr (stored as serializable string, validated on import)
// ---------------------------------------------------------------------------

/** A dice expression like "D6", "2D6+1", "D3", "5". */
export const DiceExprStringSchema = z
  .string()
  .regex(/^(\d*)D(\d+)([+-]\d+)?$|^-?\d+$/, 'Must be a valid dice expression (e.g. "D6", "2D6+1", "3")');

// ---------------------------------------------------------------------------
// Weapon keyword enum (open-ended, validated as string array)
// ---------------------------------------------------------------------------

/**
 * Known weapon keywords. Typed as string so unknown keywords don't fail validation —
 * the importer will pass them through and the engine checks for specific ones.
 */
export const WeaponKeywordSchema = z.string();

// ---------------------------------------------------------------------------
// Weapon profile
// ---------------------------------------------------------------------------

export const WeaponTypeSchema = z.enum(['melee', 'ranged']);

export const WeaponProfileSchema = z.object({
  /** Stable identifier — slugified from name */
  id: z.string(),
  name: z.string(),
  type: WeaponTypeSchema,
  /** Range in inches for ranged weapons; 'Melee' string for melee */
  range: z.union([z.number().int().positive(), z.literal('Melee')]),
  /** Attacks characteristic — DiceExpr string */
  attacks: DiceExprStringSchema,
  /** WS or BS value (e.g. 2 means "2+") */
  skill: z.number().int().min(2).max(6),
  strength: z.number().int().positive(),
  /** Armour Penetration — stored as negative (e.g. -2 = AP-2) */
  ap: z.number().int().max(0),
  /** Damage characteristic — DiceExpr string */
  damage: DiceExprStringSchema,
  /** Special rules / abilities for this weapon */
  keywords: z.array(WeaponKeywordSchema),
});
export type WeaponProfile = z.infer<typeof WeaponProfileSchema>;

// ---------------------------------------------------------------------------
// Ability
// ---------------------------------------------------------------------------

export const AbilitySchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type Ability = z.infer<typeof AbilitySchema>;

// ---------------------------------------------------------------------------
// Unit datasheet
// ---------------------------------------------------------------------------

export const UnitDatasheetSchema = z.object({
  /** Stable identifier — slugified unit name (unique within a faction) */
  id: z.string(),
  name: z.string(),
  faction: z.string(),
  /** e.g. ["Infantry", "Character", "Imperium", "Adeptus Custodes"] */
  keywords: z.array(z.string()),
  /** Primary role category: Battleline, Infantry, Character, Vehicle, etc. */
  primaryCategory: z.string(),
  // ---- Movement ----
  /** Movement in inches */
  movement: z.number().int().positive(),
  // ---- Core stats ----
  toughness: z.number().int().min(1).max(20),
  /** Save value (e.g. 2 means "2+") */
  save: z.number().int().min(2).max(6),
  /** Invulnerable save value (e.g. 4 means "4+"), or null if none */
  invuln: z.number().int().min(2).max(6).nullable(),
  /** Feel No Pain value (e.g. 3 means "3+"), or null if none */
  fnp: z.number().int().min(2).max(6).nullable(),
  wounds: z.number().int().positive(),
  /** Leadership value (e.g. 6 means "6+") */
  leadership: z.number().int().min(2).max(10),
  /** Objective Control */
  oc: z.number().int().min(0),
  weapons: z.array(WeaponProfileSchema),
  abilities: z.array(AbilitySchema),
  /** Base points cost for this unit (before enhancements) */
  basePoints: z.number().int().nonnegative(),
  /** Number of models in the unit (as deployed in this army) */
  modelCount: z.number().int().positive(),
});
export type UnitDatasheet = z.infer<typeof UnitDatasheetSchema>;

// ---------------------------------------------------------------------------
// Army list entry
// ---------------------------------------------------------------------------

export const ArmyListUnitSchema = z.object({
  /** Selection id from the source roster (e.g. BattleScribe id) */
  selectionId: z.string(),
  /** Datasheet id (slugified unit name) */
  datasheetId: z.string(),
  name: z.string(),
  points: z.number().int().nonnegative(),
  primaryCategory: z.string(),
  /** True if this is the Warlord model */
  isWarlord: z.boolean(),
  /** Names of enhancements applied */
  enhancements: z.array(z.string()),
  datasheet: UnitDatasheetSchema,
});
export type ArmyListUnit = z.infer<typeof ArmyListUnitSchema>;

// ---------------------------------------------------------------------------
// Army list
// ---------------------------------------------------------------------------

export const ArmyListSchema = z.object({
  /** Army/roster name */
  name: z.string(),
  /** Faction name */
  faction: z.string(),
  /** Detachment rule name */
  detachment: z.string(),
  totalPoints: z.number().int().nonnegative(),
  pointsLimit: z.number().int().positive(),
  units: z.array(ArmyListUnitSchema),
});
export type ArmyList = z.infer<typeof ArmyListSchema>;
