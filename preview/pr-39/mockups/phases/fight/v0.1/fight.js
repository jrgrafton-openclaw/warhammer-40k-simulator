/* fight.js — Fight phase interaction (ES module)
 * Melee combat: auto pile-in drag, WS-based hit rolls, wound/save/damage,
 * auto consolidation drag.
 *
 * Flow: select engaged unit → auto pile-in → confirm → select target →
 *       dice pipeline → auto consolidate (if kills) → confirm → mark fought
 */
import { simState, callbacks } from '../../../shared/state/store.js';
import { playMeleeStrike } from '../../../shared/audio/sfx.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';

import { ACTIVE, state, $, $$, d6, getUnit, isEnemy, setStatus,
         damageValue, pickDamage, getProfiles, isInEngagement,
         isEngagedWith, deriveThresholds, attackCount, fightApi } from './fight-helpers.js';
import { clearEffects, randomTargetModel, createHitMarker, closeWeaponPopup,
         openWeaponPopup, playMeleeVolley, updateWoundOverlays, rollDiceStage,
         showResultPanel, allocateWoundsToModels, playWoundFlashes,
         animateUnitDestroyed } from './fight-fx.js';
import { enterDragMode, exitDragMode, confirmDrag, cancelDrag,
         installDragInterceptor, installDragEnforcement, updateDirectionFeedback,
         clearModelHighlights, clearFightOverlays, clearFightRangeRings,
         isDragLegal } from './fight-drag.js';

// ── Register late-binding API for fight-drag.js ─────────
fightApi.paint = () => paint();
fightApi.updateFightButtons = () => updateFightButtons();
fightApi.closeWeaponPopup = () => closeWeaponPopup();

// ── Spent indicators ────────────────────────────────────
function updateSpentIndicators(){
  $$('.rail-unit').forEach(row => row.classList.toggle('fought', state.foughtUnits.has(row.dataset.unit)));
  const badge = $('#unit-state-badge');
  if (badge) badge.classList.toggle('visible', !!state.attackerId && state.foughtUnits.has(state.attackerId));
}

