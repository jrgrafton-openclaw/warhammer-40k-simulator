# v0.4 Plan — Rules-fidelity pass + combat log panel

## Goals
- Add weapon profile picker per selected attacker (including active wargear options).
- Derive and show hit/wound/save thresholds from BS, S vs T, AP vs Sv.
- Add deterministic seeded roll mode toggle.
- Add persistent right-side combat log timeline.
- Apply target damage with model removal visuals and undo last action.

## Assumptions
- Mockup can use unit-id BS defaults (3+ marines, 5+ orks) until full datasheet schema includes BS.
- Model removal by unit wound characteristic is sufficient for prototype-level fidelity.
- Existing terrain-aware LoS gate from v0.3 remains unchanged.

## UX Decisions
- Top-right Shoot Tools panel holds profile picker, seeded toggle, threshold readout, undo button.
- Bottom-right Combat Log panel persists event timeline with roll summaries.
- Resolve flow logs attacker/profile, thresholds, roll totals, and model removals.

## Test Cases
1. Switch attacker profile and verify threshold summary updates.
2. Toggle seeded mode and confirm log entry + deterministic roll sequence.
3. Resolve valid shot and confirm damage + model removal visual pulse.
4. Undo last action and confirm target model count restoration.
5. Attempt invalid target (range/LoS) and confirm no resolve occurs.

## Acceptance Criteria
- Profile picker works for all ranged-capable units.
- Thresholds are explicit and derived from BS/S/T/AP/Sv.
- Combat log remains visible and appends entries across actions.
- Undo restores target state from the previous resolved shot.
- No console errors.
