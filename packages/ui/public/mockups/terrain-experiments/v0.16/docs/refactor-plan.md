# Terrain Editor v0.16 — Refactor Plan

## Problem Statement

31 commits, 18 fixes (58%). The editor grew organically from a simple sprite placer into a full scene editor, but the architecture never evolved. Every listed bug traces to the same root causes:

| Bug | Root Cause |
|-----|-----------|
| Ctrl+Z undoing too much | Full-snapshot undo, no command granularity |
| Layer ordering not preserved on refresh | DOM-as-data: z-order derived from SVG children order, serialized via fragile heuristics |
| Settings not persisted on refresh | 50+ manual `save()` calls, miss one = data loss |
| Can't drag into groups / unreliable drop | Crop wrapper (`_clipWrap || el`) creates parallel DOM identity; drag handlers don't consistently resolve it |
| Sprite grounding not persisted | Effects globals (`shadow.dx`, `feather.radius`, etc.) are ephemeral — never serialized |
| Layer groups disappearing on refresh | Group restore races with sprite restore; group `<g>` elements created before sprites but `layerOrder` replay fails to find wrapped elements |

---

## Architecture Diagnosis

### 1. No Single Source of Truth (P0)
**JS objects** store sprite properties. **SVG DOM order** stores z-order and group membership. Persistence must reconcile both. Any mismatch = bugs.

Evidence:
- `_buildZOrder()` is 60 lines of defensive DOM-walking (skip lists, legacy containers, crop wrapper detection)
- `layerOrder` uses fragile heuristics: `el.id || el.dataset?.id`, `-wrap` suffix detection, sprite ID fallback
- Groups create `<g>` DOM elements — another DOM-as-data dependency
- 6+ commits fixing layer order/z-order alone

### 2. Scatter-Shot Persistence (P0)
Every mutation site must remember to call `Editor.Persistence.save()`. There are **50+ manual `save()` calls**. Missing one = settings lost.

Unpersisted state:
- Effects globals: `shadow.dx/dy/blur/opacity`, `feather.radius`, `grade.brightness/saturation/sepia`
- Light visibility toggles
- Expanded group state in layers panel

### 3. Objectives `restorePositions()` is a No-Op (P1)
`Editor.Objectives.restorePositions()` is an empty function. Objectives are only created during `Editor.Core.init()` with hardcoded default positions. `Persistence.load()` calls `restorePositions(data.objectives)` but it does nothing — so custom objective positions (if they were ever dragged) would be silently lost on reload. Discovered during Phase 0 round-trip testing.

### 4. Crop Wrapper Duality (P1)
Cropping wraps `<image>` in `<g clip-path>`. Every z-order operation must check `sp._clipWrap || sp.el`. This pattern appears **20+ times** across 5 modules. Missing one check = bug.

### 5. Full-Snapshot Undo (P2)
`push()` clones entire world. `pop()` destroys everything and rebuilds from scratch. Problems:
- Granularity: two operations sharing a `push()` undo together
- Incomplete: doesn't capture effects globals, toggle states, zoom/pan
- Expensive: full DOM teardown/rebuild on every Ctrl+Z

### 6. Module Coupling (P3)
Every module directly calls 5–8 others. No event bus, no central dispatcher. Adding a feature = updating N modules. Missing one = bug.

---

## Test Fixture

**File:** `__tests__/fixtures/test-scene.json`

The attached JSON (from James) contains a representative scene:
- 20 sprites (floor + top layers, rotations, flips, crops, groups, varying shadowMul)
- 29 models (two factions: `#0088aa` imperium, `#aa2810` ork; circle + rect kinds; cross/star/diamond icons)
- 5 objectives (standard 5-point layout)
- 1 group (`group-g1` with 6 sprites including cropped ones)
- Settings (bg, ruinsOpacity, roofOpacity)
- Edge cases: near-zero rotations (`1.77e-15`), `shadowMul: 0`, partial crops

This fixture is used throughout all test phases as the canonical round-trip verification data.

---

## Phase 0: Test Infrastructure (no refactoring)

**Goal:** Establish the testing harness and baseline coverage before touching any production code.

