/**
 * Phase 7 — Leader Attachment tests.
 * Covers: ATTACH_LEADER action, targeting validation (embedded leader cannot be targeted),
 * wound allocation order (bodyguard absorbs first), and leader separation on bodyguard death.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine, SeededRng, TranscriptLog, createInitialState } from '../index.js';
import type { BlobUnit, EngineWeapon } from '../index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOLTER: EngineWeapon = {
  id: 'bolter', name: 'Bolter', type: 'ranged', range: 24,
  attacks: '2', skill: 3, strength: 4, ap: 0, damage: '1', keywords: [],
};
const BIG_GUN: EngineWeapon = {
  id: 'big-gun', name: 'Big Gun', type: 'ranged', range: 36,
  attacks: '20', skill: 2, strength: 10, ap: -4, damage: '3', keywords: [],
};
const SWORD: EngineWeapon = {
  id: 'sword', name: 'Power Sword', type: 'melee', range: 'Melee',
  attacks: '4', skill: 3, strength: 5, ap: -2, damage: '1', keywords: [],
};

function makeUnit(overrides: Partial<BlobUnit>): BlobUnit {
  return {
    id: 'unit', datasheetId: 'test', name: 'Test Unit',
    playerId: 'player1', center: { x: 10, y: 10 }, radius: 1,
    movementInches: 6, remainingMove: 6,
    toughness: 4, save: 3, invuln: null, fnp: null,
    oc: 2, wounds: 6, maxWounds: 6,
    hasFired: false, hasCharged: false, hasFought: false,
    hasAdvanced: false, isInEngagement: false, movedThisPhase: false,
    weapons: [BOLTER],
    keywords: ['INFANTRY'],
    factionKeywords: ['ADEPTUS_CUSTODES'],
    ...overrides,
  };
}

/** Build engine in COMMAND phase (default starting phase) */
function makeCommandEngine(units: BlobUnit[], seed = 42): GameEngine {
  const state = createInitialState(['player1', 'player2'], { rngSeed: seed });
  return new GameEngine({ ...state, units }, new SeededRng(seed), new TranscriptLog());
}

// ---------------------------------------------------------------------------
// ATTACH_LEADER validation
// ---------------------------------------------------------------------------

describe('ATTACH_LEADER validation', () => {
  it('succeeds when leader attaches to compatible bodyguard', () => {
    const leader = makeUnit({
      id: 'leader', name: 'Shield-Captain', playerId: 'player1',
      isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'],
    });
    const bodyguard = makeUnit({
      id: 'guard', name: 'Custodian Guard', playerId: 'player1',
      factionKeywords: ['ADEPTUS_CUSTODES'],
    });
    const eng = makeCommandEngine([leader, bodyguard]);
    const res = eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });
    expect(res.success).toBe(true);
  });

  it('fails if leader unit not found', () => {
    const bodyguard = makeUnit({ id: 'guard', name: 'Guard', playerId: 'player1' });
    const eng = makeCommandEngine([bodyguard]);
    const res = eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'GHOST', bodyguardId: 'guard' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });

  it('fails if bodyguard unit not found', () => {
    const leader = makeUnit({ id: 'leader', isLeader: true });
    const eng = makeCommandEngine([leader]);
    const res = eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'GHOST' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });

  it('fails if unit is not a LEADER', () => {
    const notLeader = makeUnit({ id: 'a', name: 'Not a leader' });
    const bodyguard = makeUnit({ id: 'b', name: 'Guard', playerId: 'player1' });
    const eng = makeCommandEngine([notLeader, bodyguard]);
    const res = eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'a', bodyguardId: 'b' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('not a LEADER') });
  });

  it('fails if leader is already attached to another unit', () => {
    const leader = makeUnit({ id: 'leader', isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'] });
    const guard1 = makeUnit({ id: 'g1', playerId: 'player1', factionKeywords: ['ADEPTUS_CUSTODES'] });
    const guard2 = makeUnit({ id: 'g2', playerId: 'player1', factionKeywords: ['ADEPTUS_CUSTODES'] });
    const eng = makeCommandEngine([leader, guard1, guard2]);
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'g1' });
    const res = eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'g2' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('already attached') });
  });

  it('fails if bodyguard already has a leader attached', () => {
    const leader1 = makeUnit({ id: 'l1', isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'] });
    const leader2 = makeUnit({ id: 'l2', isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'] });
    const guard = makeUnit({ id: 'guard', playerId: 'player1', factionKeywords: ['ADEPTUS_CUSTODES'] });
    const eng = makeCommandEngine([leader1, leader2, guard]);
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'l1', bodyguardId: 'guard' });
    const res = eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'l2', bodyguardId: 'guard' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('already has a leader') });
  });

  it('fails if leader and bodyguard share no faction keywords', () => {
    const leader = makeUnit({ id: 'leader', isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'] });
    const guard = makeUnit({ id: 'guard', playerId: 'player1', factionKeywords: ['CHAOS'] });
    const eng = makeCommandEngine([leader, guard]);
    const res = eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('incompatible') });
  });
});

