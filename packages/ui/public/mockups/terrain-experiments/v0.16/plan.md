# Plan: Unified Entity System

**PR:** feat/broken-edge-tiles  
**Goal:** Replace parallel entity systems (sprites, lights, smoke, fire, models) with a unified Entity interface so all entity types share selection, multi-select, clipboard, groups, z-order, drag, and undo.

---

## Problem

Currently 4 separate entity arrays with 4 separate interaction systems:

| System | Array | Selection | Multi-sel | Clipboard | Groups | Arrow keys | Shift-click |
|--------|-------|-----------|-----------|-----------|--------|------------|-------------|
| Sprites | `allSprites[]` | ✅ | ✅ | ✅ ⌘C/V | ✅ | ✅ | ✅ |
| Lights | `allLights[]` | ✅ own | ❌ | ❌ | ❌ | ❌ | ❌ |
| Smoke/Fire | `allSmokeFx[]` | ✅ own | ⚠️ buggy | ❌ | ⚠️ buggy | ✅ own | ⚠️ buggy |
| Models | `allModels[]` | ✅ own | ❌ | ❌ | ❌ | ✅ own | ❌ |

Result: duplicated code, inconsistent behavior, bugs when systems interact (e.g. FX in groups, cross-type multi-select).

---

## Architecture

### Entity Interface

Every entity must implement:

```javascript
{
  // Identity
  id: string,           // unique ID (e.g. 's0', 'l1', 'fx2')
  type: string,         // 'sprite' | 'light' | 'smoke' | 'fire' | 'model'
  
  // Position
  x: number,
  y: number,
  
  // DOM
  el: SVGElement,       // primary SVG element
  rootEl: SVGElement,   // top-level element for DOM ops (getter; may differ from el for cropped sprites)
  
  // Bounding box (for hit testing, selection rect, drag-rect multi-select)
  getBounds(): { x, y, w, h },
  
  // Rendering
  apply(): void,        // re-render after property changes
  
  // Selection visuals
  drawSelection(selUI: SVGElement): void,   // draw selection ring/rect/handles into selUI
  
  // Serialization
  serialize(): object,  // JSON-safe representation
  
  // Cloning (for clipboard)
  clone(dx, dy): Entity,   // create duplicate offset by dx, dy
  
  // Shared properties
  groupId: string|null,
  hidden: boolean,
}
```

### Core State Changes

```javascript
// core.js — replace separate arrays with unified registry
Editor.Core = {
  allEntities: [],     // ALL entities in one array
  selected: null,      // single selected entity (any type)
  multiSel: [],        // multi-selected entities (any types mixed)
  clipboard: [],       // serialized entities for paste
  
  // Convenience accessors (backwards compat + type-specific operations)
  get allSprites() { return this.allEntities.filter(e => e.type === 'sprite'); },
  get allLights()  { return this.allEntities.filter(e => e.type === 'light'); },
  get allSmokeFx() { return this.allEntities.filter(e => e.type === 'smoke' || e.type === 'fire'); },
  get allModels()  { return this.allEntities.filter(e => e.type === 'model'); },
}
```

**Performance note:** The getters create new arrays on every call. For hot paths (animation loops), cache locally: `const sprites = C.allSprites;`. For the entity counts in this editor (<100 entities), this is fine.

---

## Implementation Phases

### Phase 1: Entity Protocol + Sprite Adapter (foundation)
**Files:** `js/core/entity.js` (NEW), `js/entities/core.js`, `js/entities/sprites.js`

1. Create `js/core/entity.js` with:
   - `Editor.Entity.register(entity)` — adds to `allEntities[]`
   - `Editor.Entity.unregister(id)` — removes from `allEntities[]`
   - `Editor.Entity.find(id)` — lookup by ID
   - `Editor.Entity.findByEl(el)` — lookup by SVG element (for click handling)
   - `Editor.Entity.ofType(type)` — filter by type
   - Default implementations for `getBounds()`, `drawSelection()`, `clone()` that type modules can override

