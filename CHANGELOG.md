# Changelog

All notable changes to the WH40K Simulator.
Generated from git history via [git-cliff](https://git-cliff.org).

## [0.7.0] — 2026-03-05

### Features

- **engine:** Leader attachment mechanic — ATTACH_LEADER action, embedded leaders cannot be targeted independently
- **engine:** Wound profile degradation — multi-row datasheets (Caladius Grav-Tank M14/M10/M6 by wound bracket)
- **engine/state:** `BlobUnit` extended with `keywords`, `factionKeywords`, `isLeader`, `attachedLeaderId`, `leadingUnitId`, `woundProfiles`
- **engine:** `getEffectiveMovement()` helper — applies wound profile degradation to movement stat
- **engine:** Phase reset uses effective movement (degraded by wounds)
- **content:** `DetachmentSchema` — Zod schema for detachment definitions
- **content:** `SHIELD_HOST` — Shield Host detachment definition (Adeptus Custodes), rule stubbed
- **ui:** Shield-Captain on Dawneagle Jetbike added as LEADER unit, attached to Custodian Guard I
- **ui:** Leader badge (✦) and gold crown ring shown on bodyguard unit; leader not rendered independently while embedded
- **ui:** Caladius wound profiles configured (M14/M10/M6 degradation)
- **ui:** Detachment name "Shield Host" shown in HUD
- **ui:** Warning shown when attempting to target an embedded leader

### Tests

- **engine:** `leader.test.ts` — 13 new tests (ATTACH_LEADER action, targeting validation, state effects, leader separation on death)
- **engine:** `wound-profiles.test.ts` — 11 new tests (getEffectiveMovement, engine integration)
- **content:** `detachment.test.ts` — 11 new tests (DetachmentSchema validation, SHIELD_HOST)
- **Total:** 227 tests (up from 192)

### Notes

- Shield Host detachment rule ("Shoulder the Mantle") is schema-defined but ENGINE-STUBBED in v0.7
- Enhancement effects are STUBBED (schema only)
- Faction ability system (Martial Ka'tah, Aegis of the Emperor) deferred to v0.8

## [0.6.1] — 2026-03-05

### Bug Fixes

- **ui:** Dice overlay now stays open until user clicks to dismiss (removed 3-second auto-dismiss)
- **ui:** Fight phase converted to drag-to-fight UX (consistent with charge phase)
- **ui:** Play Again button now works reliably (backdrop event passthrough, eventMode fixes, pointerdown handler)

## [0.6.0] — 2026-03-05

### Bug Fixes

- **engine:** Edge-to-edge range check for shooting
- **engine:** Turn counter only increments after both players complete phases
- **ui:** Eliminate PixiJS addChild-on-Graphics deprecation warning
- **ui:** Eliminate remaining PixiJS addChild-on-Graphics warning

### Chores

- Rebuild docs for v0.5 bug fixes
- Rebuild docs

### Docs

- Expand plan.md — 14-phase roadmap with rules audit and polish principle

### Features

- **ui:** Show version + build date in HUD
- **ui:** Version label → bottom-right corner, clickable git commit link
- **ui:** V0.6 complete game loop — both players, end screen, objective colours, dice flash

### Tests

- **engine:** Game loop tests — full round, gameOver, VP scoring

## [0.5.0] — 2026-03-05

### Bug Fixes

- **ui:** Drag-based unit movement replaces click-to-destination
- **ui:** Zone-aware drag movement — auto-detect move vs advance

### Chores

- Add git-cliff + CHANGELOG.md (auto-generated from conventional commits)
- Update CHANGELOG

### Features

- **v0.5:** Charge + Fight phases — 2D6 charge rolls, engagement, melee pipeline

## [0.4.0] — 2026-03-05

### Features

- **v0.4:** Shooting phase — full hit/wound/save/damage pipeline

## [0.3.0] — 2026-03-05

### Features

- **engine+ui:** Phase 3 — Movement phase + interactive board

## [0.2.0] — 2026-03-05

### Bug Fixes

- **engine:** ExactOptionalPropertyTypes TS strict-mode violations

### Features

- **content:** Phase 2 — Content schemas, DiceExpr parser, BattleScribe importer

## [0.1] — 2026-03-03

### Features

- **phase-1:** Deterministic engine skeleton

## [0.0] — 2026-03-03

### Features

- **phase-0:** Scaffold monorepo, CI, Pages, docs


