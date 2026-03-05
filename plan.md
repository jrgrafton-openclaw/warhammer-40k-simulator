# WH40K Simulator — Build Plan

## Summary

Incremental phased build from scaffold to full matched-play simulator.
Each phase is independently shippable, fully tested, and tagged.
**Polish principle:** polish the game-loop layer as we go; defer blob/model-layer
visuals until per-model units ship (v0.10). Sub-agents can parallelize rules work
and animation/UX polish — don't treat them as mutually exclusive.

---

## Status

| Phase | Tag    | Status      | Description                        |
|-------|--------|-------------|------------------------------------|
| 0     | v0.0   | ✅ Done      | Repo + CI + Pages                  |
| 1     | v0.1   | ✅ Done      | Engine skeleton                    |
| 2     | v0.2   | ✅ Done      | Content schema + BattleScribe importer |
| 3     | v0.3   | ✅ Done      | Movement phase (blob units, drag UI) |
| 4     | v0.4   | ✅ Done      | Shooting pipeline                  |
| 5     | v0.5   | ✅ Done      | Charge + Fight phases              |
| 6     | v0.6   | ✅ Done      | Complete game loop (both players, end screen, VP, dice flash) |
| 6.5   | v0.6.x | 🔜 Next     | Dice animation polish (delightful sequential hit→wound→save) |
| 7     | v0.7   | Planned     | Deployment phase + army selection screen                   |
| 8     | v0.8   | Planned     | Army rules + Detachments           |
| 8     | v0.8   | Planned     | Stratagems + CP economy            |
| 9     | v0.9   | Planned     | Advanced combat rules              |
| 10    | v0.10  | Planned     | Per-model unit representation      |
| 11    | v0.11  | Planned     | Army import UI + missions          |
| 12    | v0.12  | Planned     | Terrain + LoS                      |
| 13    | v0.13  | Planned     | AI v1 + Coaching                   |
| 14    | v0.14  | Planned     | Scenario/Training mode             |

---

## Rules Completeness Audit

Things missing from the 40K ruleset (tracked here until implemented):

### Pre-game gaps
- [ ] **Deployment phase** — Before turn 1: alternate unit-by-unit deployment into deployment zones; currently units are hardcoded; should be a full drag-to-deploy flow
- [ ] **Army selection screen** — Pick army before deploying; currently hardcoded Custodes vs Chaos
- [ ] **Scout moves** — Units with Scout keyword make a 6" move after deployment, before turn 1
- [ ] **Pre-game stratagems** — Some abilities/stratagems fire before the first turn

### Engine gaps
- [ ] ~~**Both players interactive**~~ — ✅ Done in v0.6
- [ ] **Command phase content** — Currently a pass-through; should: gain 1 CP, trigger battle-shock tests, allow CP-cost stratagems
- [ ] **CP economy** — Command Points pool, replenishment, spending
- [ ] **Stratagems** — keyword-gated, phase-gated, CP cost, validation
- [ ] **Army rules** — faction keywords, passive/triggered abilities, auras
- [ ] **Detachment rules** — enhancements, detachment stratagem unlocks, detachment bonus
- [ ] **Battle-shock** — units ≤ half wounds → Battle-shocked; −1 OC, cannot use stratagems
- [ ] **Critical hits** — unmodified 6 to hit → auto-wound or mortal wounds (weapon keyword)
- [ ] **Critical wounds** — unmodified 6 to wound → ignore armour (weapon keyword)
- [ ] **Hazardous** — roll 1 after firing → 1 mortal wound to attacker (per model)
- [ ] **Wound profile degradation** — multi-row datasheets (Caladius etc.) change statline by wound bracket
- [ ] **Leader/Character attachment** — characters join units, grant abilities, absorb wounds
- [ ] **Cover** — +1 Sv for units wholly within area terrain
- [ ] **Overwatch** — 1 CP to shoot in enemy Charge phase (hit on 6s)
- [ ] **Deep Strike / Reserves** — set up off-board, arrive turn 2+ within 9"
- [ ] **Transports** — embark/disembark, capacity, firing deck
- [ ] **Coherency** — models must stay within 2" of another in same unit
- [ ] **Pile-in** — 3" move toward nearest enemy before fighting
- [ ] **Consolidation** — 3" move toward nearest enemy/objective after fighting

