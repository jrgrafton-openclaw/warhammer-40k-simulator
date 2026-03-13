# Visual Acceptance Checklist — shoot/v0.8a

Reference: https://jrgrafton-openclaw.github.io/warhammer-40k-simulator/mockups/phases/shoot/v0.8a/
Screenshots: this directory

---

## Layout & Chrome

- [ ] Dark background (#0a1016-ish) fills viewport
- [ ] Roster sidebar on left (~170px wide) with collapse button
- [ ] Faction sections: IMPERIUM (cyan band) and ORKS (red band)
- [ ] Each roster unit row: icon (SVG glyph) + name + model count + state pill
- [ ] Active unit highlighted with cyan background tint
- [ ] VP bar centered at top: CP counter, IMPERIUM 10 VS 4 ORKS, RND 2/5
- [ ] RESET button at far right of VP bar
- [ ] Phase header: "SHOOTING PHASE" in Anton font, subtitle below
- [ ] "v0.8a · BOTTOM DOCK" badge at top-right
- [ ] "← Mockups" backlink at top-left of battlefield area
- [ ] Action bar at bottom: phase dots (CMD · MOVE · **SHOOT** · CHARGE · FIGHT)
- [ ] USE STRATAGEM button + END SHOOTING → button at bottom-right
- [ ] Unit card at bottom-right (330px wide): name, faction, stat row, range toggles, weapons table, abilities

## Battlefield

- [ ] Board viewBox 720×528 with SVG terrain and models
- [ ] Initial zoom ~0.5, centered
- [ ] Deployment zones: left strip cyan tint, right strip red tint
- [ ] Center line dashed gold (#c9a352), horizontal midline dashed
- [ ] Faint "IMPERIUM" / "ORKS" text in deployment zones
- [ ] 5 hex objective markers at correct positions (01–05)
- [ ] Terrain: ruins (grey, L-shaped walls) + scatter (brown rectangles)
- [ ] Terrain tooltips on hover (title + rules)

## Model Tokens

- [ ] Circular bases with radial gradient fill (dark center)
- [ ] SVG glyph icon inside each token (infantry +, character ★, elite ◆, vehicle ▭)
- [ ] Imperium: blue glow (#2266ee), Orks: red glow (#cc2222)
- [ ] Selected unit: cyan glow (#00c8a8) on bases + hull
- [ ] Hulls: curved path around unit models (d3 Catmull-Rom)
- [ ] Model drag works (individual + unit + shift-rotate)
- [ ] Overlap resolution pushes models apart
- [ ] Cohesion warning banner if models out of range
- [ ] Dreadnought: rect base with horizontal divider icon

## Shooting Interaction

- [ ] Click Imperium unit → selects as attacker, hull glows cyan
- [ ] Enemy hulls glow red if in range + valid LoS
- [ ] Enemy hulls dim if out of range or blocked LoS
- [ ] Hover enemy: dashed cyan sight lines from each attacker model to target edge
- [ ] Click valid enemy: weapon picker if multiple profiles, or straight to attack
- [ ] Weapon picker: grid of weapon cards with name, stats, keyword pills
- [ ] Keyword pills colored by type (PISTOL green, ASSAULT blue, HAZARDOUS orange, etc.)

## Dice Overlay (Bottom-Docked)

- [ ] Overlay anchored at bottom center, above action bar (~68px from bottom)
- [ ] Overlay width ~430-500px, centered with translateX(-50%)
- [ ] Dark background with cyan top border + blur backdrop
- [ ] Stage title: "HIT ROLL", "WOUND ROLL", "SAVE ROLL", "DAMAGE"
- [ ] Pre-roll: grey "–" dice chips
- [ ] Rolling animation: cyan glow on chips
- [ ] Results:
  - Hit/Wound: success = cyan border + green, fail = dim red
  - Save: enemy success = orange, enemy fail = cyan flash
  - Damage: all success (no threshold)
- [ ] Summary text below dice: "BS 3+", "Wound on 4+", etc.
- [ ] CTA button: "CLICK TO ROLL" → "ROLL WOUNDS" → "Rolling..." → "SHOW RESULT"
- [ ] Auto-resolve for wound and save stages (no manual click needed)

## Result Panel

- [ ] "Attack Resolved" title
- [ ] Wounds Applied row: ⚔ icon + large number (Anton font) + label
- [ ] Models Destroyed row: ☠ icon + large number + label
- [ ] Kills row has red tint background if killCount > 0
- [ ] OK button to dismiss

## FX

- [ ] Projectiles: small glowing capsules traveling along offset-path from attacker models to target
- [ ] Projectile color: cyan (var(--imp))
- [ ] Hit flashes: brightness spike + glow on target model tokens
- [ ] Wound ring: arc overlay on wounded multi-W model (remain=cyan, lost=red)
- [ ] Wound label: "XW" below ring
- [ ] Unit destroyed: fade-out animation on hull + models

## Stratagem Modal

- [ ] Full-screen dark overlay with blur
- [ ] Modal card centered: "SELECT STRATAGEM" title, close X
- [ ] Stratagem items: name, CP cost pill, timing pill, description
- [ ] Click outside or X to dismiss

## Interactions

- [ ] Pan: click-drag on empty battlefield area
- [ ] Zoom: scroll wheel (0.35× to 3×)
- [ ] Reset: R key or ↺ RESET button
- [ ] Keyboard: M=move, A=advance, S=stratagem, E=end phase
- [ ] Roster collapse: ◄ button toggles sidebar
- [ ] Faction toggle: click faction header to collapse/expand
- [ ] Card close: × button hides unit card
- [ ] Range toggles: MOVE/ADV/CHRG buttons show dashed range circles
- [ ] Range circles reposition correctly during zoom/pan
- [ ] ATTACKED state pill appears on spent units (roster + card badge)
- [ ] Spent unit hulls show faded/grey styling
