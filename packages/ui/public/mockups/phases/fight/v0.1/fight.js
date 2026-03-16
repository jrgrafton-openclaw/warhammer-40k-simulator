/* fight.js — Fight phase interaction (ES module)
 * Melee combat: auto pile-in drag, WS-based hit rolls, wound/save/damage,
 * auto consolidation drag.
 *
 * Flow: select engaged unit → auto pile-in → confirm → select target →
 *       dice pipeline → auto consolidate (if kills) → confirm → mark fought
 */

import { simState, PX_PER_INCH, callbacks } from '../../../shared/state/store.js';
import { UNITS, KW_RULES, wgState, initAllTooltips, showTip, hideTip } from '../../../shared/state/units.js';
import { playDiceRoll, playMeleeStrike, playSaveFailed } from '../../../shared/audio/sfx.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps,
         checkCohesion } from '../../../shared/world/svg-renderer.js';
import { center, projectileAnchor, getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';

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
  overlayRaf: null,
  dragMode: null,        // null | 'pile-in' | 'consolidate'
  dragStarts: {},        // modelId → {x, y}
  phase: null,           // null | 'pile-in' | 'target-select' | 'attacking' | 'consolidate'
  killsThisAttack: 0
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
function setStatus(msg, cls){
  const el = $('#move-mode-label');
  if (!el) return;
  el.textContent = msg || '';
  el.className = cls || '';
}
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

function isEngagedWith(unitIdA, unitIdB){
  const a = getUnit(unitIdA), b = getUnit(unitIdB);
  if (!a || !b) return false;
  return a.models.some(am =>
    b.models.some(bm => inEngagementRange(am, bm))
  );
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
      if (state.phase === 'target-select' && isEngagedWith(state.attackerId, uid)) {
        h.classList.add('shoot-valid');
      } else if (state.phase !== 'target-select') {
        h.classList.add('shoot-invalid');
      } else {
        h.classList.add('shoot-invalid');
      }
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

// ── Chainsword weapon strike animation (design system v4) ──
const SPARK_COLORS = ['#ff8020','#ffaa40','#e06818','#cc5010','#ff6830'];

function fireWeaponStrike(container, targetScreenPos) {
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
  score.setAttribute('d', d);
  score.setAttribute('fill', 'none');
  score.setAttribute('stroke', '#1a1e24');
  score.setAttribute('stroke-width', '4');
  score.setAttribute('stroke-linecap', 'round');
  score.setAttribute('stroke-dasharray', '200');
  score.setAttribute('stroke-dashoffset', '200');
  score.style.animation = 'slash-score .5s ease forwards';
  svg.appendChild(score);

  const edge = document.createElementNS(NS, 'path');
  edge.setAttribute('d', d);
  edge.setAttribute('fill', 'none');
  edge.setAttribute('stroke', '#c0c8d4');
  edge.setAttribute('stroke-width', '1.8');
  edge.setAttribute('stroke-linecap', 'round');
  edge.setAttribute('stroke-dasharray', '200');
  edge.setAttribute('stroke-dashoffset', '200');
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
      spark.style.cssText = `
        --sx:29px;--sy:29px;
        --dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px;
        background:${color};box-shadow:0 0 3px ${color};
        left:0;top:0;
        animation:slash-spark .4s ease-out ${rng()*.1}s forwards;
      `;
      arena.appendChild(spark);
    }
  }, 120);

  setTimeout(() => arena.remove(), 900);
}

async function playMeleeVolley(attacker, target, strikeCount){
  const container = $('#proj-container');
  if (!container) return;
  const count = strikeCount || attacker.models.length;

  const strikes = [];
  for (let i = 0; i < count; i++) {
    strikes.push({ to: randomTargetModel(target) });
  }

  strikes.forEach((s, ix) => {
    const toPos = projectileAnchor(s.to);
    if (!toPos.valid) return;
    setTimeout(() => {
      fireWeaponStrike(container, toPos);
      const token = tokenVisual(s.to);
      if (token) {
        token.classList.remove('anim-slash-recoil');
        void token.getBoundingClientRect();
        token.classList.add('anim-slash-recoil');
        setTimeout(() => token.classList.remove('anim-slash-recoil'), 350);
      }
    }, ix * 100);
  });

  await new Promise(r => setTimeout(r, Math.max(500, count * 100 + 500)));
}