### 0.1 — Unit Test Harness Improvements
- [ ] Add `__tests__/fixtures/test-scene.json` (the attached JSON)
- [ ] Add helper: `loadScene(json)` — calls `Editor.Persistence.importJSON`-equivalent in test, returns the editor state
- [ ] Add helper: `exportScene()` — returns the current state as JSON (same schema as fixture)
- [ ] Add helper: `assertSceneEqual(a, b, opts)` — deep-compare two scene JSONs, with options to ignore ephemeral fields

### 0.2 — Round-Trip Persistence Tests (the biggest gap)
Using `test-scene.json`:
- [ ] `save → load → export` produces identical JSON (sprite properties, z-order, groups, settings)
- [ ] Cropped sprites survive round-trip (cropL/T/R/B preserved)
- [ ] Groups survive round-trip (group membership, group metadata, sprites inside groups)
- [ ] Layer order survives round-trip (SVG DOM order matches saved `layerOrder`)
- [ ] Effects globals survive round-trip (currently expected to **fail** — documents the gap)
- [ ] Models survive round-trip (kind, position, stroke, icon)
- [ ] Objectives survive round-trip (positions)

### 0.3 — Undo/Redo Tests
- [ ] Single mutation → undo → state matches pre-mutation
- [ ] Move sprite → undo → position restored
- [ ] Create group → undo → group removed, sprites ungrouped
- [ ] Crop sprite → undo → crop removed
- [ ] Undo doesn't affect effects globals (document the gap)

### 0.4 — Layer Drag Tests
- [ ] Drag sprite A above sprite B → A's SVG element is after B's in DOM
- [ ] Drag sprite out of group → sprite becomes direct SVG child, removed from group
- [ ] Drag sprite into group → sprite becomes child of group `<g>`
- [ ] Drag within group → intra-group order changes
- [ ] Multi-select drag → all selected sprites move together, relative order preserved

### 0.5 — Visual Regression Baseline (Browser Tool)
No extra dependencies — use the OpenClaw browser tool against the live GitHub Pages deployment:
- [ ] `browser → navigate` to `https://jrgrafton-openclaw.github.io/warhammer-40k-simulator/mockups/terrain-experiments/v0.16/index.html`
- [ ] Inject `test-scene.json` into localStorage via `browser → act (evaluate)`
- [ ] Reload → `browser → screenshot` → save as `__tests__/snapshots/baseline.png`
- [ ] Screenshot after save+reload → pixel-diff against baseline (tolerance: 0.1%)
- [ ] Screenshot after undo (move sprite → undo) → matches baseline

**Exit criteria:** All persistence round-trip tests pass. Visual baseline established. Undo gaps documented as known-failing tests.

### Phase 0 Results ✅

**Completed.** 60 tests passing, 3 skipped (known gaps).

| File | Tests | What it covers |
|------|:---:|---|
| `persistence.test.js` | 12 ✅ 2 ⏭ | Full save→clear→load round-trip, crop/group/model/settings preservation |
| `undo.test.js` | 8 ✅ 1 ⏭ | Move/add/group/crop undo, shadowMul, multi-step, grouped+cropped combined |
| `layers.test.js` | 7 ✅ | Drag reorder, out-of/into-group, multi-select batch, crop wrapper z-order |
| `editor.test.js` | 33 ✅ | Pre-existing (unchanged) |

**New gap discovered:** `Objectives.restorePositions()` is a no-op — added to architecture diagnosis above.

---

## Phase 1: Introduce EditorState — Single Source of Truth

**Goal:** Extract a pure-data state object that owns all editor state. DOM becomes a derived view.

### 1.1 — Define `EditorState` Schema

