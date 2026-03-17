/**
 * screen-start.js — Cinematic start screen with particles, lightning, and audio.
 * Extracted from start-game/index.html inline JS into an ES module.
 */

import { showScreen } from '../screen-router.js';
import { openOptions } from './screen-options.js';

var canvas, ctx, W, H;
var mouseX = -1000, mouseY = -1000;
var embers = [], smokePuffs = [];
var running = false;
var lightningActive = false;
var lightningEl = null;
var lightningSfx = [];
var sfxVolume = [[0.20, 0.12], [0.12, 0.08], [0.18, 0.10]];
var lastSfxIdx = -1, secondLastSfxIdx = -1;

// ── Audio state (shared with mute button) ──
var audioCtx = null, gainNode = null;
var TARGET_VOL = 0.85, FADE_IN_SEC = 1.0, FADE_MUTE_SEC = 0.15, FADE_UNMUTE_SEC = 0.2;
var muted = localStorage.getItem('wh40k-splash-muted') === 'true';
window._audioMuted = muted;

// ── Particle creation ──
function createEmber() {
  var type = Math.random();
  var color, glow, size;
  if (type < 0.15) {
    color = 'rgba(0,212,255,0.9)'; glow = 'rgba(0,212,255,0.5)'; size = 1.5 + Math.random() * 2;
  } else if (type < 0.4) {
    color = 'rgba(255,160,50,0.95)'; glow = 'rgba(255,120,20,0.5)'; size = 2 + Math.random() * 3;
  } else {
    color = 'rgba(200,120,30,0.8)'; glow = 'rgba(180,90,10,0.4)'; size = 1.5 + Math.random() * 2.5;
  }
  return {
    x: Math.random() * W, y: H + 10 + Math.random() * 40,
    vx: -0.3 + Math.random() * 0.6, vy: -(0.4 + Math.random() * 1.2),
    size: size, color: color, glow: glow,
    life: 0, maxLife: 300 + Math.random() * 500,
    drift: (Math.random() - 0.5) * 0.01, flicker: Math.random() * Math.PI * 2
  };
}

function createSmokePuff() {
  var side = Math.random();
  var startX;
  if (side < 0.3) startX = Math.random() * W * 0.3;
  else if (side > 0.7) startX = W * 0.7 + Math.random() * W * 0.3;
  else startX = Math.random() * W;
  var grey = 160 + Math.floor(Math.random() * 60);
  return {
    x: startX, y: H * 0.5 + Math.random() * H * 0.5,
    vx: -0.15 + Math.random() * 0.3, vy: -(0.08 + Math.random() * 0.2),
    size: 40 + Math.random() * 80, maxSize: 80 + Math.random() * 120,
    color: grey, life: 0, maxLife: 600 + Math.random() * 800,
    drift: (Math.random() - 0.5) * 0.005, growRate: 0.04 + Math.random() * 0.06
  };
}