// ══════════════════════════════════════════════════════════
// ── DRAG MODE: Pile-In & Consolidation ───────────────────
// ══════════════════════════════════════════════════════════

// ── Enter drag mode ─────────────────────────────────────
function enterDragMode(mode) {
  state.dragMode = mode;
  state.dragStarts = {};
  const unit = getUnit(state.attackerId);
  if (!unit) return;
  // Capture start positions
  unit.models.forEach(m => {
    state.dragStarts[m.id] = { x: m.x, y: m.y };
  });
  // Draw range rings
  drawFightRangeRings(state.attackerId);
  // Draw ghost circles
  renderFightOverlays(state.attackerId);
  // Update buttons
  updateFightButtons();
  // Update status
  setStatus(
    mode === 'pile-in' ? '◉ PILE IN 3"' : '◉ CONSOLIDATE 3"',
    mode === 'pile-in' ? 'fight-pile-in' : 'fight-consolidate'
  );
}

// ── Exit drag mode ──────────────────────────────────────
function exitDragMode() {
  state.dragMode = null;
  state.dragStarts = {};
  clearFightRangeRings();
  clearFightOverlays();
  clearModelHighlights();
  const banner = document.getElementById('fight-invalid-banner');
  if (banner) banner.style.display = 'none';
  updateFightButtons();
}

// ── Range rings (3" orange circles from dragStarts) ─────
function drawFightRangeRings(unitId) {
  const layer = document.getElementById('layer-range-rings');
  if (!layer) return;
  layer.innerHTML = '';
  const unit = getUnit(unitId);
  if (!unit) return;
  const NS = 'http://www.w3.org/2000/svg';
  const radiusPx = 3 * PX_PER_INCH;

  unit.models.forEach(m => {
    const start = state.dragStarts[m.id];
    if (!start) return;
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', start.x);
    circle.setAttribute('cy', start.y);
    circle.setAttribute('r', radiusPx);
    circle.setAttribute('fill', 'rgba(255,140,0,0.06)');
    circle.setAttribute('stroke', 'rgba(255,140,0,0.25)');
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('class', 'range-ring');
    circle.setAttribute('pointer-events', 'none');
    layer.appendChild(circle);
  });
}

function clearFightRangeRings() {
  const layer = document.getElementById('layer-range-rings');
  if (layer) layer.innerHTML = '';
}

// ── Ghost circles + rulers ──────────────────────────────
function renderFightOverlays(unitId) {
  const layerGhosts = document.getElementById('layer-move-ghosts');
  const layerRulers = document.getElementById('layer-move-rulers');
  if (!layerGhosts || !layerRulers) return;
  layerGhosts.innerHTML = '';
  layerRulers.innerHTML = '';
  if (!state.dragMode || !unitId) return;
  const unit = getUnit(unitId);
  if (!unit) return;
  const NS = 'http://www.w3.org/2000/svg';
  const radiusPx = 3 * PX_PER_INCH;

  unit.models.forEach(m => {
    const start = state.dragStarts[m.id];
    if (!start) return;
    // Ghost circle at start
    const ghost = document.createElementNS(NS, 'circle');
    ghost.setAttribute('cx', start.x);
    ghost.setAttribute('cy', start.y);
    ghost.setAttribute('r', m.r || 8);
    ghost.setAttribute('class', 'move-ghost');
    ghost.style.stroke = '#ff8c00';
    ghost.style.strokeWidth = '1.5';
    ghost.style.pointerEvents = 'none';
    layerGhosts.appendChild(ghost);

    // Ruler line from start to current
    const dx = m.x - start.x, dy = m.y - start.y, dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const overRange = dist > radiusPx + 0.5;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', start.x); line.setAttribute('y1', start.y);
    line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
    line.setAttribute('class', 'move-ruler');
    line.style.stroke = overRange ? '#ff3333' : '#ff8c00';
    layerRulers.appendChild(line);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', (start.x + m.x) / 2);
    label.setAttribute('y', (start.y + m.y) / 2 - 4);
    label.setAttribute('class', 'move-ruler-label');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = (dist / PX_PER_INCH).toFixed(1) + '"';
    layerRulers.appendChild(label);
  });
}