### Game-loop gaps
- [ ] **End screen** — winner declared, final VPs, replay option
- [ ] **Both players take turns** — alternate active player per game turn
- [ ] **Real army import UI** — replace hardcoded demo with BattleScribe/Quickslate load
- [ ] **Mission presets** — Crucible of War layout, primary scoring rules
- [ ] **Secondary objectives** — mission-specific secondaries, scoring rules

### Polish queue (shift-left, stable surfaces only)
- [ ] **Animated dice rolls** — 2D6 tumble on charge, D6 spin on hit/wound/save
- [ ] **Hit/wound/save result card** — per-attack breakdown (not just summary log line)
- [ ] **Phase transition animation** — brief flash/text when phase changes
- [ ] **Kill animation** — unit destroyed burst effect
- [ ] **Sound effects** — dice roll, hit, kill (Web Audio API, off by default)
- [ ] **Mobile/touch optimization** — pinch-zoom, larger tap targets

---

## Phase Detail

### Phase 6 — v0.6: Complete Game Loop
**Goal:** A fully playable end-to-end 5-turn game for both players.

| Item | Notes |
|------|-------|
| Both players interactive | Player 2 (Chaos) is now also controllable; UI switches active player after each END phase |
| End screen | "VICTORY — Custodes 7 VP / Chaos 4 VP" overlay; replay button resets engine with new seed |
| VP scoring display | Live during game, final on end screen |
| Phase indicator polish | Clearer active-player highlight; colour-coded HUD per player |
| Animated dice rolls | `DiceRollOverlay` component: D6 tumble animation → settles on result; used for hit/wound/save/charge |
| Combat result card | Per-attack breakdown panel replaces single log line |
| Winning condition | Most VP after turn 5; tie-break by survivor OC |

Acceptance criteria:
- 5 full turns completable with two human players on one screen
- Winner correctly declared with final VP breakdown
- Dice animation plays for every hit roll, wound roll, save roll, charge roll
- All existing 171 tests still green; add ≥20 new tests for end conditions

---

### Phase 7 — v0.7: Army Rules + Detachments
**Goal:** Faction identity — units feel different based on who they are.

| Item | Notes |
|------|-------|
| Faction keywords on `BlobUnit` | e.g. `ADEPTUS CUSTODES`, `CHAOS SPACE MARINES` |
| Passive abilities | Data-driven ability definitions on `UnitDatasheet`; engine applies at relevant hooks |
| Aura abilities | Range-limited buffs that affect nearby friendly units |
| Detachment data | New `Detachment` schema: name, faction, stratagem list, detachment rule, enhancements |
| Detachment rule | Applied automatically at game start |
| Leader attachment | `LEADER` keyword units attach to a `Bodyguard` unit; absorb wounds, grant ability |
| Wound profile degradation | Multi-row datasheets; engine selects row by remaining wound bracket |

Acceptance criteria:
- Custodes Shield Host detachment rule applies (hardcoded OK for now)
- Leader unit attached to guard; takes wounds before guard models
- Caladius uses degraded statline when wounds ≤ 7

---

### Phase 8 — v0.8: Stratagems + CP Economy
**Goal:** The tactical decision layer — spending CP to turn the tide.

| Item | Notes |
|------|-------|
| CP pool | Start: 0 for first player, 1 for second player; +1 each Command phase |
| `USE_STRATAGEM` action | Validated: correct phase, keyword match, CP available |
| Stratagem data | `Stratagem` schema: name, CP cost, phase, faction, effect type, parameters |
| UI | Stratagem panel (list available stratagems + cost); click to activate |
| 3 hardcoded stratagems | Custodes: "Avenge the Fallen", "Shoulder the Mantle", one more |

Acceptance criteria:
- CP tracks correctly across turns
- Using stratagem deducts CP; cannot use without sufficient CP
- Wrong-phase stratagem rejected by engine

---

### Phase 9 — v0.9: Advanced Combat Rules
**Goal:** Close the rules gaps that affect combat outcomes.

| Item | Notes |
|------|-------|
| Critical hits | `DEVASTATING WOUNDS` keyword → 6-to-hit causes mortal wounds equal to Damage |
| Critical wounds | `LETHAL HITS` keyword → 6-to-hit auto-wounds (skip wound roll) |
| Hazardous | Post-shooting roll per model; 1 → mortal wound to attacker |
| Battle-shock | Check at start of Command phase; −1 OC, stratagem lock |
| Cover | `hasCover` flag on unit; +1 to save roll while set |
| Overwatch | 1 CP reaction in enemy Charge phase; hit on 6+ |
| Pile-in + Consolidate | 3" move toward nearest enemy/objective added to Fight resolution |

