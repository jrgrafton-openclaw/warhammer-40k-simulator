# WH40K Simulator — Build Plan

## Summary

10-phase incremental build from scaffold to full matched-play simulator.
Each phase is independently shippable, fully tested, and tagged.

---

## Phase Breakdown

| Phase | Tag   | Description                    | Acceptance Criteria                                              | Complexity |
|-------|-------|-------------------------------|------------------------------------------------------------------|------------|
| 0     | v0.0  | Repo + CI + Pages             | Pages live, tests pass, CI green                                 | S          |
| 1     | v0.1  | Engine Skeleton               | Determinism golden test, serialization round-trip pass           | M          |
| 2     | v0.2  | Content Schema + Importer     | Quickslate importer snapshots pass, Zod validation tests pass    | M          |
| 3     | v0.3  | Movement (Blob Units)         | Legal move radius UI, move validation, property tests pass       | M          |
| 4     | v0.4  | Shooting Pipeline             | Full hit/wound/save pipeline, golden transcript, EV sanity       | L          |
| 5     | v0.5  | Charge + Fight                | 2D6 charge roll, melee pipeline, golden transcripts              | L          |
| 6     | v0.6  | Objectives + Scoring          | OC control, VP scoring, score display in UI                      | M          |
| 7     | v0.7  | Terrain + LoS v1              | LoS blocking tests, map pack loader, terrain render in UI        | L          |
| 8     | v0.8  | AI v1 + Coaching              | AI completes 2-turn match, hint/mistake detector in UI           | XL         |
| 9     | v0.9  | Scenario/Training Mode        | 3 scenarios load + complete headless, lesson validation tests    | L          |

## Detailed Acceptance Criteria

### Phase 2 — Content Schema + Importer
- Zod schemas for `UnitDatasheet`, `WeaponProfile`, `Stratagem`, `ArmyList`
- `DiceExpr` type handles numbers AND strings like `"D6"`, `"2D6+1"`
- Quickslate importer: fetch ES module JS → parse → validate
- Snapshot tests for Captain in Terminator Armour, Intercessor Squad, Hive Tyrant
- Army list loader parses JSON with point validation

### Phase 3 — Movement
- `DeployAction` places unit in deployment zone
- `MoveUnitAction` validates: distance ≤ M, board bounds, not through impassable
- UI: click unit → colored circle overlay (radius = remaining move) → click to move
- `fast-check` property test: generated random legal moves never exceed M

### Phase 4 — Shooting
- Hit roll: 1d6 vs BS (modified by keywords)
- Wound roll: 1d6 vs table based on S vs T
- Save roll: 1d6 vs Sv+AP (or invuln if better)
- Damage: apply D (resolving DiceExpr), apply FNP if present
- Every individual dice roll is in the transcript
- Golden test: seed=42, Intercessors shoot Termagants → specific hash
- EV test: 10k sims within 10% of analytical expectation

### Phase 5 — Charge + Fight
- Declare charge: pick target(s) within 12"
- Charge roll: 2D6 vs distance to nearest target edge
- Fight: alternating (charged unit fights first), pile-in 3", fight attacks
- Consolidate: 3" toward nearest enemy/objective

### Phase 6 — Objectives
- 5 standard objectives in map preset (positions match "Crucible of War" layout)
- OC control check at start of Command phase
- Primary: 1 VP per objective held, 1 VP per turn for most objectives
- Score display updates live in UI

### Phase 7 — Terrain
- `TerrainPiece` with polygon footprint
- LoS: center-to-center line blocked by any impassable polygon
- "Cover": any unit wholly within area terrain gains +1 Sv
- Map pack JSON format with schema validation

### Phase 8 — AI
- `LegalActionGenerator` produces only valid actions (validated against engine)
- Greedy 1-ply with beam-2 rollout (depth 2)
- Evaluator: `0.6 × objectives + 0.3 × kill_projection + 0.1 × survival`
- Explanation: reasons array + top 3 alternatives with scores
- Hint button: shows ghost move + explanation text
- Mistake detector: shows warning if player chose action scoring <85% of best

### Phase 9 — Scenarios
- Scenario runner validates completion condition at each END_PHASE
- "Basic Movement": player must have 2 units in staging zones after 2 turns
- "Target Priority": player must shoot high-wound-efficiency target (validator checks)
- "Objective Contesting": player must control ≥2/3 objectives at end of turn 3

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| RNG | mulberry32 | Fast, simple, deterministic, portable |
| State | JSON + version field | Simple, serializable, diffable, LLM-readable |
| Unit model | Blob (circle) | Correct-by-default for core rules; upgrade path to per-model |
| LoS v1 | Center-to-center | Simple, fast; interface allows exact upgrade |
| AI search | Greedy + beam | Competent-enough for v1 within 50ms budget |
| Monorepo | pnpm workspaces | Fast installs, workspace protocol, well-supported |
| Build | Vite | ESM-native, fast HMR, PixiJS compatible |
| Tests | Vitest | ESM-native, fast, Vite-aligned |
| Props | fast-check | Mature property testing, TypeScript support |
