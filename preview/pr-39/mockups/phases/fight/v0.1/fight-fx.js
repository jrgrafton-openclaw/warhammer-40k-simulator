/* fight-fx.js — Visual effects, dice UI, wound overlays & allocation */
import { UNITS, initAllTooltips, showTip, hideTip } from '../../../shared/state/units.js';
import { projectileAnchor, getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { playDiceRoll, playSaveFailed } from '../../../shared/audio/sfx.js';
import { state, $, $$, rng, getUnit, keywordsFor, kwTip, kwClass } from './fight-helpers.js';

// ── Effect helpers ──────────────────────────────────────
export function clearEffects(){
  const proj = $('#proj-container'), hit = $('#hit-flash-layer');
  if (proj) proj.innerHTML = ''; if (hit) hit.innerHTML = '';
}
export function tokenVisual(model){
  return document.querySelector(`#layer-models .model-base[data-model-id="${model.id}"]`);
}
export function randomTargetModel(target){
  return target.models[Math.floor(rng() * target.models.length)] || target.models[0];
}
export function createHitMarker(model){
  const token = tokenVisual(model); if (!token) return null;
  token.classList.remove('anim-hit-token'); void token.getBoundingClientRect();
  token.classList.add('anim-hit-token');
  setTimeout(() => token.classList.remove('anim-hit-token'), 820);
  return token;
}

// ── Chainsword weapon strike animation (design system v4) ──
export const SPARK_COLORS = ['#ff8020','#ffaa40','#e06818','#cc5010','#ff6830'];
export function fireWeaponStrike(container, targetScreenPos) {
  const arena = document.createElement('div');
  arena.style.cssText = `position:absolute;left:${targetScreenPos.x - 29}px;top:${targetScreenPos.y - 29}px;width:58px;height:58px;pointer-events:none;`;
  container.appendChild(arena);
  const NS = 'http://www.w3.org/2000/svg';
  const w = 98, h = 98;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'slash-svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.style.cssText = `position:absolute;left:-20px;top:-20px;width:${w}px;height:${h}px;pointer-events:none;overflow:visible;`;
  const d = `M ${w*.08} ${h*.18} Q ${w*.45} ${h*.48} ${w*.92} ${h*.82}`;
  const score = document.createElementNS(NS, 'path');
  score.setAttribute('d', d); score.setAttribute('fill', 'none');
  score.setAttribute('stroke', '#1a1e24'); score.setAttribute('stroke-width', '4');
  score.setAttribute('stroke-linecap', 'round');
  score.setAttribute('stroke-dasharray', '200'); score.setAttribute('stroke-dashoffset', '200');
  score.style.animation = 'slash-score .5s ease forwards';
  svg.appendChild(score);
  const edge = document.createElementNS(NS, 'path');
  edge.setAttribute('d', d); edge.setAttribute('fill', 'none');
  edge.setAttribute('stroke', '#c0c8d4'); edge.setAttribute('stroke-width', '1.8');
  edge.setAttribute('stroke-linecap', 'round');
  edge.setAttribute('stroke-dasharray', '200'); edge.setAttribute('stroke-dashoffset', '200');
  edge.setAttribute('filter', 'drop-shadow(0 0 2px #ffffff60)');
  edge.style.animation = 'slash-draw .3s ease-out forwards';
  svg.appendChild(edge);
  arena.appendChild(svg);
  const point = document.createElement('div');
  point.className = 'slash-point';
  point.style.cssText = 'left:50%;top:50%;animation:slash-point-flash .25s ease-out forwards;';
  arena.appendChild(point);
  setTimeout(() => {
    for (let i = 0; i < 6; i++) {
      const spark = document.createElement('div');
      spark.className = 'slash-spark';
      const color = SPARK_COLORS[Math.floor(rng() * SPARK_COLORS.length)];
      const angle = (Math.PI * 2 / 6) * i + (rng() - .5) * .6;
      const dist = 10 + rng() * 16;
      spark.style.cssText = `--sx:29px;--sy:29px;--dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px;background:${color};box-shadow:0 0 3px ${color};left:0;top:0;animation:slash-spark .4s ease-out ${rng()*.1}s forwards;`;
      arena.appendChild(spark);
    }
  }, 120);
  setTimeout(() => arena.remove(), 900);
}

export async function playMeleeVolley(attacker, target, strikeCount){
  const container = $('#proj-container'); if (!container) return;
  const count = strikeCount || attacker.models.length;
  const strikes = [];
  for (let i = 0; i < count; i++) strikes.push({ to: randomTargetModel(target) });
  strikes.forEach((s, ix) => {
    const toPos = projectileAnchor(s.to); if (!toPos.valid) return;
    setTimeout(() => {
      fireWeaponStrike(container, toPos);
      const token = tokenVisual(s.to);
      if (token) {
        token.classList.remove('anim-slash-recoil'); void token.getBoundingClientRect();
        token.classList.add('anim-slash-recoil');
        setTimeout(() => token.classList.remove('anim-slash-recoil'), 350);
      }
    }, ix * 100);
  });
  await new Promise(r => setTimeout(r, Math.max(500, count * 100 + 500)));
}

// ── Wound state & overlays ──────────────────────────────
export function describeWoundState(uid){
  const unit = getUnit(uid); if (!unit) return null;
  const wPer = Number(UNITS[uid]?.stats?.W || 1);
  const carry = unit._carryWounds || 0;
  if (wPer <= 1 || carry <= 0) return null;
  return { unit, wPer, carry, remaining: Math.max(0, wPer - carry), lostFrac: carry / wPer };
}
function circleArcPath(cx, cy, r, startDeg, endDeg){
  const toRad = (deg) => (deg - 90) * Math.PI / 180;
  const sx = cx + r * Math.cos(toRad(startDeg)), sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(endDeg)), ey = cy + r * Math.sin(toRad(endDeg));
  return `M ${sx} ${sy} A ${r} ${r} 0 ${endDeg - startDeg > 180 ? 1 : 0} 1 ${ex} ${ey}`;
}
export function updateWoundOverlays(){
  const NS = 'http://www.w3.org/2000/svg';
  $$('#layer-models .model-base').forEach(g => {
    const uid = g.dataset.unitId, wound = describeWoundState(uid);
    const existing = g.querySelector('.wound-ring-layer');
    if (existing) existing.remove();
    if (!wound) return;
    const focusModel = wound.unit.models[wound.unit.models.length - 1];
    if (!focusModel || focusModel.id !== g.dataset.modelId) return;
    const m = focusModel;
    const ring = document.createElementNS(NS, 'g');
    ring.setAttribute('class', 'wound-ring-layer');
    const r = getModelRadius(m) + 5, cx = m.x, cy = m.y;
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
    bg.setAttribute('x', cx - 13); bg.setAttribute('y', cy + r + 4);
    bg.setAttribute('rx', '4'); bg.setAttribute('width', '26'); bg.setAttribute('height', '12');
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

// ── Overlay / dice helpers ──────────────────────────────
export function ensureOverlayPinLoop(){
  if (state.overlayRaf) return;
  const tick = () => {
    const roll = $('#roll-overlay');
    if (roll && !roll.classList.contains('hidden')) {
      roll.style.left = '50%'; roll.style.top = 'auto'; roll.style.bottom = '68px';
    }
    if (roll && !roll.classList.contains('hidden'))
      state.overlayRaf = requestAnimationFrame(tick);
    else state.overlayRaf = null;
  };
  state.overlayRaf = requestAnimationFrame(tick);
}
export function closeWeaponPopup(){
  const el = $('#roll-overlay');
  state.pinnedPopupTargetId = null;
  if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
}
export function openWeaponPopup(targetId, options, resolveAttackFn){
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
    if (el._fightTipInit) return; el._fightTipInit = true;
    el.addEventListener('mouseenter', () => showTip(el, el.dataset.tip));
    el.addEventListener('mouseleave', hideTip);
  });
  overlay.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => {
    state.selectedProfileIx = Number(btn.dataset.ix);
    closeWeaponPopup();
    resolveAttackFn(state.targetId);
  }));
  ensureOverlayPinLoop();
}

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
    chip.textContent = '–'; chip.classList.remove('pre-roll'); chip.classList.add('rolling');
    setTimeout(() => {
      chip.classList.remove('rolling'); chip.textContent = r;
      if (threshold == null) { chip.classList.add('success'); }
      else if (r >= threshold) {
        if (stageKind === 'save') chip.classList.add('enemy-success');
        else { chip.classList.add('success'); setTimeout(() => chip.classList.add('flashing'), 20); }
      } else {
        if (stageKind === 'save') { chip.classList.add('enemy-fail'); setTimeout(() => chip.classList.add('flashing'), 20); }
        else chip.classList.add('fail');
      }
    }, 80 + i * 40);
  });
}
export function rollDiceStage(title, rolls, threshold, auto = false, targetId = null, message='', stageKind='generic', ctaLabel='Click to roll', nextLabel='Continue', onTrigger = null){
  return new Promise(resolve => {
    const overlay = $('#roll-overlay');
    if (!overlay) return resolve({ rolls, successes: rolls.length, threshold });
    state.pinnedRollTargetId = targetId;
    const successes = threshold ? rolls.filter(r => r >= threshold).length : rolls.length;
    renderDiceStage(title, rolls.length, threshold, auto, message, ctaLabel);
    const cta = overlay.querySelector('.roll-cta');
    const fire = async () => {
      playDiceRoll(); revealDice(rolls, threshold, stageKind);
      const diceFinishMs = 80 + rolls.length * 40 + 200;
      if (typeof onTrigger === 'function') {
        await new Promise(r => setTimeout(r, diceFinishMs)); await onTrigger();
      }
      if (stageKind === 'save' && threshold) {
        const failCount = rolls.filter(r => r < threshold).length;
        if (failCount > 0) setTimeout(() => playSaveFailed(failCount), diceFinishMs + 100);
      }
      const remainingMs = onTrigger ? 200 : (480 + rolls.length * 40);
      setTimeout(() => {
        if (auto) setTimeout(() => resolve({ rolls, successes, threshold }), 260 + rolls.length * 40);
        else { cta.textContent = nextLabel; cta.disabled = false; cta.onclick = () => resolve({ rolls, successes, threshold, advanceRequested: true }); }
      }, remainingMs);
    };
    if (auto) { cta.disabled = true; setTimeout(() => { playDiceRoll(); fire(); }, 140); }
    else cta.addEventListener('click', () => { cta.disabled = true; fire(); }, { once: true });
  });
}
export function showResultPanel(targetId, totalDamage, killCount){
  return new Promise(resolve => {
    const overlay = $('#roll-overlay');
    state.pinnedRollTargetId = targetId;
    overlay.innerHTML = `<div class="overlay-title">Melee Attack Resolved</div><div class="result-main"><div class="result-row wounds"><span class="result-icon">⚔</span><span class="result-num">${totalDamage}</span><span class="result-label">Wound${totalDamage===1?'':'s'} Applied</span></div><div class="result-row kills ${killCount > 0 ? 'has-kills' : ''}"><span class="result-icon">☠</span><span class="result-num">${killCount}</span><span class="result-label">Model${killCount===1?'':'s'} Destroyed</span></div></div><button class="roll-cta">OK</button>`;
    overlay.classList.remove('hidden'); ensureOverlayPinLoop();
    overlay.querySelector('.roll-cta').addEventListener('click', () => {
      overlay.classList.add('hidden'); state.pinnedRollTargetId = null; resolve();
    }, { once: true });
  });
}