2. Wrap sprite creation in `addSprite()` to implement Entity interface:
   - `sp.type = 'sprite'`
   - `sp.getBounds = () => ({ x: sp.x, y: sp.y, w: sp.w, h: sp.h })`
   - `sp.apply = () => Editor.Sprites.apply(sp)`
   - `sp.drawSelection = (selUI) => Editor.Selection.drawSpriteSelection(sp, selUI)`
   - `sp.serialize = () => Editor.Sprites.serializeOne(sp)`
   - `sp.clone = (dx, dy) => Editor.Sprites.addSprite(sp.file, sp.x+dx, sp.y+dy, sp.w, sp.h, sp.rot, sp.layerType, true)`
   - Call `Editor.Entity.register(sp)` after creation

3. Update `core.js`:
   - Add `allEntities: []`
   - Add convenience getters for backwards compat
   - Keep `allSprites` as getter initially (can remove later)

**Acceptance:** All existing sprite behavior unchanged. Entity registry populated alongside allSprites. Existing tests still pass.

### Phase 2: Unified Selection System
**Files:** `js/tools/selection.js`

1. Refactor `select(sp)` → `select(entity)`:
   - Call `entity.drawSelection(selUI)` instead of hardcoded rect/handles
   - Store in `C.selected = entity`
   - Deselect lights/smoke (will be unified later)

2. Refactor `deselect()`:
   - Clear `C.selected`, `C.multiSel`
   - No longer need to call `Editor.Lights.deselectLight()` / `Editor.Smoke.deselectEffect()` separately

3. Refactor multi-select:
   - Shift-click: `if (!C.multiSel.includes(entity)) C.multiSel.push(entity)`
   - Drag-rect: `C.allEntities.filter(e => !e.hidden && intersects(e.getBounds(), rect))`
   - `drawMultiSel()`: iterate `C.multiSel`, use each entity's `getBounds()`

4. Extract sprite-specific selection drawing:
   - Move resize handles, rotate handle, edge handles into `Editor.Sprites.drawSpriteSelection(sp, selUI)`
   - FX entities: `Editor.Smoke.drawFxSelection(fx, selUI)` — draws dashed circle
   - Lights: `Editor.Lights.drawLightSelection(l, selUI)` — draws existing center indicator

5. Arrow keys:
   - `C.multiSel.forEach(e => { e.x += dx; e.y += dy; e.apply(); })`
   - Works for all entity types

6. Delete key:
   - `C.multiSel.forEach(e => Editor.Entity.remove(e))` — type-specific cleanup

**Acceptance:** Can select any entity type. Shift-click works across types (select sprite + fire together). Arrow keys move any selected entity. Delete removes any selected entity.

### Phase 3: Unified Clipboard
**Files:** `js/tools/selection.js` (keyboard handler section)

1. ⌘C: `C.clipboard = C.multiSel.map(e => e.serialize())`
2. ⌘V: `C.clipboard.forEach(data => Editor.Entity.createFromData(data, +20, +20))`
   - `createFromData` dispatches to type-specific factory:
     - `sprite` → `Editor.Sprites.addSprite(...)`
     - `smoke` → `Editor.Smoke.addSmoke(...)`
     - `fire` → `Editor.Fire.addFire(...)`
     - `light` → `Editor.Lights.addLight(...)`

**Acceptance:** ⌘C/⌘V works for any entity type. Can copy a mix of sprites + FX and paste them all.

### Phase 4: Smoke/Fire/Light Entity Adapters
**Files:** `js/entities/smoke.js`, `js/entities/fire.js`, `js/entities/lights.js`

1. Remove from smoke.js:
   - `selectedFx`, `multiSelFx` — use `C.selected` / `C.multiSel`
   - `selectEffect()`, `deselectEffect()` — use `Editor.Selection.select()`
   - `startDrag()` — use `Editor.Selection.startMove()`
   - `applySelectionRing()`, `removeSelectionRing()` — use `drawSelection()`
   - Arrow key handler — use unified handler
   - Shift-click handler — use unified handler
   - `deleteSelected()` — use unified delete

