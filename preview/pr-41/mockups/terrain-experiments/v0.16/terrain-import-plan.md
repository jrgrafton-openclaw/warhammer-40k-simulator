# Terrain Import Plan — Level Editor → Deploy Mockup → Integrated Flow

**Goal:** Export terrain layouts from the level editor (v0.16) and import them into the deploy phase mockup (v0.2a), replacing the current SVG polygon terrain with sprite-based visuals while preserving SVG polygon data for collision and line-of-sight mechanics.

**Impact summary:**
- **Editor (v0.16):** New export function added to `editor-persistence.js`; button added to `index.html`
- **Shared modules:** New `shared/world/terrain-layout.js` module; new `shared/assets/terrain-sprites/` directory; `terrain-data.js` and `terrain.js` become legacy fallbacks
- **Deploy mockup (v0.2a):** `scene.js` conditionally loads terrain from map layout; `index.html` gets a new SVG layer; `debug-menu.js` gets import/clear UI
- **Integrated (v0.4):** `app.js`, `scene-shoot.js`, `screen-forge.js` swap to new terrain source; zero changes to `collision.js`

---

## Phase 0 — Map Format Specification

### The `MapLayout` schema (version 1)

```jsonc
{
  "version": 1,

  // Visual terrain — sprite images positioned on the board
  "sprites": [{
    "id": "s0",                    // stable ID from editor
    "file": "layer-top-v3.png",    // filename only — resolved against sprite base path
    "x": 214, "y": 402,           // center position in SVG coordinates (0-720, 0-528)
    "w": 53, "h": 57,             // display dimensions
    "rot": 0,                      // rotation in degrees
    "layerType": "floor"|"top",    // floor = below models/objectives; top = above models
    "hidden": false,               // editor visibility toggle (skip in renderer)
    "flipX": false, "flipY": false,
    "groupId": "group-g0"|null,    // semantic group reference
    "shadowMul": 1.0,             // shadow intensity multiplier (0 = no shadow)
    "crop": null | { "l": 0, "t": 0, "r": 0, "b": 0 }  // fractional crop (0-1 per side)
  }],

  // Collision & LoS — SVG polygon data (same schema as current mapData.terrain)
  "terrain": [{
    "id": "t1",
    "type": "ruins"|"scatter",     // ruins = tall (blocks LoS), scatter = low
    "origin": [144, 60],           // transform origin point
    "transform": "rotate(90)",     // SVG transform string
    "paths": [{
      "d": "M 144 60 L 288 60 ...",  // SVG path d-attribute
      "fill": "rgba(58,64,64,0.75)"  // original fill (used for debug overlay only)
    }]
  }],

  // Semantic sprite groups
  "groups": [{
    "id": "group-g1",
    "name": "Corner-Building",
    "opacity": 1,
    "spriteIds": ["s9", "s7", "s1", "s13", "s14"]
  }],

  // Objective marker positions (percentage-based)
  "objectives": [{
    "idx": 0,
    "leftPct": 50,
    "topPct": 13.64
  }],

  // Display settings
  "settings": {
    "bg": "svg-dual",              // background style name
    "ruinsOpacity": 0              // SVG ruin overlay opacity (0 = hidden when sprites present)
  }
}
```

### What's new vs the current editor export

The current editor export (the attached `test.json`) already contains `sprites`, `models`, `groups`, `objectives`, `settings`. What's **new** is:

1. **`version: 1`** — format version for forward compatibility
2. **`terrain[]`** — SVG polygon data extracted from the editor's hardcoded `<g id="svgRuins">` and `<g id="svgScatter">` DOM elements. This is the same data that lives in `shared/state/terrain-data.js` today.

The `models[]` array from the editor export is **NOT** included in the map layout — models are defined by `scene.js` (army composition), not by the map. The map layout is purely terrain + objectives.

### Why two representations (sprites + terrain polygons)?

- **Sprites** → visual rendering (what the player sees)
- **Terrain polygons** → game mechanics (collision resolution in `collision.js`, line-of-sight blocking in `scene-shoot.js`, terrain tooltips via `TERRAIN_RULES`)

James manually positions sprites to visually match the SVG collision polygons in the editor. The pairing is implicit — no auto-derivation needed.

---

## Phase 1 — Editor Export (`editor-persistence.js` + `index.html`)

### File: `editor-persistence.js`

**Add new method: `exportMapJSON()`**

This method:

1. Calls the existing `save()` logic to get current sprite state
2. Converts from internal format (`cropL/T/R/B`) to output format (`crop: { l, t, r, b }`)
3. Parses the SVG DOM to extract `terrain[]` data
4. Assembles the full `MapLayout` object
5. Triggers a file download

