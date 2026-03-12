# CLAUDE.md — LLM Contributor Guide

This file is the authoritative guide for AI coding assistants working on this repo.
Read `architecture.md` and `rules_coverage.md` before making changes.

---

## Mockups & Static Files

**Mockups live in `packages/ui/public/mockups/`** — NOT in the repo root `mockups/`.

Vite copies `packages/ui/public/` verbatim into `dist/` during `pnpm --filter @wh40k/ui build`.
`dist/` is the generated build artifact that CI deploys to GitHub Pages (via `peaceiris/actions-gh-pages`, branch `gh-pages`).

### Prototype structure (phase-organised)
```
mockups/
  shared/               ← base CSS + JS template — updated only when starting a NEW phase
  phases/
    move/               ← Movement Phase (current active work)
      v0.13/ … v0.16/   ← each version is a self-contained folder with index.html
    shoot/ charge/ fight/ cmd/ INTEGRATED/  ← future phases (placeholders)
  advanced/             ← stratagems, deep-strike etc.
  archive/              ← v0.1–v0.12 historical design exploration
  index.html            ← phase-tab navigation
```

**To start a new phase version:**
```bash
cp -r packages/ui/public/mockups/phases/move/v0.16/ \
      packages/ui/public/mockups/phases/move/v0.17/
# edit phases/move/v0.17/index.html
```

**To start a new phase** (e.g. shoot):
```bash
cp -r packages/ui/public/mockups/phases/move/v0.16/ \
      packages/ui/public/mockups/phases/shoot/v0.1/
# Update shared/ path references first (should already be ../../../shared/)
```

| File location | Deployed to Pages? |
|---|---|
| `packages/ui/public/mockups/phases/move/v0.16/index.html` | ✅ Yes |
| `packages/ui/public/mockups/archive/v0.12.html` | ✅ Yes |
| `mockups/v0.x.html` (repo root) | ❌ No — never deployed |
| `dist/mockups/...` | ❌ No — generated build output only (`emptyOutDir: true`) |

**shared/ policy:** Append-only once in use. Updated manually only at new-phase kickoff.

**Mockup deploy checklist — ALL steps required before "done":**
1. Create `phases/[phase]/v0.N/index.html`
2. **Update `index.html`** — add the new version as LATEST in the correct phase tab
3. **Add a visible in-page backlink** in the new prototype page to `../../..` (`/mockups/`) so users can always return to the archive
4. Commit all related files together
5. Push + confirm CI passes
6. Verify the version card appears at `https://.../mockups/#[phase]` — not just that the direct URL is 200
7. **Verify core interaction works**: open the live page, select a unit, drag it — confirm it moves and rulers appear

Step 2 is the most commonly missed. Step 3 prevents dead-end prototype pages. Step 7 catches init-time crashes that HTTP 200 does not.

**Coding conventions for slice scripts:**
- All BattleUI values used in functions MUST be either destructured at the top of the script (`const { UNITS, mapData, ... } = BattleUI`) OR referenced as `BattleUI.X` inline. Never assume a BattleUI value is in local scope without one of these.
- An undeclared variable reference (`!mapData` where `mapData` was never declared) throws `ReferenceError` and kills all subsequent initialization silently — no error badge, no rulers, no drag.
- Every slice should have `window.onerror` set to show errors visibly on screen.

After adding/editing a mockup, the CI pipeline (`CI + Deploy to GitHub Pages`) must complete before the URL is live.

---

## Architecture Contracts (DO NOT BREAK)

### 1. `@wh40k/engine` has NO external dependencies
The engine must work in Node, Deno, browsers, and test environments.
Never add npm packages to `packages/engine` without a compelling reason.
`crypto` (node builtin) is the only allowed runtime import.

### 2. State is immutable from the outside
`engine.getState()` always returns a deep clone.
Never mutate the object returned by `getState()`.
All mutations go through `engine.dispatch(action)`.

### 3. ALL randomness flows through `SeededRng`
Never use `Math.random()` in `engine`, `content`, or `ai` packages.
The UI may use `Math.random()` for cosmetic effects only.

### 4. Transcript is append-only
Never remove or modify transcript events after appending.
The hash of the transcript must be reproducible given the same seed + actions.

### 5. Dependency direction: engine ← content ← ai ← ui
`engine` never imports from `content`, `ai`, or `ui`.
`content` never imports from `ai` or `ui`.
`ai` never imports from `ui`.

---

## How to Add a New Army

1. **Fetch data**: add datasheets to `packages/content/src/armies/<faction>/`
2. **Schema**: ensure all units conform to `UnitDatasheet` (Zod schema in `packages/content/src/schema.ts`)
3. **Faction key**: add to `FACTION_IDS` enum in `packages/content/src/factions.ts`
4. **Register**: add to `ARMY_REGISTRY` in `packages/content/src/registry.ts`
5. **Test**: add snapshot test in `packages/content/src/__tests__/<faction>.test.ts`
6. **rules_coverage.md**: add any faction-specific rules to the coverage table

Example:
```typescript
// packages/content/src/armies/tau/datasheets.ts
export const TAU_DATASHEETS: UnitDatasheet[] = [
  {
    id: 'tau_commander',
    name: 'Commander',
    faction: 'tau',
    M: 8, T: 4, Sv: 3, W: 4, Ld: 6, OC: 1,
    invuln: 4,
    weapons: [ /* ... */ ],
    abilities: [ /* ... */ ],
    keywords: ['Infantry', 'Character', 'Commander'],
    points: 95,
  },
];
```

---

## How to Add a New Rule / Keyword

### Weapon Keywords (Rapid Fire, Heavy, Assault, Melta, etc.)

