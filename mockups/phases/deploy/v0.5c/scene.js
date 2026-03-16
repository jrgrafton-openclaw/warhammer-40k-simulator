/**
 * scene.js — Army data + initialisation wiring for deployment v0.5c.
 * ES module entry point. Imperium units start in the SVG Staging zone.
 * Ork units are pre-deployed on the board.
 * "Grimdark Cinematic" variant — smoke/dust/ember particle system.
 */

import { R32, R40, simState } from '../../../shared/state/store.js';
import { buildCard, initAllTooltips, setGetRangeInches } from '../../../shared/state/units.js';
import { mapData } from '../../../shared/state/terrain-data.js';
import { renderTerrain } from '../../../shared/world/terrain.js';
import { buildTerrainAABBs } from '../../../shared/world/collision.js';
import { initBoard, initBattleControls, initModelInteraction, getRangeInches,
         renderModels, applyTx } from '../../../shared/world/svg-renderer.js';
import { initDeployment } from './deployment.js?v=20260314-deploy5';
import '../../../shared/world/world-api.js';

// ── Wire getRangeInches into the card builder ────────────
setGetRangeInches(getRangeInches);

// ── Unit definitions ────────────────────────────────────
// Imperium starts in the STAGING ZONE (x=-540 to -290, y=20 to 508).
// Orks start pre-deployed in their zone (480-720).

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

// ── Initialise shared modules ────────────────────────────
renderTerrain();
initAllTooltips();
initBoard({ initialScale: 0.5 });
initBattleControls();
initModelInteraction();

// ── Set initial camera pan to show staging + deployment zone ──
// With standard viewBox (0 0 720 528) and scale 0.5, the board renders normally.
// Staging zones are at negative x coords (overflow:visible makes them render).
// We need to pan RIGHT (positive tx) to reveal the staging area to the left of x=0.
// At scale 0.5, each SVG unit ≈ 0.7 display px. Staging center is at x≈-415.
// tx=350 shifts the canvas right enough to show staging + deployment zone together.
var inner = document.getElementById('battlefield-inner');
if (inner) {
  inner.style.transform = 'translate(350px, 0px) scale(0.5)';
}

// ── Build terrain collision AABBs ────────────────────────
var svgEl = document.getElementById('bf-svg');
window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

// ── Initialise deployment interaction ────────────────────
initDeployment();

// ── Update version badge ─────────────────────────────────
var badge = document.querySelector('.deploy-badge');
if (badge) badge.textContent = 'v0.5c · DEPLOYMENT';

// ── Smoke / Dust / Ember Particle System ─────────────────
(function initParticles() {
  var canvas = document.getElementById('smoke-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 720, H = 528;

  function resize() {
    var inner = document.getElementById('battlefield-inner');
    if (inner) {
      canvas.width = inner.offsetWidth || W;
      canvas.height = inner.offsetHeight || H;
    } else {
      canvas.width = W;
      canvas.height = H;
    }
  }
  resize();
  window.addEventListener('resize', resize);

  // Particle types
  var particles = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Smoke wisps: 25 particles
  for (var i = 0; i < 25; i++) {
    particles.push({
      type: 'smoke',
      x: rand(0, canvas.width),
      y: rand(0, canvas.height),
      size: rand(4, 8),
      opacity: rand(0.02, 0.06),
      vx: rand(0.08, 0.25),
      vy: rand(-0.04, 0.04),
      life: rand(0, 1)
    });
  }

  // Embers: 18 particles
  for (var i = 0; i < 18; i++) {
    particles.push({
      type: 'ember',
      x: rand(0, canvas.width),
      y: rand(0, canvas.height),
      size: rand(1, 2),
      opacity: rand(0.15, 0.4),
      vx: rand(-0.1, 0.15),
      vy: rand(-0.3, -0.1),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(0.01, 0.03),
      life: rand(0, 1)
    });
  }

  // Dust motes: 25 particles
  for (var i = 0; i < 25; i++) {
    particles.push({
      type: 'dust',
      x: rand(0, canvas.width),
      y: rand(0, canvas.height),
      size: rand(0.5, 1.2),
      opacity: rand(0.08, 0.2),
      vx: rand(-0.06, 0.06),
      vy: rand(-0.04, 0.04),
      life: rand(0, 1)
    });
  }

  function respawn(p) {
    var edge = Math.floor(Math.random() * 4);
    if (edge === 0) { p.x = -p.size; p.y = rand(0, canvas.height); }
    else if (edge === 1) { p.x = canvas.width + p.size; p.y = rand(0, canvas.height); }
    else if (edge === 2) { p.y = -p.size; p.x = rand(0, canvas.width); }
    else { p.y = canvas.height + p.size; p.x = rand(0, canvas.width); }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      // Update position
      p.x += p.vx;
      p.y += p.vy;

      if (p.type === 'ember') {
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * 0.3;
      }

      // Respawn if out of bounds
      if (p.x < -20 || p.x > canvas.width + 20 || p.y < -20 || p.y > canvas.height + 20) {
        respawn(p);
      }

      // Draw
      ctx.beginPath();
      if (p.type === 'smoke') {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180,175,165,' + p.opacity + ')';
      } else if (p.type === 'ember') {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        var flickerOp = p.opacity * (0.6 + 0.4 * Math.sin(Date.now() * 0.005 + i));
        ctx.fillStyle = 'rgba(255,' + Math.floor(100 + Math.random() * 80) + ',20,' + flickerOp + ')';
      } else {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,240,200,' + p.opacity + ')';
      }
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();

// ── Unit Glow Enhancement (CSS classes on SVG models) ────
(function initUnitGlows() {
  // Apply glow classes after a short delay to let models render
  setTimeout(function() {
    var models = document.querySelectorAll('#layer-models circle, #layer-models rect');
    models.forEach(function(el) {
      // Detect faction by stroke color
      var stroke = el.getAttribute('stroke') || '';
      if (stroke.indexOf('00d4ff') !== -1 || stroke.indexOf('0,212,255') !== -1) {
        el.classList.add('unit-glow-imp');
      } else if (stroke.indexOf('ff4020') !== -1 || stroke.indexOf('255,64,32') !== -1) {
        el.classList.add('unit-glow-ork');
      }
    });
  }, 500);

  // Re-apply on model re-renders via MutationObserver
  var modelLayer = document.getElementById('layer-models');
  if (modelLayer) {
    var observer = new MutationObserver(function() {
      var models = modelLayer.querySelectorAll('circle, rect');
      models.forEach(function(el) {
        var stroke = el.getAttribute('stroke') || '';
        if (stroke.indexOf('00d4ff') !== -1 || stroke.indexOf('0,212,255') !== -1) {
          if (!el.classList.contains('unit-glow-imp')) el.classList.add('unit-glow-imp');
        } else if (stroke.indexOf('ff4020') !== -1 || stroke.indexOf('255,64,32') !== -1) {
          if (!el.classList.contains('unit-glow-ork')) el.classList.add('unit-glow-ork');
        }
      });
    });
    observer.observe(modelLayer, { childList: true, subtree: true });
  }
})();

// ── Visible error handler ────────────────────────────────
window.onerror = function(msg, src, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
  el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
  document.body.appendChild(el);
};
