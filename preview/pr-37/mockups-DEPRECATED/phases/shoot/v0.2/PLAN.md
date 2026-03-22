# v0.2 Plan — Dice Resolution UX (Hit → Wound → Save)

## Goals
- Extend v0.1 with staged shooting resolution feedback.
- Add animated dice-result panel and hit flash.

## Assumptions
- Deterministic competitive accuracy is not required yet; this is UX prototype.
- Simplified thresholds: hit 3+, wound 4+, save 5+.
- Attack count approximated from weapon attacks × model count.

## UX Decisions
- Keep v0.1 targeting workflow unchanged.
- "ROLL DICE" button triggers compact multi-line summary in overlay.
- Brief target flash confirms successful unsaved hits.

## Test Cases
1. Valid target + roll → overlay shows hit/wound/save line items.
2. No target + roll → guidance message shown.
3. Failed saves > 0 → target flash animation runs.
4. Controls remain responsive after roll animation.

## Acceptance Criteria
- Dice panel appears and auto-dismisses.
- Staged outcomes are understandable at a glance.
- No JS syntax errors.
- Backlink and shoot hash navigation still valid.