function clearFightOverlays() {
  ['layer-move-ghosts', 'layer-move-rulers', 'layer-range-rings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

// ── Direction validation ────────────────────────────────
// Distance from a point (px,py) to the closest enemy model (center-to-center minus radii)
function closestEnemyDist(px, py, modelRadius, enemyModels) {
  let best = Infinity;
  for (const em of enemyModels) {
    const d = Math.hypot(px - em.x, py - em.y) - modelRadius - getModelRadius(em);
    if (d < best) best = d;
  }
  return Math.max(0, best); // Clamp: overlapping/touching = 0
}

function closestObjectiveDist(px, py) {
  let best = Infinity;
  for (const o of OBJECTIVES) {
    const d = Math.hypot(px - o.x, py - o.y);
    if (d < best) best = d;
  }
  return best;
}

function updateDirectionFeedback() {
  const banner = document.getElementById('fight-invalid-banner');
  if (!banner) return;
  
  if (!state.dragMode || !state.attackerId) {
    banner.style.display = 'none';
    clearModelHighlights();
    return;
  }
  
  const unit = getUnit(state.attackerId);
  if (!unit) { banner.style.display = 'none'; clearModelHighlights(); return; }
  
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);
  const radiusPx = 3 * PX_PER_INCH;
  
  let anyInvalid = false;
  const invalidModelIds = new Set();
  
  unit.models.forEach(m => {
    const start = state.dragStarts[m.id];
    if (!start) return;
    const moved = Math.hypot(m.x - start.x, m.y - start.y);
    if (moved < 0.5) return; // didn't move, always valid
    
    // Check range
    if (moved > radiusPx + 0.5) {
      anyInvalid = true;
      invalidModelIds.add(m.id);
      return;
    }
    
    // Check direction
    const r = getModelRadius(m);
    if (state.dragMode === 'pile-in') {
      if (allEnemyModels.length) {
        const distNow = closestEnemyDist(m.x, m.y, r, allEnemyModels);
        const distBefore = closestEnemyDist(start.x, start.y, r, allEnemyModels);
        if (distNow > distBefore + 0.5) {
          anyInvalid = true;
          invalidModelIds.add(m.id);
        }
      }
    } else if (state.dragMode === 'consolidate') {
      const distNow = allEnemyModels.length ? closestEnemyDist(m.x, m.y, r, allEnemyModels) : Infinity;
      const distBefore = allEnemyModels.length ? closestEnemyDist(start.x, start.y, r, allEnemyModels) : Infinity;
      const objNow = closestObjectiveDist(m.x, m.y);
      const objBefore = closestObjectiveDist(start.x, start.y);
      
      const closerToEnemy = distNow <= distBefore + 0.5;
      const closerToObj = objNow <= objBefore + 0.5;
      if (!closerToEnemy && !closerToObj) {
        anyInvalid = true;
        invalidModelIds.add(m.id);
      }
    }
  });
  
  if (anyInvalid) {
    banner.textContent = state.dragMode === 'pile-in' 
      ? '⚠ INVALID PILE IN — must move closer to enemy'
      : '⚠ INVALID CONSOLIDATION — must move toward enemy or objective';
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
  
  // Highlight invalid models with orange ring
  highlightInvalidModels(invalidModelIds);
}

function highlightInvalidModels(invalidIds) {
  // Clear previous highlights
  document.querySelectorAll('#layer-models .model-base').forEach(g => {
    g.classList.remove('fight-invalid-model');
  });
  // Add orange border ring to invalid models (CSS handles ring + icon color)
  invalidIds.forEach(modelId => {
    const el = document.querySelector(`#layer-models .model-base[data-model-id="${modelId}"]`);
    if (!el) return;
    el.classList.add('fight-invalid-model');
  });
}

function clearModelHighlights() {
  document.querySelectorAll('#layer-models .model-base').forEach(g => {
    g.classList.remove('fight-invalid-model');
  });
}

function isPileInDirectionValid(unitId) {
  const unit = getUnit(unitId);
  if (!unit) return false;
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);
  if (!allEnemyModels.length) return true;

  return unit.models.every(m => {
    const start = state.dragStarts[m.id];
    if (!start) return true;
    if (Math.hypot(m.x - start.x, m.y - start.y) < 0.5) return true; // didn't move

    const r = getModelRadius(m);
    const distNow = closestEnemyDist(m.x, m.y, r, allEnemyModels);
    const distBefore = closestEnemyDist(start.x, start.y, r, allEnemyModels);
    if (distNow > distBefore + 0.5) {
      console.log(`[fight] pile-in: ${m.id} not closer to enemy (now=${distNow.toFixed(1)} before=${distBefore.toFixed(1)})`);
      return false;
    }
    return true;
  });
}

function isConsolidateDirectionValid(unitId) {
  const unit = getUnit(unitId);
  if (!unit) return false;
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);

  return unit.models.every(m => {
    const start = state.dragStarts[m.id];
    if (!start) return true;
    if (Math.hypot(m.x - start.x, m.y - start.y) < 0.5) return true;

    const r = getModelRadius(m);

    // Closer to enemy? (with tolerance)
    if (allEnemyModels.length) {
      const distNow = closestEnemyDist(m.x, m.y, r, allEnemyModels);
      const distBefore = closestEnemyDist(start.x, start.y, r, allEnemyModels);
      if (distNow <= distBefore + 0.5) return true;
      console.log(`[fight] consolidate: ${m.id} not closer to enemy (now=${distNow.toFixed(1)} before=${distBefore.toFixed(1)})`);
    }

    // OR closer to objective? (with tolerance)
    const objNow = closestObjectiveDist(m.x, m.y);
    const objBefore = closestObjectiveDist(start.x, start.y);
    if (objNow > objBefore + 0.5) {
      console.log(`[fight] consolidate: ${m.id} not closer to objective either (now=${objNow.toFixed(1)} before=${objBefore.toFixed(1)})`);
      return false;
    }
    return true;
  });
}

