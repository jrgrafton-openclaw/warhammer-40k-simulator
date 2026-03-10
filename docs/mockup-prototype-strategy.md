# Mockup Prototype Strategy

**Goal:** Rapid UX exploration via self-contained HTML prototypes, organised by game phase, with a clear path to TypeScript integration once UX is validated.

---

## Folder Structure

```
packages/ui/public/mockups/
  shared/               ← base template (CSS + JS) — kickoff point for NEW phases
  phases/
    move/               ← Movement Phase prototypes
      v0.13/            ← group vs individual model interaction (combined)
      v0.13a/           ← drill-down: figma-style grouping
      v0.13b/           ← toolbar: explicit action buttons
      v0.13c/           ← modifier: keyboard power-user
      v0.14/            ← spline hulls + cohesion
      v0.15/            ← individual model bases, glow, correct scale
      v0.16/            ← movement range enforcement (LATEST)
    shoot/              ← Shooting Phase prototypes (not started)
    deploy/             ← Deployment Phase (not started)
    charge/             ← Charge Phase (not started)
    fight/              ← Fight Phase (not started)
    cmd/                ← Command Phase + special mechanics (not started)
    INTEGRATED/         ← Combined phases running together (not started)
  advanced/
    stratagems/
    deep-strike/
  archive/              ← Historical design exploration v0.1–v0.12
  index.html            ← Tab-per-phase navigation
```

---

## Workflow

### Starting a new phase

```bash
# Copy latest move prototype as starting canvas
cp -r phases/move/v0.16/ phases/shoot/v0.1/
# Edit phases/shoot/v0.1/index.html — add only shoot-specific code
```

### Iterating within a phase

```bash
cp -r phases/shoot/v0.1/ phases/shoot/v0.2/
# Edit phases/shoot/v0.2/index.html — each version is fully self-contained
```

### Updating shared/

`shared/` is updated **only when kicking off a new phase** — bring it to the latest proven state before the first `cp`. Never auto-update mid-phase. If a phase discovers a genuinely useful pattern, manually back-port to `shared/` at phase end.

---

## Phase Backlog

| Phase | Current | Next |
|-------|---------|------|
| move | v0.16 (range enforcement) | Advance D6 roll viz · terrain interaction · coherency enforcement |
| shoot | — | v0.1: target selection + range · v0.2: dice UI · v0.3: LoS |
| charge | — | v0.1: declare + 2D6 · v0.2: overwatch |
| fight | — | v0.1: pile-in + attacks + removal |
| cmd | — | v0.1: stratagems · v0.2: abilities · v0.3: deep strike · v0.4: deployment |
| INTEGRATED | — | v0.1: move+shoot · v0.2: all phases |

---

## Integration Path: Prototype → Engine

When James approves a phase version:

```
1. Behaviour spec   → document edge cases at top of the approved index.html
2. Engine action    → packages/engine/src/actions.ts
3. Resolver         → packages/engine/src/resolvers/
4. Golden test      → packages/engine/src/__tests__/
5. PixiJS render    → packages/ui/src/main.ts
6. Archive the HTML → phases/[phase]/v0.N/ stays for reference
```

The HTML prototype IS the acceptance test spec. If the prototype does it, the engine must reproduce it.

---

## Design Principles

- **Phases are the unit** — each phase has its own prototype series. Don't mix phase concerns in one prototype.
- **Self-contained versions** — each `v0.N/` folder can be opened independently. No inter-version dependencies.
- **Copy forward, not backward** — start new version from previous; never edit a released version.
- **shared/ is append-only in use** — functions in shared/ are never modified once live prototypes depend on them. New behaviour = new function name.
- **Prune aggressively** — keep last 2-3 versions of any phase on the live site. Older versions move to archive/.
- **The exploration IS the product** — for a game, UX correctness can't be spec'd upfront. The prototype is how you discover what works.
