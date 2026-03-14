/**
 * scene.js — Army data + initialisation wiring for deployment v0.3.
 * ES module entry point. Auto-deploys Ork units on load.
 * Board reverted to 720x528 — Ork positions back to original (480-650 range).
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         renderModels } from '../../../shared/world/svg-renderer.js';
import { initDeployment } from './deployment.js?v=20260314-deploy4';
import '../../../shared/world/world-api.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Unit definitions ────────────────────────────────────
// Imperium starts OFF-BOARD (staging area). Orks start pre-deployed.
var OFF = -9999;

simState.units = [
  // Imperium (all start off-board, player deploys them)
  { id:'assault-intercessors', rosterIndex:0, faction:'imp', keywords:['Infantry'],
    models:[{id:'ai1',x:OFF,y:OFF,r:R32},{id:'ai2',x:OFF,y:OFF,r:R32},{id:'ai3',x:OFF,y:OFF,r:R32},
            {id:'ai4',x:OFF,y:OFF,r:R32},{id:'ai5',x:OFF,y:OFF,r:R32}], broken:false, deployed:false },
  { id:'primaris-lieutenant', rosterIndex:1, faction:'imp', keywords:['Infantry','Character'],
    models:[{id:'pl1',x:OFF,y:OFF,r:R40}], broken:false, deployed:false },
  { id:'intercessor-squad-a', rosterIndex:2, faction:'imp', keywords:['Infantry'],
    models:[{id:'isa1',x:OFF,y:OFF,r:R32},{id:'isa2',x:OFF,y:OFF,r:R32},{id:'isa3',x:OFF,y:OFF,r:R32},
            {id:'isa4',x:OFF,y:OFF,r:R32},{id:'isa5',x:OFF,y:OFF,r:R32}], broken:false, deployed:false },
  { id:'hellblasters', rosterIndex:3, faction:'imp', keywords:['Infantry'],
    models:[{id:'hb1',x:OFF,y:OFF,r:R32},{id:'hb2',x:OFF,y:OFF,r:R32},{id:'hb3',x:OFF,y:OFF,r:R32},
            {id:'hb4',x:OFF,y:OFF,r:R32},{id:'hb5',x:OFF,y:OFF,r:R32}], broken:false, deployed:false },
  { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp', keywords:['Vehicle'],
    models:[{id:'rd1',x:OFF,y:OFF,r:22,shape:'rect',w:43,h:25}], broken:false, deployed:false },

  // Orks (auto-deployed in their deployment zone — ORIGINAL 720-wide positions)
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

// ── Initialise shared modules ────────────────────────────
renderTerrain();
buildCard('assault-intercessors');
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// ── Build terrain collision AABBs ────────────────────────
var svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

// ── Initialise deployment interaction ────────────────────
initDeployment();

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
