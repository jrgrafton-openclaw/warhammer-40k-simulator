/* shoot-resolve.js — Dice stages, wound allocation, projectiles, attack flow.
 * Extracted from shooting.js — no logic changes.
 */

import { UNITS } from '../../../shared/state/units.js';
import { initAllTooltips, showTip, hideTip } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';
import { projectileAnchor } from '../../../shared/lib/coord-helpers.js';
import { playDiceRoll, playWeaponFire, playSaveFailed } from '../../../shared/audio/sfx.js';

import {
  state, $, $$, rng, d6, getUnit, isEnemy, setStatus, _hooks,
  getProfiles, keywordsFor, kwTip, kwClass,
  getValidProfilesForTarget, targetInfo, losState,
  attackCount, deriveThresholds, damageValue, pickDamage
} from './shoot-helpers.js';

export function ensureOverlayPinLoop(){
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

export function renderDiceStage(title, count, threshold, auto, message='', ctaLabel='Click to roll'){
  const overlay = $('#roll-overlay');
  const chips = Array.from({length: Math.max(1, count)}, () => '<span class="die pre-roll">–</span>').join('');
  overlay.innerHTML = `<div class="overlay-title">${title}</div><div class="dice-row">${chips}</div><div class="dice-summary">${message || (threshold ? `Target ${threshold}+` : 'Resolve damage')}</div><button class="roll-cta">${auto ? 'Resolving…' : ctaLabel}</button>`;
  overlay.classList.remove('hidden');
  ensureOverlayPinLoop();
}

export function revealDice(rolls, threshold, stageKind){
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

export function rollDiceStage(title, rolls, threshold, auto = false, targetId = null, message='', stageKind='generic', ctaLabel='Click to roll', nextLabel='Continue', onTrigger = null){
  return new Promise(resolve => {
    const overlay = $('#roll-overlay'); if (!overlay) return resolve({ rolls, successes: rolls.length, threshold });
    state.pinnedRollTargetId = targetId;
    const successes = threshold ? rolls.filter(r => r >= threshold).length : rolls.length;
    renderDiceStage(title, rolls.length, threshold, auto, message, ctaLabel);
    const cta = overlay.querySelector('.roll-cta');
    const fire = async () => {
      playDiceRoll();
      if (typeof onTrigger === 'function') await onTrigger();
      revealDice(rolls, threshold, stageKind);
      if (stageKind === 'save' && threshold) {
        const failCount = rolls.filter(r => r < threshold).length;
        if (failCount > 0) {
          setTimeout(() => playSaveFailed(failCount), 80 + rolls.length * 40 + 200);
        }
      }
      setTimeout(() => {
        if (auto) {
          setTimeout(() => {
            resolve({ rolls, successes, threshold });
          }, 260 + rolls.length * 40);
        } else {
          cta.textContent = nextLabel; cta.disabled = false;
          cta.onclick = () => resolve({ rolls, successes, threshold, advanceRequested: true });
        }
      }, 480 + rolls.length * 40);
    };
    if (auto) { cta.disabled = true; setTimeout(() => { playDiceRoll(); fire(); }, 140); }
    else cta.addEventListener('click', () => { cta.disabled = true; fire(); }, { once: true });
  });
}

export function showResultPanel(targetId, totalDamage, killCount){
  return new Promise(resolve => {
    const overlay = $('#roll-overlay');
    state.pinnedRollTargetId = targetId;
    overlay.innerHTML = `
      <div class="overlay-title">Attack Resolved</div>
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

export function allocateWoundsToModels(target, totalDamage, visibleTargetModelIds){
  let remainingDamage = totalDamage;
  const removedModelIds = [];
  const flashedModels = [];
  const perModelW = Number(UNITS[target.id]?.stats?.W || 1) || 1;
  target._carryWounds = target._carryWounds || 0;

  while (remainingDamage > 0 && target.models.length > 0) {
    let focusIdx = target.models.length - 1;
    if (visibleTargetModelIds) {
      focusIdx = -1;
      for (let i = target.models.length - 1; i >= 0; i--) {
        if (visibleTargetModelIds.has(target.models[i].id)) { focusIdx = i; break; }
      }
      if (focusIdx === -1) break;
    }
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

export function tokenVisual(model){
  return document.querySelector(`#layer-models .model-base[data-model-id="${model.id}"]`);
}

export function randomTargetModel(target){
  return target.models[Math.floor(rng() * target.models.length)] || target.models[0];
}

export function createHitMarker(model, extraClass=''){
  const token = tokenVisual(model);
  if (!token) return null;
  token.classList.remove('anim-hit-token');
  void token.getBoundingClientRect();
  token.classList.add('anim-hit-token');
  if (extraClass) token.classList.add(extraClass);
  setTimeout(() => {
    token.classList.remove('anim-hit-token');
    if (extraClass) token.classList.remove(extraClass);
  }, 820);
  return token;
}

export function fireProjectile(color, startPos, endPos){
  const c = document.getElementById('proj-container');
  if (!c) return;
  const p = document.createElement('div');
  p.className='projectile';
  p.style.cssText=`--proj-color:${color};offset-path:path('M ${startPos.x} ${startPos.y} L ${endPos.x} ${endPos.y}');`;
  c.appendChild(p);
  setTimeout(() => p.remove(), 500);
}

export async function playVolley(attacker, target, losResult){
  const firingModels = attacker.models.filter(m => {
    const info = losResult?.perModel?.get(m.id);
    return !info || info.canSee;
  });
  const pairs = firingModels.map(m => ({ from: m, to: randomTargetModel(target) }));
  pairs.forEach((pair, ix) => {
    const from = projectileAnchor(pair.from);
    const to = projectileAnchor(pair.to);
    if (!from.valid || !to.valid) return;
    setTimeout(() => {
      fireProjectile('#ff8c00', from, to);
    }, ix * 70);
  });
  await new Promise(r => setTimeout(r, Math.max(460, pairs.length * 70 + 420)));
}

export function clearEffects(){
  const proj = $('#proj-container');
  const hit = $('#hit-flash-layer');
  if (proj) proj.innerHTML = '';
  if (hit) hit.innerHTML = '';
}

export async function animateUnitDestroyed(unitId){
  const hull = document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${unitId}"]`);
  const models = document.querySelectorAll(`#layer-models .model-base[data-unit-id="${unitId}"]`);
  hull?.classList.add('anim-die');
  models.forEach(m => m.classList.add('anim-die'));
  await new Promise(r => setTimeout(r, 720));
}

export function closeWeaponPopup(){
  const el = $('#roll-overlay');
  state.pinnedPopupTargetId = null;
  if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
}

export function openWeaponPopup(targetId, options){
  const overlay = $('#roll-overlay'); if (!overlay) return;
  state.pinnedPopupTargetId = targetId;
  overlay.innerHTML = `<div class="overlay-title">Select Weapon</div><div class="weapon-grid">${options.map(opt => {
    const ap = Number(opt.profile.ap || 0);
    const kws = keywordsFor(opt.profile).map(k => `<span class="kw-pill ${kwClass(k)}" data-tip="${kwTip(k).replace(/"/g, '&quot;')}">${k}</span>`).join('');
    return `<button class="weapon-choice" data-ix="${opt.i}"><span class="weapon-choice-name">${opt.profile.name}</span><div class="weapon-meta-row"><span class="weapon-meta">${opt.profile.rng}</span><span class="weapon-meta">A${opt.profile.a}</span><span class="weapon-meta">S${opt.profile.s}</span><span class="weapon-meta ${ap !== 0 ? 'ap-hot' : ''}">AP ${opt.profile.ap}</span><span class="weapon-meta dmg-hot">D ${opt.profile.d}</span></div>${kws ? `<div class="weapon-kws">${kws}</div>` : ''}</button>`;
  }).join('')}</div>`;
  overlay.classList.remove('hidden');
  initAllTooltips();
  overlay.querySelectorAll('[data-tip]').forEach(el => {
    if (el._shootTipInit) return;
    el._shootTipInit = true;
    el.addEventListener('mouseenter', () => showTip(el, el.dataset.tip));
    el.addEventListener('mouseleave', hideTip);
  });
  overlay.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => {
    state.selectedProfileIx = Number(btn.dataset.ix);
    closeWeaponPopup(); beginAttack(targetId);
  }));
  ensureOverlayPinLoop();
}

async function playWoundFlashes(models){
  models.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 120));
  await new Promise(r => setTimeout(r, Math.max(820, models.length * 120 + 360)));
}

export async function beginAttack(targetId){
  if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
  state.targetId = targetId;
  state.hoveredTargetId = null;
  _hooks.drawHoverLines(targetId);
  const attacker = getUnit(state.attackerId), target = getUnit(targetId), profile = getProfiles(state.attackerId)[state.selectedProfileIx];
  if (!attacker || !target || !profile) return;
  const info = targetInfo(targetId, state.selectedProfileIx);
  if (!info.valid) return;

  const finishAttack = async (totalDamage, killCount) => {
    state.shotUnits.add(attacker.id);
    renderModels();
    _hooks.paint();
    await showResultPanel(targetId, totalDamage, killCount);
    setStatus('');
    state.attackerId = null;
    state.targetId = null;
    state.hoveredTargetId = null;
    closeWeaponPopup(); _hooks.clearLines(); _hooks.clearEffects();
    baseSelectUnit(null);
    _hooks.paint();
  };

  const thresholds = deriveThresholds(profile, attacker, target);
  const losResult = losState(state.attackerId, targetId);
  const visibleModels = losResult.visibleAttackerCount;
  const totalAttacks = attackCount(profile, attacker, visibleModels);
  if (totalAttacks <= 0) return;

  const hitRolls = Array.from({length: totalAttacks}, d6);
  const hit = await rollDiceStage('Hit Roll', hitRolls, thresholds.hit, false, targetId, `BS ${thresholds.hit}+`, 'hit', 'Click to Roll', 'Roll Wounds', () => { playWeaponFire(totalAttacks); return playVolley(attacker, target, losResult); });
  if (!hit.successes) return finishAttack(0, 0);

  const woundRolls = Array.from({length: hit.successes}, d6);
  const wound = await rollDiceStage('Wound Roll', woundRolls, thresholds.wound, true, targetId, `Wound on ${thresholds.wound}+`, 'wound', 'Rolling Wounds…', 'Roll Saves');
  if (wound.successes) {
    const woundTargets = Array.from({ length: wound.successes }, () => randomTargetModel(target));
    woundTargets.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 110));
    await new Promise(r => setTimeout(r, Math.max(500, woundTargets.length * 110 + 120)));
  }

  const saveRolls = Array.from({length: wound.successes}, d6);
  const coverLabel = thresholds.coverBonus ? ' 🛡 COVER' : '';
  const save = await rollDiceStage('Save Roll', saveRolls, thresholds.save, true, targetId, `Save on ${thresholds.save}+${coverLabel}`, 'save');
  const failedSaves = save.rolls.filter(r => r < thresholds.save).length;

  let totalDamage = 0;
  const fixedDamage = damageValue(profile.d);
  if (failedSaves > 0) {
    if (fixedDamage === 1) totalDamage = failedSaves;
    else {
      const damageRolls = Array.from({length: failedSaves}, () => pickDamage(profile.d));
      const damageStage = await rollDiceStage('Damage', damageRolls, null, false, targetId, 'Damage per failed save', 'damage', 'Roll Damage', 'Show Result');
      totalDamage = damageStage.rolls.reduce((a,b)=>a+b,0);
    }
  }

  _hooks.clearLines();

  const originalModels = target.models.slice();
  const allocation = allocateWoundsToModels(target, totalDamage, losResult.visibleTargetModelIds);
  const flashedModels = allocation.flashedModels.length ? allocation.flashedModels : originalModels.slice(-Math.min(originalModels.length, totalDamage || 0));
  if (flashedModels.length) await playWoundFlashes(flashedModels);

  const killCount = allocation.removedModelIds.length;
  if (target.models.length <= 0 && killCount) await animateUnitDestroyed(target.id);

  return finishAttack(totalDamage, killCount);
}

export function onEnemyInteract(unitId){
  if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
  const options = getValidProfilesForTarget(unitId); if (!options.length) return;
  state.targetId = unitId; state.hoveredTargetId = unitId; _hooks.drawHoverLines(unitId); _hooks.paint();
  if (options.length === 1) { state.selectedProfileIx = options[0].i; beginAttack(unitId); }
  else openWeaponPopup(unitId, options);
}