function isDragLegal(unitId) {
  const unit = getUnit(unitId);
  if (!unit) return false;
  const radiusPx = 3 * PX_PER_INCH;

  for (const m of unit.models) {
    const ts = state.dragStarts[m.id];
    if (!ts) continue;
    const dist = Math.hypot(m.x - ts.x, m.y - ts.y);
    if (dist > radiusPx + 0.5) {
      console.log(`[fight] ${m.id} over range: ${(dist/PX_PER_INCH).toFixed(1)}" > 3"`);
      return false;
    }
  }

  if (state.dragMode === 'pile-in') {
    const valid = isPileInDirectionValid(unitId);
    if (!valid) console.log('[fight] pile-in direction invalid');
    return valid;
  }
  if (state.dragMode === 'consolidate') {
    const valid = isConsolidateDirectionValid(unitId);
    if (!valid) console.log('[fight] consolidate direction invalid');
    return valid;
  }
  return true;
}

// ── Update fight buttons ────────────────────────────────
function updateFightButtons() {
  const btnConfirm = $('#btn-confirm-fight');
  const btnCancel = $('#btn-cancel-fight');
  if (!btnConfirm || !btnCancel) return;

  const inDragMode = state.dragMode !== null;
  btnCancel.disabled = !inDragMode;

  if (!inDragMode) {
    btnConfirm.disabled = true;
    return;
  }

  // Check legality
  btnConfirm.disabled = !isDragLegal(state.attackerId);
}

