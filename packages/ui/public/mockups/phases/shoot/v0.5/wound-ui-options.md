# Wound Indicator UX Alternatives (v0.5)

Context: the current UI shows partial wounds as a small red `carry/total` pip anchored near the token edge (`3/4` style).

## Why the current pattern feels confusing
- The tiny pip competes with objective markers, range rings, and model glows.
- `3/4` does not clearly communicate whether that means **wounds taken** or **wounds remaining** at a glance.
- The marker only appears once damage exists, so players may not build strong visual habit around a consistent location.

---

## Option 1 — Split-Ring Health Arc (recommended)
**Concept:** keep damage on the base, but move from text-first to shape-first.

### In-board treatment
- Add a thin ring around the model base.
- Ring is split into:
  - **Remaining wounds** segment (faction tint)
  - **Lost wounds** segment (red/orange)
- Put a tiny center label only when selected/hovered: `1W left`.

### Why it reads better
- Arc length is understood instantly (pre-attentive, no reading required).
- Works while zoomed out better than tiny text.
- Keeps footprint close to existing token styling.

### Example for a 4W model currently at 1W remaining
- Ring: 25% faction color + 75% red.
- Optional center micro-label: `1/4` or `1W`.

---

## Option 2 — Vertical Damage Ladder (notches)
**Concept:** display wound state as a 4-step (or N-step) side ladder attached to one consistent side of the token.

### In-board treatment
- Small vertical stack of ticks at the token’s right edge.
- Filled ticks = wounds remaining (or lost; pick one globally and never switch).
- Last remaining tick pulses subtly at low health.

### Why it reads better
- Discrete tick marks map cleanly to low wound counts (2–8), common for elite infantry/vehicles.
- Very little overlap risk with center iconography.
- Easy to keep legible on darker terrain because each notch can have a background chip.

### Example for 3/4 wounds taken
- If encoding “remaining”: one bright notch + three dim notches.
- Tooltip on hover: `Redemptor: 1 of 4 W remaining`.

---

## Option 3 — Card-First + Minimal Board Alert
**Concept:** reduce board clutter and push exact numbers into the selected unit card.

### In-board treatment
- Token only shows a simple state dot:
  - green = healthy
  - amber = damaged
  - red = critical (<=25%)
- Exact numeric wounds appear only in the unit card and roster row.

### Why it reads better
- Cleanest battlefield visual language (best if you want cinematic board feel).
- Reduces cognitive load during target selection.
- Better mobile/stream readability because one area (card/roster) carries detail.

### Tradeoff
- Requires selection/hover for exact damage values; weaker for quick global scan of precise numbers.

---

## Copy/label recommendation (applies to all options)
To remove ambiguity, prefer explicit wording where numbers appear:
- `Wounds Remaining: 1/4`
- Avoid naked `3/4` unless prefixed with `Taken` or `Remaining`.

## Quick decision guide
- Choose **Option 1** if you want strongest at-a-glance readability without increasing clutter.
- Choose **Option 2** if you prefer deterministic, discrete marks over arcs.
- Choose **Option 3** if visual cleanliness is top priority and exact numbers can live in panels.