```js
// editor-state.js (new file)
const EditorState = {
  sprites: [],      // { id, file, x, y, w, h, rot, layerType, hidden, flipX, flipY, groupId, shadowMul, cropL, cropT, cropR, cropB }
  models: [],       // { id, kind, x, y, r?, w?, h?, stroke, icon }
  lights: [],       // { id, x, y, color, radius, intensity, hidden }
  objectives: [],   // { idx, leftPct, topPct }
  groups: [],       // { id, name, opacity }
  zOrder: [],       // ordered array of { type: 'sprite'|'group'|'builtin', id: string }
  settings: {
    bg: 'svg-gradient',
    ruinsOpacity: 100,
    roofOpacity: 100,
  },
  effects: {
    shadow: { on: true, dx: 3, dy: 3, blur: 6, opacity: 0.55 },
    feather: { on: false, radius: 10 },
    grade: { on: true, brightness: 0.75, saturation: 0.7, sepia: 0.08 },
  },
  counters: { sid: 0, gid: 0, lid: 0, clipId: 0 },
};
```

### 1.2 — State Accessors
- [x] `EditorState.getSpriteRootEl(sp)` — returns `sp._clipWrap || sp.el` (single place for the duality)
- [x] `EditorState.findSprite(id)`, `.findGroup(id)`, `.findLight(id)`
- [x] `EditorState.getZOrderedElements()` — returns elements in z-order (replaces `_buildZOrder()`)

### 1.3 — Migrate Persistence to Use EditorState
- [x] `save()` serializes `EditorState` directly (no DOM walking for z-order)
- [x] `load()` populates `EditorState` first, then calls a render pass
- [x] `zOrder` is now an explicit array in the saved JSON — no more `layerOrder` heuristics

### 1.4 — Tests
- [x] All Phase 0 round-trip tests still pass
- [x] New test: `EditorState.zOrder` matches expected order after mutations
- [ ] Visual regression: screenshots unchanged (not automated — requires browser tool)

**Exit criteria:** Persistence no longer walks the DOM for z-order. `EditorState` is the single serialization source.

### Phase 1 Results ✅

**Completed.** 118 tests passing, 3 skipped (same known gaps from Phase 0).

| File | Tests | What it covers |
|------|:---:|---|
| `editor-state.test.js` | 58 ✅ | EditorState accessors, zOrder sync/persist, crop transforms, resize with rotation+flip, layer moves into/out of groups, undo granularity for all action types, persistence through EditorState |
| `persistence.test.js` | 12 ✅ 2 ⏭ | (unchanged from Phase 0) |
| `undo.test.js` | 8 ✅ 1 ⏭ | (unchanged from Phase 0) |
| `layers.test.js` | 7 ✅ | (unchanged from Phase 0) |
| `editor.test.js` | 33 ✅ | (unchanged from Phase 0) |

**Files changed:**
- `editor-state.js` — **NEW**: EditorState object with all state arrays, zOrder, settings, effects, counters. Accessors: `getSpriteRootEl`, `findSprite/Group/Light`, `getZOrderedElements`, `syncZOrderFromDOM`, `syncFromCore/syncToCore`.
- `editor-core.js` — Added `Editor.State.syncFromCore()` and `syncZOrderFromDOM()` calls after init.
- `editor-persistence.js` — Rewritten `save()` to use `EditorState.zOrder` instead of DOM-walking. Saves explicit `zOrder` array + backward-compat `layerOrder`. `load()` syncs EditorState after load. Added `_restoreZOrderFromExplicit` and `_restoreZOrderFromLayerOrder` helpers.
- `editor-layers.js` — `_buildZOrder()` now has two paths: `_buildZOrderFromState()` (uses EditorState.zOrder) and `_buildZOrderFromDOM()` (legacy fallback). All DOM reorder handlers call `Editor.State.syncZOrderFromDOM()`.

**Architecture notes for later phases:**
- During Phase 1, EditorState arrays are **references** to Editor.Core arrays (via `syncFromCore()`), not copies. This means mutations to `Editor.Core.allSprites` are immediately visible via `Editor.State.sprites`. This is intentional for Phase 1 — Phase 2 (dispatch API) will make EditorState the primary owner.
- `zOrder` is synced from DOM after any reorder operation. Phase 2 can eliminate the DOM-sync by having `dispatch()` update zOrder directly.
- Backward compat: legacy `layerOrder` (flat ID list) still loads correctly. The `zOrder` array with `{type, id}` entries is the Phase 1+ format.

---

## Phase 2: Auto-Save via Mutation API ✅

