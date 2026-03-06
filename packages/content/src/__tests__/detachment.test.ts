/**
 * Phase 7 — Detachment schema tests.
 * Covers: DetachmentSchema validation, Shield Host detachment definition.
 */
import { describe, it, expect } from 'vitest';
import { DetachmentSchema } from '../schemas.js';
import { SHIELD_HOST } from '../detachments/shield-host.js';

// ---------------------------------------------------------------------------
// DetachmentSchema validation
// ---------------------------------------------------------------------------

describe('DetachmentSchema', () => {
  it('validates a well-formed detachment', () => {
    const valid = {
      id: 'test-detachment',
      name: 'Test Detachment',
      faction: 'TEST_FACTION',
      rule: {
        name: 'Test Rule',
        description: 'Does something cool.',
      },
      enhancements: [
        { name: 'Cool Enhancement', description: 'Adds coolness.', points: 20 },
      ],
      stratagemIds: ['strat-one', 'strat-two'],
    };
    const result = DetachmentSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects detachment with missing required fields', () => {
    const invalid = {
      name: 'Missing ID',
      faction: 'TEST',
      rule: { name: 'Rule', description: 'Desc' },
      enhancements: [],
      stratagemIds: [],
      // id is missing
    };
    const result = DetachmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects detachment with invalid enhancement (missing points)', () => {
    const invalid = {
      id: 'det',
      name: 'Detachment',
      faction: 'TEST',
      rule: { name: 'Rule', description: 'Desc' },
      enhancements: [{ name: 'Enhancement', description: 'Does stuff' }], // missing points
      stratagemIds: [],
    };
    const result = DetachmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts detachment with empty enhancements and stratagemIds', () => {
    const valid = {
      id: 'minimal',
      name: 'Minimal Detachment',
      faction: 'FACTION',
      rule: { name: 'Some Rule', description: 'Something.' },
      enhancements: [],
      stratagemIds: [],
    };
    const result = DetachmentSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shield Host detachment
// ---------------------------------------------------------------------------

describe('SHIELD_HOST detachment', () => {
  it('validates against DetachmentSchema', () => {
    const result = DetachmentSchema.safeParse(SHIELD_HOST);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Shield Host validation errors:', result.error.issues);
    }
  });

  it('has id "shield-host"', () => {
    expect(SHIELD_HOST.id).toBe('shield-host');
  });

  it('has faction ADEPTUS_CUSTODES', () => {
    expect(SHIELD_HOST.faction).toBe('ADEPTUS_CUSTODES');
  });

  it('has a named detachment rule', () => {
    expect(SHIELD_HOST.rule.name).toBeTruthy();
    expect(SHIELD_HOST.rule.description).toBeTruthy();
  });

  it('has at least 1 enhancement', () => {
    expect(SHIELD_HOST.enhancements.length).toBeGreaterThan(0);
  });

  it('all enhancements have positive or zero points', () => {
    for (const e of SHIELD_HOST.enhancements) {
      expect(e.points).toBeGreaterThanOrEqual(0);
    }
  });

  it('has at least 1 stratagem id', () => {
    expect(SHIELD_HOST.stratagemIds.length).toBeGreaterThan(0);
  });
});
