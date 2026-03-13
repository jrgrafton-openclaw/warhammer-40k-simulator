# v0.3 Plan — Terrain-aware LoS / Occlusion

## Goals
- Add LoS classification (clear / partial / blocked) on top of range validation.
- Explain invalid reasons: out-of-range vs no line of sight.

## Assumptions
- Use available terrain AABBs from shared map pipeline.
- Segment-vs-rect intersection is sufficient for mockup-level LoS feedback.
- Partial LoS allowed as valid with different visual style.

## UX Decisions
- Target highlights:
  - green = clear LoS
  - amber dashed = partial LoS
  - muted red = blocked/invalid
- Status text explicitly includes reason and measured range.
- Dice resolve uses LoS-informed eligibility gate.

## Test Cases
1. Attacker with clear lane to enemy -> valid clear LoS.
2. Enemy behind terrain -> invalid blocked LoS.
3. Enemy partially screened -> valid partial LoS.
4. Enemy far away -> invalid out-of-range even with LoS.

## Acceptance Criteria
- LoS state changes target affordance correctly.
- Invalid reason messages are explicit and correct.
- At least one clear, one blocked/partial, one out-of-range case exists in scenario.
- No console errors.