// ── Wound allocation ────────────────────────────────────
export function allocateWoundsToModels(target, totalDamage){
  let remainingDamage = totalDamage;
  const removedModelIds = [], flashedModels = [];
  const perModelW = Number(UNITS[target.id]?.stats?.W || 1) || 1;
  target._carryWounds = target._carryWounds || 0;
  while (remainingDamage > 0 && target.models.length > 0) {
    const focusIdx = target.models.length - 1, focus = target.models[focusIdx];
    if (!focus) break;
    flashedModels.push(focus);
    const woundsNeeded = perModelW - target._carryWounds;
    const applied = Math.min(remainingDamage, woundsNeeded);
    target._carryWounds += applied; remainingDamage -= applied;
    if (target._carryWounds >= perModelW) {
      removedModelIds.push(focus.id); target.models.splice(focusIdx, 1); target._carryWounds = 0;
    }
  }
  return { removedModelIds, flashedModels, remainingDamage };
}
export async function playWoundFlashes(models){
  models.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 120));
  await new Promise(r => setTimeout(r, Math.max(820, models.length * 120 + 360)));
}
export async function animateUnitDestroyed(unitId){
  const hull = document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${unitId}"]`);
  const models = document.querySelectorAll(`#layer-models .model-base[data-unit-id="${unitId}"]`);
  hull?.classList.add('anim-die'); models.forEach(m => m.classList.add('anim-die'));
  await new Promise(r => setTimeout(r, 720));
}
