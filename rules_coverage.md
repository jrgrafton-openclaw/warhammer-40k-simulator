# Rules Coverage Checklist

Status: ✅ Implemented | 🔶 Stubbed (typed, no logic) | ❌ Not started

Last updated: Phase 1 (v0.1)

---

## Core Mechanics

| Rule                              | Status | Notes                              | Planned Phase |
|-----------------------------------|--------|------------------------------------|---------------|
| Dice rolling (D6, D3, 2D6)        | ✅     | SeededRng, mulberry32              | 1             |
| Deterministic replay              | ✅     | Transcript + SHA-256 hash          | 1             |
| GameState serialization           | ✅     | JSON + versioning                  | 1             |
| Phase state machine               | ✅     | All 6 phases + transitions         | 1             |
| Turn limit (5 turns)              | ✅     | Configurable, defaults to 5        | 1             |
| Command Points (CP)               | 🔶     | Field in PlayerState, no grant logic | 2+          |
| Battle-shock                      | ❌     | Not started                        | 5+            |
| Devastating Wounds                | ❌     | Mortal wounds on crit wound        | 4             |
| Lethal Hits                       | ❌     | Auto-wound on crit hit             | 4             |
| Hazardous                         | ❌     | Mortal wound on 1 to-hit           | 4             |
| Sustained Hits                    | ❌     | Extra hits on crit                 | 4             |
| Twin-linked                       | ❌     | Re-roll wound rolls                | 4             |
| Precision                         | ❌     | Target character in unit           | 5+            |

---

## Movement Phase

| Rule                              | Status | Notes                              | Planned Phase |
|-----------------------------------|--------|------------------------------------|---------------|
| Move characteristic               | 🔶     | Field present, not enforced yet    | 3             |
| Normal move                       | 🔶     | Stub resolve, no validation        | 3             |
| Advance move (+D6, no shooting)   | ❌     |                                    | 3             |
| Fall-back move                    | ❌     |                                    | 5             |
| Fly keyword                       | ❌     | Ignore engagement for movement     | 3             |
| Engagement range (0.5")           | ✅     | Geometry module                    | 1             |
| Cannot move through units         | ❌     | Phase 3 constraint                 | 3             |
| Deployment zones                  | ❌     | Phase 3                            | 3             |

---

## Shooting Phase

| Rule                              | Status | Notes                              | Planned Phase |
|-----------------------------------|--------|------------------------------------|---------------|
| Select eligible unit to shoot     | 🔶     | Validation stub                    | 4             |
| Hit roll (BS)                     | ❌     | Full pipeline Phase 4              | 4             |
| Wound roll (S vs T table)         | ❌     |                                    | 4             |
| Saving throw (Sv + AP)            | ❌     |                                    | 4             |
| Invulnerable save                 | ❌     |                                    | 4             |
| Feel No Pain (FNP)                | ❌     |                                    | 4             |
| Damage application                | ❌     |                                    | 4             |
| Units in engagement cannot shoot  | 🔶     | Validation stub                    | 4             |
| Rapid Fire (double A in range)    | ❌     |                                    | 4             |
| Heavy (+1 to hit if stationary)   | ❌     |                                    | 4             |
| Assault (no penalty for moving)   | ❌     |                                    | 4             |
| Blast (min 3A vs 6+ models)       | ❌     | Blob unit approximation needed     | 4             |
| Melta (bonus D at half range)     | ❌     |                                    | 4             |
| Pistol (shoot in engagement)      | ❌     |                                    | 4             |

---

## Charge Phase

| Rule                              | Status | Notes                              | Planned Phase |
|-----------------------------------|--------|------------------------------------|---------------|
| Declare charge (within 12")       | 🔶     | Validation stub                    | 5             |
| Charge roll (2D6)                 | 🔶     | Roll logged, no movement yet       | 5             |
| Charge movement                   | ❌     |                                    | 5             |
| Overwatch                         | ❌     |                                    | 5+            |

---

## Fight Phase

| Rule                              | Status | Notes                              | Planned Phase |
|-----------------------------------|--------|------------------------------------|---------------|
| Fight in engagement only          | 🔶     | Validation stub                    | 5             |
| Charged units fight first         | ❌     |                                    | 5             |
| Pile-in (3")                      | ❌     |                                    | 5             |
| Melee hit/wound/save pipeline     | ❌     | Same as shooting pipeline          | 5             |
| Consolidate (3")                  | ❌     |                                    | 5             |

---

## Objectives + Scoring

| Rule                              | Status | Notes                              | Planned Phase |
|-----------------------------------|--------|------------------------------------|---------------|
| Objective markers (5 standard)    | 🔶     | Field in GameState                 | 6             |
| OC-based control                  | ✅     | Resolved at COMMAND phase          | 1 (basic)     |
| Primary: hold objectives (1VP)    | ✅     | Resolved at COMMAND phase          | 1 (basic)     |
| Primary: most objectives (1VP)    | ❌     |                                    | 6             |
| Secondary objectives              | ❌     |                                    | 6+            |
| Sticky objectives (ObSec)         | ❌     |                                    | 6             |

---

## Terrain

| Rule                              | Status | Notes                              | Planned Phase |
|-----------------------------------|--------|------------------------------------|---------------|
| Terrain footprints                | ❌     |                                    | 7             |
| Impassable terrain                | ❌     |                                    | 7             |
| Area terrain (cover)              | ❌     |                                    | 7             |
| Ruins (light/heavy cover)         | ❌     |                                    | 7             |
| LoS blocking                      | ❌     |                                    | 7             |
| Cover saves (+1 Sv in area terrain)| ❌    |                                    | 7             |

---

## Keywords (selected)

| Keyword                   | Status | Planned Phase |
|---------------------------|--------|---------------|
| Infantry                  | 🔶     | Schema only   |
| Vehicle / Monster         | 🔶     | Schema only   |
| Fly                       | ❌     | 3             |
| Character                 | ❌     | 4+            |
| Battleline                | 🔶     | Schema only   |
| Synapse (Tyranids)        | ❌     | Army-specific |
| Objective Secured         | ❌     | 6             |
| Leader (attach to unit)   | ❌     | 2+            |

---

## Known Simplifications (by design for now)

1. **Blob units**: units are circles, not per-model. Distance = edge-to-edge.
2. **LoS v1**: center-to-center, blocked only by impassable footprints.
3. **Battle-shock**: not implemented — units never fail morale.
4. **Stratagems**: schema only; no effect resolution.
5. **Secondary objectives**: scoring stubs only.
6. **Character protection**: not implemented in Phase 4.
7. **Leader rules**: not implemented; characters treat as regular units.
8. **Dedicated Transport**: not implemented.
9. **Reserves**: not implemented.