**Goal:** Replace 50+ manual `save()` calls with automatic dirty-tracking.

**Status:** ✅ Complete. 170 tests passing (118 original + 52 new), 3 skipped.

### 2.1 — `EditorState.dispatch(action)` ✅
```js
EditorState.dispatch({ type: 'MOVE_SPRITE', id: 's0' });
EditorState.dispatch({ type: 'SET_SETTING' });
EditorState.dispatch({ type: 'SET_EFFECT' });
```

- Every dispatch marks state dirty ✅
- `syncFromCore()` + `syncZOrderFromDOM()` called synchronously on dispatch ✅
- Debounced auto-save (300ms) — only localStorage write is delayed ✅
- `flush()` for immediate save (before-unload) ✅
- All mutations go through dispatch — `save()` is never called directly ✅

### 2.2 — Migrate Modules ✅
All modules migrated:
1. [x] `editor-effects.js` — 7 save() → dispatch (SET_EFFECT)
2. [x] `editor-sprites.js` — 4 save() → dispatch (ADD_SPRITE, RESIZE_SPRITE, ROTATE_SPRITE)
3. [x] `editor-groups.js` — 6 save() → dispatch (GROUP, UNGROUP, ADD_TO_GROUP, RENAME_GROUP, SET_GROUP_OPACITY, DELETE_GROUP)
4. [x] `editor-layers.js` — 7 save() → dispatch (REORDER, TOGGLE_SPRITE_VIS, DELETE_SPRITE)
5. [x] `editor-crop.js` — 2 save() → dispatch (CROP, RESET_CROP)
6. [x] `editor-lights.js` — 4 save() → dispatch (ADD_LIGHT, UPDATE_LIGHT, MOVE_LIGHT, DELETE_LIGHT)
7. [x] `editor-models.js` — 2 save() → dispatch (SET_PROPERTY)
8. [x] `editor-selection.js` — 9 save() → dispatch (SET_PROPERTY)
9. [x] `editor-undo.js` — 1 save() → dispatch (UNDO)

### 2.3 — Tests ✅ (52 new tests in dispatch.test.js)
- [x] Dispatch marks state dirty
- [x] Debounced save fires after 300ms delay
- [x] Rapid mutations → single save (debounce coalescing)
- [x] flush() saves immediately and clears timer
- [x] Moving a sprite without explicit save() → persisted after debounce
- [x] Zero manual save() calls verified (static analysis test)
- [x] Effects globals persist across reload (**was a known gap — now fixed**)
- [x] Light visibility persists across reload
- [x] All sprite properties persist (position, size, rotation, flip, layerType, hidden, shadowMul)
- [x] Crop data persists
- [x] Group data persists (id, name, opacity, sprite membership)
- [x] Models persist
- [x] zOrder persists in both explicit and legacy formats
- [x] Cropping correct with flipX, flipY, flipX+flipY, rotation, rotation+flip
- [x] Resize transforms correct with rotation and flip
- [x] Layer moves: into groups, out of groups, to top, multi-select, persist
- [x] Undo granularity: move, add, resize, rotate, flip, crop, delete, group, shadowMul
- [x] Multiple undos revert in reverse order
- [x] Full fixture round-trip through dispatch

**Architecture notes:**
- `dispatch()` calls `syncFromCore()` + `syncZOrderFromDOM()` immediately — state is always current, only the localStorage write is debounced. This preserves the previous behavior where `save()` synced state as a side effect.
- Action types are documented but not yet enforced — they serve as semantic annotations for future undo/event integration (Phase 4/5).
- `Editor.Persistence.save()` still exists and works — it's just only called from the debounced timer and `flush()`, never from modules directly.

**Exit criteria:** ✅ Zero manual `save()` calls remain. Effects globals survive reload. 170 tests pass.

---

## Phase 3: `rootEl` Getter — Kill the Duality ✅

**Goal:** Eliminate `sp._clipWrap || sp.el` scattered across the codebase.

**Status:** ✅ Complete. 175 tests passing (170 original + 5 new), 3 skipped.

