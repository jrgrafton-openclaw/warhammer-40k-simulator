/* command.js — Command phase interaction (ES module)
 * Battle-shock tests, CP gain, VP scoring.
 *
 * Flow: battle-shock tests → CP gain (+1) → VP scoring → done
 */

import { simState, PX_PER_INCH, callbacks } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';

const ACTIVE = 'imp';

const state = {
  phase: 'battle-shock',  // 'battle-shock' | 'cp-gain' | 'vp-scoring' | 'done'
  unitsNeedingTest: [],    // unit IDs below half strength
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
  // Check simState unit for explicit startingStrength, else fall back to UNITS data
  const su = getUnit(uid);
  if (su && su.startingStrength) return su.startingStrength;
  // Heuristic: use model count in fight/v0.1 scene as "full strength"
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

// ── Score tick animation ────────────────────────────────
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

// ── Center-screen announce ──────────────────────────────
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
}

function removePill(uid) {
  const row = $(`.rail-unit[data-unit="${uid}"]`);
  if (!row) return;
  const pill = row.querySelector('.roster-state-pill');
  if (pill) pill.remove();
}

// ── Hull painting ───────────────────────────────────────
function paintHulls() {
  $$('.unit-hull').forEach(el => {
    el.classList.remove('cmd-needs-test', 'cmd-battleshocked');
  });

  if (state.phase === 'battle-shock') {
    state.unitsNeedingTest.forEach(uid => {
      if (state.testedUnits.has(uid)) return;
      const hull = $(`.unit-hull[data-unit="${uid}"]`);
      if (hull) hull.classList.add('cmd-needs-test');
    });
  }

  state.battleshockedUnits.forEach(uid => {
    const hull = $(`.unit-hull[data-unit="${uid}"]`);
    if (hull) hull.classList.add('cmd-battleshocked');
  });
}

