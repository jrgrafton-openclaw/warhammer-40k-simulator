# Architecture

## Package Dependency Graph

```
@wh40k/engine    — no internal deps; only node builtins
    ↑
@wh40k/content   — depends on @wh40k/engine (types only)
    ↑
@wh40k/ai        — depends on @wh40k/engine + @wh40k/content
    ↑
@wh40k/ui        — depends on all three
```

**Rule:** Dependencies only flow DOWN. `engine` must never import from `content`, `ai`, or `ui`.
`content` must never import from `ai` or `ui`.

---

## GameState (v1)

```typescript
{
  version: 1,               // bump on breaking change → triggers migration
  turn: number,             // 1-5
  phase: Phase,             // COMMAND | MOVEMENT | SHOOTING | CHARGE | FIGHT | END
  activePlayer: string,     // playerId
  players: [PlayerState, PlayerState],
  units: BlobUnit[],
  objectives: Objective[],
  boardWidth: number,       // inches (60 standard)
  boardHeight: number,      // inches (44 standard)
  rngState: number,         // RNG state for replay continuation
  turnLimit: number,
  gameOver: boolean,
  winner: string | null,
}
```

### Versioning + Migration

1. Bump `version` field
2. Add `migratev1_to_v2(old: GameStateV1): GameStateV2` in `state-migration.ts`
3. `deserializeState` auto-detects version and runs migrations
4. Tests: migration round-trip test

---

## Action Pipeline

```
User/AI calls engine.dispatch(action)
          │
          ▼
    validateAction(action, state)
          │ invalid → ActionResult { success: false, error }
          │ valid   ↓
    transcript.append({ type: 'ACTION', action, playerId })
          │
          ▼
    resolveAction(action, state, rng)
      ├─ rolls dice via rng.d6() / rng.roll(n)
      ├─ appends ROLL events to transcript
      ├─ mutates internal state copy
      └─ appends DAMAGE_APPLIED / UNIT_DESTROYED events
          │
          ▼
    return ActionResult { success: true }
```

**Invariant:** The engine's internal state is NEVER returned directly — always deep-cloned via `getState()`.

---

## Phase State Machine

```
COMMAND → MOVEMENT → SHOOTING → CHARGE → FIGHT → END
  ↑                                                 │
  └──────────────── (next player/turn) ─────────────┘
```

Phase transitions triggered by `dispatch({ type: 'END_PHASE' })`.

Each phase has a "phase resolver" that performs phase-specific logic on entry:
- **COMMAND**: score objectives, grant command points, reset per-activation flags
- **MOVEMENT**: enable move actions
- **SHOOTING**: enable shoot actions (only for units not in engagement)
- **CHARGE**: enable charge actions
- **FIGHT**: enable fight actions (engagement range units first)
- **END**: check win condition, advance turn

---

## BlobUnit — Blob Model + Upgrade Path

### Phase 0-7: Blob model
```typescript
BlobUnit {
  center: Point,    // footprint center
  radius: number,   // footprint radius in inches
  ...
}
```

Distances measured from footprint edge to footprint edge:
`blobToBlob(a, b) = centerDist(a, b) - a.radius - b.radius`

### Phase 8+ upgrade: per-model positions (non-breaking)
```typescript
BlobUnit {
  center: Point,          // still present (used when models absent)
  radius: number,         // still present
  models?: ModelPosition[], // OPTIONAL: if present, use per-model geometry
}
```

Public API (`MoveUnit`, `Shoot`, etc.) always takes `unitId` — geometry is internal.
Callers never reference `center` or `models` directly.

---

## Transcript Log

Every game event is appended to a typed log:
- `ROLL` — individual dice roll
- `HIT_ROLL` — roll against BS with context
- `WOUND_ROLL` — roll against wound table
- `SAVE_ROLL` — roll against save (Sv or invuln)
- `ACTION` — player action
- `PHASE_CHANGE` — phase transition
- `DAMAGE_APPLIED` — wound applied to unit
- `UNIT_DESTROYED` — unit removed
- `GAME_END` — final result

Hash: `SHA-256(JSON.stringify(events))` used for:
- Determinism golden tests
- Replay verification
- Anti-cheat in future multiplayer

---

## LoS Interface (v1 + future)

```typescript
interface LoSProvider {
  hasLoS(from: Point, to: Point, terrain: TerrainPiece[]): LoSResult;
}

type LoSResult = {
  visible: boolean;
  obscured: boolean;  // partially blocked = cover
  blockedBy?: string; // terrain piece ID
}
```

v1: center-to-center line, blocked by impassable polygon intersection
v2: model-to-model, true/false per model pair, with height consideration
v3: full 3D with terrain height profiles

---

## AI Architecture (Phase 8)

```
LegalActionGenerator(state) → Action[]
         │
         ▼
For each action: Evaluator(state_after_action) → score
         │
         ▼
AIPlayer: greedy select top-k, rollout depth 2, temperature-weighted sampling
         │
         ▼
ExplainedAction { action, score, reasons[], alternatives[] }
```

DifficultyConfig controls:
- `searchBudget`: max actions evaluated per turn
- `temperature`: softmax temperature (0 = pure greedy, 1 = weighted random)
- `objectiveWeight` / `killWeight` / `riskTolerance`: evaluator weights

---

## Content Schema (Phase 2)

```
quickslate/units.js ──[importer]──→ UnitDatasheet (Zod) ──→ BlobUnit (at game start)
quickslate/stratagems.js ──────────→ Stratagem (Zod)
army_list.json ─────────────────────→ ArmyList (Zod) ──→ initial game setup
```

DiceExpr type handles both constant and variable damage:
```typescript
type DiceExpr = number | { count: number; dice: number; modifier: number };
// "D6" → { count: 1, dice: 6, modifier: 0 }
// "2D6+1" → { count: 2, dice: 6, modifier: 1 }
// 3 → 3
```

---

## Scenario Format (Phase 9)

```typescript
Scenario {
  id: string,
  title: string,
  description: string,
  lessonType: 'movement' | 'target_priority' | 'objectives' | 'trading',
  setup: GameState,           // pre-populated state (units placed, objectives set)
  hints: string[],
  successCondition: (state: GameState, transcript: TranscriptLog) => boolean,
  failureCondition?: (...) => boolean,
}
```

---

## Extension Points

| What to add        | Where                            | Contract                    |
|--------------------|----------------------------------|-----------------------------|
| New army           | `packages/content/src/armies/`   | `UnitDatasheet[]` + army id |
| New keyword        | `packages/engine/src/keywords/`  | `KeywordHandler` interface  |
| New ability        | `packages/engine/src/abilities/` | `AbilityEffect` interface   |
| New stratagem      | `packages/content/src/strats/`   | `Stratagem` + Zod schema    |
| New LoS algorithm  | `packages/engine/src/los/`       | `LoSProvider` interface     |
| New AI evaluator   | `packages/ai/src/evaluators/`    | `Evaluator` interface       |
| New scenario       | `packages/content/src/scenarios/`| `Scenario` object           |
| New phase rule     | `packages/engine/src/resolvers/` | `PhaseResolver` function    |