// ── Confirm drag ────────────────────────────────────────
function confirmDrag() {
  if (!isDragLegal(state.attackerId)) {
    const btn = $('#btn-confirm-fight');
    if (btn) { btn.classList.add('shake-error'); setTimeout(() => btn.classList.remove('shake-error'), 450); }
    return;
  }

  const mode = state.dragMode;
  exitDragMode();

  if (mode === 'pile-in') {
    // After pile-in confirmed, enter target selection
    state.phase = 'target-select';
    setStatus('Select enemy target', 'fight-target');
    paint();
  } else if (mode === 'consolidate') {
    state.foughtUnits.add(state.attackerId);
    state.attackerId = null;
    state.targetId = null;
    state.phase = null;
    setStatus('— SELECT UNIT —');
    closeWeaponPopup();
    clearEffects();
    baseSelectUnit(null);
    paint();
  }
}

// ── Cancel drag ─────────────────────────────────────────
function cancelDrag() {
  const currentPhase = state.phase;
  const unit = getUnit(state.attackerId);
  if (unit) {
    unit.models.forEach(m => {
      const ts = state.dragStarts[m.id];
      if (ts) { m.x = ts.x; m.y = ts.y; }
    });
  }
  exitDragMode();
  renderModels();

  if (currentPhase === 'pile-in') {
    // Cancel pile-in: deselect entirely
    state.attackerId = null;
    state.phase = null;
    setStatus('— SELECT UNIT —');
    baseSelectUnit(null);
    paint();
  } else if (currentPhase === 'consolidate') {
    // Cancel consolidation: reset positions but re-enter consolidate mode
    // so the player can try again
    state.phase = 'consolidate';
    enterDragMode('consolidate');
    paint();
  }
}

// ── Drag interceptor ────────────────────────────────────
function installDragInterceptor() {
  let _drag = null;
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get() { return _drag; },
    set(value) {
      if (value !== null) {
        // Only allow dragging in drag mode
        if (!state.dragMode) return;
        let unit = null;
        if (value.type === 'unit') unit = value.unit;
        else if (value.type === 'model') unit = simState.units.find(u => u.models.includes(value.model));
        if (unit) {
          // Only allow dragging the current attacker
          if (unit.id !== state.attackerId) return;
          if (state.foughtUnits.has(unit.id)) return;
          if (unit.faction !== ACTIVE) return;
        }
      }
      _drag = value;
    }
  });
}

