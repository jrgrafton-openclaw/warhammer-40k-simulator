# Changelog

All notable changes to the WH40K Simulator.
Generated from git history via [git-cliff](https://git-cliff.org).

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


