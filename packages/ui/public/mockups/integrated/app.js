/**
 * app.js — Integrated prototype entry point (v0.1: Deploy → Move).
 * Defines army, inits shared modules, handles phase transitions.
 */

import { R32, R40, simState, callbacks } from '../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../shared/state/units.js';
import { mapData } from '../shared/state/terrain-data.js';
import { renderTerrain } from '../shared/world/terrain.js';
import { buildTerrainAABBs } from '../shared/world/collision.js';
import { selectUnit as baseSelectUnit, initBoard, initBattleControls,
         initModelInteraction, getRangeInches, renderModels } from '../shared/world/svg-renderer.js';
import '../shared/world/world-api.js';

import { setTransitionCallback, nextPhase } from './phase-machine.js';
import { initDeploy, cleanupDeploy } from './scenes/scene-deploy.js';
import { initMove } from './scenes/scene-move.js';

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

// ── Initialise shared modules (once) ─────────────────────
renderTerrain();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// ── Set initial camera pan (show staging + deployment zone) ──
var inner = document.getElementById('battlefield-inner');
if (inner) {
  inner.style.transform = 'translate(350px, 0px) scale(0.5)';
}

// ── Build terrain collision AABBs ────────────────────────
var svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

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

// ── Phase transition: Deploy → Move ──────────────────────
function transitionToMove() {
  // 1. Cleanup deploy phase
  cleanupDeploy();

  // 2. Update phase header
  var title = document.querySelector('.phase-title');
  var subtitle = document.querySelector('.phase-subtitle');
  if (title) title.textContent = 'MOVEMENT PHASE';
  if (subtitle) { subtitle.id = ''; subtitle.textContent = 'Imperium Active · Round 1'; }

  // 3. Swap action bar inner content
  var actionBar = document.getElementById('action-bar');
  if (actionBar) {
    // Find and remove deploy-status-label
    var deployLabel = document.getElementById('deploy-status-label');
    if (deployLabel) deployLabel.remove();

    // Replace confirm/cancel with move-specific IDs
    var oldConfirm = document.getElementById('btn-confirm-unit');
    var oldCancel = document.getElementById('btn-cancel-unit');

    // Insert mode group where deploy-status-label was (between seps[0] and seps[1])
    var seps = actionBar.querySelectorAll('.ab-sep');
    if (seps[0]) {
      var modeGroup = document.createElement('div');
      modeGroup.className = 'mode-group';
      modeGroup.innerHTML =
        '<button class="mode-btn" id="btn-move" data-shortcut="M">NORMAL MOVE</button>' +
        '<button class="mode-btn" id="btn-advance" data-shortcut="A">ADVANCE</button>';
      seps[0].after(modeGroup);

      var modeLabel = document.createElement('span');
      modeLabel.id = 'move-mode-label';
      modeLabel.textContent = '— NO UNIT —';
      modeGroup.after(modeLabel);
    }

    // Swap confirm/cancel button IDs
    if (oldConfirm) { oldConfirm.id = 'btn-confirm-move'; oldConfirm.disabled = true; oldConfirm.textContent = '✓ CONFIRM'; }
    if (oldCancel) { oldCancel.id = 'btn-cancel-move'; oldCancel.disabled = true; }

    // Update CTA button
    var btnEnd = document.getElementById('btn-end');
    if (btnEnd) {
      btnEnd.textContent = 'END MOVEMENT →';
      btnEnd.disabled = false;
      btnEnd.style.background = '';
      btnEnd.style.borderColor = '';
      btnEnd.style.color = '';
    }
  }

  // 4. Update phase dots (MOVE gets .active)
  var phItems = document.querySelectorAll('.ph-item');
  phItems.forEach(function(item) {
    item.classList.remove('active', 'done');
    if (item.textContent.trim().includes('MOVE')) item.classList.add('active');
  });

  // 5. Add .phase-move class to body → hides deployment zone SVGs via CSS
  document.body.classList.add('phase-move');

  // 6. Clear roster deploy-state pills
  document.querySelectorAll('.roster-state-pill.deploy-state').forEach(function(pill) {
    pill.classList.remove('deploy-state', 'deployed', 'in-reserves');
    pill.textContent = '';
  });

  // 7. Hide deploy badge, show wall-collision banner container
  var deployBadge = document.querySelector('.deploy-badge');
  if (deployBadge) deployBadge.style.display = 'none';

  // 8. Animate camera to center the board
  if (inner) {
    inner.style.transition = 'transform 0.6s ease';
    inner.style.transform = 'translate(0px, 0px) scale(0.5)';
    setTimeout(function() { inner.style.transition = ''; }, 700);
  }

  // 9. Animate phase header
  var pill = document.querySelector('.phase-pill');
  if (pill) {
    pill.classList.add('phase-transition');
    setTimeout(function() { pill.classList.remove('phase-transition'); }, 600);
  }

  // 10. Re-wire roster clicks (cleanupDeployment clones .rail-unit, removing shared handlers)
  document.querySelectorAll('.rail-unit').forEach(function(r) {
    r.addEventListener('click', function() {
      var fn = callbacks.selectUnit || baseSelectUnit;
      fn(r.dataset.unit);
    });
  });

  // 11. Init movement phase (installs its own drag interceptor + listeners)
  initMove();
}

// ── Wire phase transition ────────────────────────────────
setTransitionCallback(function(info) {
  if (info.from === 'deploy' && info.to === 'move') {
    transitionToMove();
  }
});

// ── Wire CONFIRM DEPLOYMENT button to trigger transition ──
function wireEndDeployment() {
  var btnEnd = document.getElementById('btn-end');
  if (!btnEnd) return;

  // We need to intercept AFTER deployment.js's confirmDeployment runs
  // Watch for the locked state and then trigger phase transition
  var observer = new MutationObserver(function() {
    if (btnEnd.textContent.includes('LOCKED')) {
      observer.disconnect();
      // Short delay to let the camera animation start, then transition
      setTimeout(function() {
        nextPhase();
      }, 800);
    }
  });
  observer.observe(btnEnd, { childList: true, characterData: true, subtree: true });
}

// ── Start: Deploy phase ──────────────────────────────────
initDeploy();
wireEndDeployment();

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
