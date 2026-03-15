# Integrated Prototype Plan

## Goal

Build a single-page integrated prototype that runs all game phases in sequence (Deploy → Move → Shoot → Charge → Fight → Game End) in one continuous session. This validates the phase transition pattern, event bus, and Web Component architecture before porting to the production engine.

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

### Componentization: Web Components (Custom Elements)

Native browser API (stable since 2018, all browsers). Each component is a small, self-contained file (50-200 lines). No Shadow DOM — use existing BEM-like CSS conventions for styling.

Components to extract:

| Component | Source | Lines (est) | Used by |
|---|---|---|---|
| `<wh-action-bar>` | action-bar.css + HTML from each phase's index.html | ~100 | All phases |
| `<wh-phase-header>` | phase pill + subtitle from each scene.js | ~50 | All phases |
| `<wh-unit-card>` | `units.js` `buildCard()` + unit-card.css | ~150 | All phases |
| `<wh-dice-overlay>` | Roll overlay HTML from shoot/charge/fight | ~120 | Shoot, Charge, Fight |
| `<wh-model-tooltip>` | Tooltip logic from `units.js` | ~60 | All phases |
| `<wh-roster-panel>` | Roster sidebar HTML from each phase | ~80 | All phases |
| `<wh-vp-bar>` | VP tracker from game-end | ~40 | Command, Game End |

### Reactive Updates: EventTarget Event Bus

Lightweight pub/sub for cross-component synchronization. Native browser API, zero dependencies.

```js
// shared/events.js (~30 lines)
const bus = new EventTarget();

export function emit(name, detail) {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, fn) {
  bus.addEventListener(name, (e) => fn(e.detail));
}

export function off(name, fn) {
  bus.removeEventListener(name, fn);
}
```

Core events:

| Event | Payload | Emitted by | Consumed by |
|---|---|---|---|
| `phase:transition` | `{ from, to }` | State machine | All components |
| `unit:selected` | `{ unit }` | svg-renderer | wh-unit-card, wh-action-bar, phase logic |
| `unit:deselected` | `{}` | svg-renderer | wh-unit-card, wh-action-bar |
| `unit:moved` | `{ unit, from, to }` | movement.js | wh-unit-card (range update), range-rings |
| `unit:advance-toggled` | `{ unit, advanced }` | movement.js | wh-unit-card, range-rings |
| `unit:damaged` | `{ unit, wounds }` | shooting/fight.js | wh-unit-card, wh-roster-panel |
| `unit:destroyed` | `{ unit }` | shooting/fight.js | wh-roster-panel, svg-renderer |
| `roll:started` | `{ type, data }` | phase logic | wh-dice-overlay |
| `roll:complete` | `{ results }` | wh-dice-overlay | phase logic |
| `action:confirmed` | `{ phase }` | wh-action-bar | State machine |

---

## File Structure

```
mockups/integrated/
├── plan.md                  ← this file
├── index.html               ← single page, loads all modules
├── style.css                ← integration-specific styles (phase transitions, layout)
├── app.js                   ← entry point: hash router, phase state machine
├── events.js                ← EventTarget bus (emit/on/off)
├── phase-machine.js         ← state machine: phase enum, transition logic, cleanup
├── components/
│   ├── wh-action-bar.js
│   ├── wh-phase-header.js
│   ├── wh-unit-card.js
│   ├── wh-dice-overlay.js
│   ├── wh-model-tooltip.js
│   ├── wh-roster-panel.js
│   └── wh-vp-bar.js
└── scenes/
    ├── scene-deploy.js      ← adapted from phases/deploy/v0.4/deployment.js
    ├── scene-move.js         ← adapted from phases/move/v0.23/movement.js + advance-dice.js
    ├── scene-shoot.js        ← adapted from phases/shoot/v0.9/shooting.js
    ├── scene-charge.js       ← adapted from phases/charge/v0.1/charge.js
    ├── scene-fight.js        ← adapted from phases/fight/v0.1/fight.js
    └── scene-game-end.js     ← adapted from phases/game-end/v0.2/scene.js
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
// phase-machine.js
const PHASES = ['deploy', 'move', 'shoot', 'charge', 'fight', 'game-end'];

let currentIndex = 0;

export function currentPhase() { return PHASES[currentIndex]; }

export function nextPhase() {
  if (currentIndex >= PHASES.length - 1) return null;
  const from = PHASES[currentIndex];
  currentIndex++;
  const to = PHASES[currentIndex];
  emit('phase:transition', { from, to });
  return to;
}
```

Each scene module exports:
- `init(simState)` — set up phase-specific interactions, register event listeners
- `cleanup()` — remove event listeners, clear phase-specific DOM elements, reset callbacks

Transition sequence:
1. Current scene `cleanup()`
2. State machine advances
3. `wh-phase-header` updates (animated pill transition from v0.4 mockup)
4. `wh-action-bar` swaps button set
5. New scene `init(simState)` — unit positions carry over untouched

---

## Implementation Phases

### v0.1 — Deploy → Move + Architecture Foundation

**Scope:** Two-phase integration with full event bus and Web Components.

**Steps:**

1. **Create `events.js`** — EventTarget bus with `emit()`, `on()`, `off()`

2. **Create `phase-machine.js`** — Phase enum, `currentPhase()`, `nextPhase()`, transition emission

3. **Extract `<wh-action-bar>`** — Web Component from shared action-bar HTML pattern
   - Accepts `phase` attribute, renders appropriate buttons
   - Listens to `phase:transition` to swap buttons
   - Emits `action:confirmed` on primary button click

