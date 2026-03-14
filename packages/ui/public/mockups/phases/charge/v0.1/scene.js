/**
 * scene.js — Army data + initialisation wiring for the charge phase prototype.
 * ES module entry point.
 *
 * Unit positions set up for a realistic mid-game charge scenario:
 *   - Assault Intercessors ~8" from Boyz Mob (avg 7 roll should succeed)
 *   - Primaris Lieutenant ~6" from Boss Nob (easy charge)
 *   - Intercessor Squad A ~10" from Nobz Mob with ruin partially between
 *   - Hellblasters + Dreadnought further back (won't charge — shooting units)
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         selectUnit } from '../../../shared/world/svg-renderer.js';
import { initCharge } from './charge.js?v=3';
import '../../../shared/world/world-api.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Army positions — charge scenario ─────────────────────
// 12px per inch. Distances measured center-to-center.
// Imperium units push forward; Ork units hold center-right.
simState.units = [
  // === IMPERIUM ===
  // Assault Intercessors: ~8" (96px) from Boyz Mob center (~360,264)
  // Positioned around x:270, y:240 — melee unit, prime charger
  { id:'assault-intercessors', rosterIndex:0, faction:'imp',
    models:[
      {id:'ai1',x:260,y:230,r:R32},{id:'ai2',x:277,y:225,r:R32},{id:'ai3',x:294,y:230,r:R32},
      {id:'ai4',x:268,y:246,r:R32},{id:'ai5',x:285,y:246,r:R32}
    ], broken:false },

  // Primaris Lieutenant: ~6" (72px) from Boss Nob (~480,300)
  // Positioned around x:416, y:330 — easy charge
  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp',
    models:[{id:'pl1',x:416,y:330,r:R40}], broken:false },

  // Intercessor Squad A: ~10" (120px) from Nobz Mob (~490,180)
  // Positioned around x:370, y:170 — ruin t6 partially between them
  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp',
    models:[
      {id:'isa1',x:310,y:168,r:R32},{id:'isa2',x:327,y:163,r:R32},{id:'isa3',x:344,y:168,r:R32},
      {id:'isa4',x:318,y:184,r:R32},{id:'isa5',x:336,y:184,r:R32}
    ], broken:false },

  // Hellblasters: far back — won't charge (shooting unit)
  { id:'hellblasters', rosterIndex:3, faction:'imp',
    models:[
      {id:'hb1',x:100,y:380,r:R32},{id:'hb2',x:117,y:375,r:R32},{id:'hb3',x:134,y:380,r:R32},
      {id:'hb4',x:108,y:396,r:R32},{id:'hb5',x:125,y:396,r:R32}
    ], broken:false },

  // Redemptor Dreadnought: far back
  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp',
    models:[{id:'rd1',x:80,y:440,r:22,shape:'rect',w:43,h:25}], broken:false },

  // === ORKS ===
  // Boyz Mob: near center, charge target for Assault Intercessors
  { id:'boyz-mob', rosterIndex:5, faction:'ork',
    models:[
      {id:'bm1',x:355,y:260,r:R32},{id:'bm2',x:372,y:255,r:R32},{id:'bm3',x:389,y:260,r:R32},
      {id:'bm4',x:363,y:276,r:R32},{id:'bm5',x:380,y:276,r:R32}
    ], broken:false },

  // Boss Nob: slightly behind Boyz, charge target for Lieutenant
  { id:'boss-nob', rosterIndex:6, faction:'ork',
    models:[{id:'bn1',x:480,y:300,r:R40}], broken:false },

  // Nobz Mob: behind partial cover (ruin t6), charge target for Intercessor Squad A
  { id:'nobz-mob', rosterIndex:7, faction:'ork',
    models:[
      {id:'nm1',x:470,y:170,r:R40},{id:'nm2',x:500,y:178,r:R40},{id:'nm3',x:485,y:200,r:R40}
    ], broken:false },

  // Mekboy: further back
  { id:'mekboy', rosterIndex:8, faction:'ork',
    models:[{id:'mb1',x:560,y:250,r:R32}], broken:false },

  // Gretchin: screens
  { id:'gretchin', rosterIndex:9, faction:'ork',
    models:[{id:'gr1',x:520,y:340,r:R32},{id:'gr2',x:538,y:335,r:R32},{id:'gr3',x:556,y:340,r:R32}],
    broken:false }
];

// ── Initialise shared modules ────────────────────────────
renderTerrain();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// Start with no unit selected — card hidden
const unitCard = document.getElementById('unit-card');
if (unitCard) unitCard.classList.remove('visible');

// ── Initialise charge interaction ────────────────────────
initCharge();

// ── Build terrain collision AABBs ────────────────────────
const svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