### 3.1 — Add `sp.rootEl` Getter ✅
```js
Object.defineProperty(sprite, 'rootEl', {
  get() { return this._clipWrap || this.el; },
  enumerable: false, configurable: true
});
```
Added in `Editor.Sprites.addSprite()` — every sprite gets the getter at creation time.

### 3.2 — Replace All `_clipWrap || el` References ✅
- [x] `editor-groups.js` — 6 occurrences replaced (createGroup, addToGroup, ungroup, deleteGroup, restore)
- [x] `editor-layers.js` — 7 occurrences replaced (_handleDrop top-zone, _handleDrop sprite-out-of-group, _handleDrop multi-select ×2, _handleDrop target guard ×2, _handleDrop dragEl fallback)
- [x] `editor-undo.js` — 1 occurrence replaced (pop group-move)
- [x] `editor-persistence.js` — 2 occurrences replaced (_restoreZOrderFromExplicit, _restoreZOrderFromLayerOrder)
- [x] `editor-selection.js` — 2 occurrences replaced (z-order +/- keyboard shortcuts)
- [x] `editor-state.js` — `getSpriteRootEl()` now delegates to `sp.rootEl`

### 3.3 — Crop Module Updates ✅
- [x] `Editor.Crop._applyClip(sp)` sets `sp._clipWrap` → automatically reflected in `sp.rootEl`
- [x] `Editor.Crop._removeClip(sp)` clears `sp._clipWrap` → `sp.rootEl` falls back to `sp.el`
- No changes needed in editor-crop.js itself — the getter dynamically reads `_clipWrap`.

### 3.4 — Tests ✅ (5 new tests in editor-state.test.js)
- [x] `sp.rootEl` returns `el` when uncropped
- [x] `sp.rootEl` returns `_clipWrap` when cropped
- [x] `sp.rootEl` falls back to `el` after uncrop (crop → remove → check)
- [x] `getSpriteRootEl` delegates to `sp.rootEl`
- [x] `rootEl` is not enumerable (does not pollute serialization)

**Verification:** `grep -rn "_clipWrap || " *.js` returns only the getter definition in `editor-sprites.js:56`.

**Exit criteria:** ✅ Zero occurrences of `_clipWrap || el` outside the `rootEl` getter definition.

**Architecture notes:**
- `rootEl` is defined as a non-enumerable property so it doesn't appear in `Object.keys()` or `JSON.stringify()`, preventing serialization pollution.
- The `_clipWrap` property is still set/cleared by `editor-crop.js` — the getter is read-only sugar that eliminates the scattered duality pattern.
- Reverse lookups (`s._clipWrap === el`) in `editor-layers.js`, `editor-persistence.js`, `editor-state.js`, and test helpers remain — these find which sprite owns a given DOM element, a different concern from the duality pattern.

---

## Phase 4: Command-Pattern Undo ✅

**Goal:** Replace full-snapshot undo with granular, reversible commands.

**Status:** ✅ Complete. 191 tests passing (175 original + 16 new/rewritten), 1 skipped.

### 4.1 — Define Command Interface ✅
Each command: `{ type, apply(), reverse(), description }` — created via factory methods on `Editor.Commands`.

### 4.2 — Command Types ✅
- [x] `MOVE` — sprite position change
- [x] `RESIZE` — sprite dimension change
- [x] `ROTATE` — sprite rotation change
- [x] `ADD_SPRITE` / `DELETE_SPRITE`
- [x] `CROP` — crop value change (apply/remove clip)
- [x] `GROUP` / `UNGROUP` / `ADD_TO_GROUP`
- [x] `REORDER` — z-order change (full DOM order snapshot)
- [x] `SET_PROPERTY` — generic property change (flip, hide, shadowMul, etc.)
- [x] `SET_SETTING` — editor settings (bg, opacity)
- [x] `SET_EFFECT` — effect parameter change (shadow, feather, grade)
- [x] `ADD_LIGHT` / `DELETE_LIGHT` / `MOVE_LIGHT` / `LIGHT_PROPERTY` / `TOGGLE_LIGHT_VIS`
- [x] `ADD_MODEL` / `DELETE_MODEL` / `MOVE_MODEL`
- [x] `BATCH` — compound command (e.g., multi-select move)

