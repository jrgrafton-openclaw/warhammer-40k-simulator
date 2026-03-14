# Charge Phase v0.1 — Plan

## Goals
- Implement the core charge declaration → 2D6 roll → charge move → success/fail resolution flow
- Re-use shared components from movement and shooting prototypes
- Handle wall collision, unit collision, engagement range, and coherency

## 10th Edition Charge Rules (v0.1 scope)
1. Select an eligible unit (didn't advance, fall back, or already in engagement range)
2. Declare one or more enemy unit targets (must be within 12")
3. Roll 2D6 — this is the max charge distance
4. Move charging models up to the 2D6 result
5. Must end with ≥1 model within 1" (Engagement Range) of EVERY declared target
6. If impossible → failed charge, unit stays put
7. Can't move through walls or enemy models
8. Must maintain unit coherency (2")

## UX Flow
1. SELECT CHARGER → click friendly unit
2. SELECT TARGET(S) → valid enemies within 12" glow orange; click to declare
3. ROLL 2D6 → animated dice roll, charge zone drawn
4. CHARGE MOVE → drag unit to engage; wall/unit collision enforced
5. RESOLVE → success (CHARGED badge) or fail (CHARGE FAILED badge)

## Files
- `index.html` — HTML skeleton with CHARGE phase active
- `style.css` — charge-specific styles
- `scene.js` — army positions for charge scenario
- `charge.js` — core charge logic
- `PLAN.md` — this file

## Edge Cases
1. Wall between charger and target
2. Failed charge (roll too low)
3. Successful charge (engagement range reached)
4. Wall adjacent to part of unit (partial access)
5. Intervening enemy unit blocks path
6. Multi-target charge (must reach ALL targets)
7. Already in engagement range (can't declare)
8. Unit that advanced this turn (ineligible)
9. No enemies within 12" (no valid targets)
10. Coherency break during charge move
11. Single-model unit (no coherency check needed)
12. Vehicle/Monster pivot cost (2" from charge roll)
