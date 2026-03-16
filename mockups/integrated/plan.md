# Integrated Prototype Plan

## Goal

Build a single-page integrated prototype that runs all game phases in sequence (Deploy → Move → Shoot → Charge → Fight → Game End) in one continuous session. This validates the phase transition pattern and scene architecture before porting to the production engine.

---

## Architecture Decisions

### Rendering: SVG/HTML (not PixiJS)

The mockup SVG renderer (`svg-renderer.js`, 759 lines) handles everything: models, hulls, ghosts, rulers, range rings, terrain. The 1,229 lines of shared component CSS is the design system. SVG gives us free CSS styling, hit testing, DevTools, and accessibility. PixiJS would require rewriting all of this for zero user benefit at our unit scale (5-10 units, 20-40 models per side).

**Escape hatch:** If we ever need 500+ animated elements or shader effects, swap `svg-renderer.js` for a PixiJS renderer reading the same state. The rest of the app doesn't change.

### App Structure: Vanilla SPA with Hash Router

No React. No build step. One `index.html` with JS module imports.

Routes:
- `#/` → Start screen (army select, game setup) — future
- `#/game` → In-game (phase state machine)
- `#/results` → Post-game summary — future

For the integrated prototype, we only build `#/game`. The phase state machine handles all transitions internally.

### Componentization: Direct DOM (v0.1), Web Components (v0.2+)

**v0.1:** No Web Components. Direct DOM manipulation with `innerHTML` swaps and `textContent` updates. Two phases don't justify abstraction — the HTML diff between deploy and move action bars is ~10 lines. We swap `innerHTML` on transition, update `textContent` for headers/pills, and call it done.

**v0.2+:** When we add phase 3, extract Web Components based on the real patterns that emerged from v0.1. By then we'll have 3 concrete examples of each component's interface instead of guessing from 2.

Components to extract in v0.2+:

| Component | Source | Lines (est) | Used by |
|---|---|---|---|
| `<wh-action-bar>` | action-bar.css + HTML from each phase's index.html | ~100 | All phases |
| `<wh-phase-header>` | phase pill + subtitle from each scene.js | ~50 | All phases |
| `<wh-unit-card>` | `units.js` `buildCard()` + unit-card.css | ~150 | All phases |
| `<wh-dice-overlay>` | Roll overlay HTML from shoot/charge/fight | ~120 | Shoot, Charge, Fight |
| `<wh-model-tooltip>` | Tooltip logic from `units.js` | ~60 | All phases |
| `<wh-roster-panel>` | Roster sidebar HTML from each phase | ~80 | All phases |
| `<wh-vp-bar>` | VP tracker from game-end | ~40 | Command, Game End |

### Reactive Updates: Callbacks (v0.1), EventTarget (v0.2+)

**v0.1:** Existing `callbacks.selectUnit` pattern works fine for 2 phases. Phase machine uses a plain callback for transition notification.

**v0.2+:** When there are 3+ listeners on a transition event, upgrade to EventTarget bus. The interface is simple — `emit(name, detail)`, `on(name, fn)`, `off(name, fn)`.

---

## File Structure

```
mockups/integrated/
├── plan.md                  ← this file
├── index.html               ← single page, loads all modules
├── style.css                ← integration-specific styles (phase transitions, layout)
├── app.js                   ← entry point: init, phase state, transition logic
├── phase-machine.js         ← state machine: phase enum, transition logic, cleanup hooks
└── scenes/
    ├── scene-deploy.js      ← thin wrapper around phases/deploy/v0.4/deployment.js
    ├── scene-move.js         ← thin wrapper around phases/move/v0.23/movement.js + advance-dice.js
    ├── scene-shoot.js        ← adapted from phases/shoot/v0.9/shooting.js (v0.2)
    ├── scene-charge.js       ← adapted from phases/charge/v0.1/charge.js (v0.3)
    ├── scene-fight.js        ← adapted from phases/fight/v0.1/fight.js (v0.3)
    └── scene-game-end.js     ← adapted from phases/game-end/v0.2/scene.js (v0.4)
```

Shared modules imported from existing paths (`../../shared/`). No duplication.

---

## Phase State Machine

```
DEPLOY → MOVE → SHOOT → CHARGE → FIGHT → GAME_END
                                              ↓
                                         (future: → COMMAND → DEPLOY for next turn)
```