// ── Drag enforcement (mousemove) ────────────────────────
function installDragEnforcement() {
  // Re-apply highlights after model drop (mouseup)
  window.addEventListener('mouseup', () => {
    if (state.dragMode && state.attackerId) {
      // Short delay to let renderModels rebuild DOM first
      requestAnimationFrame(() => {
        updateDirectionFeedback();
        updateFightButtons();
      });
    }
  });

  window.addEventListener('mousemove', () => {
    const drag = simState.drag;
    if (!drag || !state.dragMode) return;
    const uid = state.attackerId;
    if (!uid) return;
    const radiusPx = 3 * PX_PER_INCH;

    if (drag.type === 'model') {
      const m = drag.model;
      const ts = state.dragStarts[m.id];
      if (!ts) return;
      // Clamp within 3" of start
      const dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
      if (dist > radiusPx) {
        const sc = radiusPx / dist;
        m.x = ts.x + dx * sc;
        m.y = ts.y + dy * sc;
      }
      // Terrain collision
      const tr = resolveTerrainCollision(m.x, m.y, m.r || 8, window._terrainAABBs || []);
      m.x = tr.x; m.y = tr.y;
    } else if (drag.type === 'unit') {
      // Unit-to-unit collision
      resolveUnitDragCollisions(drag.unit, simState.units);
      // Per-model clamp
      drag.unit.models.forEach(m => {
        const ts = state.dragStarts[m.id];
        if (!ts) return;
        const dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > radiusPx) {
          const sc = radiusPx / dist;
          m.x = ts.x + dx * sc;
          m.y = ts.y + dy * sc;
        }
      });
      // Terrain collision for each model
      drag.unit.models.forEach(m => {
        const tr = resolveTerrainCollision(m.x, m.y, m.r || 8, window._terrainAABBs || []);
        m.x = tr.x; m.y = tr.y;
      });
      resolveUnitDragCollisions(drag.unit, simState.units);
    }

    renderModels();
    drawFightRangeRings(uid);
    renderFightOverlays(uid);
    updateFightButtons();
    updateDirectionFeedback();
  });
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
    resolveAttack(state.targetId);
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
      revealDice(rolls, threshold, stageKind);
      const diceFinishMs = 80 + rolls.length * 40 + 200; // last die reveals + settle
      if (typeof onTrigger === 'function') {
        // Wait for dice to finish revealing, THEN run trigger (e.g. weapon strike animation)
        await new Promise(r => setTimeout(r, diceFinishMs));
        await onTrigger();
      }
      const remainingMs = onTrigger ? 200 : (480 + rolls.length * 40);
      setTimeout(() => {
        if (auto) {
          setTimeout(() => resolve({ rolls, successes, threshold }), 260 + rolls.length * 40);
        } else {
          cta.textContent = nextLabel; cta.disabled = false;
          cta.onclick = () => resolve({ rolls, successes, threshold, advanceRequested: true });
        }
      }, remainingMs);
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

  setStatus('◉ MAKE ATTACKS', 'fight-attack');

  // Hit roll (WS-based)
  const hitRolls = Array.from({length: totalAttacks}, d6);
  const successCount = hitRolls.filter(r => r >= thresholds.hit).length;
  const hit = await rollDiceStage('Hit Roll', hitRolls, thresholds.hit, false, targetId,
    `WS ${thresholds.hit}+`, 'hit', 'Click to Roll', 'Roll Wounds',
    async () => {
      // Dice have already finished revealing — play weapon strike animations
      if (successCount > 0) {
        await playMeleeVolley(attacker, target, successCount);
      }
    });

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

// ── Finish fight — consolidation or mark fought ─────────
async function finishFight(attacker, target, totalDamage, killCount) {
  renderModels();
  paint();
  state.killsThisAttack = killCount;

  await showResultPanel(target.id, totalDamage, killCount);

  // Always allow consolidation after melee attacks
  state.phase = 'consolidate';
  enterDragMode('consolidate');
}

// ── Enemy interaction (target selection phase) ──────────
function onEnemyInteract(unitId) {
  if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
  if (state.phase !== 'target-select') return;
  if (!isEngagedWith(state.attackerId, unitId)) return;
  beginFight(unitId);
}

async function beginFight(targetId) {
  if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
  state.targetId = targetId;
  state.hoveredTargetId = null;
  state.phase = 'attacking';
  paint();

  const profiles = getProfiles(state.attackerId);
  if (!profiles.length) {
    state.foughtUnits.add(state.attackerId);
    setStatus('No melee weapons');
    setTimeout(() => { setStatus(''); wrappedSelectUnit(null); }, 1000);
    return;
  }

  if (profiles.length === 1) {
    state.selectedProfileIx = 0;
    await resolveAttack(targetId);
  } else {
    const options = profiles.map((p, i) => ({ profile: p, i }));
    openWeaponPopup(targetId, options);
  }
}