Acceptance criteria:
- Golden transcript with Lethal Hits weapon matches analytical expectation
- Battle-shocked unit correctly denied stratagem use
- Cover saves correctly applied in shooting tests

---

### Phase 10 — v0.10: Per-Model Unit Representation
**Goal:** Replace the blob abstraction with per-model positions.
**Note:** `datasheetId` on `BlobUnit` is already the refactor hook.

| Item | Notes |
|------|-------|
| `ModelUnit` type | Array of `ModelPosition` (center + radius); replaces single blob circle |
| Coherency validation | All models within 2" of at least one other model in unit |
| Model-by-model wound removal | Remove closest model to attacker first |
| Rendering | Each model rendered individually; unit base ring for clarity |
| Movement | Drag-moves the whole unit; coherency enforced on drop |

Acceptance criteria:
- All existing engine tests pass with new representation
- Coherency check rejects illegal formations
- 5-model unit loses models one at a time under fire

---

### Phase 11 — v0.11: Army Import UI + Missions
**Goal:** Play with real armies from real files, on real missions.

| Item | Notes |
|------|-------|
| Army loader screen | Drag-and-drop BattleScribe/Quickslate file → validate → preview |
| Mission presets | Crucible of War layout (5 objectives, deployment zones) |
| Primary scoring | "Take and Hold" — score at end of each Command phase |
| Secondary objectives | Pick 2 per player from pool; score during game |

Acceptance criteria:
- Custodes army from BattleScribe file loads and spawns correctly
- Full game playable on Crucible of War layout
- Both players pick and score secondaries

---

### Phase 12 — v0.12: Terrain + LoS
*(Previously v0.7 — bumped to allow rules completeness first)*

| Item | Notes |
|------|-------|
| `TerrainPiece` type | Polygon footprint, terrain type (`AREA`, `OBSTACLE`, `IMPASSABLE`) |
| LoS v1 | Centre-to-centre line blocked by impassable polygon |
| Cover | Units wholly within area terrain gain Cover (feeds Phase 9 flag) |
| Map pack format | JSON schema; 3 preset maps bundled |
| UI | Terrain rendered as translucent polygons; LoS line shown on shoot |

---

### Phase 13 — v0.13: AI v1 + Coaching
*(Previously v0.8)*

| Item | Notes |
|------|-------|
| `LegalActionGenerator` | Produces only valid actions (validated against engine) |
| Greedy 1-ply + beam-2 rollout | 50ms budget; depth 2 |
| Evaluator | `0.6 × objectives + 0.3 × kill_projection + 0.1 × survival` |
| Hint button | Ghost move + explanation text |
| Mistake detector | Warning if player chose action scoring <85% of AI best |

---

### Phase 14 — v0.14: Scenario / Training Mode
*(Previously v0.9)*

| Item | Notes |
|------|-------|
| Scenario runner | Validates completion condition at each `END_PHASE` |
| "Basic Movement" | 2 units in staging zone after 2 turns |
| "Target Priority" | Validator checks optimal shoot target selected |
| "Objective Contesting" | ≥2/3 objectives controlled at end of turn 3 |

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| RNG | mulberry32 | Fast, simple, deterministic, portable |
| State | JSON + version field | Simple, serializable, diffable, LLM-readable |
| Unit model | Blob → per-model at v0.10 | `datasheetId` is the refactor hook |
| LoS v1 | Centre-to-centre | Simple, fast; interface allows exact upgrade |
| AI search | Greedy + beam | Competent-enough for v1 within 50ms budget |
| Monorepo | pnpm workspaces | Fast installs, workspace protocol |
| Build | Vite | ESM-native, fast HMR, PixiJS compatible |
| Tests | Vitest | ESM-native, fast, Vite-aligned |
| Props | fast-check | Mature property testing, TypeScript support |
| Changelog | git-cliff | Auto-generated from conventional commits |
| CI/CD | GitHub Actions → Pages | Builds from `main`, deploys to `gh-pages` |

---

## Polish Principle

> **Polish the game-loop layer; defer blob/model-layer visuals.**

Architecturally stable → polish now:
- Dice roll animations, phase transitions, kill effects, sound
- Combat result cards, log improvements
- Mobile/touch UX

Will be replaced at v0.10 → defer:
- Per-blob art, blob-level animations
- Model-count display, coherency visualisation

In an agentic workflow, polish and feature work can be parallelised across sub-agents.
Each major feature ships with its own animation (dice tumble ships with shooting, etc.).
