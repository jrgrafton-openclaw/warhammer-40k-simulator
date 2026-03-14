/* fight.js — Fight phase interaction (ES module)
 * Melee combat: pile-in, WS-based hit rolls, wound/save/damage, consolidation.
 */

import { simState, PX_PER_INCH, callbacks } from '../../../shared/state/store.js';
import { UNITS, KW_RULES, wgState, initAllTooltips, showTip, hideTip } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';
import { center, projectileAnchor, getModelRadius } from '../../../shared/lib/coord-helpers.js';

const ACTIVE = 'imp';

const state = {
  attackerId: null,
  targetId: null,
  hoveredTargetId: null,
  selectedProfileIx: 0,
  foughtUnits: new Set(),
  seed: (Date.now() ^ 0x5f3759df) >>> 0,
  pinnedPopupTargetId: null,
  pinnedRollTargetId: null,
  overlayRaf: null
};

window.__spentUnitIds = state.foughtUnits;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ── Seeded RNG (no Math.random) ─────────────────────────
function rng(){ state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
function d6(){ return 1 + Math.floor(rng() * 6); }

// ── Helpers ─────────────────────────────────────────────
function getUnit(uid){ return simState.units.find(u => u.id === uid); }
function isEnemy(uid){ const u = getUnit(uid); return u && u.faction !== ACTIVE; }
function setStatus(msg){ const el = $('#move-mode-label'); if (el) el.textContent = msg || ''; }
function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g, '')); return n || 7; }
function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
function damageValue(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return null; return Number(s) || 1; }
function pickDamage(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng() * 3); return Number(s) || 1; }

// ── Weapon Skill lookup ─────────────────────────────────
function getWeaponSkill(uid){
  return ({
    'assault-intercessors':3,
    'primaris-lieutenant':2,
    'intercessor-squad-a':3,
    'hellblasters':3,
    'redemptor-dreadnought':3,
    'boss-nob':2,
    'nobz-mob':3,
    'mekboy':3,
    'gretchin':5
  }[uid] || 4);
}

// ── Melee weapon profiles ───────────────────────────────
function getProfiles(uid){
  const u = UNITS[uid];
  if (!u) return [];
  let w = [].concat(u.weapons || []);
  const wg = wgState?.[uid] || {};
  (u.wargear || []).forEach((opt, i) => { if (wg[i] && opt.adds) w.push(opt.adds); });
  return w.filter(x => x.type === 'MELEE');
}

function keywordsFor(profile){
  return [].concat(profile?.keywords || profile?.kw || []).filter(Boolean).map(String);
}
function kwTip(k){
  return (KW_RULES[k] && KW_RULES[k].tip) || 'Keyword ability.';
}
function kwClass(k){
  const v = String(k).toLowerCase();
  if (v.includes('melee')) return 'melee';
  return 'other';
}

// ── Engagement Range (1" edge-to-edge) ──────────────────
function modelDistance(m1, m2){
  const r1 = getModelRadius(m1);
  const r2 = getModelRadius(m2);
  return Math.hypot(m1.x - m2.x, m1.y - m2.y) - r1 - r2;
}

function inEngagementRange(m1, m2){
  return modelDistance(m1, m2) <= PX_PER_INCH; // 1" = 12px
}

function isInEngagement(unitId){
  const unit = getUnit(unitId);
  if (!unit) return false;
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  return unit.models.some(m =>
    enemies.some(enemy =>
      enemy.models.some(em => inEngagementRange(m, em))
    )
  );
}

// Check if two specific units are engaged with each other
function isEngagedWith(unitIdA, unitIdB){
  const a = getUnit(unitIdA), b = getUnit(unitIdB);
  if (!a || !b) return false;
  return a.models.some(am =>
    b.models.some(bm => inEngagementRange(am, bm))
  );
}