```js
// phase-machine.js (~30 lines)
const PHASES = ['deploy', 'move', 'shoot', 'charge', 'fight', 'game-end'];

let currentIndex = 0;
let onTransition = null; // plain callback, upgrade to EventTarget in v0.2+

export function currentPhase() { return PHASES[currentIndex]; }

export function setTransitionCallback(fn) { onTransition = fn; }

export function nextPhase() {
  if (currentIndex >= PHASES.length - 1) return null;
  const from = PHASES[currentIndex];
  currentIndex++;
  const to = PHASES[currentIndex];
  if (onTransition) onTransition({ from, to });
  return to;
}
```

Each scene module exports:
- `init(simState)` — set up phase-specific interactions, register event listeners
- `cleanup()` — remove event listeners, clear phase-specific DOM elements, reset callbacks

Transition sequence:
1. Current scene `cleanup()`
2. State machine advances
3. Phase header `textContent` updated (animated pill transition)
4. Action bar `innerHTML` swapped to new phase's buttons
5. Roster pills `textContent` cleared/updated
6. New scene `init(simState)` — unit positions carry over untouched

---

## Implementation Phases

### v0.1 — Deploy → Move (Minimal Integration)

**Scope:** Two-phase integration. No Web Components, no EventTarget bus. Direct DOM manipulation. Phase machine with plain callback.

**Army:** 6 Imperium units (including Outriders for wall-collision edge case) + 3 Ork units = 9 total.

**Steps:**

1. **Create `phase-machine.js`** (~30 lines)
   - Phase enum, `currentPhase()`, `nextPhase()`, `setTransitionCallback()`
   - Plain callback for transition notification (not EventTarget yet)

2. **Create `scene-deploy.js`** (~40 lines, thin wrapper)
   - Imports from `../../phases/deploy/v0.4/deployment.js`
   - Exports `initDeploy(simState)` and `cleanupDeploy()`
   - `cleanupDeploy()`: `delete simState.drag`, remove deploy event listeners, clear deploy overlays

3. **Create `scene-move.js`** (~40 lines, thin wrapper)
   - Imports from `../../phases/move/v0.23/movement.js` + `advance-dice.js`
   - Exports `initMove(simState)` and `cleanupMove()`

4. **Add `cleanupDeployment()` to `deployment.js`** (~15 lines)
   - New export in existing file: resets deploy state, removes event listeners
   - The only modification to an existing phase file

