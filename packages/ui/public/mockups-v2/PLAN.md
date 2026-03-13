# mockups-v2 Migration Plan

**Goal:** Refactor mockup architecture for LLM iteration speed, componentization, and production alignment — while preserving exact visual fidelity to v0.8a.

**Reference page:** [shoot/v0.8a](https://jrgrafton-openclaw.github.io/warhammer-40k-simulator/mockups/phases/shoot/v0.8a/)

---

## Architecture

### World space (SVG → later Pixi)
Everything that pans/zooms with the board:
- Unit model tokens, hulls, wound rings
- Terrain pieces
- Objective markers
- Target sight lines
- Range overlays
- Projectile FX, hit flashes

### Screen space (HTML/CSS)
UI chrome that stays fixed regardless of camera:
- Roster sidebar
- VP/score bar
- Phase header + pill
- Action bar + phase pills
- Unit card
- Weapon picker / dice overlay / result panel
- Stratagem modal

### Bridge
- `shared/world/world-api.js` — single coordinate contract (`worldToScreen`, `getUnitAnchor`, camera state)
- `shared/lib/coord-helpers.js` — extracted utility functions from shooting.js

---

## Directory Structure

```
mockups-v2/
├── index.html                          # v2 mockup index
├── PLAN.md                             # This file
│
├── shared/
│   ├── tokens/
│   │   ├── colors.css                  # CSS custom properties
│   │   └── typography.css              # Font faces, size scale
│   │
│   ├── components/                     # Screen-space UI (HTML/CSS)
│   │   ├── roster.css                  # Sidebar roster panel
│   │   ├── unit-card.css               # Right-side unit card
│   │   ├── action-bar.css              # Bottom action bar + phase pills
│   │   ├── vp-bar.css                  # Top score/round bar
│   │   ├── overlays.css                # Weapon popup, roll overlay, result panel
│   │   ├── stratagem-modal.css         # Stratagem modal
│   │   └── fx.css                      # Projectile + hit-flash animations
│   │
│   ├── world/                          # World-space rendering
│   │   ├── world-api.js                # THE contract: coordinate transforms, anchors, camera
│   │   ├── svg-renderer.js             # Current SVG impl (battle-board + battle-models-v23 merged)
│   │   ├── terrain.js                  # Terrain data + rendering
│   │   ├── models.js                   # Model tokens, hulls, wound rings
│   │   └── collision.js                # AABB intersection, LoS checks
│   │
│   ├── state/                          # Shared state management
│   │   ├── store.js                    # Simple pub/sub store
│   │   ├── units.js                    # UNITS data + card builder
│   │   └── terrain-data.js             # mapData terrain layout
│   │
│   └── lib/                            # Vendor / utility
│       ├── d3.min.js                   # Local copy (no CDN)
│       └── coord-helpers.js            # toBattlefieldCoords, projectileAnchor, etc.
│
├── phases/
│   └── shoot/
│       └── v0.8a/
│           ├── index.html              # Minimal shell (same DOM as original)
│           ├── scene.js                # Army positions + init wiring
│           ├── shooting.js             # Shooting interaction (attack flow, dice)
│           └── style.css               # Phase-specific overrides only
│
└── REFERENCE/                          # Frozen visual references
    └── shoot-v0.8a/
        ├── screenshot-idle.png
        ├── screenshot-unit-selected.png
        ├── screenshot-attack-hit-roll.png
        ├── screenshot-hit-results.png
        ├── screenshot-damage-roll.png
        ├── screenshot-result-panel.png
        ├── screenshot-stratagem-modal.png
        └── ACCEPTANCE.md
```

---

## Migration PRs

### PR A: Freeze reference + scaffold ✅ (this commit)
- Create `mockups-v2/` directory structure
- Capture reference screenshots of v0.8a
- Write ACCEPTANCE.md checklist
- Write this plan
- **No behavior changes. No rendering changes.**

### PR B: Extract CSS tokens + component files
- Split v0.4's 916-line monolithic CSS into component files
- Create `colors.css` and `typography.css` tokens
- Create `index.html` with **exact same DOM** as v0.8a, loading component CSS
- Verify against screenshots: pixel-match check
- **Zero JS changes.**

### PR C: Extract state + world API
- Create `store.js`, `units.js`, `terrain-data.js`
- Create `world-api.js` with SVG implementation
- Create `svg-renderer.js` (merge of battle-board + battle-models-v23)
- Wire `scene.js` to use new modules
- Get battlefield rendering working (terrain, models, pan/zoom, selection)
- **No shooting interaction yet. Just a rendered board you can pan and click.**

### PR D: Port shooting interaction
- Port `shooting.js` to use `WorldAPI` + `coord-helpers`
- Port projectile FX, wound rings, hit flashes
- Full shooting flow: select → target → dice → result
- **Verify against screenshots at each step**

### PR E: Verify + clean up
- Side-by-side comparison with original v0.8a
- Fix any fidelity gaps
- Keep original v0.8a in `mockups/` as permanent reference

---

## Guardrails

| Rule | Why |
|---|---|
| One axis of change per PR | PR #13 failed by changing rendering + markup + styling simultaneously |
| DOM copied verbatim from v0.8a | PR #13 regenerated all markup from scratch, lost fidelity |
| SVG stays until world-api.js is proven | PR #13 jumped to Canvas2D prematurely |
| ES modules with explicit imports | Replaces global `window.BattleUI` namespace soup |
| Reference screenshots checked per PR | No way to verify was the root cause of PR #13 drift |
| No deletion of original mockups | `mockups/phases/shoot/v0.8a/` stays as the canonical reference |

---

## Key Design Decisions

### Why not Pixi yet?
PR #13 tried SVG→Canvas2D + restructure at once. That's two axes. We keep SVG behind `world-api.js` so we can swap to Pixi later without touching any UI code.

### Why ES modules?
The current `window.BattleUI` global means every file monkey-patches every other file. `battle-models-v23.js` completely overwrites functions from `battle-models.js`. ES modules make dependencies explicit and prevent accidental coupling.

### Why split CSS by component?
The v0.4 monolith (916 lines) forces LLMs to parse everything to edit anything. An LLM editing the roster should never see overlay code. Each component file is <150 lines and self-contained.

### What about movement.js / advance-dice.js?
Not migrated yet. They're loaded by shoot v0.8a but unused in the shooting phase. They'll come when we migrate move phases.
