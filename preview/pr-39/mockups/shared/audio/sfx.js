/**
 * sfx.js — Shared SFX module for all mockup phases.
 *
 * Provides:
 *   playSfx(name, opts)    — play a named sound effect
 *   playStacked(name, count, opts) — play multiple with smart staggering
 *   sfxEnabled / toggleSfx — global mute control
 *
 * Volume levels are pre-normalized to -1dB peak. JS volumes are relative:
 *   - Dice roll:     0.35  (background texture, not jarring)
 *   - Save failed:   0.30  (impactful but not deafening)
 *   - Score tick:     0.25  (subtle UI feedback)
 *   - Weapon fire:    0.25  (layered with dice, keep moderate)
 *   - Weapon melee:   0.25
 *
 * Smart stacking: for N simultaneous sounds, each instance is offset
 * by staggerMs and volume reduced by diminishing factor to avoid clipping.
 */

// ── Asset path (resolved relative to this module, works from any page) ──
const SFX_BASE = new URL('./sfx/', import.meta.url).href;

// ── Sound registry ──
const SOUNDS = {
  'dice-roll':        { file: 'dice-roll.mp3',       vol: 0.35 },
  'save-failed':      { file: 'dice-fail.mp3',       vol: 0.30 },
  'score-tick':       { file: 'ui-score.mp3',        vol: 0.25 },
  'weapon-bolter':    { file: 'weapon-bolter-v2.mp3', vol: 0.25 },
  'weapon-poweraxe':  { file: 'weapon-poweraxe.mp3', vol: 0.25 },
};

// ── Pre-loaded audio pool (3 instances per sound for overlap) ──
const POOL_SIZE = 4;
const pools = {};
let _enabled = true;

function initPool(name) {
  if (pools[name]) return pools[name];
  const info = SOUNDS[name];
  if (!info) { console.warn('[sfx] Unknown sound:', name); return null; }
  const instances = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = new Audio(SFX_BASE + info.file);
    a.preload = 'auto';
    a.volume = info.vol;
    instances.push(a);
  }
  pools[name] = { instances, nextIdx: 0, info };
  return pools[name];
}

// Pre-init all pools on module load
Object.keys(SOUNDS).forEach(initPool);

/**
 * Play a single SFX instance.
 * @param {string} name - Sound name from SOUNDS registry
 * @param {object} [opts]
 * @param {number} [opts.volume] - Override volume (0-1)
 * @param {number} [opts.delay]  - Delay in ms before playing
 */
export function playSfx(name, opts) {
  if (!_enabled) return;
  const pool = pools[name] || initPool(name);
  if (!pool) return;

  const vol = (opts && opts.volume !== undefined) ? opts.volume : pool.info.vol;
  const delay = (opts && opts.delay) || 0;

  const play = function() {
    const audio = pool.instances[pool.nextIdx];
    pool.nextIdx = (pool.nextIdx + 1) % POOL_SIZE;
    audio.volume = Math.max(0, Math.min(1, vol));
    audio.currentTime = 0;
    audio.play().catch(function() {});
  };

  if (delay > 0) setTimeout(play, delay);
  else play();
}

/**
 * Play multiple staggered instances of the same SFX (smart stacking).
 * Used for: multiple save failures, multiple weapon shots.
 *
 * Strategy:
 *   - 1 sound: play at full volume
 *   - 2-3: stagger 80ms, each -20% volume
 *   - 4+: play 3 staggered (capped), diminishing volume
 *
 * @param {string} name
 * @param {number} count - How many logical instances
 * @param {object} [opts]
 * @param {number} [opts.staggerMs] - Ms between each (default 80)
 * @param {number} [opts.baseVolume] - Override base volume
 */
export function playStacked(name, count, opts) {
  if (!_enabled || count <= 0) return;
  const staggerMs = (opts && opts.staggerMs) || 80;
  const baseVol = (opts && opts.baseVolume) || (SOUNDS[name] && SOUNDS[name].vol) || 0.3;

  // Cap at 3 actual audio instances to avoid cacophony
  var actual = Math.min(count, 3);
  for (var i = 0; i < actual; i++) {
    // Diminish volume: 100%, 75%, 55%
    var dimFactor = 1 / (1 + i * 0.4);
    playSfx(name, {
      volume: baseVol * dimFactor,
      delay: i * staggerMs
    });
  }
}

/** Check if SFX are enabled */
export function isSfxEnabled() { return _enabled; }

/** Toggle SFX on/off */
export function toggleSfx(on) {
  _enabled = (on !== undefined) ? !!on : !_enabled;
  return _enabled;
}

/**
 * Convenience: play dice roll SFX.
 * Call this when any "Click to roll" CTA is clicked.
 */
export function playDiceRoll() {
  playSfx('dice-roll');
}

/**
 * Convenience: play weapon fire SFX for shooting phase.
 * @param {number} attacks - Number of attacks (for smart stacking)
 */
export function playWeaponFire(attacks) {
  if (attacks <= 1) {
    playSfx('weapon-bolter');
  } else {
    playStacked('weapon-bolter', attacks, { staggerMs: 60 });
  }
}

/**
 * Convenience: play melee weapon SFX for fight phase.
 * @param {number} strikes - Number of strikes (for smart stacking)
 */
export function playMeleeStrike(strikes) {
  if (strikes <= 1) {
    playSfx('weapon-poweraxe');
  } else {
    playStacked('weapon-poweraxe', strikes, { staggerMs: 100 });
  }
}

/**
 * Convenience: play save failed SFX.
 * @param {number} failures - Number of failed saves (for smart stacking)
 */
export function playSaveFailed(failures) {
  if (failures <= 0) return;
  playStacked('save-failed', failures, { staggerMs: 100 });
}

/**
 * Convenience: play score tick SFX (VP/CP increment).
 */
export function playScoreTick() {
  playSfx('score-tick');
}
