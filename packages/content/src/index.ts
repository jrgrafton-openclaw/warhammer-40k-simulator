/**
 * @wh40k/content — Phase 2
 * Content schemas, dice expressions, and army importers for WH40K 10th Edition.
 */

export const CONTENT_VERSION = '0.2.0';

// Dice expressions
export {
  parseDiceExpr,
  tryParseDiceExpr,
  diceMin,
  diceMax,
  diceAverage,
  diceToString,
  diceRoll,
} from './dice-expr.js';
export type { DiceExpr } from './dice-expr.js';

// Schemas & types
export {
  DiceExprStringSchema,
  WeaponTypeSchema,
  WeaponProfileSchema,
  AbilitySchema,
  UnitDatasheetSchema,
  ArmyListUnitSchema,
  ArmyListSchema,
  DetachmentSchema,
} from './schemas.js';
export type {
  WeaponProfile,
  Ability,
  UnitDatasheet,
  ArmyListUnit,
  ArmyList,
  Detachment,
} from './schemas.js';

// Detachments
export { SHIELD_HOST } from './detachments/shield-host.js';

// BattleScribe importer
export { importBattleScribeRoster } from './battlescribe-importer.js';
export type { ImportOptions } from './battlescribe-importer.js';

// Army loader
export {
  validateArmyList,
  summarizeArmy,
  unitToBlob,
} from './army-loader.js';
export type {
  ArmyValidationResult,
  ArmySummary,
  BlobUnitInit,
} from './army-loader.js';

// Army spawner (content → engine bridge)
export { spawnArmy, createPlaceholderOpponent } from './army-spawner.js';
export type { PlayerSide } from './army-spawner.js';
