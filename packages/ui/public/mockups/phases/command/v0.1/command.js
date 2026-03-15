/* command.js — Command phase interaction (ES module)
 * Battle-shock tests, CP gain, VP scoring.
 *
 * Flow: battle-shock tests → CP gain (+1) → VP scoring → done
 *
 * WH40K 10th Edition Command Phase order:
 *   1. Battle-shock tests (below-half friendly units roll 2D6 vs Ld)
 *   2. Gain 1 CP
 *   3. Score VP (standard method: 5 for 1+, 5 for 2+, 5 for more than opponent)
 */

import { simState, PX_PER_INCH, callbacks } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';

const ACTIVE = 'imp';

const state = {
  phase: 'battle-shock',  // 'battle-shock' | 'cp-gain' | 'vp-scoring' | 'done'
  unitsNeedingTest: [],    // unit IDs below half strength (FRIENDLY ONLY)
  testedUnits: new Set(),
  battleshockedUnits: new Set(),
  seed: (Date.now() ^ 0x5f3759df) >>> 0,
  vpImp: 10,
  cpVal: 4
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ── Seeded RNG (no Math.random) ─────────────────────────
function rng() { state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
function d6() { return 1 + Math.floor(rng() * 6); }

// ── Helpers ─────────────────────────────────────────────
function getUnit(uid) { return simState.units.find(u => u.id === uid); }
function setStatus(msg, cls) {
  const el = $('#move-mode-label');
  if (!el) return;
  el.textContent = msg || '';
  el.className = cls || '';
}

function getLeadership(uid) {
  const u = UNITS[uid];
  if (!u) return 7;
  const ld = u.stats.Ld;
  if (typeof ld === 'number') return ld;
  const n = parseInt(String(ld || '').replace(/[^0-9]/g, ''));
  return n || 7;
}

function getStartingStrength(uid) {
  const su = getUnit(uid);
  if (su && su.startingStrength) return su.startingStrength;
  const defaults = {
    'assault-intercessors': 5,
    'primaris-lieutenant': 1,
    'intercessor-squad-a': 5,
    'hellblasters': 5,
    'redemptor-dreadnought': 1,
    'boss-nob': 1,
    'nobz-mob': 3,
    'mekboy': 1,
    'gretchin': 3,
    'boyz-mob': 10
  };
  return defaults[uid] || (su ? su.models.length : 1);
}

function isBelowHalf(uid) {
  const u = getUnit(uid);
  if (!u) return false;
  const starting = getStartingStrength(uid);
  return u.models.length < Math.ceil(starting / 2);
}

// ── Delay helper ────────────────────────────────────────
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Score tick animation (v4 design system) ─────────────
function animateScoreTick(el, newVal) {
  return new Promise(resolve => {
    el.classList.add('ticking-out');
    setTimeout(() => {
      el.textContent = newVal;
      el.classList.remove('ticking-out');
      el.classList.add('ticking-in');
      setTimeout(() => {
        el.classList.remove('ticking-in');
        resolve();
      }, 500);
    }, 200);
  });
}

// ── Announce overlay (inside #battlefield, aligned with phase header) ──
function showAnnounce(id, text, cls, duration) {
  return new Promise(resolve => {
    const el = document.getElementById(id);
    if (!el) { resolve(); return; }
    el.innerHTML = '<div class="cmd-announce-text ' + (cls || '') + '">' + text + '</div>';
    el.classList.remove('hidden');
    setTimeout(() => {
      el.classList.add('hidden');
      resolve();
    }, duration || 1500);
  });
}

// ── Roster pill management ──────────────────────────────
function setPill(uid, text, cls) {
  const row = $(`.rail-unit[data-unit="${uid}"]`);
  if (!row) return;
  let pill = row.querySelector('.roster-state-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'roster-state-pill';
    row.appendChild(pill);
  }
  pill.textContent = text;
  pill.className = 'roster-state-pill ' + (cls || '');
  // Force display since shared CSS hides pills by default
  pill.style.display = 'inline-flex';
}

// ── Hull painting ───────────────────────────────────────
function paintHulls() {
  $$('#layer-hulls .unit-hull').forEach(el => {
    el.classList.remove('cmd-needs-test', 'cmd-battleshocked');
  });

  if (state.phase === 'battle-shock') {
    state.unitsNeedingTest.forEach(uid => {
      if (state.testedUnits.has(uid)) return;
      const hull = $(`#layer-hulls .unit-hull[data-unit-id="${uid}"]`);
      if (hull) hull.classList.add('cmd-needs-test');
    });
  }

  state.battleshockedUnits.forEach(uid => {
    const hull = $(`#layer-hulls .unit-hull[data-unit-id="${uid}"]`);
    if (hull) hull.classList.add('cmd-battleshocked');
  });

  // Also add battleshocked visual to model tokens
  $$('#layer-models .model-base').forEach(g => {
    const uid = g.dataset.unitId;
    g.classList.toggle('cmd-bs-token', state.battleshockedUnits.has(uid));
  });
}

// ── Banner management ───────────────────────────────────
function updateBanner(text) {
  const banner = document.getElementById('bs-banner');
  if (!banner) return;
  if (text) {
    banner.textContent = text;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// ── Battle-shock roll overlay ───────────────────────────
// Uses SHARED overlay/dice classes from overlays.css + phase-states.css
// Matches the advance-roll UX from move/v0.23 exactly.
function showBattleShockRoll(uid) {
  return new Promise(resolve => {
    const u = UNITS[uid];
    if (!u) { resolve(); return; }
    const ld = getLeadership(uid);
    const overlay = $('#roll-overlay');
    if (!overlay) { resolve(); return; }

    overlay.innerHTML =
      '<div class="overlay-title">BATTLE-SHOCK TEST — ' + u.name + '</div>' +
      '<div class="dice-summary">Leadership ' + ld + '+ · Roll 2D6 ≥ ' + ld + ' to pass</div>' +
      '<div class="dice-row">' +
        '<span class="die pre-roll">\u2013</span>' +
        '<span class="die pre-roll">\u2013</span>' +
      '</div>' +
      '<div class="dice-summary" id="bs-result-summary"></div>' +
      '<button class="roll-cta" id="bs-roll-btn">Click to roll</button>';
    overlay.classList.remove('hidden');

    // Pin overlay position (matching advance-dice.js)
    overlay.style.left = '50%';
    overlay.style.top = 'auto';
    overlay.style.bottom = '68px';

    const rollBtn = document.getElementById('bs-roll-btn');
    rollBtn.addEventListener('click', function onRoll() {
      rollBtn.removeEventListener('click', onRoll);
      rollBtn.disabled = true;
      rollBtn.textContent = 'Rolling\u2026';

      const v1 = d6(), v2 = d6();
      const total = v1 + v2;
      const passed = total >= ld;

      const dice = overlay.querySelectorAll('.die');
      const d1El = dice[0], d2El = dice[1];

      // Animate dice — matching shared .rolling → result pattern
      setTimeout(() => {
        if (d1El) {
          d1El.classList.remove('pre-roll');
          d1El.classList.add('rolling');
          setTimeout(() => {
            d1El.classList.remove('rolling');
            d1El.textContent = v1;
            d1El.classList.add(passed ? 'success' : 'fail');
          }, 80);
        }
      }, 100);

      setTimeout(() => {
        if (d2El) {
          d2El.classList.remove('pre-roll');
          d2El.classList.add('rolling');
          setTimeout(() => {
            d2El.classList.remove('rolling');
            d2El.textContent = v2;
            d2El.classList.add(passed ? 'success' : 'fail');
          }, 80);
        }
      }, 250);

      // Show result after dice settle
      setTimeout(() => {
        const resultEl = document.getElementById('bs-result-summary');
        if (resultEl) {
          resultEl.innerHTML = '<span class="' + (passed ? 'hi' : 'lo') + '">' +
            total + ' — ' + (passed ? 'PASSED' : 'BATTLE-SHOCKED') + '</span>';
        }

        // Update unit state
        state.testedUnits.add(uid);
        if (!passed) {
          state.battleshockedUnits.add(uid);
          setPill(uid, 'SHOCKED', 'shocked');
        } else {
          setPill(uid, 'PASSED', 'bs-passed');
        }
        paintHulls();

        // Update banner
        const remaining = state.unitsNeedingTest.filter(id => !state.testedUnits.has(id));
        if (remaining.length > 0) {
          updateBanner('⚡ ' + remaining.length + ' UNIT' + (remaining.length > 1 ? 'S' : '') + ' NEED BATTLE-SHOCK TESTS');
        } else {
          updateBanner(null);
        }

        // Replace button with OK
        rollBtn.textContent = 'OK';
        rollBtn.disabled = false;
        rollBtn.onclick = () => {
          overlay.classList.add('hidden');
          overlay.innerHTML = '';
          checkBattleShockComplete().then(resolve);
        };
      }, 600);
    }, { once: true });
  });
}

// ── Check if all battle-shock tests done ────────────────
async function checkBattleShockComplete() {
  const remaining = state.unitsNeedingTest.filter(uid => !state.testedUnits.has(uid));
  if (remaining.length > 0) {
    setStatus('— SELECT UNIT TO TEST (' + remaining.length + ' remaining) —', 'cmd-battle-shock');
    return;
  }
  // All tested — advance to CP gain
  updateBanner(null);
  await wait(500);
  await enterCpGain();
}

// ── BATTLE-SHOCK PHASE ──────────────────────────────────
function enterBattleShock() {
  state.phase = 'battle-shock';

  // Scan for FRIENDLY units below half strength only
  state.unitsNeedingTest = [];
  simState.units.forEach(u => {
    if (u.faction !== ACTIVE) return;  // ← FRIENDLY ONLY
    if (isBelowHalf(u.id)) {
      state.unitsNeedingTest.push(u.id);
    }
  });

  if (state.unitsNeedingTest.length === 0) {
    updateBanner(null);
    const flash = document.createElement('div');
    flash.className = 'cmd-flash-msg';
    flash.textContent = 'NO BATTLE-SHOCK TESTS NEEDED';
    document.body.appendChild(flash);
    setStatus('No Battle-shock tests needed', 'cmd-battle-shock');
    setTimeout(() => {
      flash.remove();
      enterCpGain();
    }, 1500);
    return;
  }

  // Update subtitle
  const subtitle = $('.phase-subtitle');
  if (subtitle) subtitle.textContent = state.unitsNeedingTest.length + ' units need Battle-shock tests';

  setStatus('— SELECT UNIT TO TEST —', 'cmd-battle-shock');

  // Show banner below phase header
  updateBanner('⚡ ' + state.unitsNeedingTest.length + ' UNITS NEED BATTLE-SHOCK TESTS');

  // Mark units with pills and hull highlights
  state.unitsNeedingTest.forEach(uid => {
    setPill(uid, 'NEEDS TEST', 'needs-test');
  });
  paintHulls();
}

// ── CP GAIN PHASE ───────────────────────────────────────
async function enterCpGain() {
  state.phase = 'cp-gain';
  setStatus('+1 COMMAND POINT', 'cmd-cp-gain');

  const subtitle = $('.phase-subtitle');
  if (subtitle) subtitle.textContent = 'CP Gain · +1 Command Point';

  // Animate CP counter tick
  state.cpVal += 1;
  const cpEl = document.getElementById('cp-val');
  if (cpEl) {
    await animateScoreTick(cpEl, state.cpVal);
  }

  // Announce (inside battlefield, aligned with board center)
  await showAnnounce('cp-announce', '+1 COMMAND POINT', 'cp', 1500);

  // Auto-advance to VP scoring
  await wait(300);
  await enterVpScoring();
}

// ── VP SCORING PHASE ────────────────────────────────────
// WH40K 10th Edition Standard Method:
//   5 VP for holding 1+ objectives
//   5 VP for holding 2+ objectives
//   5 VP for holding MORE than opponent
//   Max 15 VP per turn
async function enterVpScoring() {
  state.phase = 'vp-scoring';
  setStatus('SCORING OBJECTIVES...', 'cmd-vp-scoring');

  const subtitle = $('.phase-subtitle');
  if (subtitle) subtitle.textContent = 'VP Scoring · Checking objectives';

  // All 5 objectives
  const ALL_OBJECTIVES = [
    { id: null, x: 360, y: 72,  label: 'OBJ 01' },   // neutral top
    { id: 'obj-02', x: 120, y: 264, label: 'OBJ 02' }, // controlled (imp)
    { id: 'obj-03', x: 360, y: 264, label: 'OBJ 03' }, // neutral center
    { id: null, x: 600, y: 264, label: 'OBJ 04' },      // enemy (ork)
    { id: null, x: 360, y: 456, label: 'OBJ 05' }       // neutral bottom
  ];

  // Check which objectives each faction holds (nearest unit within 3")
  function countHeld(faction) {
    let count = 0;
    for (const obj of ALL_OBJECTIVES) {
      for (const unit of simState.units) {
        if (unit.faction !== faction) continue;
        // Battle-shocked units can't hold objectives
        if (state.battleshockedUnits.has(unit.id)) continue;
        let holds = false;
        for (const model of unit.models) {
          const dx = model.x - obj.x;
          const dy = model.y - obj.y;
          const dist = Math.sqrt(dx * dx + dy * dy) - (model.r || 8);
          if (dist <= 3 * PX_PER_INCH) { holds = true; break; }
        }
        if (holds) { count++; break; }
      }
    }
    return count;
  }

  const impHeld = countHeld('imp');
  const orkHeld = countHeld('ork');

  // Standard method scoring
  let vpGained = 0;
  const scoringBreakdown = [];

  if (impHeld >= 1) {
    vpGained += 5;
    scoringBreakdown.push('1+ OBJ: +5 VP');
  }
  if (impHeld >= 2) {
    vpGained += 5;
    scoringBreakdown.push('2+ OBJ: +5 VP');
  }
  if (impHeld > orkHeld) {
    vpGained += 5;
    scoringBreakdown.push('MORE THAN OPPONENT: +5 VP');
  }

  if (vpGained === 0) {
    setStatus('NO OBJECTIVES HELD', 'cmd-vp-scoring');
    await wait(1000);
    await enterDone();
    return;
  }

  // Flash held objectives
  for (const obj of ALL_OBJECTIVES) {
    if (!obj.id) continue;
    // Check if this specific obj is held by imp
    let held = false;
    for (const unit of simState.units) {
      if (unit.faction !== 'imp') continue;
      if (state.battleshockedUnits.has(unit.id)) continue;
      for (const model of unit.models) {
        const dx = model.x - obj.x;
        const dy = model.y - obj.y;
        const dist = Math.sqrt(dx * dx + dy * dy) - (model.r || 8);
        if (dist <= 3 * PX_PER_INCH) { held = true; break; }
      }
      if (held) break;
    }
    if (held) {
      const el = document.getElementById(obj.id);
      if (el) {
        el.classList.add('obj-scoring');
        await wait(600);
      }
    }
  }

  // Animate VP score tick
  const vpEl = document.getElementById('vp-imp');
  if (vpEl) {
    state.vpImp += vpGained;
    await animateScoreTick(vpEl, state.vpImp);
  }

  // Build summary text
  const summaryText = '+' + vpGained + ' VP — ' + impHeld + ' OBJ HELD' +
    (impHeld > orkHeld ? ' (MORE THAN OPPONENT)' : '');

  // Announce
  await showAnnounce('vp-announce', summaryText, 'vp', 2000);
  setStatus(summaryText, 'cmd-vp-scoring');

  await wait(500);
  await enterDone();
}

// ── DONE ────────────────────────────────────────────────
async function enterDone() {
  state.phase = 'done';
  setStatus('COMMAND PHASE COMPLETE', 'cmd-done');

  const subtitle = $('.phase-subtitle');
  if (subtitle) subtitle.textContent = 'Command Phase complete — advance to Movement';

  // Enable end button
  const endBtn = document.getElementById('btn-end-cmd');
  if (endBtn) endBtn.disabled = false;
}

// ── Drag interceptor (no movement in command phase) ─────
function installDragInterceptor() {
  const svg = document.getElementById('bf-svg');
  if (!svg) return;

  // Capture phase mousedown to prevent drag initiation
  svg.addEventListener('mousedown', (e) => {
    // Allow click-to-select (handled by shared code) but block drag
    // We'll nullify drag state on the next frame
    requestAnimationFrame(() => {
      if (simState.drag) {
        simState.drag = null;
        simState.anim.liftUnitId = null;
        simState.anim.liftModelId = null;
      }
    });
  }, true); // capture phase — runs before shared handler
}

// ── Unit selection handler for battle-shock ─────────────
function wrappedSelectUnit(uid) {
  // Always allow viewing units via card
  baseSelectUnit(uid);

  // During battle-shock, clicking a needs-test unit triggers roll
  if (state.phase === 'battle-shock' &&
      state.unitsNeedingTest.includes(uid) &&
      !state.testedUnits.has(uid)) {
    showBattleShockRoll(uid);
  }
}

// ── Init ────────────────────────────────────────────────
export function initCommand() {
  // Override selectUnit callback
  callbacks.selectUnit = wrappedSelectUnit;

  // Wire roster clicks to our handler
  $$('.rail-unit[data-unit]').forEach(row => {
    row.addEventListener('click', () => {
      const uid = row.dataset.unit;
      if (uid) wrappedSelectUnit(uid);
    });
  });

  // Create battle-shock banner inside #phase-header
  const phaseHeader = document.getElementById('phase-header');
  if (phaseHeader && !document.getElementById('bs-banner')) {
    const banner = document.createElement('div');
    banner.id = 'bs-banner';
    banner.style.display = 'none';
    phaseHeader.appendChild(banner);
  }

  // Wire end button
  const endBtn = document.getElementById('btn-end-cmd');
  if (endBtn) {
    endBtn.addEventListener('click', () => {
      if (state.phase !== 'done') return;
      const cmdItem = $('.ph-item.active');
      if (cmdItem) {
        cmdItem.classList.remove('active');
        cmdItem.classList.add('done');
      }
      endBtn.disabled = true;
      setStatus('COMMAND PHASE ENDED', 'cmd-done');
    });
  }

  // Install drag interceptor — no unit movement in command phase
  installDragInterceptor();

  // Re-apply battleshocked token highlights after renderModels rebuilds DOM
  callbacks.afterRender = () => {
    if (state.battleshockedUnits.size > 0) {
      $$('#layer-models .model-base').forEach(g => {
        const uid = g.dataset.unitId;
        g.classList.toggle('cmd-bs-token', state.battleshockedUnits.has(uid));
      });
    }
  };

  // Start the state machine
  enterBattleShock();
}