### 4.3 — Undo Manager ✅
- [x] `Editor.Undo.record(cmd)` — push already-applied command onto undo stack
- [x] `Editor.Undo.undo()` — pops and reverses last command (Ctrl+Z)
- [x] `Editor.Undo.redo()` — re-applies from redo stack (Ctrl+Shift+Z / Ctrl+Y)
- [x] Redo stack cleared on new command
- [x] No DOM teardown/rebuild — only the affected elements change
- [x] Backward-compat shims: `push()` (no-op), `pop()` → `undo()`

### 4.4 — Tests ✅
- [x] Move sprite → undo → position matches original
- [x] Move sprite → undo → redo → position matches moved
- [x] Move A, resize B → undo → only B reverts, A unchanged
- [x] Batch (multi-move) → single undo reverts all
- [x] Undo after crop → crop removed cleanly (no DOM artifacts)
- [x] Crop → undo → redo → crop reapplied
- [x] Add/delete sprite → undo → sprite removed/restored
- [x] Group → undo → group removed, sprites ungrouped
- [x] Rotate, flip, hide, resize, shadowMul, reorder → all reversible
- [x] Multiple undos revert in reverse order
- [x] ALL action types can be on the undo stack without undoing too much
- [x] Undo clears redo stack on new command
- [x] Stack respects max size (50)
- [x] canUndo/canRedo reflect stack state
- [x] Effects undo via SetEffect command
- [x] Full fixture scene: move sprite → undo → only that sprite reverts

**Files changed:**
- `editor-commands.js` — **NEW**: 717 lines. Command factories for all action types with helpers (`_captureSprite`, `_restoreSprite`, `_removeSprite`, `captureDOMOrder`, `_restoreDOMOrder`).
- `editor-undo.js` — Rewritten: command-pattern undo/redo with `record()`, `undo()`, `redo()`. No more full-snapshot `push()`/`pop()`.
- `editor-groups.js` — Uses `Editor.Commands.Group.create()` for undo recording.
- `editor-selection.js` — Uses `Editor.Commands.Move/Resize/Rotate/SetProperty/Batch.create()` for all interactions.
- `editor-crop.js` — Uses `Editor.Commands.Crop.create()` for crop apply.
- `editor-sprites.js` — Uses `Editor.Commands.AddSprite.create()` for drag-from-toolbox.
- All test files updated to use command-pattern API.

**Also fixed in Phase 4:**
- Un-skipped effects globals round-trip test (was fixed in Phase 2, test was still skipped). Now 1 skip remaining (objectives known gap only).

**Exit criteria:** ✅ Ctrl+Z reverts exactly one logical operation. Redo works. No full-DOM rebuild on undo.

---

## Phase 5: Event Bus — Decouple Modules ✅

**Goal:** Modules communicate through events, not direct function calls.

**Status:** ✅ Complete. 210 tests passing (191 from Phase 4 + 19 new), 1 skipped.

### 5.1 — Simple Event Bus ✅
```js
Editor.Bus.on('sprite:moved', handler);
Editor.Bus.emit('sprite:moved', { id, x, y });
Editor.Bus.off('sprite:moved', handler);
Editor.Bus.once('state:loaded', handler);
Editor.Bus.clear();
```

### 5.2 — Event Catalog ✅
All events emitted automatically by `EditorState.dispatch()`:
- `sprite:added`, `sprite:removed`, `sprite:moved`, `sprite:resized`, `sprite:rotated`, `sprite:property-changed`
- `group:created`, `group:removed`, `group:sprite-added`
- `light:changed`
- `zorder:changed`
- `effect:changed`
- `state:loaded`, `state:undone`, `state:dispatched` (catch-all)

### 5.3 — Integration ✅
- [x] `dispatch()` emits semantic events mapped from action types
- [x] `zorder:changed` can trigger `Layers.rebuild()` via listener
- [x] `state:loaded` can trigger rebuilds via listener
- [x] `state:dispatched` fires for ALL dispatch calls (catch-all for debugging/logging)
- [x] Persistence auto-save already handled by Phase 2 dispatch (no duplicate)