```js
// Add to Editor.Persistence object:

exportMapJSON() {
  // 1. Get current state (reuse save() serialization for sprites)
  this.save(); // ensure localStorage is fresh
  const raw = localStorage.getItem(this.STORAGE_KEY);
  if (!raw) { alert('No layout data to export'); return; }
  const data = JSON.parse(raw);

  // 2. Convert sprites to output format
  const sprites = (data.sprites || []).map((s, i) => ({
    id: s.id || ('s' + i),  // Use existing ID or generate
    file: s.file,
    x: s.x, y: s.y, w: s.w, h: s.h,
    rot: s.rot || 0,
    layerType: s.layerType || 'floor',
    hidden: !!s.hidden,
    flipX: !!s.flipX, flipY: !!s.flipY,
    groupId: s.groupId || null,
    shadowMul: s.shadowMul != null ? s.shadowMul : 1.0,
    crop: (s.cropL || s.cropT || s.cropR || s.cropB)
      ? { l: s.cropL || 0, t: s.cropT || 0, r: s.cropR || 0, b: s.cropB || 0 }
      : null
  }));

  // 3. Extract terrain[] from SVG DOM
  const terrain = this._extractTerrainFromSVG();

  // 4. Build groups with spriteIds
  const groups = (data.groups || []).map(g => {
    const spriteIds = sprites
      .filter(s => s.groupId === g.id)
      .map(s => s.id);
    return { id: g.id, name: g.name, opacity: g.opacity, spriteIds };
  });

  // 5. Objectives
  const objectives = Editor.Objectives.serialize();

  // 6. Settings
  const bgSel = document.getElementById('bgSel');
  const ranges = document.querySelectorAll('input[type=range]');
  const settings = {
    bg: bgSel ? bgSel.value : 'svg-dual',
    ruinsOpacity: ranges[0] ? parseInt(ranges[0].value) : 92
  };

  // 7. Assemble MapLayout
  const mapLayout = {
    version: 1,
    sprites,
    terrain,
    groups,
    objectives,
    settings
  };

  // 8. Download
  const blob = new Blob([JSON.stringify(mapLayout, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'map-layout.json';
  a.click();
  URL.revokeObjectURL(url);
},
```

**Add helper method: `_extractTerrainFromSVG()`**

Parses the `<g id="svgRuins">` and `<g id="svgScatter">` groups in the editor's SVG:

```js
_extractTerrainFromSVG() {
  const terrain = [];
  let idCounter = 1;

  // Process both ruin and scatter groups
  const groups = [
    { el: document.getElementById('svgRuins'), type: 'ruins' },
    { el: document.getElementById('svgScatter'), type: 'scatter' }
  ];

  groups.forEach(({ el, type }) => {
    if (!el) return;
    // Each direct child <g> is one terrain piece
    Array.from(el.children).forEach(g => {
      if (g.tagName !== 'g') return;

      // Parse transform attribute
      // Format: "translate(ox,oy) [scale(...)] rotate(deg) translate(-ox,-oy)"
      const tf = g.getAttribute('transform') || '';

      // Extract origin from the first translate()
      const originMatch = tf.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
      if (!originMatch) return;
      const ox = parseFloat(originMatch[1]);
      const oy = parseFloat(originMatch[2]);

      // Extract the middle transform (between the two translate() calls)
      // e.g. "translate(144,60) rotate(90) translate(-144,-60)" → "rotate(90)"
      // e.g. "translate(192,264) scale(-1,1) rotate(0) translate(-192,-264)" → "scale(-1,1) rotate(0)"
      const parts = tf.split(/translate\([^)]+\)/g).filter(s => s.trim());
      const middleTransform = parts.length > 0 ? parts[0].trim() : '';

      // Extract paths
      const paths = Array.from(g.querySelectorAll('path')).map(p => ({
        d: p.getAttribute('d'),
        fill: p.getAttribute('fill')
      }));

      if (paths.length === 0) return;

      terrain.push({
        id: 't' + idCounter++,
        type: type,
        origin: [ox, oy],
        transform: middleTransform,
        paths: paths
      });
    });
  });

  return terrain;
}
```

### File: `index.html`

**Modify:** The config-actions div (around line ~165 in the right sidebar):