// ── Unit keyword check ──────────────────────────────────
function unitIsInfantry(uid){
  const u = UNITS[uid];
  if (!u) return false;
  // Check faction string and unit data for INFANTRY keyword
  const factionStr = (u.faction || '').toUpperCase();
  if (factionStr.includes('INFANTRY')) return true;
  // Check abilities/keywords for Infantry
  if (u.keywords && u.keywords.some(k => String(k).toUpperCase() === 'INFANTRY')) return true;
  // Heuristic: all Space Marine and Ork infantry have small bases
  // Vehicle check: if faction includes VEHICLE, it's not infantry
  if (factionStr.includes('VEHICLE')) return false;
  // Default: infantry for small-base models (R32), not for large vehicles
  const unitData = getUnit(uid);
  if (!unitData) return false;
  return unitData.models.every(m => (m.r || 8) <= 10);
}

// ── Objective marker positions (SVG coords) ─────────────
const OBJECTIVES = [
  { x: 360, y: 72 },   // OBJ 01
  { x: 120, y: 264 },  // OBJ 02
  { x: 360, y: 264 },  // OBJ 03
  { x: 600, y: 264 },  // OBJ 04
  { x: 360, y: 456 }   // OBJ 05
];

// ── Thresholds (melee: no cover bonus) ──────────────────
function deriveThresholds(profile, attacker, target){
  const ws = getWeaponSkill(attacker.id);
  const hit = Math.min(6, Math.max(2, ws));
  const t = Number(UNITS[target.id]?.stats?.T || 4);
  const rawSave = parseSave(UNITS[target.id]?.stats?.Sv);
  const ap = Number(profile.ap || 0);
  // No cover bonus in melee
  const save = Math.min(7, Math.max(2, rawSave - ap));
  return { hit, wound: woundTarget(Number(profile.s || 0), t), save };
}

function attackCount(profile, attacker){
  return (Number(profile.a || 1) || 1) * Math.max(0, attacker.models.length);
}

// ── Spent indicators ────────────────────────────────────
function updateSpentIndicators(){
  $$('.rail-unit').forEach(row => row.classList.toggle('fought', state.foughtUnits.has(row.dataset.unit)));
  const badge = $('#unit-state-badge');
  if (badge) badge.classList.toggle('visible', !!state.attackerId && state.foughtUnits.has(state.attackerId));
}

// ── Wound state tracking ────────────────────────────────
function describeWoundState(uid){
  const unit = getUnit(uid);
  if (!unit) return null;
  const wPer = Number(UNITS[uid]?.stats?.W || 1);
  const carry = unit._carryWounds || 0;
  if (wPer <= 1 || carry <= 0) return null;
  return { unit, wPer, carry, remaining: Math.max(0, wPer - carry), lostFrac: carry / wPer };
}

function circleArcPath(cx, cy, r, startDeg, endDeg){
  const toRad = (deg) => (deg - 90) * Math.PI / 180;
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(endDeg));
  const ey = cy + r * Math.sin(toRad(endDeg));
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

function updateWoundOverlays(){
  const NS = 'http://www.w3.org/2000/svg';
  $$('#layer-models .model-base').forEach(g => {
    const uid = g.dataset.unitId;
    const wound = describeWoundState(uid);
    const existing = g.querySelector('.wound-ring-layer');
    if (existing) existing.remove();
    if (!wound) return;
    const focusModel = wound.unit.models[wound.unit.models.length - 1];
    if (!focusModel || focusModel.id !== g.dataset.modelId) return;
    const m = focusModel;
    const ring = document.createElementNS(NS, 'g');
    ring.setAttribute('class', 'wound-ring-layer');
    const r = getModelRadius(m) + 5;
    const cx = m.x, cy = m.y;

    const track = document.createElementNS(NS, 'circle');
    track.setAttribute('class', 'wound-ring-track');
    track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
    ring.appendChild(track);

    const lostSweep = Math.max(10, 360 * wound.lostFrac);
    const remainSweep = Math.max(0, 360 - lostSweep - 8);
    if (remainSweep > 6) {
      const remain = document.createElementNS(NS, 'path');
      remain.setAttribute('class', 'wound-ring-remain');
      remain.setAttribute('d', circleArcPath(cx, cy, r, 0, remainSweep));
      ring.appendChild(remain);
    }
    const lost = document.createElementNS(NS, 'path');
    lost.setAttribute('class', 'wound-ring-lost');
    lost.setAttribute('d', circleArcPath(cx, cy, r, remainSweep + 8, 360));
    ring.appendChild(lost);

    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('class', 'wound-ring-label-bg');
    bg.setAttribute('x', cx - 13); bg.setAttribute('y', cy + r + 4); bg.setAttribute('rx', '4');
    bg.setAttribute('width', '26'); bg.setAttribute('height', '12');
    ring.appendChild(bg);
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('class', 'wound-ring-label');
    txt.setAttribute('x', cx); txt.setAttribute('y', cy + r + 13);
    txt.setAttribute('text-anchor', 'middle');
    txt.textContent = `${wound.remaining}W`;
    ring.appendChild(txt);

    g.appendChild(ring);
  });
}

