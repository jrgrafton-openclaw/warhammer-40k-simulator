# Changelog

All notable changes to this project will be documented in this file.
Format: `## [vX.Y] — YYYY-MM-DD | Phase N — Description`

---

## [v0.1] — 2026-03-03 | Phase 1 — Deterministic Engine Skeleton

### Added
- `SeededRng` (mulberry32) — deterministic, cloneable, serializable
- `TranscriptLog` — append-only typed event log with SHA-256 hash for determinism testing
- `GameState` v1 — serializable, versioned, deep-cloneable
- `GameEngine` — dispatch pipeline (validate → resolve → transcript → newState)
- Phase state machine: COMMAND → MOVEMENT → SHOOTING → CHARGE → FIGHT → END → (next turn)
- `BlobUnit` model with upgrade path to per-model positions
- `Objective` model with OC-based control determination
- Geometry module: `pointDistance`, `blobToBlob`, `isInEngagement`, `isLegalMove`

### Tests
- Determinism golden test: same seed/actions → identical transcript hash
- State serialization round-trip
- Geometry unit tests + fast-check property tests
- 28 tests, all passing

---

## [v0.0] — 2026-03-03 | Phase 0 — Repo + CI + Pages

### Added
- pnpm monorepo: `packages/engine`, `packages/ui`, `packages/ai`, `packages/content`, `scripts/`
- TypeScript strict mode, ESLint, Prettier
- Vitest configured at root
- GitHub Actions CI: test → build → deploy to Pages
- PixiJS UI placeholder with grimdark theme and phase progress tracker
- GitHub Pages live at `https://jrgrafton-openclaw.github.io/warhammer-40k-simulator/`
- `plan.md`, `architecture.md`, `rules_coverage.md`, `CLAUDE.md`