```html
<!-- BEFORE -->
<div class="config-actions">
  <button class="tbtn" onclick="navigator.clipboard.writeText(debug.value)">Copy JSON</button>
  <button class="tbtn" onclick="Editor.Persistence.importJSON()">Import JSON</button>
  <button class="tbtn" onclick="..." style="color:#cc4444;...">Clear All</button>
</div>

<!-- AFTER -->
<div class="config-actions">
  <button class="tbtn" onclick="navigator.clipboard.writeText(debug.value)">Copy JSON</button>
  <button class="tbtn" onclick="Editor.Persistence.importJSON()">Import JSON</button>
  <button class="tbtn" style="color:#00d4ff;border-color:#00d4ff33" onclick="Editor.Persistence.exportMapJSON()">Export Map JSON</button>
  <button class="tbtn" onclick="..." style="color:#cc4444;...">Clear All</button>
</div>
```

### Verification

- [ ] Click "Export Map JSON" → downloads `map-layout.json`
- [ ] File contains `version: 1`
- [ ] `sprites[]` matches current layout (same positions, rotations, crops in `{l,t,r,b}` format)
- [ ] `terrain[]` contains 16 entries (8 ruins + 8 scatter — matching `terrain-data.js`)
- [ ] Each terrain entry has valid `origin`, `transform`, and `paths[]`
- [ ] `groups[]` each have `spriteIds` array
- [ ] `objectives[]` has 5 entries with `leftPct`/`topPct`
- [ ] Round-trip: Export → Import JSON → Export → compare files (should be identical)
- [ ] `terrain[].paths[].d` values match the hardcoded SVG paths in the HTML exactly

---

## Phase 2 — Shared Terrain Sprite Assets

### New directory: `shared/assets/terrain-sprites/`

Copy these 24 PNG files from `terrain-experiments/v0.16/img/`:

```
layer-bottom-aligned.png    layer-top-aligned.png
layer-bottom-v2.png         layer-top-v2.png
layer-bottom-v3.png         layer-top-v3.png
layer-bottom-v4.png         layer-top-v4.png
layer-bottom-v5.png         layer-top-v5.png
layer-bottom-v6.png         layer-top-v6.png
layer-bottom-v7.png         layer-top-v7.png
scatter-layer.png           scatter-v2.png
scatter-v3.png              scatter-v4.png
scatter-v5.png              scatter-v6.png
openai-ruin-1.png           openai-ruin-2.png
openai-ruin-ushape.png      openai-scatter.png
t10-layer-bottom.png        t10-layer-top.png
```

**NOT copied** (backgrounds, not terrain sprites):
```
bg-variation-1.png through bg-variation-5.png
v16-ground-better.png
```

### Path resolution

The new renderer (`terrain-layout.js`) will accept a `basePath` parameter:
- Deploy mockup (v0.2a): `../../../shared/assets/terrain-sprites/`
- Integrated (v0.4): `../../shared/assets/terrain-sprites/`
- Editor (v0.16): `img/` (existing path, unchanged)

### Verification

- [ ] All 24 PNGs present in `shared/assets/terrain-sprites/`
- [ ] File sizes match originals (no corruption)
- [ ] Test: open deploy mockup, manually create an `<image>` in devtools pointing to `../../../shared/assets/terrain-sprites/layer-bottom-v5.png` — confirm it loads

---

## Phase 3 — Shared Terrain Layout Renderer (`shared/world/terrain-layout.js`)

### New file: `shared/world/terrain-layout.js`

This is the core new module. It replaces `terrain-data.js` + `terrain.js` as the terrain rendering path.

#### Exports

```js
// ── State ──
let _layout = null;   // current MapLayout or null
let _basePath = '';    // sprite image base path

// ── Public API ──

/** Store a MapLayout and configure sprite path */
export function loadMapLayout(json, basePath) { ... }

/** Returns the current MapLayout or null */
export function getMapLayout() { ... }

/** Clear loaded layout */
export function clearMapLayout() { ... }

/** Returns terrain[] in mapData-compatible format for collision/LoS */
export function getTerrainData() { ... }

/** Returns objectives[] from the layout */
export function getObjectives() { ... }

/** Render floor-layer sprites into the given SVG <g> element */
export function renderFloorSprites(targetG) { ... }

/** Render top-layer sprites into the given SVG <g> element */
export function renderTopSprites(targetG) { ... }

/** Re-export terrain rules for tooltips */
export { TERRAIN_RULES } from '../state/terrain-data.js';
```

#### `loadMapLayout(json, basePath)`

```js
export function loadMapLayout(json, basePath) {
  if (!json || json.version !== 1) {
    console.warn('terrain-layout: invalid or missing version');
    return false;
  }
  _layout = json;
  _basePath = basePath || '';
  return true;
}
```

#### `getTerrainData()`

Returns a `{ terrain: [...] }` object with the same structure as `mapData` from `terrain-data.js`, so existing consumers (`buildTerrainAABBs`, `buildLosBlockers`) work without changes.

