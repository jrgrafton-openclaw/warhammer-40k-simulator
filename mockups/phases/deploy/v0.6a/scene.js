/**
 * scene.js — v0.6a "Textured SVG" deployment phase.
 * Enhances v0.4 with procedural textures, drop shadows, board surface texture,
 * metallic frame, and particle effects.
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         renderModels, applyTx } from '../../../shared/world/svg-renderer.js';
import { initDeployment } from './deployment.js?v=20260316-v06a';
import '../../../shared/world/world-api.js';
import { generateTextures } from '../../../shared/textures/texture-gen.js';
import { initParticles } from './particles.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Generate procedural textures ─────────────────────────
const textures = generateTextures(256);

// ── Apply board surface texture via CSS ──────────────────
function applyBoardTextures() {
  const inner = document.getElementById('battlefield-inner');
  if (inner) {
    // Set the deck plate texture as background on the inner container
    inner.style.backgroundImage = `url("${textures.deckPlate}")`;
    inner.style.backgroundRepeat = 'repeat';
    inner.style.backgroundSize = '256px 256px';
  }

  // Surround treatment: darker texture on the battlefield container
  const bf = document.getElementById('battlefield');
  if (bf) {
    // Create a darker version using the metal texture
    bf.style.backgroundImage = `url("${textures.metal}")`;
    bf.style.backgroundRepeat = 'repeat';
    bf.style.backgroundSize = '256px 256px';
  }
}

// ── Create SVG defs: patterns + filters ──────────────────
function createSVGDefs() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('bf-svg-terrain');
  if (!svg) return;

  // Create or get <defs>
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  // ── Pattern: ruins texture ──
  const ruinsPattern = document.createElementNS(NS, 'pattern');
  ruinsPattern.setAttribute('id', 'pattern-ruins');
  ruinsPattern.setAttribute('patternUnits', 'userSpaceOnUse');
  ruinsPattern.setAttribute('width', '64');
  ruinsPattern.setAttribute('height', '64');
  const ruinsImg = document.createElementNS(NS, 'image');
  ruinsImg.setAttribute('href', textures.ruins);
  ruinsImg.setAttribute('width', '64');
  ruinsImg.setAttribute('height', '64');
  ruinsPattern.appendChild(ruinsImg);
  defs.appendChild(ruinsPattern);

  // ── Pattern: ruins wall (lighter concrete) ──
  const wallPattern = document.createElementNS(NS, 'pattern');
  wallPattern.setAttribute('id', 'pattern-wall');
  wallPattern.setAttribute('patternUnits', 'userSpaceOnUse');
  wallPattern.setAttribute('width', '64');
  wallPattern.setAttribute('height', '64');
  const wallImg = document.createElementNS(NS, 'image');
  wallImg.setAttribute('href', textures.gothicStone);
  wallImg.setAttribute('width', '64');
  wallImg.setAttribute('height', '64');
  wallPattern.appendChild(wallImg);
  defs.appendChild(wallPattern);

  // ── Pattern: scatter terrain (metal/rubble) ──
  const scatterPattern = document.createElementNS(NS, 'pattern');
  scatterPattern.setAttribute('id', 'pattern-scatter');
  scatterPattern.setAttribute('patternUnits', 'userSpaceOnUse');
  scatterPattern.setAttribute('width', '64');
  scatterPattern.setAttribute('height', '64');
  const scatterImg = document.createElementNS(NS, 'image');
  scatterImg.setAttribute('href', textures.metal);
  scatterImg.setAttribute('width', '64');
  scatterImg.setAttribute('height', '64');
  scatterPattern.appendChild(scatterImg);
  defs.appendChild(scatterPattern);

  // ── Filter: terrain drop shadow (top-left light source) ──
  const shadowFilter = document.createElementNS(NS, 'filter');
  shadowFilter.setAttribute('id', 'terrain-shadow');
  shadowFilter.setAttribute('x', '-20%');
  shadowFilter.setAttribute('y', '-20%');
  shadowFilter.setAttribute('width', '150%');
  shadowFilter.setAttribute('height', '150%');
  const dropShadow = document.createElementNS(NS, 'feDropShadow');
  dropShadow.setAttribute('dx', '3');
  dropShadow.setAttribute('dy', '3');
  dropShadow.setAttribute('stdDeviation', '4');
  dropShadow.setAttribute('flood-color', '#000000');
  dropShadow.setAttribute('flood-opacity', '0.55');
  shadowFilter.appendChild(dropShadow);
  defs.appendChild(shadowFilter);

  // ── Filter: terrain inner highlight (top-left light) ──
  const glowFilter = document.createElementNS(NS, 'filter');
  glowFilter.setAttribute('id', 'terrain-highlight');
  glowFilter.setAttribute('x', '-10%');
  glowFilter.setAttribute('y', '-10%');
  glowFilter.setAttribute('width', '130%');
  glowFilter.setAttribute('height', '130%');
  // Composite: original + subtle inner edge light
  const flood = document.createElementNS(NS, 'feFlood');
  flood.setAttribute('flood-color', 'rgba(160,180,200,0.12)');
  flood.setAttribute('result', 'light');
  glowFilter.appendChild(flood);
  const comp = document.createElementNS(NS, 'feComposite');
  comp.setAttribute('in', 'light');
  comp.setAttribute('in2', 'SourceGraphic');
  comp.setAttribute('operator', 'atop');
  glowFilter.appendChild(comp);
  defs.appendChild(glowFilter);

  // ── Board edge frame (metallic border) ──
  addBoardFrame(svg, NS);
}

// ── Board edge metallic frame ────────────────────────────
function addBoardFrame(svg, NS) {
  const frameGroup = document.createElementNS(NS, 'g');
  frameGroup.setAttribute('id', 'board-frame');
  frameGroup.style.pointerEvents = 'none';

  // Main border rect
  const border = document.createElementNS(NS, 'rect');
  border.setAttribute('x', '0');
  border.setAttribute('y', '0');
  border.setAttribute('width', '720');
  border.setAttribute('height', '528');
  border.setAttribute('fill', 'none');
  border.setAttribute('stroke', 'rgba(201,163,82,0.35)');
  border.setAttribute('stroke-width', '1.5');
  border.setAttribute('vector-effect', 'non-scaling-stroke');
  frameGroup.appendChild(border);

  // Inner border (slight inset for depth)
  const innerBorder = document.createElementNS(NS, 'rect');
  innerBorder.setAttribute('x', '1');
  innerBorder.setAttribute('y', '1');
  innerBorder.setAttribute('width', '718');
  innerBorder.setAttribute('height', '526');
  innerBorder.setAttribute('fill', 'none');
  innerBorder.setAttribute('stroke', 'rgba(201,163,82,0.12)');
  innerBorder.setAttribute('stroke-width', '0.5');
  innerBorder.setAttribute('vector-effect', 'non-scaling-stroke');
  frameGroup.appendChild(innerBorder);

  // Corner accents (small L-shaped brackets)
  const corners = [
    { x: 0, y: 0, dx: 1, dy: 1 },     // top-left
    { x: 720, y: 0, dx: -1, dy: 1 },   // top-right
    { x: 0, y: 528, dx: 1, dy: -1 },   // bottom-left
    { x: 720, y: 528, dx: -1, dy: -1 }, // bottom-right
  ];
  corners.forEach(c => {
    const L = 18;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d',
      `M ${c.x + c.dx * L} ${c.y} L ${c.x} ${c.y} L ${c.x} ${c.y + c.dy * L}`
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(201,163,82,0.5)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.setAttribute('stroke-linecap', 'square');
    frameGroup.appendChild(path);
  });

  svg.appendChild(frameGroup);
}

// ── Post-process terrain: replace flat fills with textures + add shadows ──
function enhanceTerrain() {
  const layer = document.getElementById('terrain-layer');
  if (!layer) return;

  const groups = layer.querySelectorAll('g');
  groups.forEach((g, gi) => {
    const terrainPiece = mapData.terrain[gi];
    if (!terrainPiece) return;

    // Apply drop shadow filter to the entire terrain group
    g.setAttribute('filter', 'url(#terrain-shadow)');

    const paths = g.querySelectorAll('path');
    paths.forEach((path, pi) => {
      if (terrainPiece.type === 'ruins') {
        if (pi === 0) {
          // Floor/base path — use ruins texture
          path.setAttribute('fill', 'url(#pattern-ruins)');
          path.setAttribute('stroke', 'rgba(20,25,30,0.6)');
          path.setAttribute('stroke-width', '1.5');
        } else {
          // Wall path — use gothic stone texture, stronger contrast
          path.setAttribute('fill', 'url(#pattern-wall)');
          path.setAttribute('stroke', 'rgba(140,155,170,0.35)');
          path.setAttribute('stroke-width', '1');
          // Bump opacity for wall visibility
          path.setAttribute('opacity', '1');
        }
      } else if (terrainPiece.type === 'scatter') {
        // Scatter terrain — metal/rubble texture
        path.setAttribute('fill', 'url(#pattern-scatter)');
        path.setAttribute('stroke', 'rgba(40,50,60,0.5)');
        path.setAttribute('stroke-width', '1');
      }
    });

    // Add a subtle top-left edge highlight to each terrain group
    // by duplicating the first path with a shifted clip
    if (paths.length > 0 && terrainPiece.type === 'ruins') {
      const firstPath = paths[0];
      const NS = 'http://www.w3.org/2000/svg';
      const highlight = document.createElementNS(NS, 'path');
      highlight.setAttribute('d', firstPath.getAttribute('d'));
      highlight.setAttribute('fill', 'none');
      highlight.setAttribute('stroke', 'rgba(160,180,200,0.15)');
      highlight.setAttribute('stroke-width', '1');
      highlight.setAttribute('vector-effect', 'non-scaling-stroke');
      // Only visible on top and left edges via stroke-dashoffset trick
      // Simpler: just add it as a subtle overlay
      highlight.style.pointerEvents = 'none';
      g.appendChild(highlight);
    }

    // Increase group opacity (was 0.92, make it more visible)
    g.setAttribute('opacity', '1');
  });
}

// ── Unit definitions ────────────────────────────────────
simState.units = [
  // Imperium — positioned inside the Staging zone
  { id:'assault-intercessors', rosterIndex:0, faction:'imp', keywords:['Infantry'],
    models:[
      {id:'ai1',x:-432,y:64,r:R32},{id:'ai2',x:-415,y:64,r:R32},{id:'ai3',x:-398,y:64,r:R32},
      {id:'ai4',x:-424,y:81,r:R32},{id:'ai5',x:-407,y:81,r:R32}
    ], broken:false, deployed:false },

  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp', keywords:['Infantry','Character'],
    models:[{id:'pl1',x:-415,y:160,r:R40}], broken:false, deployed:false },

  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp', keywords:['Infantry'],
    models:[
      {id:'isa1',x:-432,y:224,r:R32},{id:'isa2',x:-415,y:224,r:R32},{id:'isa3',x:-398,y:224,r:R32},
      {id:'isa4',x:-424,y:241,r:R32},{id:'isa5',x:-407,y:241,r:R32}
    ], broken:false, deployed:false },

  { id:'hellblasters', rosterIndex:3, faction:'imp', keywords:['Infantry'],
    models:[
      {id:'hb1',x:-432,y:314,r:R32},{id:'hb2',x:-415,y:314,r:R32},{id:'hb3',x:-398,y:314,r:R32},
      {id:'hb4',x:-424,y:331,r:R32},{id:'hb5',x:-407,y:331,r:R32}
    ], broken:false, deployed:false },

  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp', keywords:['Vehicle'],
    models:[{id:'rd1',x:-415,y:430,r:22,shape:'rect',w:43,h:25}], broken:false, deployed:false },

  // Orks (auto-deployed in their deployment zone — 480-720 range)
  { id:'boss-nob', rosterIndex:6, faction:'ork', keywords:['Infantry','Character'],
    models:[{id:'bn1',x:560,y:100,r:R40}], broken:false, deployed:true },
  { id:'boyz-mob', rosterIndex:7, faction:'ork', keywords:['Infantry'],
    models:[
      {id:'bm1',x:500,y:200,r:R32},{id:'bm2',x:517,y:200,r:R32},{id:'bm3',x:534,y:200,r:R32},
      {id:'bm4',x:551,y:200,r:R32},{id:'bm5',x:568,y:200,r:R32},{id:'bm6',x:500,y:217,r:R32},
      {id:'bm7',x:517,y:217,r:R32},{id:'bm8',x:534,y:217,r:R32},{id:'bm9',x:551,y:217,r:R32},
      {id:'bm10',x:568,y:217,r:R32}
    ], broken:false, deployed:true },
  { id:'mekboy', rosterIndex:8, faction:'ork', keywords:['Infantry','Character'],
    models:[{id:'mb1',x:560,y:350,r:R32}], broken:false, deployed:true }
];

// ── Initialise: render terrain first, then enhance ──────
renderTerrain();
createSVGDefs();
enhanceTerrain();
applyBoardTextures();

initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// ── Set initial camera pan to show staging + deployment zone ──
var inner = document.getElementById('battlefield-inner');
if (inner) {
  inner.style.transform = 'translate(350px, 0px) scale(0.5)';
}

// ── Build terrain collision AABBs ────────────────────────
var svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

// ── Initialise deployment interaction ────────────────────
initDeployment();

// ── Initialise particle effects ──────────────────────────
initParticles();

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