4. **Extract `<wh-phase-header>`** — Web Component from phase pill pattern
   - Accepts `phase` + `subtitle` attributes
   - Animated transition (dot pulse + label slide from v0.4 mockup)
   - Listens to `phase:transition` to update

5. **Extract `<wh-unit-card>`** — Web Component wrapping `buildCard()`
   - Listens to `unit:selected`, `unit:deselected`, `unit:advance-toggled`
   - Renders in card slot area

6. **Create `scene-deploy.js`** — Adapt from `phases/deploy/v0.4/deployment.js` (675 lines)
   - Import deployment logic, wire to event bus instead of direct DOM manipulation
   - On "CONFIRM DEPLOYMENT" → emit `action:confirmed`

7. **Create `scene-move.js`** — Adapt from `phases/move/v0.23/movement.js` (793 lines) + `advance-dice.js` (83 lines)
   - Import movement logic, wire to event bus
   - Emit `unit:moved`, `unit:advance-toggled` events
   - On "END MOVEMENT" → emit `action:confirmed`

8. **Create `app.js`** — Entry point
   - Define `simState.units` (once, from deploy scene.js data)
   - Init shared modules (renderTerrain, initBoard, etc. — once)
   - Register phase machine listener: on `action:confirmed`, call `nextPhase()`
   - Start with `scene-deploy.init()`

9. **Create `index.html`** — Single page
   - Links all shared CSS files (9 files from `shared/components/`)
   - Links integration `style.css` (phase transition animations)
   - Uses Web Components in markup: `<wh-phase-header>`, `<wh-action-bar>`, `<wh-unit-card>`
   - SVG battlefield (same structure as individual phase pages)
   - `<script type="module" src="app.js">`

10. **Create `style.css`** — Phase transition animations, layout for integrated view

**Acceptance criteria:**
- [ ] Page loads showing Deploy phase with staging zone
- [ ] User deploys units via drag (existing deployment mechanics)
- [ ] "CONFIRM DEPLOYMENT" transitions to Move phase with animation
- [ ] Phase header pill animates from "DEPLOYMENT" to "MOVEMENT"
- [ ] Action bar swaps to movement buttons
- [ ] Unit positions carry over from Deploy to Move
- [ ] Movement mechanics work (drag, range rings, advance toggle, ghosts)
- [ ] Unit card updates reactively via event bus when advance toggled
- [ ] "END MOVEMENT" shows completion state
- [ ] All shared CSS renders correctly (no missing styles)
- [ ] Each file is <300 lines (LLM-friendly)

**Key risk:** The drag interceptor pattern (`Object.defineProperty` on callbacks) is set differently per phase. The integration layer needs a single interceptor that delegates to the current phase. Test this carefully during Deploy → Move transition.

---

### v0.2 — + Shoot

**Add:** `scene-shoot.js` adapted from `phases/shoot/v0.9/shooting.js` (951 lines)

**New component:** `<wh-dice-overlay>` — shared roll overlay for shoot/charge/fight

**Steps:**
1. Extract `<wh-dice-overlay>` from shooting HTML
2. Create `scene-shoot.js` — wire shooting logic to event bus
3. Add `shoot` to phase machine transition
4. Wire "END MOVEMENT" → Shoot transition

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

## Integration Layer Size Estimate

| New file | Lines (est) | Purpose |
|---|---|---|
| `events.js` | ~30 | Event bus |
| `phase-machine.js` | ~60 | State machine + transition logic |
| `app.js` | ~100 | Entry point, init, router |
| `style.css` | ~80 | Phase transition animations |
| `index.html` | ~150 | Single page shell |
| 7 Web Components | ~600 total | UI componentization |
| **Total new integration code** | **~1,020** | |

Each phase scene file is adapted (not rewritten) from its mockup counterpart. The adaptation is primarily:
- Remove `simState.units` definition (shared across phases now)
- Remove shared module init calls (done once in `app.js`)
- Replace direct DOM manipulation for action bar / phase header with event emissions
- Export `init()` and `cleanup()` functions

---

## Production Engine Port Path

After the integrated prototype validates the architecture:

1. **Movement** — simplest action. `engine.dispatch({type: 'MOVE_UNIT', ...})` replaces direct position update. Engine validates distance.
2. **Shooting** — engine already resolves full hit/wound/save/damage pipeline. UI reads results, animates.
3. **Charge** — engine has 2D6 roll + engagement check. UI animates charge move.
4. **Fight** — mirrors shooting. Engine resolves melee damage.
5. **Command** — battle-shock, VP scoring. Mostly UI animation.

The Web Components and event bus carry over to production unchanged. Only the scene files change: instead of manipulating `simState` directly, they call `engine.dispatch()` and read the returned state.

---

## Rules for LLM Implementors

1. **Read this plan first.** Don't improvise architecture.
2. **One version at a time.** Complete v0.1 before starting v0.2.
3. **No file over 300 lines.** Split if approaching.
4. **Import shared modules from `../../shared/`.** Never copy them.
5. **Use the event bus for cross-component updates.** No direct DOM queries between components.
6. **Test each phase transition manually** — deploy units, confirm, verify state carries.
7. **The drag interceptor is the hardest part.** The current pattern uses `Object.defineProperty` on a callbacks object. The integration needs a single interceptor that delegates to the current phase's handler. Get this right in v0.1.
8. **Phase-specific CSS goes in the phase's existing `style.css`** (linked from index.html). Integration CSS goes in `integrated/style.css`.
9. **Keep the scene files recognizable.** Someone should be able to diff `scene-deploy.js` against `phases/deploy/v0.4/deployment.js` and see the adaptation, not a rewrite.