// ── Hull painting ───────────────────────────────────────
function paint(){
  $$('#layer-hulls .unit-hull').forEach(h => {
    const uid = h.dataset.unitId;
    h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker','shoot-partial','fight-engaged','fight-ineligible');
    if (uid === state.attackerId) {
      h.classList.add('shoot-attacker');
    } else if (isEnemy(uid) && state.attackerId && !state.foughtUnits.has(state.attackerId)) {
      if (state.phase === 'target-select' && isEngagedWith(state.attackerId, uid)) h.classList.add('shoot-valid');
      else h.classList.add('shoot-invalid');
    } else if (!isEnemy(uid) && uid !== state.attackerId) {
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

// ── Update fight buttons ────────────────────────────────
function updateFightButtons() {
  const btnConfirm = $('#btn-confirm-fight'), btnCancel = $('#btn-cancel-fight');
  if (!btnConfirm || !btnCancel) return;
  const inDragMode = state.dragMode !== null;
  btnCancel.disabled = !inDragMode;
  if (!inDragMode) { btnConfirm.disabled = true; return; }
  btnConfirm.disabled = !isDragLegal(state.attackerId);
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
  setStatus('◉ MAKE ATTACKS', 'fight-attack');

  // Hit roll (WS-based)
  const hitRolls = Array.from({length: totalAttacks}, d6);
  const successCount = hitRolls.filter(r => r >= thresholds.hit).length;
  const hit = await rollDiceStage('Hit Roll', hitRolls, thresholds.hit, false, targetId,
    `WS ${thresholds.hit}+`, 'hit', 'Click to Roll', 'Roll Wounds',
    async () => { if (successCount > 0) { playMeleeStrike(successCount); await playMeleeVolley(attacker, target, successCount); } });
  if (!hit.successes) return finishFight(attacker, target, 0, 0);

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
    if (fixedDamage === 1) { totalDamage = failedSaves; }
    else {
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

// ── Finish fight — consolidation or mark fought ─────────
async function finishFight(attacker, target, totalDamage, killCount) {
  renderModels(); paint(); state.killsThisAttack = killCount;
  await showResultPanel(target.id, totalDamage, killCount);
  state.phase = 'consolidate';
  enterDragMode('consolidate');
}

// ── Enemy interaction (target selection phase) ──────────
function onEnemyInteract(unitId) {
  if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
  if (state.phase !== 'target-select') return;
  if (!isEngagedWith(state.attackerId, unitId)) return;
  beginAttack(unitId);
}
async function beginAttack(targetId) {
  if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
  state.targetId = targetId; state.hoveredTargetId = null;
  state.phase = 'attacking'; paint();
  const profiles = getProfiles(state.attackerId);
  if (!profiles.length) {
    state.foughtUnits.add(state.attackerId);
    setStatus('No melee weapons');
    setTimeout(() => { setStatus(''); wrappedSelectUnit(null); }, 1000);
    return;
  }
  if (profiles.length === 1) { state.selectedProfileIx = 0; await resolveAttack(targetId); }
  else openWeaponPopup(targetId, profiles.map((p, i) => ({ profile: p, i })), resolveAttack);
}

// ── Fight overrides (enemy hover/click during target-select) ──
let _fightMousemove = null, _fightMouseleave = null, _fightIntercept = null, _fightKeydown = null;

function bindFightOverrides() {
  const svg = $('#bf-svg'); if (!svg) return;
  _fightMousemove = (e) => {
    if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
    if (state.dragMode) return;
    if (state.phase !== 'target-select') return;
    let node = e.target;
    while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
    if (!node) return;
    const uid = node.dataset.unitId;
    if (!isEnemy(uid) || !isEngagedWith(state.attackerId, uid)) return;
    state.hoveredTargetId = uid; paint();
  };
  svg.addEventListener('mousemove', _fightMousemove, true);
  _fightMouseleave = () => { if (state.targetId) return; state.hoveredTargetId = null; paint(); };
  svg.addEventListener('mouseleave', _fightMouseleave, true);
  _fightIntercept = (e) => {
    if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
    if (state.dragMode) return;
    if (state.phase !== 'target-select') return;
    let node = e.target;
    while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
    if (!node) return;
    const uid = node.dataset.unitId;
    if (!isEnemy(uid) || !isEngagedWith(state.attackerId, uid)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type === 'click') onEnemyInteract(uid);
  };
  svg.addEventListener('mousedown', _fightIntercept, true);
  svg.addEventListener('click', _fightIntercept, true);
}

// ── Selection override ──────────────────────────────────
function selectAttacker(uid) {
  state.attackerId = uid; state.targetId = null; state.hoveredTargetId = null;
  state.selectedProfileIx = 0; state.killsThisAttack = 0;
  closeWeaponPopup(); clearEffects(); clearFightOverlays();
  if (state.dragMode) exitDragMode();
  paint(); setStatus(uid ? '' : '— SELECT UNIT —');
}
function wrappedSelectUnit(uid) {
  if (state.dragMode) return;
  if (state.phase === 'target-select' && uid && !isEnemy(uid)) return;
  baseSelectUnit(uid);
  if (!uid) {
    selectAttacker(null); state.phase = null;
    setStatus('— SELECT UNIT —');
    requestAnimationFrame(() => paint()); return;
  }
  const u = getUnit(uid); if (!u) return;
  if (u.faction === ACTIVE) {
    if (state.foughtUnits.has(uid)) { setStatus('Unit already fought this phase'); selectAttacker(uid); }
    else if (!isInEngagement(uid)) { setStatus('Not in Engagement Range'); selectAttacker(uid); }
    else { selectAttacker(uid); state.phase = 'pile-in'; enterDragMode('pile-in'); }
    const rangesEl = $('#card-ranges'); if (rangesEl) rangesEl.innerHTML = '';
    requestAnimationFrame(() => paint());
  } else {
    if (state.phase === 'target-select' && state.attackerId && isEngagedWith(state.attackerId, uid))
      onEnemyInteract(uid);
    const rangesEl = $('#card-ranges'); if (rangesEl) rangesEl.innerHTML = '';
  }
}

// ── Init ───────────────────────────────────────────────
export function initFight() {
  callbacks.selectUnit = wrappedSelectUnit;
  window.selectUnit = wrappedSelectUnit;
  $('#btn-end-fight')?.addEventListener('click', function() {
    var btn = $('#btn-end-fight');
    if (btn) {
      btn.textContent = '✓ FIGHT COMPLETE'; btn.disabled = true;
      btn.style.background = 'var(--success-dim, rgba(0,200,80,0.15))';
      btn.style.borderColor = 'var(--success, rgba(0,200,80,0.4))';
      btn.style.color = 'var(--success, #00c850)';
    }
  });
  $('#card-close')?.addEventListener('click', () => wrappedSelectUnit(null));
  $('#btn-confirm-fight')?.addEventListener('click', confirmDrag);
  $('#btn-cancel-fight')?.addEventListener('click', cancelDrag);
  _fightKeydown = (e) => {
    if (e.key === 'Escape') { if (state.dragMode) cancelDrag(); else wrappedSelectUnit(null); }
  };
  document.addEventListener('keydown', _fightKeydown);
  const phaseHeader = document.getElementById('phase-header');
  if (phaseHeader && !document.getElementById('fight-invalid-banner')) {
    const cohBanner = document.getElementById('cohesion-banner');
    if (cohBanner) phaseHeader.appendChild(cohBanner);
    const banner = document.createElement('div');
    banner.id = 'fight-invalid-banner'; banner.innerHTML = '⚠ INVALID PILE IN';
    banner.style.display = 'none'; phaseHeader.appendChild(banner);
  }
  installDragInterceptor(); installDragEnforcement(); bindFightOverrides();
  callbacks.afterRender = () => { if (state.dragMode && state.attackerId) updateDirectionFeedback(); };
  setStatus('— SELECT UNIT —'); paint();
}

// ── Cleanup (for integrated phase transition) ─────────
export function cleanupFight() {
  const svg = $('#bf-svg');
  if (svg) {
    if (_fightMousemove) svg.removeEventListener('mousemove', _fightMousemove, true);
    if (_fightMouseleave) svg.removeEventListener('mouseleave', _fightMouseleave, true);
    if (_fightIntercept) { svg.removeEventListener('mousedown', _fightIntercept, true); svg.removeEventListener('click', _fightIntercept, true); }
  }
  _fightMousemove = null; _fightMouseleave = null; _fightIntercept = null;
  if (_fightKeydown) document.removeEventListener('keydown', _fightKeydown);
  _fightKeydown = null;
  delete simState.drag; simState.drag = null;
  clearFightOverlays(); clearFightRangeRings(); clearEffects(); clearModelHighlights();
  $$('#layer-hulls .unit-hull').forEach(h => {
    h.classList.remove('shoot-valid', 'shoot-invalid', 'shoot-target', 'shoot-attacker', 'fight-engaged', 'fight-eligible');
  });
  const overlay = $('#roll-overlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.innerHTML = ''; }
  const fightBanner = document.getElementById('fight-invalid-banner');
  if (fightBanner) fightBanner.remove();
  $$('.wound-ring-layer').forEach(el => el.remove());
  state.attackerId = null; state.targetId = null; state.hoveredTargetId = null;
  state.selectedProfileIx = 0; state.foughtUnits.clear();
  state.dragMode = null; state.dragStarts = {}; state.phase = null; state.killsThisAttack = 0;
  if (state.overlayRaf) { cancelAnimationFrame(state.overlayRaf); state.overlayRaf = null; }
  callbacks.selectUnit = null; callbacks.afterRender = null;
  delete window.selectUnit; delete window.__spentUnitIds;
}