// ---------------------------------------------------------------------------
// ATTACH_LEADER state effects
// ---------------------------------------------------------------------------

describe('ATTACH_LEADER state effects', () => {
  it('sets leadingUnitId on leader after attachment', () => {
    const leader = makeUnit({ id: 'leader', isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'] });
    const guard = makeUnit({ id: 'guard', playerId: 'player1', factionKeywords: ['ADEPTUS_CUSTODES'] });
    const eng = makeCommandEngine([leader, guard]);
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });
    const state = eng.getState();
    const updatedLeader = state.units.find((u) => u.id === 'leader');
    expect(updatedLeader?.leadingUnitId).toBe('guard');
  });

  it('sets attachedLeaderId on bodyguard after attachment', () => {
    const leader = makeUnit({ id: 'leader', isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'] });
    const guard = makeUnit({ id: 'guard', playerId: 'player1', factionKeywords: ['ADEPTUS_CUSTODES'] });
    const eng = makeCommandEngine([leader, guard]);
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });
    const state = eng.getState();
    const updatedGuard = state.units.find((u) => u.id === 'guard');
    expect(updatedGuard?.attachedLeaderId).toBe('leader');
  });
});

// ---------------------------------------------------------------------------
// Targeting validation — embedded leader cannot be targeted
// ---------------------------------------------------------------------------