// ── Hull painting ───────────────────────────────────────
function paint(){
  $$('#layer-hulls .unit-hull').forEach(h => {
    const uid = h.dataset.unitId;
    h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker','shoot-partial','fight-engaged','fight-ineligible');

    if (uid === state.attackerId) {
      h.classList.add('shoot-attacker');
    } else if (isEnemy(uid) && state.attackerId && !state.foughtUnits.has(state.attackerId)) {
      // Highlight enemies engaged with the selected attacker green, others dimmed
      if (isEngagedWith(state.attackerId, uid)) {
        h.classList.add('shoot-valid');
      } else {
        h.classList.add('shoot-invalid');
      }
    } else if (!isEnemy(uid) && uid !== state.attackerId) {
      // Dim friendly units that are not the attacker
      const u = getUnit(uid);
      if (u && u.faction === ACTIVE) {
        if (state.foughtUnits.has(uid)) h.classList.add('fight-ineligible');
        else if (!isInEngagement(uid)) h.classList.add('fight-ineligible');
      }
    }

    if (uid === state.targetId || uid === state.hoveredTargetId) h.classList.add('shoot-target');
  });
  updateSpentIndicators();
  updateWoundOverlays();
}

// ── Effect helpers ──────────────────────────────────────
function clearEffects(){
  const proj = $('#proj-container');
  const hit = $('#hit-flash-layer');
  if (proj) proj.innerHTML = '';
  if (hit) hit.innerHTML = '';
}

function tokenVisual(model){
  return document.querySelector(`#layer-models .model-base[data-model-id="${model.id}"]`);
}

function randomTargetModel(target){
  return target.models[Math.floor(rng() * target.models.length)] || target.models[0];
}

function createHitMarker(model){
  const token = tokenVisual(model);
  if (!token) return null;
  token.classList.remove('anim-hit-token');
  void token.getBoundingClientRect();
  token.classList.add('anim-hit-token');
  setTimeout(() => token.classList.remove('anim-hit-token'), 820);
  return token;
}

// ── Melee slash animation ───────────────────────────────
async function playMeleeVolley(attacker, target){
  const container = $('#proj-container');
  if (!container) return;

  const pairs = attacker.models.map(m => ({
    from: m,
    to: randomTargetModel(target)
  }));

  pairs.forEach((pair, ix) => {
    const toPos = projectileAnchor(pair.to);
    if (!toPos.valid) return;
    setTimeout(() => {
      // Create 2-3 slash marks at the target position
      const slashCount = 2 + Math.floor(rng() * 2); // 2 or 3
      for (let s = 0; s < slashCount; s++) {
        const slash = document.createElement('div');
        slash.className = 'melee-slash';
        // Offset slightly per slash for visual spread
        const offsetX = (rng() - 0.5) * 16;
        const offsetY = (rng() - 0.5) * 12;
        const rotation = -30 + rng() * 60; // -30 to 30 degrees
        slash.style.left = (toPos.x + offsetX) + 'px';
        slash.style.top = (toPos.y + offsetY) + 'px';
        slash.style.transform = `rotate(${rotation}deg)`;
        slash.style.animationDelay = (s * 60) + 'ms';
        container.appendChild(slash);
        setTimeout(() => slash.remove(), 500 + s * 60);
      }
    }, ix * 80);
  });

  await new Promise(r => setTimeout(r, Math.max(460, pairs.length * 80 + 420)));
}

