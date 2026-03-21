# Terrain Editor v0.16 — Architecture Guide

## Directory Structure

```
v0.16/
├── index.html          HTML shell + SVG battlefield + sidebar controls
├── css/                Styles — one file per concern
│   ├── base.css        Reset, body, layout
│   ├── sidebar.css     Left sidebar, thumbnails, toggles, controls
│   ├── effects.css     Shadow/feather/grade slider controls
│   ├── canvas.css      Battlefield SVG area, selection rect, drag ghost
│   ├── layers.css      Right sidebar layers panel, group rows, drag indicators
│   ├── config.css      JSON debug panel, light controls
│   └── shortcuts.css   Keyboard shortcuts overlay
├── img/                Sprite images (referenced via Editor.Core.spriteBasePath)
├── js/
│   ├── core/           Infrastructure — loaded first, no cross-deps between them
│   │   ├── bus.js      Event bus (pub/sub). Zero dependencies.
│   │   ├── state.js    Centralized dispatch → save pipeline. Depends on Bus.
│   │   ├── commands.js Command pattern (execute + undo record). Depends on State, Undo.
│   │   └── undo.js     Undo/redo stack. Replays via Crop, Effects, Layers.
│   ├── entities/       Data objects — sprites, models, lights, objectives
│   │   ├── core.js     Init, allSprites/allModels/allLights arrays, setBg, toggles.
│   │   ├── sprites.js  Add/remove/transform sprites. Heavy: depends on most modules.
│   │   ├── models.js   Unit model tokens (circles/rects in SVG).
│   │   ├── lights.js   Light source entities.
│   │   └── objectives.js  Objective markers. Minimal deps (only Core).
│   ├── tools/          Operations on entities
│   │   ├── crop.js     Clip-path cropping per sprite.
│   │   ├── groups.js   Sprite grouping (SVG <g> wrappers).
│   │   ├── effects.js  Drop shadow, feather, color grade. Depends on Core, State.
│   │   └── selection.js  Multi-select, drag, resize, rotate. Heaviest module.
│   ├── ui/             Visual panels and viewport
│   │   ├── layers.js   Layer panel (right sidebar) — drag reorder, visibility.
│   │   ├── zoom.js     Pan/zoom via wheel + pinch.
│   │   └── shortcuts.js  Keyboard shortcut overlay. Zero dependencies.
│   └── persistence.js  Save/load/import JSON. Depends on all entity modules.
├── data/               Layout fixture files
│   ├── james-layout.json
│   └── test-layout.json
├── docs/
│   └── refactor-plan.md
└── __tests__/           Vitest test suite (jsdom)
    ├── fixtures/
    ├── test-helpers.js  Shared loadEditor() — loads all modules in order
    ├── vitest.config.js
    └── *.test.js
```

## Key Patterns

### Window.Editor namespace (NOT ES modules)
All files register on `window.Editor.*` (e.g. `Editor.Bus = { ... }`).
Scripts are loaded via `<script>` tags in index.html — order matters.

### Dispatch pattern
State mutations go through `Editor.State.dispatch(actionName)`.
Dispatch debounces auto-save and notifies the Bus.

### Command pattern (undo/redo)
Mutating operations call `Editor.Commands.exec(description, doFn, undoFn)`.
The command is executed immediately and pushed onto the undo stack.

### rootEl getter
Sprites may be wrapped in clip groups (`_clipWrap`) or custom groups.
Always use the sprite's effective root element for DOM operations.

### spriteBasePath
`Editor.Core.spriteBasePath` = `'img/'` — relative to index.html.
All sprite `<image>` hrefs use this prefix.

## Load Order (and why)

1. **bus.js** — zero deps, everything else may publish/subscribe
2. **state.js** — needs Bus for dispatch notifications
3. **commands.js** — needs State for dispatch, Undo for recording
4. **core.js** (entities) — defines allSprites/allModels arrays used everywhere
5. **undo.js** — needs Core arrays to replay; registered after commands
6. **models.js** — needs Core
7. **sprites.js** — needs Core, Effects, Layers, Commands
8. **objectives.js** — needs Core
9. **lights.js** — needs Core, Commands
10. **groups.js** — needs Core, Commands, Selection
11. **crop.js** — needs Core, Sprites, Selection
12. **zoom.js** — needs Core (for SVG element)
13. **shortcuts.js** — self-contained overlay
14. **selection.js** — needs almost everything (heaviest consumer)
15. **layers.js** — needs Core, State, Commands
16. **effects.js** — needs Core, State
17. **persistence.js** — last: serializes/deserializes all entity types

## How to Add a New Entity Type

1. Create `js/entities/<name>.js`
2. Register as `Editor.<Name> = { ... }` with add/remove/restore methods
3. Add array `Editor.Core.all<Name>s = []` in core.js init
4. Add serialization in `persistence.js` (save + restore)
5. Add `<script>` tag in index.html (after core.js, before persistence.js)
6. Update `__tests__/test-helpers.js` and `__tests__/editor.test.js` module lists

## How to Add a New Tool

1. Create `js/tools/<name>.js`
2. Register as `Editor.<Name> = { ... }`
3. Wire UI controls in index.html with `onclick="Editor.<Name>.method()"`
4. If it mutates state, use `Editor.Commands.exec()` for undo support
5. Call `Editor.State.dispatch('<action>')` after mutations
6. Add `<script>` tag in index.html (after entities, before persistence.js)

## Test Infrastructure

Tests run in jsdom via Vitest. `loadEditor()` in test-helpers.js:
1. Creates a minimal SVG DOM
2. Reads each JS file from disk via `fs.readFileSync`
3. Executes in jsdom's `window.Function` scope with `Editor` aliased
4. Calls `init()` on Core, Effects, Zoom, Shortcuts

Run: `npx vitest run` from v0.16/ (uses `__tests__/vitest.config.js`)
