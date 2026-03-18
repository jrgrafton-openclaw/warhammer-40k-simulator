/**
 * app.js — Integrated prototype entry point (v0.4: Start → Forge → Game).
 *
 * Architecture: Screen Router (start/forge/game) + Scene Registry + EventTarget bus.
 * Each game phase registers itself with a declarative config.
 * transitionTo() handles ALL DOM updates — no per-phase functions here.
 */

import { R32, R40, simState, callbacks } from '../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../shared/state/units.js';
import { mapData } from '../shared/state/terrain-data.js';
import { renderTerrain } from '../shared/world/terrain.js';
import { buildTerrainAABBs } from '../shared/world/collision.js';
import { selectUnit as baseSelectUnit, initBoard, initBattleControls,
         initModelInteraction, getRangeInches, renderModels, setCamera } from '../shared/world/svg-renderer.js';
import '../shared/world/world-api.js';

// ── Screen Router ──
import { registerScreen, showScreen, onScreenShow, onScreenHide } from './screen-router.js';
import { initStartScreen, cleanupStartScreen } from './screens/screen-start.js';
import { initBattleForge } from './screens/screen-forge.js';
import { initOptions } from './screens/screen-options.js';

// ── Import scene registrations (each file calls registerScene on import) ──
import './scenes/scene-deploy.js';
import './scenes/scene-move.js';
import './scenes/scene-shoot.js';
import './scenes/scene-charge.js';
import './scenes/scene-fight.js';
import './scenes/scene-game-end.js';

import { transitionTo } from './scene-registry.js';
import { bus } from './game-bus.js';
import { initDebug } from './debug.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Army definitions ─────────────────────────────────────
// Imperium: 6 units in staging zone (deployed: false)
// Orks: 3 units pre-deployed on board (deployed: true)
simState.units = [
  // Imperium — staging zone (x=-540 to -290)
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
    models:[{id:'rd1',x:-415,y:400,r:22,shape:'rect',w:43,h:25}], broken:false, deployed:false },

  { id:'outriders', rosterIndex:5, faction:'imp', keywords:['Mounted'],
    models:[
      {id:'or1',x:-432,y:460,r:R40},{id:'or2',x:-407,y:460,r:R40},{id:'or3',x:-420,y:482,r:R40}
    ], broken:false, deployed:false },

  // Orks — pre-deployed (480-720)
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

// ── Global handlers for inline onclick in HTML ───────────
window.toggleFaction = function(header) {
  var body = header.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  var chev = header.querySelector('.faction-chevron');
  if (chev) chev.textContent = body.style.display === 'none' ? '▸' : '▾';
};
window.toggleAA = function(header) {
  var body = header.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  var chev = header.querySelector('.aa-chev');
  if (chev) chev.textContent = body.style.display === 'none' ? '▸' : '▾';
};

// ── Save initial unit positions for game restart ─────────
var _initialUnits = JSON.parse(JSON.stringify(simState.units));

// ── Register screens ─────────────────────────────────────
registerScreen('start', document.getElementById('screen-start'));
registerScreen('forge', document.getElementById('screen-forge'));
registerScreen('game', document.getElementById('screen-game'));

// ── Game initialisation flag (lazy-init on first game screen show) ──
var _gameInitialized = false;

function initGameModules() {
  if (_gameInitialized) return;
  _gameInitialized = true;

  // Restore initial unit positions (in case of replay)
  simState.units = JSON.parse(JSON.stringify(_initialUnits));

  renderTerrain();
  initAllTooltips();
  initBoard({ initialScale: 0.5 });
  initBattleControls();
  initModelInteraction();
  setCamera(350, 0, 0.5);

  var svgEl = document.getElementById('bf-svg');
  window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

  transitionTo('deploy', { skipCamera: true });
  initDebug();
}

// ── Screen lifecycle callbacks ───────────────────────────
onScreenShow('start', function() {
  initStartScreen();
  // Switch back to ambient drone for start screen
  var audio = document.getElementById('ambient-audio');
  if (audio) {
    var src = audio.querySelector('source');
    if (src) src.src = 'assets/ambient-loop.mp3';
    audio.src = 'assets/ambient-loop.mp3';
    audio.load();
    audio.play().catch(function() {});
  }
});

onScreenHide('start', function() {
  cleanupStartScreen();
});

onScreenShow('game', function() {
  if (!_gameInitialized) {
    initGameModules();
  }
  // Switch to battle music — "Grim March of the Forty-First Millennium"
  var audio = document.getElementById('ambient-audio');
  if (audio) {
    var src = audio.querySelector('source');
    if (src) src.src = '../shared/assets/music/suno-grim-march.mp3';
    audio.src = '../shared/assets/music/suno-grim-march.mp3';
    audio.load();
    audio.play().catch(function() {});
  }
});

// ── Initialize options modal ─────────────────────────────
initOptions();

// ── Initialize screen modules ────────────────────────────
initStartScreen();
initBattleForge();

// ── Restart handler — resets state + transitions to deploy ──
window.addEventListener('wh40k:restart', function() {
  // Reset units to initial positions
  simState.units = JSON.parse(JSON.stringify(_initialUnits));

  // Reset roster pills
  document.querySelectorAll('.roster-state-pill').forEach(function(pill) {
    pill.textContent = 'UNDEPLOYED';
    pill.className = 'roster-state-pill deploy-state';
  });

  // Reset deployed unit tracking
  if (window.__deployedUnitIds) window.__deployedUnitIds.clear();

  // Reset game init flag so modules re-initialize
  _gameInitialized = false;

  // Show game screen → re-init
  showScreen('game');
});

// ── Start at the Start Screen ────────────────────────────
showScreen('start');

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