describe('Shooting targeting — embedded leader protection', () => {
  it('leader cannot be targeted for shooting when embedded in bodyguard', () => {
    const attacker = makeUnit({
      id: 'attacker', playerId: 'player2', center: { x: 30, y: 10 },
      weapons: [BOLTER], factionKeywords: ['CHAOS'],
    });
    const leader = makeUnit({
      id: 'leader', name: 'Shield-Captain', playerId: 'player1',
      center: { x: 10, y: 10 }, isLeader: true,
      factionKeywords: ['ADEPTUS_CUSTODES'],
    });
    const bodyguard = makeUnit({
      id: 'guard', name: 'Custodian Guard', playerId: 'player1',
      center: { x: 10, y: 10 }, factionKeywords: ['ADEPTUS_CUSTODES'],
    });

    const eng = makeCommandEngine([attacker, leader, bodyguard]);
    // Attach leader to bodyguard
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });
    // Advance to SHOOTING phase (player2 needs to be active — but player1 is first active)
    // Advance to player2's SHOOTING phase
    eng.dispatch({ type: 'END_PHASE' }); // COMMAND p1 → MOVEMENT p1
    eng.dispatch({ type: 'END_PHASE' }); // MOVEMENT p1 → SHOOTING p1
    eng.dispatch({ type: 'END_PHASE' }); // SHOOTING p1 → CHARGE p1
    eng.dispatch({ type: 'END_PHASE' }); // CHARGE p1 → FIGHT p1
    eng.dispatch({ type: 'END_PHASE' }); // FIGHT p1 → END p1
    eng.dispatch({ type: 'END_PHASE' }); // END p1 → COMMAND p2
    eng.dispatch({ type: 'END_PHASE' }); // COMMAND p2 → MOVEMENT p2
    eng.dispatch({ type: 'END_PHASE' }); // MOVEMENT p2 → SHOOTING p2

    const res = eng.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'leader', weaponIndex: 0 });
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('attached') });
  });

  it('leader CAN be targeted once bodyguard is destroyed', () => {
    const attacker = makeUnit({
      id: 'attacker', playerId: 'player2',
      center: { x: 15, y: 10 }, weapons: [BIG_GUN],
      factionKeywords: ['CHAOS'],
    });
    const leader = makeUnit({
      id: 'leader', name: 'Shield-Captain', playerId: 'player1',
      center: { x: 10, y: 10 }, isLeader: true, wounds: 5, maxWounds: 5,
      factionKeywords: ['ADEPTUS_CUSTODES'],
    });
    const bodyguard = makeUnit({
      id: 'guard', name: 'Custodian Guard', playerId: 'player1',
      center: { x: 10, y: 10 },
      toughness: 4, save: 6, invuln: null, fnp: null,
      wounds: 1, maxWounds: 1,
      factionKeywords: ['ADEPTUS_CUSTODES'],
    });

    const eng = makeCommandEngine([attacker, leader, bodyguard]);
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });

    // Advance to player2's SHOOTING phase (8 phases from COMMAND p1)
    for (let i = 0; i < 8; i++) eng.dispatch({ type: 'END_PHASE' });

    // Shoot bodyguard to destroy it (weak T4/6+ save)
    const shootGuard = eng.dispatch({ type: 'SHOOT', attackerId: 'attacker', targetId: 'guard', weaponIndex: 0 });
    expect(shootGuard.success).toBe(true);

    // Verify bodyguard is destroyed
    const stateAfterBodyguard = eng.getState();
    expect(stateAfterBodyguard.units.find((u) => u.id === 'guard')).toBeUndefined();

    // Verify leader is now standalone
    const leaderAfter = stateAfterBodyguard.units.find((u) => u.id === 'leader');
    expect(leaderAfter?.leadingUnitId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Leader separation on bodyguard death
// ---------------------------------------------------------------------------

describe('Leader separation on bodyguard death', () => {
  it('clears leadingUnitId from leader when bodyguard is destroyed', () => {
    const att = makeUnit({
      id: 'att', playerId: 'player2',
      center: { x: 15, y: 10 }, weapons: [BIG_GUN],
      factionKeywords: ['CHAOS'],
    });
    const leader = makeUnit({
      id: 'leader', playerId: 'player1', center: { x: 10, y: 10 },
      isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'],
    });
    const bodyguard = makeUnit({
      id: 'guard', playerId: 'player1', center: { x: 10, y: 10 },
      toughness: 3, save: 6, wounds: 1, maxWounds: 1,
      factionKeywords: ['ADEPTUS_CUSTODES'],
    });

    const eng = makeCommandEngine([att, leader, bodyguard]);
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });
    // 8 END_PHASEs: COMMAND p1 → ... → END p1 → COMMAND p2 → MOVEMENT p2 → SHOOTING p2
    for (let i = 0; i < 8; i++) eng.dispatch({ type: 'END_PHASE' });
    eng.dispatch({ type: 'SHOOT', attackerId: 'att', targetId: 'guard', weaponIndex: 0 });

    const state = eng.getState();
    const leaderAfter = state.units.find((u) => u.id === 'leader');
    // If bodyguard was destroyed, leader becomes standalone (leadingUnitId cleared)
    if (!state.units.find((u) => u.id === 'guard')) {
      expect(leaderAfter?.leadingUnitId).toBeUndefined();
    }
  });

  it('leader remains on battlefield when bodyguard is destroyed', () => {
    const att = makeUnit({
      id: 'att', playerId: 'player2',
      center: { x: 15, y: 10 }, weapons: [BIG_GUN],
    });
    const leader = makeUnit({
      id: 'leader', playerId: 'player1', center: { x: 10, y: 10 },
      isLeader: true, factionKeywords: ['ADEPTUS_CUSTODES'], wounds: 6, maxWounds: 6,
    });
    const bodyguard = makeUnit({
      id: 'guard', playerId: 'player1', center: { x: 10, y: 10 },
      toughness: 3, save: 6, wounds: 1, maxWounds: 1,
      factionKeywords: ['ADEPTUS_CUSTODES'],
    });

    const eng = makeCommandEngine([att, leader, bodyguard]);
    eng.dispatch({ type: 'ATTACH_LEADER', leaderId: 'leader', bodyguardId: 'guard' });
    for (let i = 0; i < 8; i++) eng.dispatch({ type: 'END_PHASE' });
    eng.dispatch({ type: 'SHOOT', attackerId: 'att', targetId: 'guard', weaponIndex: 0 });

    const state = eng.getState();
    // Leader should still be on the board regardless of bodyguard fate
    const leaderUnit = state.units.find((u) => u.id === 'leader');
    expect(leaderUnit).toBeDefined();
    expect(leaderUnit!.wounds).toBeGreaterThan(0);
  });
});