1. Add to `WeaponKeyword` union type in `packages/content/src/schema.ts`
2. Add handler in `packages/engine/src/keywords/<keyword>.ts`:
   ```typescript
   export function applyRapidFire(attacks: number, range: number, dist: number): number {
     return dist <= range / 2 ? attacks * 2 : attacks;
   }
   ```
3. Register in `packages/engine/src/keywords/index.ts`
4. Add unit test in `packages/engine/src/__tests__/keywords.test.ts`
5. Update `rules_coverage.md`

### Unit Abilities

1. Add handler in `packages/engine/src/abilities/<ability-name>.ts`
2. Implement the `AbilityEffect` interface:
   ```typescript
   export interface AbilityEffect {
     id: string;
     trigger: AbilityTrigger; // 'on_hit' | 'on_wound' | 'on_save' | 'phase_start' | ...
     apply(context: AbilityContext): void;
   }
   ```
3. Register in unit's datasheet `abilityIds: string[]`
4. Engine resolvers check ability registry at trigger points

### Stratagems

1. Define in `packages/content/src/stratagems/<faction>.ts`
2. Implement `StratagemEffect` interface
3. Add `USE_STRATAGEM` action handling in `packages/engine/src/engine.ts`

---

## How to Add a New Edition (11th Edition)

The ruleset is versioned via `GameState.version` and `RulesetVersion`.

1. Create `packages/engine/src/rulesets/11e/` with overrides
2. `packages/engine/src/rulesets/index.ts` exports a `RulesetProvider` interface
3. `GameEngine` constructor accepts optional `RulesetVersion` (defaults to '10e')
4. Content schema for 11e in `packages/content/src/schemas/11e.ts`
5. Migration: `packages/engine/src/state-migration.ts` handles state upgrades
6. Add `11e` to `RULESET_VERSIONS` enum
7. CI tests both editions independently

The key rule: **existing 10e tests must still pass**. 11e is additive.

---

## Where NOT to Put Logic

| Logic Type                         | Where it goes        | NOT here                    |
|------------------------------------|----------------------|-----------------------------|
| Dice rolling                       | engine/rng.ts        | Not in content, AI, or UI   |
| State mutation                     | engine/resolvers/*   | Not in AI or UI             |
| Army data (stats, weapons, pts)    | content/armies/*     | Not in engine               |
| Rule effects (keywords, abilities) | engine/keywords/*    | Not in content              |
| AI scoring                         | ai/evaluators/*      | Not in engine               |
| UI pixel logic                     | ui/src/*             | Not in engine               |
| Scenario setup                     | content/scenarios/*  | Not in engine               |
| Terrain geometry                   | engine/geometry.ts   | Not in UI                   |

---

## Extension Points Summary

| What                | Interface/Type             | Location                          |
|---------------------|---------------------------|-----------------------------------|
| New keyword         | `KeywordHandler`          | `engine/src/keywords/`            |
| New ability         | `AbilityEffect`           | `engine/src/abilities/`           |
| New stratagem       | `StratagemEffect`         | `content/src/stratagems/`         |
| New army            | `UnitDatasheet[]`         | `content/src/armies/<faction>/`   |
| New terrain type    | `TerrainPiece` + handler  | `engine/src/terrain/`             |
| New LoS algorithm   | `LoSProvider`             | `engine/src/los/`                 |
| New AI evaluator    | `Evaluator`               | `ai/src/evaluators/`              |
| New phase resolver  | `PhaseResolver`           | `engine/src/resolvers/`           |
| New scenario        | `Scenario`                | `content/src/scenarios/`          |
| New scoring rule    | `ScoringRule`             | `engine/src/scoring/`             |

---

## Test Conventions

### Golden transcript tests
```typescript
// Always use a fixed, named seed
const SEED = 42;
const GOLDEN_HASH = 'abc123...'; // update when pipeline intentionally changes

it('shooting pipeline golden transcript', () => {
  const hash = runShootScenario(SEED);
  expect(hash).toBe(GOLDEN_HASH);
});
```
**When you intentionally change the pipeline, update the hash and explain why in the commit message.**

### Property tests (fast-check)
```typescript
import { fc } from '@fast-check/vitest';

it.prop([fc.integer({ min: 1, max: 100 })])(
  'units cannot move beyond their M characteristic',
  (movement) => {
    // ... assert invariant holds for all valid movement values
  }
);
```

### Invariants to ALWAYS preserve
1. `unit.wounds >= 0` at all times
2. `unit.wounds <= unit.maxWounds` at all times
3. Destroyed units (wounds === 0) are removed from `state.units`
4. `state.activePlayer` is always a valid player ID
5. Phase transitions only happen via `END_PHASE` action
6. The transcript hash is identical for identical seed + action sequences

---

## Commit Convention

```
<type>(<scope>): <description>

feat(engine): implement shooting pipeline (hit/wound/save)
fix(engine): wounds cannot exceed maxWounds after FNP
feat(content): add Tau army datasheets
test(engine): add golden transcript for Intercessors vs Termagants
chore(ci): fix Pages deployment base URL
docs(rules): mark Rapid Fire as implemented in rules_coverage.md
```

Types: `feat | fix | test | docs | chore | refactor | perf`
Scopes: `engine | content | ai | ui | ci | docs`

---

## Performance Budget

| Operation                          | Target      |
|------------------------------------|-------------|
| AI action evaluation (1 action)    | < 1ms       |
| AI full turn decision              | < 50ms      |
| Golden transcript hash             | < 5ms       |
| State deep clone                   | < 1ms       |
| Full test suite                    | < 30s       |
| UI frame time                      | < 16ms      |