```js
export function getTerrainData() {
  if (!_layout || !_layout.terrain) return null;
  return { terrain: _layout.terrain };
}
```

#### `renderFloorSprites(targetG)` and `renderTopSprites(targetG)`

Both call a shared `_renderSprites(targetG, layerType)` internal function.

**Rendering logic for each sprite:**

```js
function _renderSprites(targetG, layerType) {
  if (!_layout) return;
  var NS = 'http://www.w3.org/2000/svg';
  var sprites = _layout.sprites.filter(function(s) {
    return s.layerType === layerType && !s.hidden;
  });

  // Group sprites by groupId for opacity wrapping
  var ungrouped = sprites.filter(function(s) { return !s.groupId; });
  var grouped = {};
  sprites.forEach(function(s) {
    if (!s.groupId) return;
    if (!grouped[s.groupId]) grouped[s.groupId] = [];
    grouped[s.groupId].push(s);
  });

  // Render ungrouped sprites directly
  ungrouped.forEach(function(s) {
    targetG.appendChild(_createSpriteElement(s));
  });

  // Render grouped sprites inside <g opacity="...">
  var groups = _layout.groups || [];
  groups.forEach(function(grp) {
    var grpSprites = grouped[grp.id];
    if (!grpSprites || grpSprites.length === 0) return;
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('id', 'terrain-group-' + grp.id);
    if (grp.opacity != null && grp.opacity !== 1) {
      g.setAttribute('opacity', String(grp.opacity));
    }
    grpSprites.forEach(function(s) {
      g.appendChild(_createSpriteElement(s));
    });
    targetG.appendChild(g);
  });
}
```

**`_createSpriteElement(sprite)` — the per-sprite SVG builder:**

```js
function _createSpriteElement(s) {
  var NS = 'http://www.w3.org/2000/svg';
  var g = document.createElementNS(NS, 'g');
  g.setAttribute('data-sprite-id', s.id);
  g.style.pointerEvents = 'none';

  // Position: x,y is center of sprite in SVG coords
  // Build transform: translate to position, then rotate
  var tf = 'translate(' + s.x + ',' + s.y + ')';
  if (s.rot) tf += ' rotate(' + s.rot + ')';
  g.setAttribute('transform', tf);

  // Shadow filter (if shadowMul > 0)
  if (s.shadowMul > 0) {
    var filterId = 'sprite-shadow-' + s.id;
    var svgEl = g.ownerDocument.querySelector('svg');
    // Create filter in nearest <defs> (lazily)
    _ensureShadowFilter(svgEl, filterId, s.shadowMul);
    g.setAttribute('filter', 'url(#' + filterId + ')');
  }

  // Crop: if crop is set, add a clipPath
  var hasCrop = s.crop && (s.crop.l || s.crop.t || s.crop.r || s.crop.b);
  var imgX = -s.w / 2;
  var imgY = -s.h / 2;

  if (hasCrop) {
    var clipId = 'sprite-clip-' + s.id;
    var clipPath = document.createElementNS(NS, 'clipPath');
    clipPath.setAttribute('id', clipId);
    var clipRect = document.createElementNS(NS, 'rect');
    var cl = (s.crop.l || 0) * s.w;
    var ct = (s.crop.t || 0) * s.h;
    var cr = (s.crop.r || 0) * s.w;
    var cb = (s.crop.b || 0) * s.h;
    clipRect.setAttribute('x', String(imgX + cl));
    clipRect.setAttribute('y', String(imgY + ct));
    clipRect.setAttribute('width', String(s.w - cl - cr));
    clipRect.setAttribute('height', String(s.h - ct - cb));
    clipPath.appendChild(clipRect);

    // Append clipPath to the sprite <g> itself (valid SVG)
    g.appendChild(clipPath);
  }

  // Image element
  var img = document.createElementNS(NS, 'image');
  img.setAttribute('href', _basePath + s.file);
  img.setAttribute('x', String(imgX));
  img.setAttribute('y', String(imgY));
  img.setAttribute('width', String(s.w));
  img.setAttribute('height', String(s.h));
  img.setAttribute('preserveAspectRatio', 'none');

  if (hasCrop) {
    img.setAttribute('clip-path', 'url(#sprite-clip-' + s.id + ')');
  }

  // Flip: apply scale transform to the image
  if (s.flipX || s.flipY) {
    var sx = s.flipX ? -1 : 1;
    var sy = s.flipY ? -1 : 1;
    img.setAttribute('transform', 'scale(' + sx + ',' + sy + ')');
  }

  g.appendChild(img);
  return g;
}
```

**`_ensureShadowFilter(svgEl, filterId, mul)` — lazy shadow filter creation:**

