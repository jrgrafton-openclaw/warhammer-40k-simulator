# v0.5 Plan — Board-first shooting UX cleanup

## Goals
- Remove the separate Shoot Tools panel and restore the bottom-right unit card.
- Correct the action bar so SHOOT is the active phase and the controls are minimal.
- Auto-highlight valid targets when selecting a friendly unit that has not fired.
- Hovering a valid target draws dashed sight-lines from each attacker model to the hovered target model.
- Clicking a target either starts the attack immediately or opens a compact weapon popup if multiple ranged profiles are valid.
- Dice flow is staged and click-driven for hit/wound/damage, with save auto-rolled.

## UX Decisions
- The board is the primary interaction surface; no explicit target-confirm / roll-dice flow.
- The unit card shows concise shooting guidance and threshold summary.
- The action bar keeps only status, clear-targeting, and undo-last-shot.
- Weapon selection appears near the clicked target, not in a sidebar.

## Test Cases
1. Select a friendly unit and confirm valid targets auto-highlight.
2. Hover a valid target model and confirm dashed lines draw to that specific model.
3. Click a target with one valid profile and confirm staged roll flow begins immediately.
4. Click a target with multiple valid profiles and confirm popup appears over target.
5. Confirm save stage auto-resolves while hit/wound/damage remain click-driven.
6. Undo restores target models and re-allows the firing unit to shoot.
7. Unit marked as already shot cannot fire again until undo.

## Acceptance Criteria
- No Shoot Tools sidebar remains.
- SHOOT is visibly the active phase in the action bar.
- Primary flow is select attacker → hover target → click target → staged roll UX.
- Hover lines and weapon popup behave consistently with no console errors.
- Build passes and deployed mockup archive points to shoot/v0.5 as latest.
