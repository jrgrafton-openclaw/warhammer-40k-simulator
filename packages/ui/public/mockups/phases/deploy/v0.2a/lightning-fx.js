/**
 * lightning-fx.js — Vignette-edge lightning flashes for v0.2a.
 *
 * Creates blue-white lightning rects INSIDE the existing vignette SVG
 * (#bf-svg-vignette), matching the vignette rect geometry exactly.
 * This means the flash inherits the vignette's noise filter, coordinate
 * space, and zoom/pan transforms — it always lights up the right edges.
 *
 * Reads config from window globals set by debug-menu.js.
 */
(function initLightningFx() {
  var NS = 'http://www.w3.org/2000/svg';
  var FLASH_COLOR = '180,210,240'; // Cool blue-white

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

  // ── Lightning SVG group (created after vignette SVG exists) ──
  var lightningGroup = null;
  var tintEl = document.getElementById('lightning-board-tint');

  function createLightningRects() {
    var vigSvg = document.getElementById('bf-svg-vignette');
    if (!vigSvg || lightningGroup) return;

    var defs = vigSvg.querySelector('defs');
    if (!defs) return;

    // Create lightning-specific gradients (blue-white, same direction as vignette)
    var gradDefs = [
      { id: 'lt-grad-l', x1: '0', y1: '0', x2: '1', y2: '0' },
      { id: 'lt-grad-r', x1: '1', y1: '0', x2: '0', y2: '0' },
      { id: 'lt-grad-t', x1: '0', y1: '0', x2: '0', y2: '1' },
      { id: 'lt-grad-b', x1: '0', y1: '1', x2: '0', y2: '0' }
    ];
    gradDefs.forEach(function(g) {
      var lg = document.createElementNS(NS, 'linearGradient');
      lg.setAttribute('id', g.id);
      lg.setAttribute('x1', g.x1); lg.setAttribute('y1', g.y1);
      lg.setAttribute('x2', g.x2); lg.setAttribute('y2', g.y2);
      // Bright at edge, fade to transparent toward board center
      lg.innerHTML =
        '<stop offset="0%" stop-color="rgb(' + FLASH_COLOR + ')" stop-opacity="1"/>' +
        '<stop offset="40%" stop-color="rgb(' + FLASH_COLOR + ')" stop-opacity="0.3"/>' +
        '<stop offset="100%" stop-color="rgb(' + FLASH_COLOR + ')" stop-opacity="0"/>';
      defs.appendChild(lg);
    });

    // Create a group for lightning rects — sits on top of the vignette group
    lightningGroup = document.createElementNS(NS, 'g');
    lightningGroup.setAttribute('id', 'lightning-group');
    lightningGroup.setAttribute('pointer-events', 'none');
    lightningGroup.style.opacity = '0';
    // Apply the same noise filter as the vignette for organic edges
    lightningGroup.setAttribute('filter', 'url(#vig-noise)');

    // Read current vignette rect positions to match geometry exactly
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

  // Sync lightning rect geometry with vignette rects (debug menu may resize them)
  function syncGeometry() {
    if (!lightningGroup) return;
    var pairs = [
      { src: 'vig-rect-l', lt: 0 },
      { src: 'vig-rect-r', lt: 1 },
      { src: 'vig-rect-t', lt: 2 },
      { src: 'vig-rect-b', lt: 3 }
    ];
    var ltRects = lightningGroup.querySelectorAll('.lt-rect');
    pairs.forEach(function(p) {
      var srcRect = document.getElementById(p.src);
      var ltRect = ltRects[p.lt];
      if (!srcRect || !ltRect) return;
      ltRect.setAttribute('x', srcRect.getAttribute('x'));
      ltRect.setAttribute('y', srcRect.getAttribute('y'));
      ltRect.setAttribute('width', srcRect.getAttribute('width'));
      ltRect.setAttribute('height', srcRect.getAttribute('height'));
    });
  }

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

    var idx;
    do {
      idx = Math.floor(Math.random() * sfxClips.length);
    } while (idx === lastSfxIndex && sfxClips.length > 1);
    lastSfxIndex = idx;

    var clip = sfxClips[idx];
    clip.volume = Math.min(1, c.sfxVol * 0.2);
    clip.currentTime = 0;

    setTimeout(function() {
      clip.play().catch(function() {});
    }, delay);
  }

  // ── Flash animation ──
  var timerId = null;

  function setFlash(opacity) {
    if (lightningGroup) lightningGroup.style.opacity = String(opacity);
  }

  function setTint(opacity) {
    if (tintEl) tintEl.style.opacity = String(opacity);
  }

  function doFlash() {
    var c = cfg();
    if (!c.enabled || !lightningGroup) return;

    // Sync geometry in case debug menu changed vignette size
    syncGeometry();

    var peak = c.intensity * 0.18;
    var tintPeak = c.boardTint ? c.tintStrength * 0.05 : 0;

    // Primary flash
    setFlash(peak);
    setTint(tintPeak);

    // Thunder SFX with random delay
    playThunder(80 + Math.floor(Math.random() * 150));

    // Primary flash off after 80ms
    setTimeout(function() {
      setFlash(0);
      setTint(0);

      // Secondary flash after 70ms gap (70% intensity)
      setTimeout(function() {
        setFlash(peak * 0.7);
        setTint(tintPeak * 0.7);

        setTimeout(function() {
          setFlash(0);
          setTint(0);
        }, 70);
      }, 70);

      // 40% chance of bonus flicker 400-600ms later
      if (Math.random() < 0.4) {
        var flickerDelay = 400 + Math.floor(Math.random() * 200);
        setTimeout(function() {
          setFlash(peak * 0.4);
          setTint(tintPeak * 0.3);
          setTimeout(function() {
            setFlash(0);
            setTint(0);
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
    setFlash(0);
    setTint(0);
    // Ensure SVG rects exist
    createLightningRects();
    var c = cfg();
    if (c.enabled) scheduleNext();
  }

  // ── Public API ──
  window._lightningRestart = restart;

  // ── Self-start (wait for scene.js to create vignette SVG) ──
  if (document.readyState === 'complete') {
    restart();
  } else {
    window.addEventListener('load', restart);
  }
})();