// ── Pile-In movement (3" toward closest enemy) ──────────
async function pileIn(unitId){
  const unit = getUnit(unitId);
  if (!unit) return;
  setStatus('PILE IN');

  const isInfantry = unitIsInfantry(unitId);
  const maxMove = 3 * PX_PER_INCH; // 3" = 36px
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);
  if (!allEnemyModels.length) return;

  // Calculate target positions for each model
  const moves = [];
  unit.models.forEach(m => {
    // Find closest enemy model
    let closestDist = Infinity;
    let closestEnemy = null;
    allEnemyModels.forEach(em => {
      const d = modelDistance(m, em);
      if (d < closestDist) { closestDist = d; closestEnemy = em; }
    });
    if (!closestEnemy) return;

    // Already in base contact?
    const r1 = getModelRadius(m);
    const r2 = getModelRadius(closestEnemy);
    if (closestDist <= 1) {
      moves.push({ model: m, dx: 0, dy: 0 });
      return;
    }

    // Direction toward closest enemy
    const dx = closestEnemy.x - m.x;
    const dy = closestEnemy.y - m.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.1) { moves.push({ model: m, dx: 0, dy: 0 }); return; }

    const ux = dx / dist;
    const uy = dy / dist;

    // Move up to 3", but stop at base contact (radii touching + 1px gap)
    const contactDist = dist - r1 - r2 - 1;
    const moveAmount = Math.min(maxMove, Math.max(0, contactDist));

    // Must end closer than we started
    if (moveAmount <= 0) {
      moves.push({ model: m, dx: 0, dy: 0 });
      return;
    }

    moves.push({
      model: m,
      dx: ux * moveAmount,
      dy: uy * moveAmount,
      startX: m.x,
      startY: m.y,
      endX: m.x + ux * moveAmount,
      endY: m.y + uy * moveAmount
    });
  });

  // Animate over 300ms
  const duration = 300;
  const startTime = performance.now();

  await new Promise(resolve => {
    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out quad

      moves.forEach(mv => {
        if (mv.dx === 0 && mv.dy === 0) return;
        mv.model.x = mv.startX + mv.dx * ease;
        mv.model.y = mv.startY + mv.dy * ease;
      });

      renderModels();

      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });

  // Ensure final positions are exact
  moves.forEach(mv => {
    if (mv.endX !== undefined) { mv.model.x = mv.endX; mv.model.y = mv.endY; }
  });
  renderModels();

  // Brief pause after pile-in
  await new Promise(r => setTimeout(r, 100));
}

// ── Consolidation (3" after kills) ──────────────────────
async function consolidate(unitId){
  const unit = getUnit(unitId);
  if (!unit) return;
  setStatus('CONSOLIDATE');

  const isInfantry = unitIsInfantry(unitId);
  const maxMove = 3 * PX_PER_INCH; // 3"
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);

  const moves = [];
  unit.models.forEach(m => {
    let targetX = null, targetY = null;

    // Priority 1: Move toward closest enemy within (3" + engagement range)
    if (allEnemyModels.length) {
      let closestDist = Infinity;
      let closestEnemy = null;
      allEnemyModels.forEach(em => {
        const d = modelDistance(m, em);
        if (d < closestDist) { closestDist = d; closestEnemy = em; }
      });
      if (closestEnemy && closestDist <= (3 + 1) * PX_PER_INCH) { // 3" move + 1" engagement
        targetX = closestEnemy.x;
        targetY = closestEnemy.y;
      }
    }

    // Priority 2: Move toward nearest objective
    if (targetX === null) {
      let bestObjDist = Infinity;
      OBJECTIVES.forEach(obj => {
        const d = Math.hypot(m.x - obj.x, m.y - obj.y);
        if (d < bestObjDist) { bestObjDist = d; targetX = obj.x; targetY = obj.y; }
      });
    }

    // Priority 3: Don't move
    if (targetX === null) {
      moves.push({ model: m, dx: 0, dy: 0 });
      return;
    }

    const dx = targetX - m.x;
    const dy = targetY - m.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.1) { moves.push({ model: m, dx: 0, dy: 0 }); return; }

    const ux = dx / dist;
    const uy = dy / dist;
    const moveAmount = Math.min(maxMove, dist);

    moves.push({
      model: m,
      dx: ux * moveAmount,
      dy: uy * moveAmount,
      startX: m.x,
      startY: m.y,
      endX: m.x + ux * moveAmount,
      endY: m.y + uy * moveAmount
    });
  });

  // Animate over 300ms
  const duration = 300;
  const startTime = performance.now();

  await new Promise(resolve => {
    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      moves.forEach(mv => {
        if (mv.dx === 0 && mv.dy === 0) return;
        mv.model.x = mv.startX + mv.dx * ease;
        mv.model.y = mv.startY + mv.dy * ease;
      });

      renderModels();

      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });

  moves.forEach(mv => {
    if (mv.endX !== undefined) { mv.model.x = mv.endX; mv.model.y = mv.endY; }
  });
  renderModels();

  await new Promise(r => setTimeout(r, 100));
}