function resize() {
  if (!canvas) return;
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

function tick() {
  if (!running) return;
  ctx.clearRect(0, 0, W, H);

  // Smoke
  while (smokePuffs.length < 38) smokePuffs.push(createSmokePuff());
  for (var i = smokePuffs.length - 1; i >= 0; i--) {
    var s = smokePuffs[i];
    s.life++; s.vx += s.drift; s.vx *= 0.998; s.x += s.vx; s.y += s.vy;
    s.size = Math.min(s.size + s.growRate, s.maxSize);
    var alpha = 0, fadeIn = 80, fadeOut = 200;
    if (s.life < fadeIn) alpha = s.life / fadeIn;
    else if (s.life > s.maxLife - fadeOut) alpha = (s.maxLife - s.life) / fadeOut;
    else alpha = 1;
    alpha *= 0.045;
    if (alpha <= 0 || s.life >= s.maxLife || s.y < -s.size) { smokePuffs.splice(i, 1); continue; }
    var grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
    grad.addColorStop(0, 'rgba(' + s.color + ',' + s.color + ',' + s.color + ',' + alpha + ')');
    grad.addColorStop(0.5, 'rgba(' + s.color + ',' + s.color + ',' + s.color + ',' + (alpha * 0.5) + ')');
    grad.addColorStop(1, 'rgba(' + s.color + ',' + s.color + ',' + s.color + ',0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
  }

  // Embers
  while (embers.length < 80) embers.push(createEmber());
  for (var j = embers.length - 1; j >= 0; j--) {
    var p = embers[j]; p.life++;
    var dx = p.x - mouseX, dy = p.y - mouseY, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 120) { var force = (120 - dist) / 120 * 0.5; p.vx += (dx / dist) * force; p.vy += (dy / dist) * force; }
    p.vx += p.drift; p.vx *= 0.99; p.x += p.vx; p.y += p.vy;
    var a2 = 1;
    if (p.life < 30) a2 = p.life / 30;
    if (p.life > p.maxLife - 60) a2 = (p.maxLife - p.life) / 60;
    if (a2 <= 0 || p.life >= p.maxLife || p.y < -20) { embers.splice(j, 1); continue; }
    var flick = 0.7 + 0.3 * Math.sin(p.flicker + p.life * 0.08); a2 *= flick;
    ctx.save(); ctx.globalAlpha = a2 * 0.5; ctx.shadowColor = p.glow; ctx.shadowBlur = p.size * 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = p.glow; ctx.fill(); ctx.restore();
    ctx.save(); ctx.globalAlpha = a2; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill(); ctx.restore();
  }
  requestAnimationFrame(tick);
}

// ── Lightning ──
function playLightningSfx() {
  if (window._audioMuted) return;
  var idx;
  do { idx = Math.floor(Math.random() * lightningSfx.length); } while (
    (idx === lastSfxIdx || idx === secondLastSfxIdx) && lightningSfx.length > 2
  );
  secondLastSfxIdx = lastSfxIdx; lastSfxIdx = idx;
  var sfx = lightningSfx[idx];
  if (!sfx) return;
  var vol = sfxVolume[idx];
  sfx.volume = vol[0] + Math.random() * vol[1];
  sfx.currentTime = 0;
  sfx.play().catch(function() {});
}

function triggerLightning() {
  if (!lightningActive || !lightningEl) return;
  lightningEl.style.background = 'rgba(180,210,240,0.08)';
  setTimeout(function() { lightningEl.style.background = 'rgba(180,210,240,0)'; }, 80);
  setTimeout(function() { lightningEl.style.background = 'rgba(180,210,240,0.05)'; }, 150);
  setTimeout(function() { lightningEl.style.background = 'rgba(180,210,240,0)'; }, 220);
  setTimeout(playLightningSfx, 80 + Math.random() * 150);
  if (Math.random() < 0.4) {
    setTimeout(function() {
      lightningEl.style.background = 'rgba(180,210,240,0.06)';
      setTimeout(function() { lightningEl.style.background = 'rgba(180,210,240,0)'; }, 60);
    }, 400 + Math.random() * 200);
  }
}

var _lightningTimer = null;
function startLightning() {
  lightningActive = true;
  (function scheduleNext() {
    if (!lightningActive) return;
    _lightningTimer = setTimeout(function() { triggerLightning(); scheduleNext(); }, 5000 + Math.random() * 7000);
  })();
}

// ── Audio (Web Audio API) ──
function ensureAudioContext() {
  if (audioCtx) return;
  var audio = document.getElementById('ambient-audio');
  if (!audio) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  var source = audioCtx.createMediaElementSource(audio);
  gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
}

function rampGain(target, dur) {
  if (!gainNode) return;
  gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
  gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(target, audioCtx.currentTime + dur);
}

function fadeInAudio() {
  ensureAudioContext();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  var audio = document.getElementById('ambient-audio');
  if (audio) audio.play().catch(function() {});
  rampGain(muted ? 0 : TARGET_VOL, FADE_IN_SEC);
}

// ── Public API ──
var _booted = false;
var _mouseMoveHandler = null;

export function initStartScreen() {
  canvas = document.getElementById('ember-canvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  lightningEl = document.getElementById('start-lightning');

  // Pre-load lightning SFX
  lightningSfx = [
    new Audio('assets/lightning-1.mp3'),
    new Audio('assets/lightning-2.mp3'),
    new Audio('assets/lightning-3.mp3')
  ];
  lightningSfx.forEach(function(a) { a.preload = 'auto'; });

  // Mute button
  var muteBtn = document.getElementById('mute-toggle');
  if (muteBtn) {
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.onclick = function(e) {
      e.stopPropagation();
      if (!gainNode) return;
      muted = !muted;
      muteBtn.textContent = muted ? '🔇' : '🔊';
      rampGain(muted ? 0 : TARGET_VOL, muted ? FADE_MUTE_SEC : FADE_UNMUTE_SEC);
      window._audioMuted = muted;
      localStorage.setItem('wh40k-splash-muted', String(muted));
    };
  }

  // Enter gate
  var gate = document.getElementById('enter-gate');
  if (gate && !_booted) {
    gate.addEventListener('click', function onGateClick() {
      gate.classList.add('hidden');
      document.getElementById('splash-root').classList.add('boot');
      fadeInAudio();
      setTimeout(function() { startParticles(); startLightning(); }, 1500);
      triggerLightning();
      setTimeout(triggerLightning, 500);
      setTimeout(function() {
        var t = document.getElementById('start-title');
        if (t) { t.classList.remove('stamp'); t.classList.add('idle'); }
      }, 3000);
      setTimeout(function() { if (gate.parentNode) gate.remove(); }, 1000);
      _booted = true;
    });
  } else if (_booted) {
    // Returning to start screen (already booted)
    if (gate) gate.remove();
    var root = document.getElementById('splash-root');
    if (root && !root.classList.contains('boot')) root.classList.add('boot');
    if (!running) startParticles();
    if (!lightningActive) startLightning();
  }

  // Mouse tracking for particle interaction
  _mouseMoveHandler = function(e) { mouseX = e.clientX; mouseY = e.clientY; };
  document.addEventListener('mousemove', _mouseMoveHandler);
  window.addEventListener('resize', resize);

  // Wire menu buttons
  var btnNew = document.getElementById('btn-new-game');
  if (btnNew) {
    btnNew.onclick = function() { showScreen('forge'); };
  }
  var btnSettings = document.getElementById('btn-settings');
  if (btnSettings) {
    btnSettings.onclick = function() { openOptions(); };
  }
}

function startParticles() {
  resize();
  running = true;
  tick();
}

export function cleanupStartScreen() {
  running = false;
  lightningActive = false;
  if (_lightningTimer) { clearTimeout(_lightningTimer); _lightningTimer = null; }
  if (_mouseMoveHandler) {
    document.removeEventListener('mousemove', _mouseMoveHandler);
    _mouseMoveHandler = null;
  }
  window.removeEventListener('resize', resize);
  embers = [];
  smokePuffs = [];
}