```js
function _ensureShadowFilter(svgEl, filterId, mul) {
  if (!svgEl || document.getElementById(filterId)) return;
  var NS = 'http://www.w3.org/2000/svg';
  var defs = svgEl.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svgEl.insertBefore(defs, svgEl.firstChild);
  }
  var filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('x', '-20%');
  filter.setAttribute('y', '-20%');
  filter.setAttribute('width', '140%');
  filter.setAttribute('height', '140%');
  filter.innerHTML =
    '<feDropShadow dx="2" dy="2" stdDeviation="' + (3 * mul) + '" ' +
    'flood-color="#000" flood-opacity="' + (0.5 * mul) + '"/>';
  defs.appendChild(filter);
}
```

#### Terrain tooltips on sprites

The renderer does NOT add tooltips to sprites directly. Tooltips remain driven by the `terrain[]` collision polygons (which are rendered as invisible overlay paths in debug mode, or via existing `renderTerrain()` tooltip logic). This keeps the concerns separated.

### Verification

- [ ] `loadMapLayout(json, basePath)` returns `true` for valid v1 JSON, `false` for invalid
- [ ] `getTerrainData()` returns `{ terrain: [...] }` with same structure as `mapData`
- [ ] `renderFloorSprites(g)` creates `<image>` elements for all `layerType: "floor"` sprites
- [ ] `renderTopSprites(g)` creates `<image>` elements for all `layerType: "top"` sprites
- [ ] Hidden sprites (`hidden: true`) are not rendered
- [ ] Crop clips work correctly (visible area matches editor preview)
- [ ] Flip transforms produce correct mirror effect
- [ ] Group opacity wraps sprites in a shared `<g>` with correct opacity
- [ ] Shadow filters are created lazily and not duplicated
- [ ] `clearMapLayout()` resets state to null

---

## Phase 4 — Deploy Mockup Integration (v0.2a)

### File: `index.html`

**Add a new SVG layer** for top-layer terrain sprites. Insert between `bf-svg` (models) and `bf-svg-vignette`:

```html
<!-- EXISTING: SVG 2: model overlays -->
<svg id="bf-svg" viewBox="0 0 720 528" preserveAspectRatio="xMidYMid slice">
  ...
</svg>

<!-- NEW: SVG 3: terrain top layer (roofs, above models) -->
<svg id="bf-svg-terrain-top" viewBox="0 0 720 528" preserveAspectRatio="xMidYMid slice"
     style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible;">
  <g id="terrain-top"></g>
</svg>

<!-- EXISTING: Lightning board tint -->
<div id="lightning-board-tint" aria-hidden="true"></div>
```

The `z-index: 3` places it above `bf-svg` (z:2) but below `bf-svg-vignette` (z:8).

Also add a `<g id="terrain-floor"></g>` inside `bf-svg-terrain`, right after the existing `<g id="terrain-layer"></g>`:

```html
<g id="terrain-layer"></g>
<g id="terrain-floor"></g>
```

### File: `scene.js`

**Modify imports** (top of file):

```js
// EXISTING
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';

// ADD
import { loadMapLayout, getMapLayout, getTerrainData, getObjectives,
         renderFloorSprites, renderTopSprites } from '../../../shared/world/terrain-layout.js';
```

**Modify terrain initialization** (replace `renderTerrain()` call around line 80):

```js
// ── Load terrain ─────────────────────────────────────
var MAP_LAYOUT_KEY = 'wh40k-map-layout';
var _usingMapLayout = false;

(function initTerrain() {
  var raw = localStorage.getItem(MAP_LAYOUT_KEY);
  if (raw) {
    try {
      var layout = JSON.parse(raw);
      if (loadMapLayout(layout, '../../../shared/assets/terrain-sprites/')) {
        _usingMapLayout = true;

        // Render floor sprites (below objectives/models)
        var floorG = document.getElementById('terrain-floor');
        if (floorG) renderFloorSprites(floorG);

        // Render top sprites (above models)
        var topG = document.getElementById('terrain-top');
        if (topG) renderTopSprites(topG);

        // Hide the old SVG terrain layer
        var oldLayer = document.getElementById('terrain-layer');
        if (oldLayer) oldLayer.style.display = 'none';

        // Update objectives from map layout
        var layoutObjectives = getObjectives();
        if (layoutObjectives && layoutObjectives.length) {
          var objWraps = document.querySelectorAll('.obj-hex-wrap');
          var objRings = document.querySelectorAll('.obj-area-ring');
          layoutObjectives.forEach(function(obj) {
            if (objWraps[obj.idx]) {
              objWraps[obj.idx].style.left = obj.leftPct + '%';
              objWraps[obj.idx].style.top = obj.topPct + '%';
            }
            if (objRings[obj.idx]) {
              objRings[obj.idx].style.left = obj.leftPct + '%';
              objRings[obj.idx].style.top = obj.topPct + '%';
            }
          });
        }

        console.log('[terrain] Loaded map layout (' + layout.sprites.length + ' sprites, ' +
                    (layout.terrain ? layout.terrain.length : 0) + ' collision polys)');
      }
    } catch (e) {
      console.warn('[terrain] Failed to load map layout:', e);
    }
  }

  if (!_usingMapLayout) {
    // Fallback: render old SVG terrain
    renderTerrain();
  }
})();
```