// ── Overlay helpers (reused from shooting pattern) ──────
function ensureOverlayPinLoop(){
  if (state.overlayRaf) return;
  const tick = () => {
    const roll = $('#roll-overlay');
    if (roll && !roll.classList.contains('hidden')) {
      roll.style.left = '50%';
      roll.style.top = 'auto';
      roll.style.bottom = '68px';
    }
    if (roll && !roll.classList.contains('hidden'))
      state.overlayRaf = requestAnimationFrame(tick);
    else state.overlayRaf = null;
  };
  state.overlayRaf = requestAnimationFrame(tick);
}

function closeWeaponPopup(){
  const el = $('#roll-overlay');
  state.pinnedPopupTargetId = null;
  if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
}

function openWeaponPopup(targetId, options){
  const overlay = $('#roll-overlay'); if (!overlay) return;
  state.pinnedPopupTargetId = targetId;
  overlay.innerHTML = `<div class="overlay-title">Select Melee Weapon</div><div class="weapon-grid">${options.map(opt => {
    const ap = Number(opt.profile.ap || 0);
    const kws = keywordsFor(opt.profile).map(k => `<span class="kw-pill ${kwClass(k)}" data-tip="${kwTip(k).replace(/"/g, '&quot;')}">${k}</span>`).join('');
    return `<button class="weapon-choice" data-ix="${opt.i}"><span class="weapon-choice-name">${opt.profile.name}</span><div class="weapon-meta-row"><span class="weapon-meta">A${opt.profile.a}</span><span class="weapon-meta">S${opt.profile.s}</span><span class="weapon-meta ${ap !== 0 ? 'ap-hot' : ''}">AP ${opt.profile.ap}</span><span class="weapon-meta dmg-hot">D ${opt.profile.d}</span></div>${kws ? `<div class="weapon-kws">${kws}</div>` : ''}</button>`;
  }).join('')}</div>`;
  overlay.classList.remove('hidden');
  initAllTooltips();
  overlay.querySelectorAll('[data-tip]').forEach(el => {
    if (el._fightTipInit) return;
    el._fightTipInit = true;
    el.addEventListener('mouseenter', () => showTip(el, el.dataset.tip));
    el.addEventListener('mouseleave', hideTip);
  });
  overlay.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => {
    state.selectedProfileIx = Number(btn.dataset.ix);
    closeWeaponPopup();
    resolveAttack(targetId);
  }));
  ensureOverlayPinLoop();
}

// ── Dice stage rendering ────────────────────────────────
function renderDiceStage(title, count, threshold, auto, message='', ctaLabel='Click to roll'){
  const overlay = $('#roll-overlay');
  const chips = Array.from({length: Math.max(1, count)}, () => '<span class="die pre-roll">–</span>').join('');
  overlay.innerHTML = `<div class="overlay-title">${title}</div><div class="dice-row">${chips}</div><div class="dice-summary">${message || (threshold ? `Target ${threshold}+` : 'Resolve damage')}</div><button class="roll-cta">${auto ? 'Resolving…' : ctaLabel}</button>`;
  overlay.classList.remove('hidden');
  ensureOverlayPinLoop();
}

function revealDice(rolls, threshold, stageKind){
  const chips = $$('#roll-overlay .die');
  rolls.forEach((r, i) => {
    const chip = chips[i]; if (!chip) return;
    chip.textContent = '–';
    chip.classList.remove('pre-roll');
    chip.classList.add('rolling');
    setTimeout(() => {
      chip.classList.remove('rolling');
      chip.textContent = r;
      if (threshold == null) {
        chip.classList.add('success');
      } else if (r >= threshold) {
        if (stageKind === 'save') chip.classList.add('enemy-success');
        else { chip.classList.add('success'); setTimeout(() => chip.classList.add('flashing'), 20); }
      } else {
        if (stageKind === 'save') { chip.classList.add('enemy-fail'); setTimeout(() => chip.classList.add('flashing'), 20); }
        else chip.classList.add('fail');
      }
    }, 80 + i * 40);
  });
}

function rollDiceStage(title, rolls, threshold, auto = false, targetId = null, message='', stageKind='generic', ctaLabel='Click to roll', nextLabel='Continue', onTrigger = null){
  return new Promise(resolve => {
    const overlay = $('#roll-overlay'); if (!overlay) return resolve({ rolls, successes: rolls.length, threshold });
    state.pinnedRollTargetId = targetId;
    const successes = threshold ? rolls.filter(r => r >= threshold).length : rolls.length;
    renderDiceStage(title, rolls.length, threshold, auto, message, ctaLabel);
    const cta = overlay.querySelector('.roll-cta');
    const fire = async () => {
      if (typeof onTrigger === 'function') await onTrigger();
      revealDice(rolls, threshold, stageKind);
      setTimeout(() => {
        if (auto) {
          setTimeout(() => resolve({ rolls, successes, threshold }), 260 + rolls.length * 40);
        } else {
          cta.textContent = nextLabel; cta.disabled = false;
          cta.onclick = () => resolve({ rolls, successes, threshold, advanceRequested: true });
        }
      }, 480 + rolls.length * 40);
    };
    if (auto) { cta.disabled = true; setTimeout(() => fire(), 140); }
    else cta.addEventListener('click', () => { cta.disabled = true; fire(); }, { once: true });
  });
}

function showResultPanel(targetId, totalDamage, killCount){
  return new Promise(resolve => {
    const overlay = $('#roll-overlay');
    state.pinnedRollTargetId = targetId;
    overlay.innerHTML = `
      <div class="overlay-title">Melee Attack Resolved</div>
      <div class="result-main">
        <div class="result-row wounds"><span class="result-icon">⚔</span><span class="result-num">${totalDamage}</span><span class="result-label">Wound${totalDamage===1?'':'s'} Applied</span></div>
        <div class="result-row kills ${killCount > 0 ? 'has-kills' : ''}"><span class="result-icon">☠</span><span class="result-num">${killCount}</span><span class="result-label">Model${killCount===1?'':'s'} Destroyed</span></div>
      </div>
      <button class="roll-cta">OK</button>`;
    overlay.classList.remove('hidden');
    ensureOverlayPinLoop();
    overlay.querySelector('.roll-cta').addEventListener('click', () => {
      overlay.classList.add('hidden'); state.pinnedRollTargetId = null; resolve();
    }, { once: true });
  });
}

// ── Wound allocation ────────────────────────────────────
function allocateWoundsToModels(target, totalDamage){
  let remainingDamage = totalDamage;
  const removedModelIds = [];
  const flashedModels = [];
  const perModelW = Number(UNITS[target.id]?.stats?.W || 1) || 1;
  target._carryWounds = target._carryWounds || 0;

  while (remainingDamage > 0 && target.models.length > 0) {
    const focusIdx = target.models.length - 1;
    const focus = target.models[focusIdx];
    if (!focus) break;

    flashedModels.push(focus);
    const woundsNeeded = perModelW - target._carryWounds;
    const applied = Math.min(remainingDamage, woundsNeeded);
    target._carryWounds += applied;
    remainingDamage -= applied;
    if (target._carryWounds >= perModelW) {
      removedModelIds.push(focus.id);
      target.models.splice(focusIdx, 1);
      target._carryWounds = 0;
    }
  }

  return { removedModelIds, flashedModels, remainingDamage };
}

async function playWoundFlashes(models){
  models.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 120));
  await new Promise(r => setTimeout(r, Math.max(820, models.length * 120 + 360)));
}

async function animateUnitDestroyed(unitId){
  const hull = document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${unitId}"]`);
  const models = document.querySelectorAll(`#layer-models .model-base[data-unit-id="${unitId}"]`);
  hull?.classList.add('anim-die');
  models.forEach(m => m.classList.add('anim-die'));
  await new Promise(r => setTimeout(r, 720));
}