2. Add Entity interface to `addSmoke()`:
   - `fx.type = 'smoke'`
   - `fx.getBounds = () => ({ x: fx.x - fx.spread, y: fx.y - fx.maxHeight, w: fx.spread * 2, h: fx.maxHeight + fx.spread })`
   - `fx.apply = () => Editor.Smoke.applyEffect(fx)`
   - `fx.drawSelection = (selUI) => { /* dashed circle */ }`
   - `fx.serialize = () => Editor.Smoke.serializeOne(fx)`
   - `fx.clone = (dx, dy) => Editor.Smoke.addSmoke(fx.x + dx, fx.y + dy, { ...serialized }, true)`
   - `Editor.Entity.register(fx)`

3. Same pattern for `addFire()` and `addLight()`.

4. Keep in smoke.js/fire.js:
   - Entity creation (addSmoke, addFire)
   - Rendering (applyEffect, _tick)
   - Sidebar controls (type-specific UI)
   - Animation loop

**Acceptance:** FX entities participate fully in sprite selection system. All parallel selection code removed. ~150 lines deleted from smoke.js.

### Phase 5: Unified Groups + Layers
**Files:** `js/tools/groups.js`, `js/ui/layers.js`

1. Groups: `addToGroup(groupId, entity)` — works for any entity type
   - Currently only handles sprites. Generalize to use `entity.el` / `entity.rootEl`
   - Set `entity.groupId = groupId`

2. Layers panel:
   - Replace separate `_createSpriteRow`, `_createSmokeFxRow`, `_createLightChildRow` with:
   - `_createEntityRow(entity)` — dispatches to type-specific icon/label/meta based on `entity.type`
   - All entities draggable, all support visibility toggle

3. Layer z-order scanning:
   - Single pass through SVG children → lookup in `allEntities` by element

**Acceptance:** Any entity type can be dragged into/out of groups. Layers panel shows all entity types uniformly.

### Phase 6: Unified Undo Commands
**Files:** `js/core/commands.js`

1. Replace separate `AddSprite/AddLight/AddFx`, `RemoveSprite/RemoveLight/RemoveFx`, `MoveSprite/MoveLight/MoveFx` with:
   - `AddEntity.create(entityData)` — type field determines how to restore
   - `RemoveEntity.create(entityData)`
   - `MoveEntity.create(entityId, fromX, fromY, toX, toY)`

2. Keep type-specific helpers for capture/restore but route through unified commands.

**Acceptance:** Ctrl+Z works uniformly for all entity types.

### Phase 7: Persistence Update
**Files:** `js/persistence.js`

1. Save: serialize `allEntities` with type tags (can keep backwards-compat format initially)
2. Load: dispatch to type-specific factories based on `type` field
3. Z-order: single array of entity IDs (already close to this)

**Acceptance:** Save/load round-trip works for all entity types including mixed groups.

### Phase 8: Tests
**Files:** `__tests__/entity.test.js` (NEW), updates to existing tests

**Unit tests:**
1. Entity.register / Entity.unregister / Entity.find
2. Sprite implements Entity interface (getBounds, serialize, clone)
3. Smoke implements Entity interface
4. Fire implements Entity interface
5. Light implements Entity interface
6. Selection.select works for each type
7. Multi-select across types (sprite + fire)
8. Clipboard copy/paste for each type
9. Clipboard copy/paste mixed types
10. Group add/remove for each type
11. Arrow key movement for each type
12. Delete for each type
13. Undo add/remove/move for each type
14. Persistence round-trip for each type
15. Z-order persistence for mixed types

