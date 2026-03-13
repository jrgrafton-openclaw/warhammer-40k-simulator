# Shoot v0.9 — Tall Ruin LoS Blocking

## Design

Per-model line-of-sight (LoS) through tall ruin footprints with visual ray termination.

### Key Decisions
1. **Attack count = visible model count only** — if 3/5 attacker models can see the target, only 3 models' attacks fire
2. **Visual: blue→red/dashed lines** — clear rays are solid blue; blocked rays show blue to the obstruction point, then red/dashed to the target
3. **Tall ruins block LoS through FULL footprint** — `paths[0]` (floor footprint), not just `paths[1]` (walls). `scatter` terrain does NOT block LoS.
4. **Self-contained in v0.9** — shared modules (collision.js, etc.) are not modified

### Architecture

**LoS Blockers (`scene.js`):**
- Built separately from terrain collision AABBs
- `window._losBlockers[]` — one entry per ruins terrain piece
- Each blocker stores: polygon points (from `paths[0]`), inverse matrix (SVG→local), forward matrix (local→SVG)
- Marked with `kind: 'tall-ruin'`

**Ray-Polygon Intersection (`shooting.js`):**
- `rayIntersectsTallRuins(x1, y1, x2, y2, blockers)` — tests a line segment against all tall ruin polygons
- Transforms ray endpoints to LOCAL space using each blocker's inverse matrix
- Tests against each polygon edge, finds the first (smallest t) intersection
- Returns `{ blocked, hitPoint, t }` — hitPoint in SVG space

**Per-Model LoS (`shooting.js`):**
- `losState(attackerId, targetId)` — for each attacker model, checks LoS to each target model
- Returns `{ state, visibleAttackerCount, totalAttackerCount, perModel }`
- `perModel` is a Map: `attackerModelId → { canSee, bestTarget: { model, dist, hitPoint } }`

**Attack Pipeline:**
- `attackCount()` now accepts optional `visibleModelCount` parameter
- `beginAttack()` computes LoS and passes visible count to `attackCount()`
- Total attacks = profile.a × visibleAttackerCount

**Visual Lines (`drawHoverLines`):**
- Clear models: solid blue line to closest visible target model edge
- Blocked models: solid blue to hit point → red/dashed to target

**Target Info:**
- Partial: "3/5 models have LoS · 12.3" / 24""
- Blocked: "No line of sight"
- Clear: "Clear LoS 12.3" / 24""

### CSS Classes
- `.target-line-clear` — solid blue line for clear LoS
- `.target-line-blocked` — red dashed line for blocked portion