// ── Core attack resolution ──────────────────────────────
async function resolveAttack(targetId){
  if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
  const attacker = getUnit(state.attackerId);
  const target = getUnit(targetId);
  const profiles = getProfiles(state.attackerId);
  const profile = profiles[state.selectedProfileIx];
  if (!attacker || !target || !profile) return;

  const thresholds = deriveThresholds(profile, attacker, target);
  const totalAttacks = attackCount(profile, attacker);
  if (totalAttacks <= 0) return;

  setStatus('MELEE ATTACKS');

  // Hit roll (WS-based)
  const hitRolls = Array.from({length: totalAttacks}, d6);
  const hit = await rollDiceStage('Hit Roll', hitRolls, thresholds.hit, false, targetId,
    `WS ${thresholds.hit}+`, 'hit', 'Click to Roll', 'Roll Wounds',
    () => playMeleeVolley(attacker, target));

  if (!hit.successes) {
    return finishFight(attacker, target, 0, 0);
  }

  // Wound roll
  const woundRolls = Array.from({length: hit.successes}, d6);
  const wound = await rollDiceStage('Wound Roll', woundRolls, thresholds.wound, true, targetId,
    `Wound on ${thresholds.wound}+`, 'wound', 'Rolling Wounds…', 'Roll Saves');

  if (wound.successes) {
    const woundTargets = Array.from({ length: wound.successes }, () => randomTargetModel(target));
    woundTargets.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 110));
    await new Promise(r => setTimeout(r, Math.max(500, woundTargets.length * 110 + 120)));
  }

  // Save roll (no cover in melee)
  const saveRolls = Array.from({length: wound.successes}, d6);
  const save = await rollDiceStage('Save Roll', saveRolls, thresholds.save, true, targetId,
    `Save on ${thresholds.save}+`, 'save');
  const failedSaves = save.rolls.filter(r => r < thresholds.save).length;

  // Damage
  let totalDamage = 0;
  const fixedDamage = damageValue(profile.d);
  if (failedSaves > 0) {
    if (fixedDamage === 1) {
      totalDamage = failedSaves;
    } else {
      const damageRolls = Array.from({length: failedSaves}, () => pickDamage(profile.d));
      const damageStage = await rollDiceStage('Damage', damageRolls, null, false, targetId,
        'Damage per failed save', 'damage', 'Roll Damage', 'Show Result');
      totalDamage = damageStage.rolls.reduce((a,b)=>a+b, 0);
    }
  }

  // Apply wounds
  const originalModels = target.models.slice();
  const allocation = allocateWoundsToModels(target, totalDamage);
  const flashedModels = allocation.flashedModels.length ? allocation.flashedModels :
    originalModels.slice(-Math.min(originalModels.length, totalDamage || 0));
  if (flashedModels.length) await playWoundFlashes(flashedModels);

  const killCount = allocation.removedModelIds.length;
  if (target.models.length <= 0 && killCount) await animateUnitDestroyed(target.id);

  return finishFight(attacker, target, totalDamage, killCount);
}

