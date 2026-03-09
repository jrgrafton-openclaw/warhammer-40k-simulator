# Mockup Prototype Strategy

**Goal:** Rapidly prototype gameplay mechanics as interactive HTML mockups, validate them visually/interactively, then fold proven mechanics into the core engine + UI packages with minimal rework.

---

## The Problem Today

Each mockup is a self-contained ~1600-line HTML file. As we add mechanics:
- CSS, terrain rendering, pan/zoom, unit card JS gets copy-pasted into every new file
- A bug fix in one mockup (e.g. drag, scale schema) has to be applied everywhere manually
- No clear path from "validated prototype" → `packages/engine` + `packages/ui`

---

## Solution: Shared Core + Vertical Slices

```
packages/ui/public/mockups/
├── shared/
│   ├── battle-ui.css       ← dark theme, fonts, design tokens, layout grid
│   ├── battle-terrain.js   ← mapData, renderTerrain(), TERRAIN_RULES
│   ├── battle-units.js     ← UNITS data, buildCard(), wargear logic
│   ├── battle-board.js     ← pan/zoom, range circles, SVG scale schema
│   └── battle-models.js    ← renderModels(), resolveOverlaps(), cohesion
└── v0.xx-<slice>.html      ← thin slice: imports shared, adds ONE new mechanic
```

Each slice is ≤ 300 lines of HTML/JS: just the scaffold + the mechanic being prototyped. Everything else comes from `shared/`.

**Migration plan:** Extract v0.15's shared code into `shared/` when starting v0.16. Future slices are thin wrappers.

---

## Vertical Slice Backlog

Each entry = one prototype slice (1–3 days per slice). Ordered by dependency.

### Phase 1 — Movement (in progress)
| Slice | Status | Mechanic |
|-------|--------|----------|
| v0.15 | ✅ Live | Individual model bases, correct scale, drag + overlap |
| v0.16 | Next | **Movement range** — enforce M characteristic; models can't move further than M"; highlight valid destination zone |

### Phase 2 — Shooting
| Slice | Mechanic |
|-------|----------|
| v0.17 | **Target selection** — select unit, hover shows range circle; enemy units within range + unblocked LoS highlighted |
| v0.18 | **Dice roll UI** — animated D6 pool; hit/wound/save pipeline; wound markers on models |
| v0.19 | **Line of Sight** — SVG terrain occlusion; LoS blocked/partial indicators |

### Phase 3 — Charge & Fight
| Slice | Mechanic |
|-------|----------|
| v0.20 | **Declare charge** — select charger, click target; 2D6 charge roll; move into engagement range (1") |
| v0.21 | **Fight phase** — pile-in moves, attack sequence, model removal |

### Phase 4 — Command & Special Mechanics
| Slice | Mechanic |
|-------|----------|
| v0.22 | **Stratagem picker** — contextual list filtered by phase/unit; CP cost deducted |
| v0.23 | **Ability use** — triggered abilities (Shock Assault, ATSNKF); timing confirmation UX |
| v0.24 | **Deep Strike** — reserve pool; place-on-board animation; 9" rule enforcement |
| v0.25 | **Pre-game deployment** — drag units into DZ; army points validation |

### Phase 5 — Game Loop
| Slice | Mechanic |
|-------|----------|
| v0.26 | **Objective scoring** — end-of-turn VP tally; hold/contest logic |
| v0.27 | **Full game loop** — 5-round structure, phase sequencing, end-game condition |

---

## Integration Path: Prototype → Engine

When a slice is validated (James signs off), extract it in this order:

```
1. Logic    → packages/engine/src/resolvers/<mechanic>.ts  (pure functions, deterministic)
2. Types    → packages/content/src/schema.ts               (if new data shapes needed)
3. Actions  → packages/engine/src/actions.ts               (new DISPATCH types)
4. Tests    → packages/engine/src/__tests__/<mechanic>.test.ts
5. UI comp  → packages/ui/src/components/<Mechanic>/       (React, uses engine dispatch)
6. Retire   → mockup marked [INTEGRATED] in index.html
```

**Rule:** The mockup prototype IS the acceptance test spec. If the prototype behaves correctly, the engine implementation must reproduce that exact behaviour.

---

## Shared Resources — What Goes Where

| Resource | Shared? | Location after extraction |
|----------|---------|--------------------------|
| Dark theme CSS, fonts, design tokens | ✅ | `shared/battle-ui.css` → eventually `ui/src/styles/` |
| mapData terrain JSON | ✅ | `shared/battle-terrain.js` → already in engine geometry |
| Unit datasheets (UNITS obj) | ✅ | `shared/battle-units.js` → `content/src/armies/` |
| SVG scale schema (mmR, PX_PER_INCH) | ✅ | `shared/battle-board.js` → `engine/src/geometry.ts` |
| Pan/zoom, range circles | ✅ | `shared/battle-board.js` → `ui/src/components/Battlefield/` |
| renderModels, cohesion, overlap | ✅ | `shared/battle-models.js` → `ui/src/components/ModelLayer/` |
| Mechanic-specific dice rolling | ❌ | Stays in the slice until integrated into engine |
| Phase-specific UI (action bar variants) | ❌ | Stays in slice |

---

## Naming Convention

```
v0.16.html              ← iteration on main battlefield (Movement v2)
v0.17-shooting.html     ← new mechanic slice (descriptive suffix)
v0.18-dice.html
v0.25-deployment.html
```

When a mechanic spans multiple slices (e.g. shooting has 3), they stay as separate files — don't try to merge them until integration.

---

## Acceptance Criteria for Integration

A mechanic is ready to integrate into the engine when:
- [ ] Prototype slice is reviewed and approved by James
- [ ] All edge cases visible in the prototype are documented in a comment block at the top of the slice
- [ ] The mechanic can be expressed as pure functions with no DOM dependencies
- [ ] A golden transcript test can be written for it

---

## Immediate Next Steps

1. **v0.15 hotfix** — restore deployment zones ✅ (done)
2. **Extract `shared/`** — when starting v0.16, spend ~1 day extracting the shared core from v0.15; subsequent slices will be much faster to write
3. **v0.16 — Movement range** — start here; adds real gameplay constraint to the existing drag mechanic
4. **Shooting pipeline** — the most complex mechanic; break into 3 slices (target selection → dice → LoS)