### 5.4 — Tests ✅ (19 new tests in bus.test.js)
- [x] `on` + `emit` fires handler
- [x] Multiple handlers all fire
- [x] `off` removes handler
- [x] `once` fires only once
- [x] `clear` removes all listeners
- [x] `emit` with no listeners is a no-op
- [x] `on` returns Bus for chaining
- [x] Handler can remove itself during emit
- [x] Dispatch ADD_SPRITE/DELETE_SPRITE/MOVE_SPRITE emits corresponding events
- [x] Dispatch SET_PROPERTY emits sprite:property-changed
- [x] Dispatch REORDER emits zorder:changed
- [x] Dispatch GROUP emits group:created
- [x] Dispatch IMPORT emits state:loaded
- [x] Dispatch SET_EFFECT emits effect:changed
- [x] All dispatches emit state:dispatched
- [x] zorder:changed listener triggers Layers.rebuild
- [x] state:loaded listener triggers rebuild

**Files changed:**
- `editor-bus.js` — **NEW**: lightweight event emitter (on/off/once/emit/clear).
- `editor-state.js` — `dispatch()` now emits Bus events mapped from action types.
- Test harnesses updated to load `editor-bus.js`.

**Exit criteria:** ✅ Event bus wired into dispatch. Modules can subscribe to semantic events. All existing tests pass.

---

## Phase Summary

| Phase | Files Changed | New Files | Risk | Est. Effort |
|-------|:---:|:---:|:---:|:---:|
| 0 — Test infrastructure ✅ | 0 | 4 test files, 1 fixture | None (no prod changes) | ✅ Done |
| 1 — EditorState ✅ | 3 (persistence, core, layers) | 1 (editor-state.js) + 1 test | Medium | ✅ Done |
| 2 — Auto-save dispatch ✅ | 11 editor-*.js + 1 test | 1 (dispatch.test.js) | Medium | ✅ Done |
| 3 — rootEl getter ✅ | 6 (sprites, groups, layers, undo, persistence, selection, state) | 0 | Low | ✅ Done |
| 4 — Command undo ✅ | 6 (undo, commands, groups, selection, crop, sprites) + 4 test files | 1 (editor-commands.js) | High | ✅ Done |
| 5 — Event bus ✅ | 1 (editor-state.js) + 2 test harnesses | 1 (editor-bus.js) + 1 test | Medium | ✅ Done |

**Final test counts:** 210 passing, 1 skipped (objectives restorePositions known gap).

Each phase is independently deployable and leaves the editor in a working state. Tests from earlier phases catch regressions in later phases.

---

## Visual Test Strategy (Browser Tool)

Each phase adds visual regression checks using the OpenClaw browser tool — no Playwright/Puppeteer dependency:

```
__tests__/
  fixtures/
    test-scene.json          ← the attached JSON
  snapshots/
    baseline.png             ← Phase 0 golden screenshot
  editor.test.js             ← unit tests (Vitest + jsdom)
  vitest.config.js
```

Flow: `browser navigate` to GitHub Pages → inject fixture via `evaluate` → `browser screenshot` → diff.

Visual tests verify:
1. **Load fixture → screenshot** matches baseline
2. **Save → reload → screenshot** matches baseline  
3. **Mutate → undo → screenshot** matches baseline
4. **Layer reorder → screenshot** shows correct z-order

Pixel diff tolerance: 0.1% (accounts for font rendering differences across environments).

---

## Test Data: `test-scene.json`

The canonical fixture lives at `__tests__/fixtures/test-scene.json` and contains the JSON provided by James. It covers:

- **20 sprites** across floor/top layers with varied transforms
- **29 models** in two factions with all icon types
- **5 objectives** in standard tournament layout  
- **1 custom group** (`group-g1`) containing 6 sprites (including cropped + zero-shadow)
- **Settings** (background, opacity sliders)
- **Edge cases**: near-zero floats, `shadowMul: 0`, partial crops (`crop.b: 0.156`)

Every test phase uses this fixture as the canonical "known-good scene" for round-trip verification.