async function finishFight(attacker, target, totalDamage, killCount){
  renderModels();
  paint();

  await showResultPanel(target.id, totalDamage, killCount);

  // Consolidation: only if kills were scored
  if (killCount > 0) {
    await consolidate(attacker.id);
  }

  // Mark as fought
  state.foughtUnits.add(attacker.id);
  setStatus('');
  state.attackerId = null;
  state.targetId = null;
  state.hoveredTargetId = null;
  closeWeaponPopup();
  clearEffects();
  baseSelectUnit(null);
  paint();
}

// ── Begin fight flow for a unit ─────────────────────────
async function beginFight(targetId){
  if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
  state.targetId = targetId;
  state.hoveredTargetId = null;
  paint();

  const attacker = getUnit(state.attackerId);
  const target = getUnit(targetId);
  if (!attacker || !target) return;

  // Step 1: Pile-in
  await pileIn(state.attackerId);

  // Step 2: Weapon selection
  const profiles = getProfiles(state.attackerId);
  if (!profiles.length) {
    // No melee weapons — skip
    state.foughtUnits.add(state.attackerId);
    setStatus('No melee weapons');
    setTimeout(() => { setStatus(''); baseSelectUnit(null); paint(); }, 1000);
    return;
  }

  if (profiles.length === 1) {
    state.selectedProfileIx = 0;
    await resolveAttack(targetId);
  } else {
    // Show weapon picker — resolveAttack is called via the picker callback
    const options = profiles.map((p, i) => ({ profile: p, i }));
    openWeaponPopup(targetId, options);
  }
}

