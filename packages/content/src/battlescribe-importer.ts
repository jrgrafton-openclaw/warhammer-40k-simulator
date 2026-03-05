/**
 * BattleScribe / NewRecruit roster importer.
 *
 * Converts the BattleScribe JSON roster format (v2.03) into our canonical ArmyList schema.
 * Compatible with exports from newrecruit.eu and BattleScribe apps.
 *
 * Design notes:
 * - Parsing is defensive: unknown fields are ignored, missing optional fields get defaults.
 * - Weapons are collected recursively from the selection tree.
 * - Unit stats are extracted from the first "Unit" typeName profile found in the tree.
 * - Invulnerable saves are parsed from Ability description text as a fallback.
 */

import type { ArmyList, ArmyListUnit, UnitDatasheet, WeaponProfile, Ability } from './schemas.js';

// ---------------------------------------------------------------------------
// Raw BattleScribe types (loose, for parsing)
// ---------------------------------------------------------------------------

interface BSCharacteristic {
  name: string;
  $text: string;
}

interface BSProfile {
  id: string;
  name: string;
  typeName: string;
  characteristics: BSCharacteristic[];
}

interface BSCost {
  name: string;
  value: number;
}

interface BSCategory {
  id: string;
  name: string;
  primary: boolean;
}

interface BSRule {
  name: string;
  description: string;
}

interface BSSelection {
  id: string;
  name: string;
  type: string;
  /** Number of models/items in this selection (for multi-model sub-selections) */
  number?: number;
  costs?: BSCost[];
  categories?: BSCategory[];
  profiles?: BSProfile[];
  rules?: BSRule[];
  selections?: BSSelection[];
}

interface BSForce {
  catalogueName?: string;
  selections: BSSelection[];
}

interface BSRoster {
  costs?: BSCost[];
  costLimits?: BSCost[];
  forces?: BSForce[];
  name?: string;
}

