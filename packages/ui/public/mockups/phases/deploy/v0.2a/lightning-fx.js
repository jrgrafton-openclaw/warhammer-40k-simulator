/**
 * lightning-fx.js — Vignette-edge lightning flashes for v0.2a.
 *
 * Flashes the dark vignette margins around the board (NOT the board surface).
 * Uses a CSS overlay with inverse-vignette radial gradient.
 * Reads config from window globals set by debug-menu.js.
 */
(function initLightningFx() {
  // ── Config defaults (overridden by debug-menu globals) ──
  function cfg() {
    return {
      enabled:       window._lightningEnabled !== undefined ? window._lightningEnabled : true,
      intensity:     window._lightningIntensity !== undefined ? window._lightningIntensity : 0.7,
      freqMin:       window._lightningFreqMin !== undefined ? window._lightningFreqMin : 8000,
      freqMax:       window._lightningFreqMax !== undefined ? window._lightningFreqMax : 18000,
      sfxVol:        window._lightningSfxVol !== undefined ? window._lightningSfxVol : 0.25,
      boardTint:     window._lightningBoardTint !== undefined ? window._lightningBoardTint : false,
      tintStrength:  window._lightningTintStrength !== undefined ? window._lightningTintStrength : 0.15
    };
  }

  // ── DOM refs ──
  var flashEl = document.getElementById('lightning-vignette-flash');
  var tintEl  = document.getElementById('lightning-board-tint');

  // ── Thunder SFX ──
  var sfxPaths = [
    '../../../start-game/assets/lightning-1.mp3',
    '../../../start-game/assets/lightning-2.mp3',
    '../../../start-game/assets/lightning-3.mp3'
  ];
  var sfxClips = [];
  var lastSfxIndex = -1;

  for (var i = 0; i < sfxPaths.length; i++) {
    var audio = new Audio();
    audio.preload = 'auto';
    audio.src = sfxPaths[i];
    sfxClips.push(audio);
  }

  function playThunder(delay) {
    var c = cfg();
    if (window._audioMuted) return;
    if (sfxClips.length === 0) return;

    // Pick a clip, avoiding repeat
    var idx;
    do {
      idx = Math.floor(Math.random() * sfxClips.length);
    } while (idx === lastSfxIndex && sfxClips.length > 1);
    lastSfxIndex = idx;

    var clip = sfxClips[idx];
    clip.volume = Math.min(1, c.sfxVol * 0.2);
    clip.currentTime = 0;

    setTimeout(function() {
      clip.play().catch(function() { /* autoplay blocked — ignore */ });
    }, delay);
  }

  // ── Flash animation ──
  var timerId = null;

  function flash(el, peakOpacity, riseMs, holdMs, fallMs, cb) {
    if (!el) { if (cb) cb(); return; }
    el.style.opacity = String(peakOpacity);
    setTimeout(function() {
      el.style.opacity = '0';
      if (cb) setTimeout(cb, fallMs);
    }, riseMs + holdMs);
  }

  function doFlash() {
    var c = cfg();
    if (!c.enabled) return;
    if (!flashEl) return;

    var peak = c.intensity * 0.12;
    var tintPeak = c.tintStrength * 0.05;

    // Primary flash
    flashEl.style.transition = 'opacity 40ms ease-in';
    flashEl.style.opacity = String(peak);

    // Board tint (if enabled)
    if (c.boardTint && tintEl) {
      tintEl.style.transition = 'opacity 40ms ease-in';
      tintEl.style.opacity = String(tintPeak);
    }

    // Thunder SFX with random delay
    var thunderDelay = 80 + Math.floor(Math.random() * 150);
    playThunder(thunderDelay);

    // Primary flash off after 80ms
    setTimeout(function() {
      flashEl.style.transition = 'opacity 60ms ease-out';
      flashEl.style.opacity = '0';
      if (c.boardTint && tintEl) {
        tintEl.style.transition = 'opacity 60ms ease-out';
        tintEl.style.opacity = '0';
      }

      // Secondary flash after 70ms gap
      setTimeout(function() {
        var secondPeak = peak * 0.7;
        var secondTint = tintPeak * 0.7;

        flashEl.style.transition = 'opacity 35ms ease-in';
        flashEl.style.opacity = String(secondPeak);
        if (c.boardTint && tintEl) {
          tintEl.style.transition = 'opacity 35ms ease-in';
          tintEl.style.opacity = String(secondTint);
        }

        setTimeout(function() {
          flashEl.style.transition = 'opacity 80ms ease-out';
          flashEl.style.opacity = '0';
          if (c.boardTint && tintEl) {
            tintEl.style.transition = 'opacity 80ms ease-out';
            tintEl.style.opacity = '0';
          }
        }, 70);
      }, 70);

      // 40% chance of a bonus flicker 400-600ms later
      if (Math.random() < 0.4) {
        var flickerDelay = 400 + Math.floor(Math.random() * 200);
        setTimeout(function() {
          var flickerPeak = peak * 0.4;
          flashEl.style.transition = 'opacity 30ms ease-in';
          flashEl.style.opacity = String(flickerPeak);
          if (c.boardTint && tintEl) {
            tintEl.style.transition = 'opacity 30ms ease-in';
            tintEl.style.opacity = String(flickerPeak * 0.3);
          }
          setTimeout(function() {
            flashEl.style.transition = 'opacity 60ms ease-out';
            flashEl.style.opacity = '0';
            if (c.boardTint && tintEl) {
              tintEl.style.transition = 'opacity 60ms ease-out';
              tintEl.style.opacity = '0';
            }
          }, 50);
        }, flickerDelay);
      }
    }, 80);
  }

  // ── Timer loop ──
  function scheduleNext() {
    var c = cfg();
    if (!c.enabled) { timerId = null; return; }
    var delay = c.freqMin + Math.random() * (c.freqMax - c.freqMin);
    timerId = setTimeout(function() {
      doFlash();
      scheduleNext();
    }, delay);
  }

  function restart() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    var c = cfg();
    if (c.enabled) scheduleNext();
    // Reset opacity in case we're mid-flash
    if (flashEl) flashEl.style.opacity = '0';
    if (tintEl) tintEl.style.opacity = '0';
  }

  // ── Public API ──
  window._lightningRestart = restart;

  // ── Self-start ──
  restart();
})();
