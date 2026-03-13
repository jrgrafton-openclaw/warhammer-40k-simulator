const fs = require('fs');
const v01 = fs.readFileSync('v0.1.html', 'utf8');

const prompt = {
  contents: [{
    parts: [{
      text: `You are an expert frontend developer building a Warhammer 40K tactical simulator UI mockup.

Here is the current v0.1 mockup HTML/CSS/JS (all inline):
<v0.1>
${v01}
</v0.1>

Generate a complete, self-contained improved v0.2 HTML file with ALL of the following improvements:

## Improvements Required

### 1. Unit Token Sizes — Scale by Unit Type
Infantry squads: 48px diameter circle
Multi-model squads (5+ models): use a CLUSTER representation — multiple small overlapping circles (like AoE tokens), the cluster width scales with squad size. For a 5-man squad, show 5 small 28px circles arranged in a tight formation using absolute positioning inside a 100px wrapper div.
Vehicles/Dreadnoughts (Redemptor Dreadnought): Large 80px square token with rounded corners (8px), to represent their large physical footprint.
Characters (Primaris Lieutenant): 44px circle with a gold star icon/indicator.
Show model COUNT as a small badge on squad tokens.

### 2. Typography & Visual Hierarchy — Bolder, More Dramatic
- Sidebar panel headers (ARMY ROSTER, SELECTED UNIT): 13px, letter-spacing: 3px, ALL CAPS, Cinzel font, gold color
- Unit name in right sidebar: 28px minimum, Cinzel font, white/bright, with a subtle text-shadow glow
- Stat values in stat block: 18px, bold Roboto Condensed, brighter color (#e8e0d0)
- Stat headers (M, WS, BS, etc.): 10px, ALL CAPS, gold color, letter-spacing: 2px
- Status labels ("Moving", "Ready"): 11px, uppercase, with color-coded left border on the unit row
- Section headers in panels: 11px, letter-spacing: 2.5px, Oswald font

### 3. Action Buttons — Bigger and More Dramatic
- Minimum height: 52px
- Minimum width: 90px (Command Re-roll: 110px)
- Font size: 13px, Oswald font, letter-spacing: 1.5px, ALL CAPS
- Active state: bright cyan border (2px), cyan inner glow box-shadow, lighter bg
- Hover: gold border illuminates, slight scale(1.02) transform
- The action bar container should be 72px tall minimum

### 4. Lines on the Battlefield — Make Them Logical
Remove random crossing lines. Instead:
- One MOVEMENT PATH line: dashed cyan line from the selected unit (Assault Intercessors cluster, center-left) to a target destination point (slightly forward/north of current position). Add an arrowhead at the end using a CSS triangle or SVG marker.
- One LOS line: solid green line from the Assault Intercessors cluster to ONE specific enemy token (upper-right Ork), labeled "LOS: Clear" at the midpoint. Only draw LOS to a unit that is actually selected.
- Threat range circle: semi-transparent red radial gradient around the enemy cluster only.
- NO other random lines.

Use an SVG overlay (position: absolute, top:0, left:0, width:100%, height:100%, pointer-events:none) for the lines — SVG lines are much cleaner than CSS borders.

### 5. Terrain — Contextual, Not Dropdown
Remove the "Terrain Rules" dropdown from the right sidebar.
Instead: add a small TERRAIN CONTEXT badge that appears ON the selected unit's token on the battlefield (a small icon + "Light Cover" text below the token).
In the right sidebar, show a static info box:
  Title: "TERRAIN — LIGHT COVER"
  Body: "Unit is currently in light cover (Ruins terrain). Ranged attacks against this unit subtract 1 from hit rolls."
  This should read as context, not a user control.

### 6. Panning & Zooming the Battlefield
The battlefield center div needs to support pan and zoom:
- Wrap all battlefield tokens/lines/overlays in a single inner div: <div id="battlefield-inner">
- Apply CSS transform: scale + translate to this inner div
- Mouse wheel: zoom in/out (clamp between 0.4x and 3x)
- Click and drag on the battlefield background: pan (translate)
- Show a zoom level indicator in the battlefield header bar: "Zoom: 100%"
- Show a "Reset View" button (small, top-right of battlefield) that resets to scale(1) translate(0,0)
- The battlefield background grid pattern should visually indicate scale changes (it will zoom with the inner div, which is correct)

## Output Format
Output ONLY the complete HTML file — no explanation, no markdown code fences, no preamble.
Start with <!DOCTYPE html> and end with </html>.
All CSS in <style> tags, all JS in <script> tags. Self-contained, no external file deps except Google Fonts CDN.`
    }]
  }],
  generationConfig: {
    maxOutputTokens: 65536,
    temperature: 0.7
  }
};

fs.writeFileSync('prompt.json', JSON.stringify(prompt, null, 2));
console.log('prompt.json written, size:', JSON.stringify(prompt).length, 'bytes');
