/**
 * lightning-fx.js — Vignette-edge lightning flashes for v0.2a.
 *
 * Two rendering modes:
 *   "board"       — SVG rects inside #bf-svg-vignette (lights up board edges)
 *   "screenspace" — CSS overlay at z-index 9 with mix-blend-mode:screen
 *                   (lights up dark gaps around the board)
 *
 * Screenspace can be clipped to #battlefield (excludes roster) or
 * cover the full viewport (includes roster).
 *
 * Reads config from window globals set by debug-menu.js.
 */
(function initLightningFx() {
  var NS = 'http://www.w3.org/2000/svg';
  var FLASH_COLOR = '180,210,240';

  // ── Config ──
  function cfg() {
    return {
      enabled:        window._lightningEnabled !== undefined ? window._lightningEnabled : true,
      mode:           window._lightningMode || 'screenspace',
      includeRoster:  window._lightningIncludeRoster !== undefined ? window._lightningIncludeRoster : false,
      intensity:      window._lightningIntensity !== undefined ? window._lightningIntensity : 0.7,
      freqMin:        window._lightningFreqMin !== undefined ? window._lightningFreqMin : 8000,
      freqMax:        window._lightningFreqMax !== undefined ? window._lightningFreqMax : 18000,
      sfxVol:         window._lightningSfxVol !== undefined ? window._lightningSfxVol : 0.25,
      boardTint:      window._lightningBoardTint !== undefined ? window._lightningBoardTint : false,
      tintStrength:   window._lightningTintStrength !== undefined ? window._lightningTintStrength : 0.15
    };
  }

  // ═══════════════════════════════════════════════════════
  // MODE 1: BOARD — SVG rects inside vignette
  // ═══════════════════════════════════════════════════════
  var lightningGroup = null;

  function createBoardRects() {
    if (lightningGroup) return;
    var vigSvg = document.getElementById('bf-svg-vignette');
    if (!vigSvg) return;

    var defs = vigSvg.querySelector('defs');
    if (!defs) return;

    var gradDefs = [
      { id: 'lt-grad-l', x1: '0', y1: '0', x2: '1', y2: '0' },
      { id: 'lt-grad-r', x1: '1', y1: '0', x2: '0', y2: '0' },
      { id: 'lt-grad-t', x1: '0', y1: '0', x2: '0', y2: '1' },
      { id: 'lt-grad-b', x1: '0', y1: '1', x2: '0', y2: '0' }
    ];
    gradDefs.forEach(function(g) {
      if (document.getElementById(g.id)) return; // already exists
      var lg = document.createElementNS(NS, 'linearGradient');
      lg.setAttribute('id', g.id);
      lg.setAttribute('x1', g.x1); lg.setAttribute('y1', g.y1);
      lg.setAttribute('x2', g.x2); lg.setAttribute('y2', g.y2);
      lg.innerHTML =
        '<stop offset="0%" stop-color="rgb(' + FLASH_COLOR + ')" stop-opacity="1"/>' +
        '<stop offset="40%" stop-color="rgb(' + FLASH_COLOR + ')" stop-opacity="0.3"/>' +
        '<stop offset="100%" stop-color="rgb(' + FLASH_COLOR + ')" stop-opacity="0"/>';
      defs.appendChild(lg);
    });

    lightningGroup = document.createElementNS(NS, 'g');
    lightningGroup.setAttribute('id', 'lightning-group');
    lightningGroup.setAttribute('pointer-events', 'none');
    lightningGroup.style.opacity = '0';
    lightningGroup.setAttribute('filter', 'url(#vig-noise)');

    var vigRects = [
      { src: 'vig-rect-l', grad: 'lt-grad-l' },
      { src: 'vig-rect-r', grad: 'lt-grad-r' },
      { src: 'vig-rect-t', grad: 'lt-grad-t' },
      { src: 'vig-rect-b', grad: 'lt-grad-b' }
    ];
    vigRects.forEach(function(vr) {
      var srcRect = document.getElementById(vr.src);
      if (!srcRect) return;
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', srcRect.getAttribute('x'));
      r.setAttribute('y', srcRect.getAttribute('y'));
      r.setAttribute('width', srcRect.getAttribute('width'));
      r.setAttribute('height', srcRect.getAttribute('height'));
      r.setAttribute('fill', 'url(#' + vr.grad + ')');
      r.setAttribute('class', 'lt-rect');
      lightningGroup.appendChild(r);
    });

    vigSvg.appendChild(lightningGroup);
  }

  function syncBoardGeometry() {
    if (!lightningGroup) return;
    var pairs = ['vig-rect-l', 'vig-rect-r', 'vig-rect-t', 'vig-rect-b'];
    var ltRects = lightningGroup.querySelectorAll('.lt-rect');
    pairs.forEach(function(srcId, i) {
      var srcRect = document.getElementById(srcId);
      var ltRect = ltRects[i];
      if (!srcRect || !ltRect) return;
      ltRect.setAttribute('x', srcRect.getAttribute('x'));
      ltRect.setAttribute('y', srcRect.getAttribute('y'));
      ltRect.setAttribute('width', srcRect.getAttribute('width'));
      ltRect.setAttribute('height', srcRect.getAttribute('height'));
    });
  }

  // ═══════════════════════════════════════════════════════
  // MODE 2: SCREENSPACE — CSS overlay
  // ═══════════════════════════════════════════════════════
  var screenOverlay = null;

  function ensureScreenOverlay() {
    if (screenOverlay) return;
    screenOverlay = document.createElement('div');
    screenOverlay.id = 'lightning-screen-flash';
    screenOverlay.setAttribute('aria-hidden', 'true');
    screenOverlay.style.cssText =
      'pointer-events:none;' +
      'inset:0;' +
      'opacity:0;' +
      'mix-blend-mode:screen;' +
      'background:radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(' + FLASH_COLOR + ',0.12) 70%, rgba(' + FLASH_COLOR + ',0.18) 100%);';
    applyScreenPosition();
    document.body.appendChild(screenOverlay);
  }

  function applyScreenPosition() {
    if (!screenOverlay) return;
    var c = cfg();
    if (c.includeRoster) {
      // Full viewport — position fixed
      screenOverlay.style.position = 'fixed';
      screenOverlay.style.zIndex = '9999';
      // Move to body if not already there
      if (screenOverlay.parentNode !== document.body) {
        document.body.appendChild(screenOverlay);
      }
    } else {
      // Battlefield only — position absolute inside #battlefield
      screenOverlay.style.position = 'absolute';
      screenOverlay.style.zIndex = '9';
      var bf = document.getElementById('battlefield');
      if (bf && screenOverlay.parentNode !== bf) {
        bf.appendChild(screenOverlay);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // BOARD TINT (shared by both modes)
  // ═══════════════════════════════════════════════════════
  var tintEl = document.getElementById('lightning-board-tint');

  // ═══════════════════════════════════════════════════════
  // THUNDER SFX
  // ═══════════════════════════════════════════════════════
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
    var idx;
    do { idx = Math.floor(Math.random() * sfxClips.length); }
    while (idx === lastSfxIndex && sfxClips.length > 1);
    lastSfxIndex = idx;
    var clip = sfxClips[idx];
    clip.volume = Math.min(1, c.sfxVol * 0.2);
    clip.currentTime = 0;
    setTimeout(function() { clip.play().catch(function() {}); }, delay);
  }

  // ═══════════════════════════════════════════════════════
  // FLASH ANIMATION
  // ═══════════════════════════════════════════════════════
  var timerId = null;

  function setFlash(opacity) {
    var c = cfg();
    if (c.mode === 'board') {
      if (lightningGroup) lightningGroup.style.opacity = String(opacity);
    } else {
      if (screenOverlay) screenOverlay.style.opacity = String(opacity);
    }
  }

  function setTint(opacity) {
    if (tintEl) tintEl.style.opacity = String(opacity);
  }

  function doFlash() {
    var c = cfg();
    if (!c.enabled) return;

    // Ensure the right elements exist
    if (c.mode === 'board') {
      createBoardRects();
      syncBoardGeometry();
    } else {
      ensureScreenOverlay();
      applyScreenPosition();
    }

    var peak = c.mode === 'board' ? c.intensity * 0.18 : c.intensity * 1.0;
    var tintPeak = c.boardTint ? c.tintStrength * 0.05 : 0;

    // Primary flash
    setFlash(peak);
    setTint(tintPeak);
    playThunder(80 + Math.floor(Math.random() * 150));

    // Primary off after 80ms
    setTimeout(function() {
      setFlash(0);
      setTint(0);

      // Secondary flash after 70ms gap
      setTimeout(function() {
        setFlash(peak * 0.7);
        setTint(tintPeak * 0.7);
        setTimeout(function() {
          setFlash(0);
          setTint(0);
        }, 70);
      }, 70);

      // 40% bonus flicker
      if (Math.random() < 0.4) {
        setTimeout(function() {
          setFlash(peak * 0.4);
          setTint(tintPeak * 0.3);
          setTimeout(function() {
            setFlash(0);
            setTint(0);
          }, 50);
        }, 400 + Math.floor(Math.random() * 200));
      }
    }, 80);
  }

  // ═══════════════════════════════════════════════════════
  // TIMER
  // ═══════════════════════════════════════════════════════
  function scheduleNext() {
    var c = cfg();
    if (!c.enabled) { timerId = null; return; }
    var delay = c.freqMin + Math.random() * (c.freqMax - c.freqMin);
    timerId = setTimeout(function() { doFlash(); scheduleNext(); }, delay);
  }

  function restart() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    setFlash(0);
    setTint(0);

    var c = cfg();
    // Ensure elements for current mode
    if (c.mode === 'board') {
      createBoardRects();
    } else {
      ensureScreenOverlay();
      applyScreenPosition();
    }

    if (c.enabled) scheduleNext();
  }

  // ── Public API ──
  window._lightningRestart = restart;

  // ── Self-start ──
  if (document.readyState === 'complete') {
    restart();
  } else {
    window.addEventListener('load', restart);
  }
})();