// ── Battle-shock roll overlay ───────────────────────────
function showBattleShockRoll(uid) {
  return new Promise(resolve => {
    const u = UNITS[uid];
    if (!u) { resolve(); return; }
    const ld = getLeadership(uid);
    const overlay = $('#roll-overlay');
    if (!overlay) { resolve(); return; }

    overlay.innerHTML = `
      <div class="bs-roll-title">BATTLE-SHOCK TEST — ${u.name}</div>
      <div class="bs-roll-info">Leadership ${ld}+ &nbsp;·&nbsp; Roll 2D6 ≥ ${ld} to pass</div>
      <div class="bs-dice-row">
        <div class="bs-die" id="bs-d1">?</div>
        <div class="bs-die" id="bs-d2">?</div>
      </div>
      <div class="bs-roll-result" id="bs-result"></div>
      <button class="bs-roll-btn" id="bs-roll-btn">CLICK TO ROLL</button>
    `;
    overlay.classList.remove('hidden');

    const rollBtn = document.getElementById('bs-roll-btn');
    rollBtn.addEventListener('click', function onRoll() {
      rollBtn.removeEventListener('click', onRoll);
      rollBtn.style.display = 'none';

      const v1 = d6(), v2 = d6();
      const total = v1 + v2;
      const passed = total >= ld;

      const d1El = document.getElementById('bs-d1');
      const d2El = document.getElementById('bs-d2');
      d1El.textContent = v1;
      d1El.classList.add('rolled');
      setTimeout(() => {
        d2El.textContent = v2;
        d2El.classList.add('rolled');
      }, 150);

      setTimeout(() => {
        // Color dice
        const cls = passed ? 'success' : 'fail';
        d1El.classList.add(cls);
        d2El.classList.add(cls);

        // Show result
        const resultEl = document.getElementById('bs-result');
        resultEl.textContent = total + ' — ' + (passed ? 'PASSED' : 'FAILED / BATTLE-SHOCKED');
        resultEl.classList.add(passed ? 'passed' : 'failed');

        // Update unit state
        state.testedUnits.add(uid);
        if (!passed) {
          state.battleshockedUnits.add(uid);
          setPill(uid, 'SHOCKED', 'shocked');
        } else {
          setPill(uid, 'PASSED', 'bs-passed');
        }
        paintHulls();

        // OK button
        const okBtn = document.createElement('button');
        okBtn.className = 'bs-roll-btn';
        okBtn.textContent = 'OK';
        okBtn.style.marginTop = '12px';
        overlay.appendChild(okBtn);

        okBtn.addEventListener('click', () => {
          overlay.classList.add('hidden');
          overlay.innerHTML = '';
          checkBattleShockComplete().then(resolve);
        });
      }, 500);
    });
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
  await wait(500);
  await enterCpGain();
}

// ── BATTLE-SHOCK PHASE ──────────────────────────────────
function enterBattleShock() {
  state.phase = 'battle-shock';

  // Scan for units below half strength
  state.unitsNeedingTest = [];
  simState.units.forEach(u => {
    if (isBelowHalf(u.id)) {
      state.unitsNeedingTest.push(u.id);
    }
  });

  if (state.unitsNeedingTest.length === 0) {
    // No tests needed — flash message and skip
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

  // Center-screen announce
  await showAnnounce('cp-announce', '+1 COMMAND POINT', 'cp', 1500);

  // Auto-advance to VP scoring
  await wait(300);
  await enterVpScoring();
}

// ── VP SCORING PHASE ────────────────────────────────────
async function enterVpScoring() {
  state.phase = 'vp-scoring';
  setStatus('SCORING OBJECTIVES...', 'cmd-vp-scoring');

  const subtitle = $('.phase-subtitle');
  if (subtitle) subtitle.textContent = 'VP Scoring · Checking objectives';

  // Determine held objectives
  // OBJ 02 is at ~120, 264 and OBJ 03 at ~360, 264 in SVG coords
  // Imperium units are positioned near both — check which objectives have nearest Imperium unit within 3" (36px)
  const objectives = [
    { id: 'obj-02', x: 120, y: 264, label: 'OBJ 02' },
    { id: 'obj-03', x: 360, y: 264, label: 'OBJ 03' }
  ];

  const heldObjectives = [];
  const VP_PER_OBJ = 4;

  for (const obj of objectives) {
    let held = false;
    for (const unit of simState.units) {
      if (unit.faction !== 'imp') continue;
      for (const model of unit.models) {
        const dx = model.x - obj.x;
        const dy = model.y - obj.y;
        const dist = Math.sqrt(dx * dx + dy * dy) - (model.r || 8);
        if (dist <= 3 * PX_PER_INCH) { // 3" = 36px
          held = true;
          break;
        }
      }
      if (held) break;
    }
    if (held) heldObjectives.push(obj);
  }

  const totalVP = heldObjectives.length * VP_PER_OBJ;

  if (heldObjectives.length === 0) {
    setStatus('NO OBJECTIVES HELD', 'cmd-vp-scoring');
    await wait(1000);
    await enterDone();
    return;
  }

  // Flash each held objective
  for (const obj of heldObjectives) {
    const el = document.getElementById(obj.id);
    if (el) {
      el.classList.add('obj-scoring');
      await wait(600);
    }
  }

  // Animate VP ticks sequentially
  const vpEl = document.getElementById('vp-imp');
  if (vpEl) {
    for (let i = 0; i < heldObjectives.length; i++) {
      state.vpImp += VP_PER_OBJ;
      await animateScoreTick(vpEl, state.vpImp);
      await wait(200);
    }
  }

  // Show center announce
  await showAnnounce('vp-announce',
    '+' + totalVP + ' VP — ' + heldObjectives.length + ' OBJECTIVES HELD', 'vp', 1800);

  setStatus('+' + totalVP + ' VP — ' + heldObjectives.length + ' OBJECTIVES HELD', 'cmd-vp-scoring');

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

  // Wire end button
  const endBtn = document.getElementById('btn-end-cmd');
  if (endBtn) {
    endBtn.addEventListener('click', () => {
      if (state.phase !== 'done') return;
      // Mark CMD as done in phase row
      const cmdItem = $('.ph-item.active');
      if (cmdItem) {
        cmdItem.classList.remove('active');
        cmdItem.classList.add('done');
      }
      endBtn.disabled = true;
      setStatus('COMMAND PHASE ENDED', 'cmd-done');
    });
  }

  // Start the state machine
  enterBattleShock();
}