// ── Fight overrides (enemy hover/click during target-select) ──
function bindFightOverrides() {
  const svg = $('#bf-svg'); if (!svg) return;

  svg.addEventListener('mousemove', (e) => {
    if (!state.attackerId || state.foughtUnits.has(state.attackerId)) return;
    if (state.dragMode) return;
    if (state.phase !== 'target-select') return;
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
    if (state.dragMode) return;
    if (state.phase !== 'target-select') return;
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
function selectAttacker(uid) {
  state.attackerId = uid;
  state.targetId = null;
  state.hoveredTargetId = null;
  state.selectedProfileIx = 0;
  state.killsThisAttack = 0;
  closeWeaponPopup();
  clearEffects();
  clearFightOverlays();
  if (state.dragMode) exitDragMode();
  paint();
  setStatus(uid ? '' : '— SELECT UNIT —');
}

function wrappedSelectUnit(uid) {
  // If in drag mode, ignore selection changes
  if (state.dragMode) return;
  // If in target-select phase, don't allow changing attacker
  if (state.phase === 'target-select' && uid && !isEnemy(uid)) return;

  baseSelectUnit(uid);
  if (!uid) {
    selectAttacker(null);
    state.phase = null;
    setStatus('— SELECT UNIT —');
    requestAnimationFrame(() => paint());
    return;
  }
  const u = getUnit(uid);
  if (!u) return;

  if (u.faction === ACTIVE) {
    if (state.foughtUnits.has(uid)) {
      setStatus('Unit already fought this phase');
      selectAttacker(uid);
    } else if (!isInEngagement(uid)) {
      setStatus('Not in Engagement Range');
      selectAttacker(uid);
    } else {
      // AUTO ENTER PILE-IN MODE
      selectAttacker(uid);
      state.phase = 'pile-in';
      enterDragMode('pile-in');
    }
    const rangesEl = $('#card-ranges');
    if (rangesEl) rangesEl.innerHTML = '';
    requestAnimationFrame(() => paint());
  } else {
    // Enemy clicked
    if (state.phase === 'target-select' && state.attackerId) {
      // Target selection after pile-in
      if (isEngagedWith(state.attackerId, uid)) {
        onEnemyInteract(uid);
      }
    }
    const rangesEl = $('#card-ranges');
    if (rangesEl) rangesEl.innerHTML = '';
  }
}

callbacks.selectUnit = wrappedSelectUnit;
window.selectUnit = wrappedSelectUnit;

// ── Init ───────────────────────────────────────────────
export function initFight() {
  $('#btn-end-fight')?.addEventListener('click', () => setStatus('END FIGHT NOT WIRED IN MOCKUP'));
  $('#card-close')?.addEventListener('click', () => wrappedSelectUnit(null));
  $('#btn-confirm-fight')?.addEventListener('click', confirmDrag);
  $('#btn-cancel-fight')?.addEventListener('click', cancelDrag);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.dragMode) cancelDrag();
      else wrappedSelectUnit(null);
    }
  });

  // Move cohesion banner + create fight banner inside #phase-header (flex column)
  const phaseHeader = document.getElementById('phase-header');
  if (phaseHeader && !document.getElementById('fight-invalid-banner')) {
    // Move existing cohesion banner into the phase-header column
    const cohBanner = document.getElementById('cohesion-banner');
    if (cohBanner) {
      phaseHeader.appendChild(cohBanner);
    }

    // Create invalid-direction banner
    const banner = document.createElement('div');
    banner.id = 'fight-invalid-banner';
    banner.innerHTML = '⚠ INVALID PILE IN';
    banner.style.display = 'none';
    phaseHeader.appendChild(banner);
  }

  installDragInterceptor();
  installDragEnforcement();
  bindFightOverrides();

  // Re-apply invalid model highlights after every renderModels() call
  // (renderModels rebuilds DOM via innerHTML, wiping classes)
  callbacks.afterRender = () => {
    if (state.dragMode && state.attackerId) {
      updateDirectionFeedback();
    }
  };

  setStatus('— SELECT UNIT —');
  paint();
}