// ── Enemy interaction ───────────────────────────────────
function onEnemyInteract(unitId){
  if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
  // Target must be specifically engaged with the selected attacker (not just any unit)
  if (!isEngagedWith(state.attackerId, unitId)) return;
  beginFight(unitId);
}

function bindFightOverrides(){
  const svg = $('#bf-svg'); if (!svg) return;

  svg.addEventListener('mousemove', (e) => {
    if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
    let node = e.target;
    while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
    if (!node) return;
    const uid = node.dataset.unitId;
    if (!isEnemy(uid)) return;
    if (!isEngagedWith(state.attackerId, uid)) return;
    state.hoveredTargetId = uid;
    paint();
  }, true);

  svg.addEventListener('mouseleave', () => {
    if (state.targetId) return;
    state.hoveredTargetId = null;
    paint();
  }, true);

  const intercept = (e) => {
    if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
    let node = e.target;
    while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
    if (!node) return;
    const uid = node.dataset.unitId;
    if (!isEnemy(uid)) return;
    if (!isEngagedWith(state.attackerId, uid)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type === 'click') onEnemyInteract(uid);
  };

  svg.addEventListener('mousedown', intercept, true);
  svg.addEventListener('click', intercept, true);
}

// ── Selection override ──────────────────────────────────
function selectAttacker(uid){
  state.attackerId = uid;
  state.targetId = null;
  state.hoveredTargetId = null;
  state.selectedProfileIx = 0;
  closeWeaponPopup();
  clearEffects();
  paint();
  setStatus('');
}

function wrappedSelectUnit(uid){
  baseSelectUnit(uid);
  if (!uid) {
    selectAttacker(null);
    requestAnimationFrame(() => paint());
    return;
  }
  const u = getUnit(uid);
  if (!u) return;
  if (u.faction === ACTIVE) {
    // Only allow selecting units that are in engagement and haven't fought
    if (state.foughtUnits.has(uid)) {
      setStatus('Unit already fought this phase');
      selectAttacker(uid); // Show it selected but fought
    } else if (!isInEngagement(uid)) {
      setStatus('Not in Engagement Range');
      selectAttacker(uid);
    } else {
      selectAttacker(uid);
      setStatus('Select enemy target');
    }
    // Clear range toggles in fight phase (no ranged weapons matter)
    const rangesEl = $('#card-ranges');
    if (rangesEl) rangesEl.innerHTML = '';
    requestAnimationFrame(() => paint());
  } else {
    const rangesEl = $('#card-ranges');
    if (rangesEl) rangesEl.innerHTML = '';
  }
}

callbacks.selectUnit = wrappedSelectUnit;
window.selectUnit = wrappedSelectUnit;

// ── Init ───────────────────────────────────────────────
export function initFight(){
  $('#btn-end-fight')?.addEventListener('click', () => setStatus('END FIGHT NOT WIRED IN MOCKUP'));
  $('#card-close')?.addEventListener('click', () => wrappedSelectUnit(null));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { wrappedSelectUnit(null); }
  });

  window.__fightDebug = {
    state,
    selectAttacker,
    beginFight,
    resolveAttack,
    pileIn,
    consolidate,
    isInEngagement,
    paint
  };

  bindFightOverrides();
  paint();
}