**Modify collision AABB build** (around line 95):

```js
// ── Build terrain collision AABBs ────────────────────────
var svgEl = document.getElementById('bf-svg');
if (_usingMapLayout) {
  var layoutData = getTerrainData();
  window._terrainAABBs = layoutData ? buildTerrainAABBs(layoutData, svgEl) : [];
} else {
  window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);
}
```

### File: `debug-menu.js`

**Add a new TERRAIN section** after the CAMERA section (or at the end):

```js
// ══════════════════════════════════════════════════════
// TERRAIN LAYOUT SECTION
// ══════════════════════════════════════════════════════
var terrainBody = section('TERRAIN LAYOUT');

// Status label
var terrainStatus = document.createElement('div');
terrainStatus.className = 'dbg-row';
terrainStatus.style.cssText = 'font:11px/1.6 monospace;color:#8af;padding:4px 8px;';
var MAP_LAYOUT_KEY = 'wh40k-map-layout';
var hasLayout = !!localStorage.getItem(MAP_LAYOUT_KEY);
terrainStatus.textContent = hasLayout
  ? '✓ Map layout loaded from localStorage'
  : '— No map layout (using SVG fallback)';
terrainBody.appendChild(terrainStatus);

// Import button
var importRow = document.createElement('div');
importRow.className = 'dbg-row';
var importBtn = document.createElement('button');
importBtn.className = 'dbg-toggle on';
importBtn.style.cssText = 'width:100%;text-align:center;cursor:pointer;padding:4px 8px;font-size:11px;';
importBtn.textContent = 'Import Map Layout (.json)';
importBtn.addEventListener('click', function() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (data.version !== 1) {
          alert('Invalid map layout: expected version 1, got ' + data.version);
          return;
        }
        localStorage.setItem(MAP_LAYOUT_KEY, JSON.stringify(data));
        terrainStatus.textContent = '✓ Imported! Reloading...';
        location.reload();
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});
importRow.appendChild(importBtn);
terrainBody.appendChild(importRow);

// Clear button
var clearRow = document.createElement('div');
clearRow.className = 'dbg-row';
var clearBtn = document.createElement('button');
clearBtn.className = 'dbg-toggle';
clearBtn.style.cssText = 'width:100%;text-align:center;cursor:pointer;padding:4px 8px;font-size:11px;color:#cc4444;';
clearBtn.textContent = 'Clear Map Layout (revert to SVG)';
clearBtn.addEventListener('click', function() {
  localStorage.removeItem(MAP_LAYOUT_KEY);
  terrainStatus.textContent = '— Cleared. Reloading...';
  location.reload();
});
clearRow.appendChild(clearBtn);
terrainBody.appendChild(clearRow);
```

### Verification

