/**
 * Phase 2 — Army Importer Tests
 * Uses the Custodes "Test Army" fixture (1985pts, Shield Host detachment).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  importBattleScribeRoster,
  validateArmyList,
  summarizeArmy,
} from '../index.js';
import type { ArmyList } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'custodes-test-army.json');

let army: ArmyList;

beforeAll(() => {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as unknown;
  army = importBattleScribeRoster(raw, { validatePoints: true });
});

// ---------------------------------------------------------------------------
// Top-level army metadata
// ---------------------------------------------------------------------------

describe('ArmyList metadata', () => {
  it('has correct name', () => {
    expect(army.name).toBe('Test Army');
  });

  it('has correct faction', () => {
    expect(army.faction).toBe('Adeptus Custodes');
  });

  it('has correct detachment', () => {
    expect(army.detachment).toBe('Shield Host');
  });

  it('has correct total points (1985)', () => {
    expect(army.totalPoints).toBe(1985);
  });

  it('has correct points limit (2000)', () => {
    expect(army.pointsLimit).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// Unit roster
// ---------------------------------------------------------------------------

describe('Army unit roster', () => {
  it('has 13 unit entries', () => {
    expect(army.units).toHaveLength(13);
  });

  it('unit names include all expected units', () => {
    const names = army.units.map((u) => u.name);
    // Two Blade Champions
    const bladeChamps = names.filter((n) => n === 'Blade Champion');
    expect(bladeChamps).toHaveLength(2);
    // Four Custodian Guard squads
    const custGuard = names.filter((n) => n === 'Custodian Guard');
    expect(custGuard).toHaveLength(4);
    // Two Allarus Custodians squads
    const allarus = names.filter((n) => n === 'Allarus Custodians');
    expect(allarus).toHaveLength(2);
    // Two Prosecutors squads
    const prosecutors = names.filter((n) => n === 'Prosecutors');
    expect(prosecutors).toHaveLength(2);
    // Two Caladius Grav-tanks
    const caladius = names.filter((n) => n === 'Caladius Grav-tank');
    expect(caladius).toHaveLength(2);
    // One Inquisitor Draxus
    const draxus = names.filter((n) => n === 'Inquisitor Draxus');
    expect(draxus).toHaveLength(1);
  });

  it('unit points sum matches army total', () => {
    const sum = army.units.reduce((acc, u) => acc + u.points, 0);
    expect(sum).toBe(army.totalPoints);
  });

  it('exactly one Warlord designated', () => {
    const warlords = army.units.filter((u) => u.isWarlord);
    expect(warlords).toHaveLength(1);
    expect(warlords[0]!.name).toBe('Blade Champion');
  });
});

// ---------------------------------------------------------------------------
// Blade Champion (Warlord) — Character, with Auric Mantle (+2W, +15pts)
// ---------------------------------------------------------------------------

describe('Blade Champion (Warlord)', () => {
  let bc: ArmyList['units'][0];

  beforeAll(() => {
    bc = army.units.find((u) => u.name === 'Blade Champion' && u.isWarlord)!;
  });

  it('exists', () => expect(bc).toBeDefined());

  it('costs 135pts (120 base + 15 Auric Mantle)', () => {
    expect(bc.points).toBe(135);
  });

  it('primary category is Character', () => {
    expect(bc.primaryCategory).toBe('Character');
  });

  it('has Auric Mantle enhancement', () => {
    expect(bc.enhancements).toContain('Auric Mantle');
  });

  it('has T6, SV2+, W8 (with Auric Mantle), OC2', () => {
    const ds = bc.datasheet;
    expect(ds.toughness).toBe(6);
    expect(ds.save).toBe(2);
    expect(ds.wounds).toBe(8); // 6 base + 2 from Auric Mantle
    expect(ds.oc).toBe(2);
  });

  it('has M6"', () => {
    expect(bc.datasheet.movement).toBe(6);
  });

  it('has a 4+ invulnerable save', () => {
    expect(bc.datasheet.invuln).toBe(4);
  });

  it('has Vaultswords weapons (3 profiles: Behemor, Hurricanis, Victus)', () => {
    const weapons = bc.datasheet.weapons;
    const names = weapons.map((w) => w.name);
    expect(names).toContain('Vaultswords - Behemor');
    expect(names).toContain('Vaultswords - Hurricanis');
    expect(names).toContain('Vaultswords - Victus');
  });

  it('Vaultswords Victus has Devastating Wounds keyword', () => {
    const victus = bc.datasheet.weapons.find((w) => w.name === 'Vaultswords - Victus')!;
    expect(victus).toBeDefined();
    expect(victus.keywords).toContain('Devastating Wounds');
    expect(victus.ap).toBe(-3);
    expect(victus.damage).toBe('3');
  });

  it('Vaultswords Behemor has Precision keyword', () => {
    const behemor = bc.datasheet.weapons.find((w) => w.name === 'Vaultswords - Behemor')!;
    expect(behemor).toBeDefined();
    expect(behemor.keywords).toContain('Precision');
    expect(behemor.strength).toBe(7);
    expect(behemor.ap).toBe(-2);
  });

  it('datasheetId is slugified name', () => {
    expect(bc.datasheetId).toBe('blade-champion');
  });
});

// ---------------------------------------------------------------------------
// Custodian Guard — Battleline, 5 models
// ---------------------------------------------------------------------------

describe('Custodian Guard', () => {
  let cg: ArmyList['units'][0];

  beforeAll(() => {
    // Take any of the four squads
    cg = army.units.find((u) => u.name === 'Custodian Guard')!;
  });

  it('exists', () => expect(cg).toBeDefined());

  it('costs 190pts each', () => {
    const allCG = army.units.filter((u) => u.name === 'Custodian Guard');
    for (const unit of allCG) {
      expect(unit.points).toBe(190);
    }
  });

  it('primary category is Battleline', () => {
    expect(cg.primaryCategory).toBe('Battleline');
  });

  it('has T6, SV2+, W3, OC2', () => {
    const ds = cg.datasheet;
    expect(ds.toughness).toBe(6);
    expect(ds.save).toBe(2);
    expect(ds.wounds).toBe(3);
    expect(ds.oc).toBe(2);
  });

  it('has a 4+ invulnerable save', () => {
    expect(cg.datasheet.invuln).toBe(4);
  });

  it('has 5 models', () => {
    expect(cg.datasheet.modelCount).toBe(5);
  });

  it('has Guardian Spear (melee and ranged profiles)', () => {
    const weapons = cg.datasheet.weapons;
    const melee = weapons.find((w) => w.name === 'Guardian Spear' && w.type === 'melee');
    const ranged = weapons.find((w) => w.name === 'Guardian Spear' && w.type === 'ranged');
    expect(melee).toBeDefined();
    expect(ranged).toBeDefined();
    // Melee: A5, WS2+, S7, AP-2, D2
    expect(melee!.attacks).toBe('5');
    expect(melee!.skill).toBe(2);
    expect(melee!.strength).toBe(7);
    expect(melee!.ap).toBe(-2);
    expect(melee!.damage).toBe('2');
    // Ranged: A2, BS2+, S4, AP-1, D2, Assault
    expect(ranged!.attacks).toBe('2');
    expect(ranged!.strength).toBe(4);
    expect(ranged!.keywords).toContain('Assault');
  });

  it('has Stand Vigil and Sentinel Storm abilities', () => {
    const abilityNames = cg.datasheet.abilities.map((a) => a.name);
    expect(abilityNames).toContain('Stand Vigil');
    expect(abilityNames).toContain('Sentinel Storm');
  });
});

// ---------------------------------------------------------------------------
// Allarus Custodians
// ---------------------------------------------------------------------------

describe('Allarus Custodians', () => {
  it('3-model squad costs 165pts', () => {
    const unit = army.units.find(
      (u) => u.name === 'Allarus Custodians' && u.points === 165
    );
    expect(unit).toBeDefined();
    expect(unit!.datasheet.modelCount).toBe(3);
  });

  it('2-model squad costs 110pts', () => {
    const unit = army.units.find(
      (u) => u.name === 'Allarus Custodians' && u.points === 110
    );
    expect(unit).toBeDefined();
    expect(unit!.datasheet.modelCount).toBe(2);
  });

  it('has T7, SV2+, W4', () => {
    const unit = army.units.find((u) => u.name === 'Allarus Custodians')!;
    expect(unit.datasheet.toughness).toBe(7);
    expect(unit.datasheet.save).toBe(2);
    expect(unit.datasheet.wounds).toBe(4);
  });

  it('has Balistus grenade launcher (ranged, D6 attacks)', () => {
    const unit = army.units.find((u) => u.name === 'Allarus Custodians')!;
    const launcher = unit.datasheet.weapons.find(
      (w) => w.name === 'Balistus grenade launcher'
    );
    expect(launcher).toBeDefined();
    expect(launcher!.type).toBe('ranged');
    expect(launcher!.attacks).toBe('D6');
    expect(launcher!.keywords).toContain('Blast');
  });
});

// ---------------------------------------------------------------------------
// Caladius Grav-tank — Vehicle
// ---------------------------------------------------------------------------

describe('Caladius Grav-tank', () => {
  let tank: ArmyList['units'][0];

  beforeAll(() => {
    tank = army.units.find((u) => u.name === 'Caladius Grav-tank')!;
  });

  it('exists', () => expect(tank).toBeDefined());

  it('costs 215pts', () => {
    const allTanks = army.units.filter((u) => u.name === 'Caladius Grav-tank');
    for (const t of allTanks) expect(t.points).toBe(215);
  });

  it('primary category is Vehicle', () => {
    expect(tank.primaryCategory).toBe('Vehicle');
  });

  it('has T11, SV2+, W14, M10"', () => {
    const ds = tank.datasheet;
    expect(ds.toughness).toBe(11);
    expect(ds.save).toBe(2);
    expect(ds.wounds).toBe(14);
    expect(ds.movement).toBe(10);
  });

  it('has a 5+ invulnerable save', () => {
    expect(tank.datasheet.invuln).toBe(5);
  });

  it('has Twin arachnus heavy blaze cannon (D6+2 damage)', () => {
    const cannon = tank.datasheet.weapons.find(
      (w) => w.name === 'Twin arachnus heavy blaze cannon'
    );
    expect(cannon).toBeDefined();
    expect(cannon!.damage).toBe('D6+2');
    expect(cannon!.keywords).toContain('Twin-linked');
    expect(cannon!.strength).toBe(12);
    expect(cannon!.ap).toBe(-3);
  });

  it('has Twin lastrum bolt cannon', () => {
    const cannon = tank.datasheet.weapons.find(
      (w) => w.name === 'Twin lastrum bolt cannon'
    );
    expect(cannon).toBeDefined();
    expect(cannon!.keywords).toContain('Sustained Hits 1');
  });
});

// ---------------------------------------------------------------------------
// Prosecutors (Anathema Psykana)
// ---------------------------------------------------------------------------

describe('Prosecutors', () => {
  it('each squad costs 85pts', () => {
    const units = army.units.filter((u) => u.name === 'Prosecutors');
    expect(units).toHaveLength(2);
    for (const u of units) expect(u.points).toBe(85);
  });

  it('each squad has 10 models (1 Sister Superior + 9 Prosecutors)', () => {
    const unit = army.units.find((u) => u.name === 'Prosecutors')!;
    expect(unit.datasheet.modelCount).toBe(10);
  });

  it('has T3, SV3+', () => {
    const unit = army.units.find((u) => u.name === 'Prosecutors')!;
    expect(unit.datasheet.toughness).toBe(3);
    expect(unit.datasheet.save).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Inquisitor Draxus (Allied Unit)
// ---------------------------------------------------------------------------

describe('Inquisitor Draxus', () => {
  it('costs 95pts', () => {
    const draxus = army.units.find((u) => u.name === 'Inquisitor Draxus');
    expect(draxus?.points).toBe(95);
  });

  it('has T3, W4, 5+ invuln', () => {
    const draxus = army.units.find((u) => u.name === 'Inquisitor Draxus')!;
    expect(draxus.datasheet.toughness).toBe(3);
    expect(draxus.datasheet.wounds).toBe(4);
    expect(draxus.datasheet.invuln).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validateArmyList', () => {
  it('returns valid=true for the Custodes army', () => {
    const result = validateArmyList(army);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.totalPoints).toBe(1985);
    expect(result.unitCount).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// summarizeArmy
// ---------------------------------------------------------------------------

describe('summarizeArmy', () => {
  it('returns correct summary', () => {
    const summary = summarizeArmy(army);
    expect(summary.warlord).toBe('Blade Champion');
    expect(summary.totalPoints).toBe(1985);
    expect(summary.faction).toBe('Adeptus Custodes');
    expect(summary.unitBreakdown).toHaveLength(13);
  });
});