interface BSFile {
  roster: BSRoster;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** "6\"" → 6, "10\"" → 10 */
function parseInches(val: string): number {
  const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/** "2+" → 2, "3+" → 3, "6+" → 6 */
function parsePlusValue(val: string): number {
  const n = parseInt(val.replace('+', '').trim(), 10);
  return isNaN(n) ? 6 : n;
}

/** "24\"" → 24, "Melee" → 'Melee', "18\"" → 18 */
function parseRange(val: string): number | 'Melee' {
  const v = val.trim();
  if (v.toLowerCase() === 'melee') return 'Melee';
  return parseInches(v);
}

/** "-2" → -2, "0" → 0, "-3" → -3 */
function parseAP(val: string): number {
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? 0 : n;
}

/** "Precision,Assault" or "-" → string[] */
function parseKeywords(val: string): string[] {
  const v = val.trim();
  if (v === '-' || v === '') return [];
  return v.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
}

/** Extract a named characteristic from a profile */
function getChar(profile: BSProfile, name: string): string {
  const c = profile.characteristics.find((ch) => ch.name === name);
  return c?.$text?.trim() ?? '';
}

/** Slugify a name for use as an ID */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Get pts cost from a selection — recursive sum includes enhancements and wargear sub-costs */
function getPts(sel: BSSelection): number {
  let total = 0;
  for (const c of sel.costs ?? []) {
    if (c.name === 'pts') total += c.value;
  }
  for (const sub of sel.selections ?? []) {
    total += getPts(sub);
  }
  return total;
}

/** Get primary category name from a selection */
function getPrimaryCategory(sel: BSSelection): string {
  if (!sel.categories) return 'Unknown';
  const primary = sel.categories.find((c) => c.primary);
  return primary?.name ?? 'Unknown';
}

/** Get all category names */
function getAllCategories(sel: BSSelection): string[] {
  return (sel.categories ?? []).map((c) => c.name);
}

/** Check if selection is a configuration item (not a real unit) */
function isConfigurationItem(sel: BSSelection): boolean {
  if (!sel.categories) return false;
  return sel.categories.some(
    (c) => c.name === 'Configuration' || c.name === 'Illegal Units'
  );
}

/** Recursively collect all profiles from a selection tree */
function collectProfiles(sel: BSSelection): BSProfile[] {
  const result: BSProfile[] = [...(sel.profiles ?? [])];
  for (const sub of sel.selections ?? []) {
    result.push(...collectProfiles(sub));
  }
  return result;
}

/** Collect all rules from a selection tree */
function collectRules(sel: BSSelection): BSRule[] {
  const result: BSRule[] = [...(sel.rules ?? [])];
  for (const sub of sel.selections ?? []) {
    result.push(...collectRules(sub));
  }
  return result;
}

/** Check if a sub-selection is a Warlord designation */
function isWarlord(sel: BSSelection): boolean {
  function checkRec(s: BSSelection): boolean {
    if (s.name === 'Warlord') return true;
    return (s.selections ?? []).some(checkRec);
  }
  return (sel.selections ?? []).some(checkRec);
}

/** Collect enhancement names (named upgrades with pts costs in the top-level sub-selections) */
function collectEnhancements(sel: BSSelection): string[] {
  const result: string[] = [];
  for (const sub of sel.selections ?? []) {
    const pts = getPts(sub);
    if (pts > 0 && sub.type === 'upgrade') {
      result.push(sub.name);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parse invulnerable save from ability description text
// ---------------------------------------------------------------------------

/** "This model has a 4+ invulnerable save." → 4 */
function parseInvulnFromAbilities(abilities: BSProfile[]): number | null {
  for (const p of abilities) {
    if (p.typeName !== 'Abilities') continue;
    for (const c of p.characteristics) {
      const text = c.$text ?? '';
      const match = /(\d)\+\s+invulnerable save/i.exec(text);
      if (match?.[1]) return parseInt(match[1], 10);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Weapon extraction
// ---------------------------------------------------------------------------

function buildWeaponProfile(profile: BSProfile, type: 'melee' | 'ranged'): WeaponProfile | null {
  const name = profile.name.replace(/^➤\s*/, '').trim(); // strip leading arrow
  if (!name) return null;

  // Skip duplicate "base" name entries that are selections rather than profiles
  const range = parseRange(getChar(profile, 'Range'));
  const attacksRaw = getChar(profile, 'A');
  const skillRaw = type === 'melee' ? getChar(profile, 'WS') : getChar(profile, 'BS');
  const strengthRaw = getChar(profile, 'S');
  const apRaw = getChar(profile, 'AP');
  const damageRaw = getChar(profile, 'D');
  const keywordsRaw = type === 'melee'
    ? getChar(profile, 'Keywords')
    : getChar(profile, 'Keywords');

  // Validate we have meaningful data
  if (!attacksRaw || !strengthRaw) return null;

  const skill = parsePlusValue(skillRaw || '4+');
  const strength = parseInt(strengthRaw, 10) || 3;
  const ap = parseAP(apRaw);
  const damage = damageRaw || '1';
  const attacks = attacksRaw || '1';
  const keywords = parseKeywords(keywordsRaw);

  // Validate dice expressions
  const dicePattern = /^(\d*)D(\d+)([+-]\d+)?$|^-?\d+$/i;
  if (!dicePattern.test(attacks.trim())) return null;
  if (!dicePattern.test(damage.trim())) return null;

  return {
    id: slugify(name),
    name,
    type,
    range: range as number | 'Melee',
    attacks: attacks.trim(),
    skill,
    strength,
    ap,
    damage: damage.trim(),
    keywords,
  };
}

function extractWeapons(sel: BSSelection): WeaponProfile[] {
  const allProfiles = collectProfiles(sel);
  // Deduplicate by (id, type) — a weapon like "Guardian Spear" can have both
  // melee AND ranged profiles, so we must include both.
  const seen = new Set<string>();
  const weapons: WeaponProfile[] = [];

  for (const p of allProfiles) {
    if (p.typeName === 'Melee Weapons') {
      const w = buildWeaponProfile(p, 'melee');
      const key = `melee:${w?.id ?? ''}`;
      if (w && !seen.has(key)) {
        seen.add(key);
        weapons.push(w);
      }
    } else if (p.typeName === 'Ranged Weapons') {
      const w = buildWeaponProfile(p, 'ranged');
      const key = `ranged:${w?.id ?? ''}`;
      if (w && !seen.has(key)) {
        seen.add(key);
        weapons.push(w);
      }
    }
  }

  return weapons;
}

// ---------------------------------------------------------------------------
// Unit datasheet extraction
// ---------------------------------------------------------------------------

function extractUnitStats(sel: BSSelection): {
  movement: number;
  toughness: number;
  save: number;
  wounds: number;
  leadership: number;
  oc: number;
} | null {
  const allProfiles = collectProfiles(sel);
  const unitProfile = allProfiles.find((p) => p.typeName === 'Unit');
  if (!unitProfile) return null;

  const movement = parseInches(getChar(unitProfile, 'M'));
  const toughness = parseInt(getChar(unitProfile, 'T'), 10) || 4;
  const save = parsePlusValue(getChar(unitProfile, 'SV') || '3+');
  const wounds = parseInt(getChar(unitProfile, 'W'), 10) || 1;
  const leadership = parsePlusValue(getChar(unitProfile, 'LD') || '6+');
  const oc = parseInt(getChar(unitProfile, 'OC'), 10) || 0;

  return { movement, toughness, save, wounds, leadership, oc };
}

function extractAbilities(sel: BSSelection): Ability[] {
  const allProfiles = collectProfiles(sel);
  const allRules = collectRules(sel);
  const seen = new Set<string>();
  const abilities: Ability[] = [];

  // From profiles (Abilities typeName)
  for (const p of allProfiles) {
    if (p.typeName === 'Abilities') {
      const desc = p.characteristics.map((c) => c.$text ?? '').join(' ').trim();
      if (!seen.has(p.name)) {
        seen.add(p.name);
        abilities.push({ name: p.name, description: desc });
      }
    }
  }

  // From rules
  for (const r of allRules) {
    if (!seen.has(r.name)) {
      seen.add(r.name);
      abilities.push({ name: r.name, description: r.description });
    }
  }

  return abilities;
}

/** Count model count from sub-selections of type "model" */
function countModels(sel: BSSelection): number {
  const modelSels = (sel.selections ?? []).filter(
    (s) => s.type === 'model' || s.type === 'unit'
  );
  if (modelSels.length === 0) {
    // Leaf model (e.g. Blade Champion, Caladius) — single model
    return 1;
  }
  let total = 0;
  for (const sub of modelSels) {
    total += sub.number ?? 1;
  }
  return total || 1;
}

function buildDatasheet(sel: BSSelection, faction: string): UnitDatasheet | null {
  const stats = extractUnitStats(sel);
  if (!stats) return null;

  const allProfiles = collectProfiles(sel);
  const invuln = parseInvulnFromAbilities(allProfiles);
  const weapons = extractWeapons(sel);
  const abilities = extractAbilities(sel);
  const keywords = getAllCategories(sel);
  const primaryCategory = getPrimaryCategory(sel);
  const modelCount = countModels(sel);

  return {
    id: slugify(sel.name),
    name: sel.name,
    faction,
    keywords,
    primaryCategory,
    movement: stats.movement,
    toughness: stats.toughness,
    save: stats.save,
    invuln,
    fnp: null, // future: parse from Daughter of the Abyss style abilities
    wounds: stats.wounds,
    leadership: stats.leadership,
    oc: stats.oc,
    weapons,
    abilities,
    basePoints: getPts(sel),
    modelCount,
  };
}

// ---------------------------------------------------------------------------
// Main importer
// ---------------------------------------------------------------------------

export interface ImportOptions {
  /** Throw if total pts validation fails. Default: true */
  validatePoints?: boolean;
  /** Throw on any Zod validation failure. Default: false (warn instead) */
  strictValidation?: boolean;
}

/**
 * Import a BattleScribe/NewRecruit JSON roster into our canonical ArmyList format.
 *
 * @param json  Parsed JSON object (or stringified JSON) from the roster file.
 */
export function importBattleScribeRoster(
  json: unknown,
  opts: ImportOptions = {}
): ArmyList {
  const { validatePoints = true } = opts;

  // Accept string or parsed object
  const raw: BSFile = (typeof json === 'string' ? JSON.parse(json) : json) as BSFile;

  const roster = raw.roster;
  if (!roster) throw new Error('Invalid BattleScribe file: missing "roster" root key');

  const forcesArray = roster.forces ?? [];
  if (forcesArray.length === 0) throw new Error('Roster has no forces');

  const force = forcesArray[0]!;
  const catalogueName = force.catalogueName ?? 'Unknown Faction';

  // Faction name: strip "Imperium - " prefix for cleaner display
  const faction = catalogueName.replace(/^Imperium\s*-\s*/i, '').trim();

  // Detachment: find in top-level selections
  let detachment = 'Unknown';
  let pointsLimit = 2000;

  const allCosts = roster.costLimits ?? [];
  const ptsLimit = allCosts.find((c) => c.name === 'pts');
  if (ptsLimit) pointsLimit = ptsLimit.value;

  const topSelections = force.selections ?? [];

  // Extract detachment name from "Detachments" selection
  for (const sel of topSelections) {
    if (sel.name === 'Detachments') {
      const sub = (sel.selections ?? [])[0];
      if (sub) detachment = sub.name;
    }
  }

  // Filter to real unit selections
  const unitSelections = topSelections.filter((sel) => {
    if (isConfigurationItem(sel)) return false;
    if (sel.name === 'Battle Size' || sel.name === 'Detachments' || sel.name === 'Show/Hide Options') return false;
    if (sel.type === 'upgrade' && getPts(sel) === 0) return false;
    return true;
  });

  const units: ArmyListUnit[] = [];

  for (const sel of unitSelections) {
    const datasheet = buildDatasheet(sel, faction);
    if (!datasheet) {
      // Skip if we couldn't extract stats (may be a no-stat allied unit etc.)
      continue;
    }

    units.push({
      selectionId: sel.id,
      datasheetId: datasheet.id,
      name: sel.name,
      points: getPts(sel),
      primaryCategory: getPrimaryCategory(sel),
      isWarlord: isWarlord(sel),
      enhancements: collectEnhancements(sel),
      datasheet,
    });
  }

  const totalPoints = units.reduce((sum, u) => sum + u.points, 0);

  // Validate pts total matches roster total
  const rosterTotal = (roster.costs ?? []).find((c) => c.name === 'pts')?.value ?? 0;
  if (validatePoints && rosterTotal > 0 && Math.abs(totalPoints - rosterTotal) > 5) {
    throw new Error(
      `Points mismatch: parsed ${totalPoints}pts but roster reports ${rosterTotal}pts ` +
      `(diff ${totalPoints - rosterTotal}). Some units may have been filtered incorrectly.`
    );
  }

  return {
    name: roster.name ?? 'Unnamed Army',
    faction,
    detachment,
    totalPoints: rosterTotal || totalPoints,
    pointsLimit,
    units,
  };
}