- [ ] No map layout in localStorage → page renders exactly as before (SVG terrain polygons visible)
- [ ] Import a map layout JSON via debug menu → page reloads, sprites visible instead of SVG polygons
- [ ] Floor sprites appear below objectives and models
- [ ] Top sprites (roofs) appear above models but below vignette
- [ ] Objective positions update to match the imported layout
- [ ] Collision still works: drag a model into a ruin wall → it's pushed out
- [ ] Terrain tooltips still work on hover (via the old SVG paths, hidden but pointer-events active — OR verify tooltips are lost and decide if that's acceptable for now)
- [ ] Clear map layout → page reverts to SVG terrain
- [ ] Camera pan/zoom works correctly with sprite terrain (no misalignment)
- [ ] Sprite crops render correctly (compare to editor preview)
- [ ] Sprite flips render correctly
- [ ] Group opacity applies (Roofs group at 0.9 opacity)
- [ ] Debug menu persists collapsed/expanded state for new section

---

## Phase 5 — Integrated v0.4 Compatibility

### File: `integrated/v0.4/app.js`

**Current code (lines ~11-13, ~127):**

```js
import { mapData } from '../../shared/state/terrain-data.js';
import { renderTerrain } from '../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../shared/world/collision.js';
// ...
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);
```

**Modified:**

```js
import { mapData } from '../../shared/state/terrain-data.js';
import { renderTerrain } from '../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../shared/world/collision.js';
import { loadMapLayout, getMapLayout, getTerrainData,
         renderFloorSprites, renderTopSprites } from '../../shared/world/terrain-layout.js';

// ... in init:
var MAP_LAYOUT_KEY = 'wh40k-map-layout';
var _usingMapLayout = false;
var rawLayout = localStorage.getItem(MAP_LAYOUT_KEY);
if (rawLayout) {
  try {
    var layout = JSON.parse(rawLayout);
    if (loadMapLayout(layout, '../../shared/assets/terrain-sprites/')) {
      _usingMapLayout = true;
      var floorG = document.getElementById('terrain-floor'); // needs adding to HTML
      if (floorG) renderFloorSprites(floorG);
      var topG = document.getElementById('terrain-top');     // needs adding to HTML
      if (topG) renderTopSprites(topG);
      var oldLayer = document.getElementById('terrain-layer');
      if (oldLayer) oldLayer.style.display = 'none';
    }
  } catch (e) { console.warn('[terrain] layout load failed', e); }
}
if (!_usingMapLayout) renderTerrain();

// Collision AABBs
var terrainSource = _usingMapLayout ? getTerrainData() : mapData;
window._terrainAABBs = buildTerrainAABBs(terrainSource || mapData, svgEl);
```

### File: `integrated/v0.4/scenes/scene-shoot.js`

**Current code (line ~10-11, ~28):**

```js
import { mapData } from '../../../shared/state/terrain-data.js';
// ...
mapData.terrain.forEach(function(piece) { ... });
```

**Modified:**

```js
import { mapData } from '../../../shared/state/terrain-data.js';
import { getTerrainData } from '../../../shared/world/terrain-layout.js';

// In buildLosBlockers():
var terrainSource = getTerrainData() || mapData;
terrainSource.terrain.forEach(function(piece) { ... });
```

### File: `integrated/v0.4/screens/screen-forge.js`

**Current code (lines ~212-233):**

```js
import('../../../shared/state/terrain-data.js').then(function(mod) {
  var mapData = mod.mapData;
  // ...
  mapData.terrain.forEach(function(piece) { ... });
```

**Modified:**

```js
Promise.all([
  import('../../../shared/state/terrain-data.js'),
  import('../../../shared/world/terrain-layout.js')
]).then(function(mods) {
  var mapData = mods[0].mapData;
  var terrainLayout = mods[1];
  var terrainSource = terrainLayout.getTerrainData() || mapData;
  var layer = document.getElementById('forge-terrain-layer');
  if (!layer || !terrainSource) return;
  terrainSource.terrain.forEach(function(piece) { ... });
```

### File: `integrated/v0.4/index.html`

Add `<g id="terrain-floor"></g>` and a new SVG for `terrain-top`, matching the same pattern as deploy v0.2a.

### Verification

- [ ] v0.4 loads without errors when no map layout is in localStorage
- [ ] v0.4 loads sprite terrain when layout IS in localStorage
- [ ] Scene transitions (Deploy → Move → Shoot → Charge → Fight) all work with sprite terrain
- [ ] LoS blocking in shoot phase uses collision polygons from map layout
- [ ] Collision AABBs work in deploy phase
- [ ] Battle Forge minimap renders terrain (SVG polygons, not sprites — minimap is tiny)
- [ ] Debug overlay (collision grid) still renders correctly

---

## Phase 6 — Testing Strategy

### Unit Tests (Vitest)

**New file: `shared/world/__tests__/terrain-layout.test.js`**

```
Test: loadMapLayout — rejects invalid version
Test: loadMapLayout — accepts version 1
Test: getTerrainData — returns null when no layout loaded
Test: getTerrainData — returns terrain array from loaded layout
Test: getTerrainData — terrain entries match mapData schema
Test: getObjectives — returns objectives from layout
Test: clearMapLayout — resets to null
Test: renderFloorSprites — creates image elements for floor sprites only
Test: renderTopSprites — creates image elements for top sprites only
Test: renderFloorSprites — skips hidden sprites
Test: renderFloorSprites — applies crop clipPath when crop is set
Test: renderFloorSprites — applies flip transform
Test: renderFloorSprites — wraps grouped sprites in opacity <g>
Test: renderFloorSprites — creates shadow filter for sprites with shadowMul > 0
```

**New file: `terrain-experiments/v0.16/__tests__/export.test.js`**

```
Test: _extractTerrainFromSVG — extracts ruins and scatter
Test: _extractTerrainFromSVG — parses origin from transform
Test: _extractTerrainFromSVG — extracts middle transform (rotate, scale)
Test: _extractTerrainFromSVG — extracts path d and fill attributes
Test: exportMapJSON output — has version 1
Test: exportMapJSON output — sprites use crop object format (not cropL/T/R/B)
Test: exportMapJSON output — groups have spriteIds
Test: Round-trip — export → import → export produces identical output
```

### Integration Tests (Manual Checklist)

```
[ ] Editor: Export map JSON → file downloads, valid JSON
[ ] Editor: Export → Import JSON → layout unchanged
[ ] Deploy: No localStorage layout → SVG terrain renders (regression)
[ ] Deploy: Import layout via debug menu → sprites render
[ ] Deploy: Floor sprites below objectives (visual check)
[ ] Deploy: Top sprites above models (visual check — drag model under a roof)
[ ] Deploy: Collision works (drag model into ruin wall → pushed out)
[ ] Deploy: Tooltips work on terrain hover
[ ] Deploy: Objective positions match layout
[ ] Deploy: Clear layout → SVG terrain returns
[ ] Deploy: Pan/zoom → sprites stay aligned with grid/models
[ ] Deploy: Performance — smooth 60fps pan/zoom with 20 sprites
[ ] v0.4: All phase transitions work with sprite terrain
[ ] v0.4: Shoot phase LoS blocking works
[ ] v0.4: Battle Forge minimap renders terrain
[ ] v0.4: Debug collision grid overlay works
```

### Visual Regression

Compare screenshots of:
1. Editor with current layout
2. Deploy mockup with imported layout
3. Check sprite positions, rotations, crops, flips, group opacity all match

### Performance Test

With the test layout (20 sprites, 4 groups):
- Measure paint time during camera pan (Chrome DevTools Performance tab)
- Target: <16ms per frame (60fps)
- If slow: batch shadow filters into a shared filter def, reduce filter complexity

---

## Execution Order

```
Phase 2 (assets)     → 30 min   — Copy PNGs to shared directory
Phase 1 (export)     → 1 hr     — Editor export button + SVG extraction
Phase 3 (renderer)   → 2-3 hrs  — terrain-layout.js with full sprite rendering
Phase 4 (deploy)     → 2 hrs    — Wire into deploy mockup + debug menu
Phase 5 (integrated) → 1 hr     — Swap terrain source in v0.4
Phase 6 (testing)    → 1-2 hrs  — Unit tests + manual verification
```

**Total estimate: ~8 hours**

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| SVG `<image>` with filters (shadow, crop) slow during pan/zoom | Choppy framerate | Use shared filter defs; if still slow, pre-render to canvas |
| Sprite coordinates don't align with editor preview | Visually wrong terrain | Both use same SVG viewBox (720×528); verify with test file |
| SVG polygon extraction misses transform edge cases | Broken collision | Unit test every transform variant; compare against `terrain-data.js` hardcoded values |
| `terrain[]` missing from old editor exports | Collision breaks | Fallback: if `terrain[]` absent in layout, use `mapData` from `terrain-data.js` |
| Browser CORS blocks `<image>` from relative paths on gh-pages | Blank sprites | All assets served from same origin; no CORS issue |

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `terrain-experiments/v0.16/editor-persistence.js` | Modified | Add `exportMapJSON()` and `_extractTerrainFromSVG()` |
| `terrain-experiments/v0.16/index.html` | Modified | Add "Export Map JSON" button |
| `shared/assets/terrain-sprites/*.png` | New (24 files) | Terrain sprite images |
| `shared/world/terrain-layout.js` | New | Map layout renderer module |
| `shared/world/__tests__/terrain-layout.test.js` | New | Unit tests |
| `terrain-experiments/v0.16/__tests__/export.test.js` | New | Export unit tests |
| `phases/deploy/v0.2a/index.html` | Modified | Add `terrain-floor` `<g>` and `bf-svg-terrain-top` SVG |
| `phases/deploy/v0.2a/scene.js` | Modified | Conditional terrain loading from map layout |
| `phases/deploy/v0.2a/debug-menu.js` | Modified | Add TERRAIN LAYOUT section with import/clear |
| `integrated/v0.4/index.html` | Modified | Add terrain-floor/top layers |
| `integrated/v0.4/app.js` | Modified | Conditional terrain loading |
| `integrated/v0.4/scenes/scene-shoot.js` | Modified | Use `getTerrainData()` for LoS |
| `integrated/v0.4/screens/screen-forge.js` | Modified | Use `getTerrainData()` for minimap |
