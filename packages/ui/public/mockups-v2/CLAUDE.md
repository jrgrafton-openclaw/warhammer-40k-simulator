# mockups-v2 — Agent Guide

## Architecture

ES modules. No globals. Every dependency is an explicit `import`.

**World space** (SVG) → `shared/world/`
**Screen space** (HTML/CSS) → `shared/components/`
**State** → `shared/state/`
**Coordinate helpers** → `shared/lib/`
**Phase-specific** → `phases/<phase>/<version>/`

## What to edit for what

| I want to... | Edit this file |
|---|---|
| Change colors | `shared/tokens/colors.css` |
| Change fonts | `shared/tokens/typography.css` |
| Change the roster sidebar | `shared/components/roster.css` |
| Change the unit card | `shared/components/unit-card.css` |
| Change the action bar | `shared/components/action-bar.css` |
| Change the top VP bar | `shared/components/vp-bar.css` |
| Change dice/weapon/result overlays | `shared/components/overlays.css` |
| Change projectile/hit animations | `shared/components/fx.css` |
| Change the battlefield/terrain look | `shared/components/battlefield.css` |
| Change the stratagem modal | `shared/components/stratagem-modal.css` |
| Change spent/attacked state visuals | `shared/components/phase-states.css` |
| Change model token rendering | `shared/world/svg-renderer.js` |
| Change terrain rendering | `shared/world/terrain.js` |
| Change pan/zoom behavior | `shared/world/svg-renderer.js` → `initBoard()` |
| Change coordinate transforms | `shared/world/world-api.js` |
| Change collision/LoS | `shared/world/collision.js` |
| Change unit data (stats/weapons) | `shared/state/units.js` |
| Change terrain layout | `shared/state/terrain-data.js` |
| Change army positions | `phases/<phase>/<version>/scene.js` |
| Change shooting interaction | `phases/shoot/<version>/shooting.js` |
| Change movement interaction | `phases/move/<version>/movement.js` |

## Key contracts

### WorldAPI (`shared/world/world-api.js`)
```js
WorldAPI.worldToScreen(svgX, svgY)  // → { x, y, valid }
WorldAPI.screenToWorld(screenX, screenY)  // → { x, y }
WorldAPI.getUnitAnchor(unitId, mode)  // → { x, y, valid }
WorldAPI.getModelAnchor(modelId)  // → { x, y, valid }
WorldAPI.getCamera()  // → { scale, tx, ty }
WorldAPI.resetCamera()
WorldAPI.selectUnit(uid)
WorldAPI.getMousePos(evt)  // → { x, y } in SVG coords
```

### Store (`shared/state/store.js`)
```js
simState.units  // Array of unit objects with models
activeRangeTypes  // Set of active range circle types
currentUnit  // Currently selected unit ID
callbacks.selectUnit  // Override hook for phase-specific selection behavior
```

## Adding a new phase version

1. Create `phases/<phase>/<version>/`
2. Create `index.html` — load shared CSS + `<script type="module" src="scene.js">`
3. Create `scene.js` — import shared modules, set up army positions, call init functions
4. Create phase interaction JS (e.g., `shooting.js`, `movement.js`)
5. Create `style.css` for phase-specific overrides only
6. Set `window.selectUnit`, `window.toggleFaction`, `window.toggleAA` for inline HTML handlers

## Rules

- **DOM structure in index.html is the single source of truth** for layout
- **One concern per CSS file** — never put roster styles in overlays.css
- **No `window.BattleUI`** — use imports
- **d3 loaded via CDN `<script>` before modules** — reference as `window.d3`
- The inline `onclick="toggleFaction(this)"` handlers in HTML require window globals — set them in scene.js