5. **Create `app.js`** (~150 lines)
   - Define `simState.units` — 6 imp units (Assault Intercessors, Primaris Lieutenant, Intercessor Squad A, Hellblasters, Redemptor Dreadnought, Outriders) in staging zone + 3 Orks pre-deployed
   - Init shared modules once: `renderTerrain()`, `initBoard()`, `initBattleControls()`, `initModelInteraction()`
   - Set initial camera pan (deploy's `translate(350px, 0px) scale(0.5)`)
   - `let currentPhase = 'deploy'`; register transition callback
   - `transitionToMove()`:
     1. `cleanupDeploy()` — remove deploy drag interceptor
     2. Update `.phase-title` textContent: "DEPLOYMENT PHASE" → "MOVEMENT PHASE"
     3. Update `.phase-subtitle` textContent
     4. Swap action bar innerHTML (remove deploy-status, add mode-group, swap confirm/cancel IDs)
     5. Update phase dots (MOVE goes `.active`)
     6. Add `.phase-move` class to body → hides deployment zone SVGs via CSS
     7. Clear roster deploy-state pills
     8. `initMovement()` — movement.js takes over

6. **Create `index.html`** (~220 lines)
   - Base: deploy v0.4's HTML structure
   - Add: `#roll-overlay` div (for advance dice), Outriders roster entry
   - Deploy-specific SVG (staging zone, deployment zones, NML labels) stays in HTML — hidden via CSS class on transition
   - Links all shared CSS + both phase CSS files + integration style.css
   - `<script type="module" src="app.js">`

7. **Create `style.css`** (~60 lines)
   - Phase transition animation (pill fade/slide for header)
   - `.phase-move` class that hides deployment zone SVGs (staging, zones, NML labels)
   - Camera transition easing

**Key risk: Drag interceptor handoff.**
Both deploy and move use `Object.defineProperty(simState, 'drag', {...})` with `configurable: true`. On transition:
1. `cleanupDeploy()` calls `delete simState.drag` to remove deploy's interceptor
2. `initMovement()` installs move's interceptor via its own `Object.defineProperty`
This must be tested carefully — the `delete` must happen before the new `defineProperty`.

**Acceptance criteria:**
- [ ] Page loads showing Deploy with 6 imp units in staging + 3 orks on board
- [ ] Outriders visible in roster and staging zone (3 models, R32 bases)
- [ ] User deploys units via drag (existing deployment mechanics)
- [ ] "CONFIRM DEPLOYMENT" transitions to Move phase with animation
- [ ] Phase header pill animates from "DEPLOYMENT" to "MOVEMENT"
- [ ] Action bar swaps to movement buttons (mode group + confirm/cancel)
- [ ] Deployment zone SVGs hidden after transition
- [ ] Unit positions carry over from Deploy to Move
- [ ] Movement mechanics work (drag, range rings, advance toggle, ghosts)
- [ ] Outriders: 14" move range, wall collision blocks path through gaps
- [ ] "END MOVEMENT" shows completion state
- [ ] All shared CSS renders correctly (no missing styles)
- [ ] Each file is <300 lines (LLM-friendly)
- [ ] Unit tests pass (6 tests)
- [ ] Visual tests pass (4 tests)

**Testing:**

*Unit tests (Vitest, ~6 tests):*
1. `nextPhase()` advances from 'deploy' to 'move' and fires transition callback
2. After transition, body has `.phase-move` class
3. Phase header text reads "MOVEMENT PHASE" after transition
4. Action bar contains move/advance mode buttons after transition
5. Unit positions from deploy carry over unchanged to move phase state
6. Drag interceptor cleanly swapped (deploy interceptor removed, move interceptor installed — no throw)

*Visual tests (Playwright screenshot comparison, ~4 tests):*
1. Initial load — deploy phase with staging zone, 6 imp units + 3 ork units visible
2. All units deployed — confirm button enabled, correct roster pill states
3. Post-transition — move phase UI: pill says MOVEMENT, action bar has mode buttons, deployment zones hidden
4. Outriders selected — range rings show 14" move, correct card stats

---

### v0.2 — + Shoot + Extract Web Components

**Add:** `scene-shoot.js` adapted from `phases/shoot/v0.9/shooting.js` (951 lines)

**Architecture upgrade:** Extract Web Components + EventTarget bus based on patterns from v0.1.

**Steps:**
1. Create `events.js` — EventTarget bus with `emit()`, `on()`, `off()`
2. Extract `<wh-action-bar>` Web Component (now we have 3 phase examples)
3. Extract `<wh-phase-header>` Web Component
4. Extract `<wh-dice-overlay>` from shooting HTML
5. Create `scene-shoot.js` — wire shooting logic to event bus
6. Add `shoot` to phase machine transition
7. Wire "END MOVEMENT" → Shoot transition

**New events:** `roll:started`, `roll:complete`, `unit:damaged`, `unit:destroyed`

**Acceptance criteria:**
- [ ] Move → Shoot transition works
- [ ] Unit that Advanced can't fire non-ASSAULT weapons (state carries from Move)
- [ ] Weapon selection, targeting, roll overlay all functional
- [ ] Damage applied to target units, reflected in unit cards
- [ ] Destroyed units removed from board

---

### v0.3 — + Charge + Fight

**Add:** `scene-charge.js` (922 lines) + `scene-fight.js` (1,301 lines)

**Steps:**
1. Create `scene-charge.js` — 2D6 charge roll, engagement, charge move
2. Create `scene-fight.js` — melee weapon selection, fight sequence
3. `<wh-dice-overlay>` reused for charge rolls and fight rolls
4. Add both to phase machine

**Acceptance criteria:**
- [ ] Shoot → Charge → Fight transitions work
- [ ] Charge roll determines max charge distance
- [ ] Units that charged can fight
- [ ] Melee damage applied correctly
- [ ] All state accumulated through Deploy → Move → Shoot → Charge → Fight

---

### v0.4 — + Game End

**Add:** `scene-game-end.js` (170 lines), `<wh-vp-bar>`

**Steps:**
1. Create `scene-game-end.js` — victory screen with scoring
2. Extract `<wh-vp-bar>` from game-end mockup
3. Show final score, casualties, replay option

**Acceptance criteria:**
- [ ] Fight → Game End transition works
- [ ] Summary screen shows accumulated game state
- [ ] Full single-turn playthrough: Deploy → Move → Shoot → Charge → Fight → Game End

---

### v0.5 — Command Phase + Multi-Turn

**Add:** Command phase (battle-shock, CP, VP scoring per turn), turn loop

**Steps:**
1. Create `scene-command.js` — battle-shock tests, CP allocation, objective scoring
2. Wire Game End → Command → Deploy loop for turn 2+
3. Add round counter, player swap
4. Extract `<wh-roster-panel>` for persistent roster tracking across turns

---

## Shared Module Reuse Map

All shared modules are imported directly from `../../shared/` — zero duplication.

| Module | Lines | Changes needed for integration |
|---|---|---|
| `store.js` | 27 | None — `simState.units` is the shared state contract |
| `units.js` | 301 | None — `buildCard()`, tooltips work as-is |
| `terrain-data.js` | 52 | None |
| `svg-renderer.js` | 759 | None — `initBoard()`, `initModelInteraction()`, `renderModels()` all reused |
| `collision.js` | 181 | None |
| `pathfinding.js` | 349 | None |
| `range-rings.js` | 47 | None |
| `coord-helpers.js` | 97 | None |
| `terrain.js` | 53 | None |
| `world-api.js` | 82 | None |
| **9 shared CSS files** | 1,229 | None — all linked in `index.html` |

**Total shared code reused verbatim: 3,381 lines (JS) + 1,229 lines (CSS)**

---

## Integration Layer Size Estimate (v0.1)

| New file | Lines (est) | Purpose |
|---|---|---|
| `phase-machine.js` | ~30 | State machine + transition logic |
| `app.js` | ~150 | Entry point, init, army data, transition DOM manipulation |
| `style.css` | ~60 | Phase transition animations, deploy-zone hiding |
| `index.html` | ~220 | Single page shell (deploy base + move additions) |
| `scenes/scene-deploy.js` | ~40 | Thin wrapper: init + cleanup for deploy |
| `scenes/scene-move.js` | ~40 | Thin wrapper: init + cleanup for move |
| **Total new integration code** | **~540** | |

**Modified existing file:**
| File | Change | Lines added |
|---|---|---|
| `deployment.js` | Add `cleanupDeployment()` export | ~15 |

---

## Production Engine Port Path

After the integrated prototype validates the architecture:

1. **Movement** — simplest action. `engine.dispatch({type: 'MOVE_UNIT', ...})` replaces direct position update. Engine validates distance.
2. **Shooting** — engine already resolves full hit/wound/save/damage pipeline. UI reads results, animates.
3. **Charge** — engine has 2D6 roll + engagement check. UI animates charge move.
4. **Fight** — mirrors shooting. Engine resolves melee damage.
5. **Command** — battle-shock, VP scoring. Mostly UI animation.

Scene files and (future) Web Components carry over to production unchanged. Only the state mutation changes: instead of manipulating `simState` directly, scenes call `engine.dispatch()` and read the returned state.

---

## Rules for LLM Implementors

1. **Read this plan first.** Don't improvise architecture.
2. **One version at a time.** Complete v0.1 before starting v0.2.
3. **No file over 300 lines.** Split if approaching.
4. **Import shared modules from `../../shared/`.** Never copy them.
5. **v0.1: Direct DOM manipulation.** No Web Components, no EventTarget bus. `innerHTML` swaps and `textContent` updates.
6. **v0.2+: Extract Web Components** based on real patterns from v0.1. Not before.
7. **Test each phase transition manually** — deploy units, confirm, verify state carries.
8. **The drag interceptor is the hardest part.** Both phases use `Object.defineProperty` on callbacks with `configurable: true`. `delete` the old one before installing the new one. Get this right in v0.1.
9. **Phase-specific CSS goes in the phase's existing `style.css`** (linked from index.html). Integration CSS goes in `integrated/style.css`.
10. **Keep the scene files recognizable.** Someone should be able to diff `scene-deploy.js` against `phases/deploy/v0.4/deployment.js` and see the adaptation, not a rewrite.
11. **Army: 6 Imperium + 3 Orks.** Outriders are required for wall-collision edge case testing. Do not drop them.
