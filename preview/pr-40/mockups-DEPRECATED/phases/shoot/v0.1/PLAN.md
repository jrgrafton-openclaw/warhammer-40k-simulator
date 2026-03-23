# v0.1 Plan — Target Selection + Range Highlighting

## Goals
- Build first playable shooting loop for selecting attacker + target.
- Show valid vs invalid targets by range.
- Reuse v0.23 UI shell for consistency and speed.

## Assumptions
- Imperium is active player.
- Range measured center-to-center (prototype simplification).
- Uses first available ranged weapon profile for quick target validation.

## UX Decisions
- Friendly selection sets attacker.
- Enemy selection attempts target lock.
- Hull states:
  - cyan = attacker
  - green = valid target
  - muted red = invalid target
  - bright red = locked target
- Action bar text provides reason when invalid.

## Test Cases
1. Select friendly unit → attacker state appears.
2. Click enemy in range → target lock succeeds.
3. Click enemy out of range → status explains out-of-range.
4. Clear target button resets lock.

## Acceptance Criteria
- No console errors on load.
- Attacker/target states visibly distinct.
- Invalid targets clearly identified + reason text shown.
- Backlink to #shoot present.