**Visual verification checklist:**
- [ ] Click sprite → rect selection + handles
- [ ] Click smoke → circle selection ring
- [ ] Click fire → circle selection ring
- [ ] Click light → center indicator
- [ ] Shift-click sprite + fire → both selected
- [ ] Arrow keys move mixed selection
- [ ] ⌘C sprite → ⌘V creates duplicate
- [ ] ⌘C fire → ⌘V creates duplicate
- [ ] ⌘C sprite + fire → ⌘V creates both
- [ ] Drag fire into group → appears in group
- [ ] Drag fire out of group → returns to top level
- [ ] Delete mixed selection → all removed
- [ ] Ctrl+Z after delete → all restored
- [ ] Reload → all entities at correct position/group/z-order

---

## File Impact Summary

| File | Action | Est. Lines |
|------|--------|------------|
| `js/core/entity.js` | NEW | ~120 |
| `js/entities/core.js` | Modify | +30, -5 |
| `js/entities/sprites.js` | Modify | +40, -10 |
| `js/entities/smoke.js` | Modify | +30, -150 |
| `js/entities/fire.js` | Modify | +20, -30 |
| `js/entities/lights.js` | Modify | +30, -20 |
| `js/tools/selection.js` | Modify | +60, -80 |
| `js/tools/groups.js` | Modify | +20, -30 |
| `js/ui/layers.js` | Modify | +40, -60 |
| `js/persistence.js` | Modify | +20, -15 |
| `js/core/commands.js` | Modify | +40, -80 |
| `__tests__/entity.test.js` | NEW | ~200 |
| **Net** | | **~-100 lines** (code deletion > addition) |

---

## Execution Order

Phases 1-3 must be sequential (each builds on the previous).
Phases 4-5 can partially parallel.
Phases 6-7 depend on Phase 4.
Phase 8 runs after each phase (incremental testing).

**Recommended:** Execute Phase 1-2 first, verify existing tests pass, then continue. This is the riskiest part — if sprite selection breaks, everything breaks.

---

## Rollback Strategy

Each phase is a separate commit. If a phase breaks things:
1. `git revert HEAD` to undo the last phase
2. Fix and retry

The convenience getters (`get allSprites()`) provide backwards compat so partial migration is safe.

---

## PR Strategy

**This refactor should be a NEW PR based off the current PR branch:**

```bash
git checkout feat/broken-edge-tiles
git checkout -b feat/entity-system
# ... implement phases ...
gh pr create --base feat/broken-edge-tiles --title "refactor(terrain-editor): unified entity system"
```

When PR #40 (`feat/broken-edge-tiles`) merges to `main`, GitHub auto-retargets PR #41 to `main`.

---

## Gap Check — Features That Must Work Post-Refactor

Sprite-specific features that should NOT apply to FX/lights (guard with `if (entity.type === 'sprite')`):
- **Resize handles** (corner + edge) — sprites only
- **Rotate handle** (R key + drag handle) — sprites only  
- **Flip** (F key) — sprites only
- **Crop mode** (Enter/Escape) — sprites only
- **Shadow/grounding** (shadowMul) — sprites only
- **preserveAspectRatio** — sprites only

Features that SHOULD apply to all entity types (via Entity interface):
- **Select** (click)
- **Multi-select** (shift-click, drag-rect)
- **Move** (arrow keys, drag)
- **Delete** (Delete/Backspace key)
- **Copy/Paste** (⌘C/⌘V)
- **Group** (⌘G, drag into/out of groups)
- **Z-order** (layers panel drag)
- **Undo/Redo** (⌘Z/⌘⇧Z)
- **Visibility toggle** (layers panel eye icon)
- **Escape to deselect**
- **Persistence** (save/load)
- **Debug output** (scene config JSON)

FX-specific features (handled in type module, not Entity interface):
- **Particle animation** (rAF tick loop)
- **Sidebar controls** (type-specific sliders/pickers)
- **Glow animation** (pulse/flicker/breathe)
- **Center dot toggle**

Light-specific features:
- **Radial gradient glow rendering**
- **Center crosshair indicator**
- **Pulse/flicker/breathe animation**

Model-specific features:
- **Circle/rect rendering**
- **Icon type selection**
