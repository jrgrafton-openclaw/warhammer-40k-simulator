/**
 * explosion-sfx.js — Distant artillery SFX triggered by explosion flashes.
 *
 * Listens for 'explosion-flash' custom events dispatched by fog-fx.js.
 * Plays a random distant artillery variant at the configured volume.
 * Controlled via debug menu globals:
 *   window._explosionSfxEnabled  (bool, default true)
 *   window._explosionSfxVolume   (0-1, default 0.15)
 */
(function initExplosionSfx() {
  var VARIANTS = [
    '../../../shared/assets/sfx/explosion-distant-1.mp3',
    '../../../shared/assets/sfx/explosion-distant-2.mp3',
    '../../../shared/assets/sfx/explosion-distant-3.mp3',
    '../../../shared/assets/sfx/explosion-distant-4.mp3'
  ];

  // Pre-load all variants into Audio elements
  var pools = VARIANTS.map(function(src) {
    // Pool of 3 per variant so overlapping plays don't cut each other off
    var pool = [];
    for (var i = 0; i < 3; i++) {
      var audio = new Audio(src);
      audio.preload = 'auto';
      pool.push(audio);
    }
    return pool;
  });

  var lastVariant = -1;
  var MIN_INTERVAL_MS = 800; // Don't spam — minimum gap between SFX
  var lastPlayTime = 0;

  function play() {
    if (window._explosionSfxEnabled === false) return;

    var now = performance.now();
    if (now - lastPlayTime < MIN_INTERVAL_MS) return;
    lastPlayTime = now;

    // Pick a random variant (avoid immediate repeat)
    var idx;
    do {
      idx = Math.floor(Math.random() * VARIANTS.length);
    } while (idx === lastVariant && VARIANTS.length > 1);
    lastVariant = idx;

    var vol = window._explosionSfxVolume !== undefined ? window._explosionSfxVolume : 0.15;

    // Find a free audio element in the pool
    var pool = pools[idx];
    var audio = null;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].paused || pool[i].ended) {
        audio = pool[i];
        break;
      }
    }
    if (!audio) {
      // All busy — reuse the first one
      audio = pool[0];
      audio.currentTime = 0;
    }

    audio.volume = Math.max(0, Math.min(1, vol));
    audio.currentTime = 0;
    audio.play().catch(function() { /* user hasn't interacted yet — ignore */ });
  }

  window.addEventListener('explosion-flash', play);
})();
