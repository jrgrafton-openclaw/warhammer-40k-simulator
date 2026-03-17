/* shooting.js — Shooting phase entry point (ES module).
 * Main init/cleanup, rendering, and UI wiring.
 * Helpers in shoot-helpers.js, attack flow in shoot-resolve.js.
 */

import { callbacks } from '../../../shared/state/store.js';
import { UNITS } from '../../../shared/state/units.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';
import { getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { drawPerModelRangeRings, clearRangeRings } from '../../../shared/world/range-rings.js';

import {
  ACTIVE, state, $, $$, _hooks,
  getUnit, isEnemy, setStatus, parseRange,
  getProfiles, getValidProfilesForTarget, losState,
  closestTargetEdgePoint, modelEdgePointToward,
  targetInfo
} from './shoot-helpers.js';

import {
  ensureOverlayPinLoop,
  closeWeaponPopup, openWeaponPopup,
  beginAttack, onEnemyInteract,
  rollDiceStage, playVolley,
  clearEffects
} from './shoot-resolve.js';

// Register hooks for shoot-resolve.js (breaks circular import)
// Function declarations below are hoisted, so they're available here.
_hooks.drawHoverLines = function(tid) { return drawHoverLines(tid); };
_hooks.clearLines = function() { return clearLines(); };
_hooks.clearEffects = function() { return clearEffects(); };
_hooks.paint = function() { return paint(); };

function updateSpentIndicators(){
  $$('.rail-unit').forEach(row => row.classList.toggle('attacked', state.shotUnits.has(row.dataset.unit)));
  const badge = $('#unit-state-badge');
  if (badge) badge.classList.toggle('visible', !!state.attackerId && state.shotUnits.has(state.attackerId));
}

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

export function clearLines(){ const g = $('#layer-target-lines'); if (g) g.innerHTML = ''; }

export function _addOriginDot(g, x, y, blocked) {
  if (!document.body.classList.contains('debug-los-enhanced')) return;
  const NS = 'http://www.w3.org/2000/svg';
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', x); dot.setAttribute('cy', y);
  dot.setAttribute('r', '3');
  dot.setAttribute('class', blocked ? 'los-origin-dot-blocked' : 'los-origin-dot');
  g.appendChild(dot);
}

export function drawHoverLines(targetId){
  const g = $('#layer-target-lines'); if (!g) return; g.innerHTML='';
  if (!state.attackerId || !targetId) return;
  const attacker = getUnit(state.attackerId), target = getUnit(targetId); if (!attacker || !target) return;
  const NS = 'http://www.w3.org/2000/svg';
  const losResult = losState(state.attackerId, targetId);

  attacker.models.forEach(m => {
    const modelLos = losResult.perModel.get(m.id);
    if (!modelLos || !modelLos.bestTarget) return;

    if (modelLos.canSee && modelLos.bestRay) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', modelLos.bestRay.from.x); line.setAttribute('y1', modelLos.bestRay.from.y);
      line.setAttribute('x2', modelLos.bestRay.to.x); line.setAttribute('y2', modelLos.bestRay.to.y);
      line.setAttribute('class', 'target-line-clear');
      g.appendChild(line);
      _addOriginDot(g, modelLos.bestRay.from.x, modelLos.bestRay.from.y, false);
    } else if (modelLos.canSee) {
      const tm = modelLos.bestTarget.model;
      const tEdge = closestTargetEdgePoint(m, { models: [tm] });
      const aEdge = modelEdgePointToward(m, tEdge.x, tEdge.y);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', aEdge.x); line.setAttribute('y1', aEdge.y);
      line.setAttribute('x2', tEdge.x); line.setAttribute('y2', tEdge.y);
      line.setAttribute('class', 'target-line-clear');
      g.appendChild(line);
      _addOriginDot(g, aEdge.x, aEdge.y, false);
    } else {
      const tm = modelLos.bestTarget.model;
      const tEdge = closestTargetEdgePoint(m, { models: [tm] });
      const hp = modelLos.bestTarget.hitPoint;
      if (hp) {
        const aEdge = modelEdgePointToward(m, hp.x, hp.y);
        const blueLine = document.createElementNS(NS, 'line');
        blueLine.setAttribute('x1', aEdge.x); blueLine.setAttribute('y1', aEdge.y);
        blueLine.setAttribute('x2', hp.x); blueLine.setAttribute('y2', hp.y);
        blueLine.setAttribute('class', 'target-line-clear');
        g.appendChild(blueLine);

        const redLine = document.createElementNS(NS, 'line');
        redLine.setAttribute('x1', hp.x); redLine.setAttribute('y1', hp.y);
        redLine.setAttribute('x2', tEdge.x); redLine.setAttribute('y2', tEdge.y);
        redLine.setAttribute('class', 'target-line-blocked');
        g.appendChild(redLine);
        _addOriginDot(g, aEdge.x, aEdge.y, true);
      } else {
        const aEdge = modelEdgePointToward(m, tEdge.x, tEdge.y);
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', aEdge.x); line.setAttribute('y1', aEdge.y);
        line.setAttribute('x2', tEdge.x); line.setAttribute('y2', tEdge.y);
        line.setAttribute('class', 'target-line-blocked');
        g.appendChild(line);
        _addOriginDot(g, aEdge.x, aEdge.y, true);
      }
    }
  });
}

export function paint(){
  $$('#layer-hulls .unit-hull').forEach(h=>{
    const uid = h.dataset.unitId;
    h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker','shoot-partial');
    if (uid === state.attackerId) h.classList.add('shoot-attacker');
    else if (isEnemy(uid) && state.attackerId && !state.shotUnits.has(state.attackerId)) {
      const valids = getValidProfilesForTarget(uid);
      if (valids.length) {
        h.classList.add('shoot-valid');
        if (valids.some(v => v.info.los === 'partial' || (v.info.losResult && v.info.losResult.state === 'partial'))) h.classList.add('shoot-partial');
      } else h.classList.add('shoot-invalid');
    }
    if (uid === state.targetId || uid === state.hoveredTargetId) h.classList.add('shoot-target');
  });
  updateSpentIndicators();
  updateWoundOverlays();
}

// ── Weapon range ring colors ──────────────────────────
const WEAPON_RING_COLORS = [
  { fill: 'rgba(0,180,255,0.06)', stroke: 'rgba(0,212,255,0.25)' },
  { fill: 'rgba(80,140,255,0.05)', stroke: 'rgba(100,160,255,0.22)' },
  { fill: 'rgba(0,255,200,0.04)', stroke: 'rgba(0,220,180,0.20)' },
  { fill: 'rgba(140,100,255,0.05)', stroke: 'rgba(140,120,255,0.22)' }
];

const activeWeaponToggles = new Set();

function buildWeaponRangeToggles(uid) {
  const rangesEl = $('#card-ranges');
  if (!rangesEl) return;
  const u = UNITS[uid];
  if (!u) { rangesEl.innerHTML = ''; return; }
  const unit = getUnit(uid);
  if (!unit || unit.faction !== ACTIVE) { rangesEl.innerHTML = ''; return; }

  const profiles = getProfiles(uid);
  if (!profiles.length) { rangesEl.innerHTML = ''; return; }

  const seen = new Set();
  const unique = [];
  profiles.forEach(p => {
    const key = p.name + '|' + p.rng;
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
  });

  activeWeaponToggles.clear();
  clearRangeRings();

  rangesEl.innerHTML = unique.map((p, i) => {
    const rng = parseRange(p);
    return `<button class="range-toggle weapon-range" data-wpn-ix="${i}">${p.name}<br>${rng}"</button>`;
  }).join('');

  rangesEl.querySelectorAll('.weapon-range').forEach(btn => {
    btn.addEventListener('click', () => {
      const ix = Number(btn.dataset.wpnIx);
      const wasActive = activeWeaponToggles.has(ix);

      activeWeaponToggles.clear();
      rangesEl.querySelectorAll('.weapon-range').forEach(otherBtn => otherBtn.classList.remove('active'));
      clearRangeRings();

      if (wasActive) return;

      activeWeaponToggles.add(ix);
      btn.classList.add('active');

      const prof = unique[ix];
      if (!prof) return;
      const rng = parseRange(prof);
      const color = WEAPON_RING_COLORS[ix % WEAPON_RING_COLORS.length];
      drawPerModelRangeRings(uid, [{ radiusInches: rng, fill: color.fill, stroke: color.stroke }]);
    });
  });
}

function wrappedSelectUnit(uid) {
  const prevAttacker = state.attackerId;
  const sameUnit = uid && uid === prevAttacker;

  if (!sameUnit) {
    clearRangeRings();
    activeWeaponToggles.clear();
  }

  baseSelectUnit(uid);
  if (!uid) {
    clearRangeRings();
    activeWeaponToggles.clear();
    selectAttacker(null);
    requestAnimationFrame(() => paint());
    return;
  }
  const u = getUnit(uid);
  if (!u) return;
  if (u.faction === ACTIVE) {
    selectAttacker(uid);
    if (!sameUnit) buildWeaponRangeToggles(uid);
    requestAnimationFrame(() => paint());
  } else {
    clearRangeRings();
    activeWeaponToggles.clear();
    const rangesEl = $('#card-ranges');
    if (rangesEl) rangesEl.innerHTML = '';
  }
}

function selectAttacker(uid){
  state.attackerId = uid;
  state.targetId = null;
  state.hoveredTargetId = null;
  state.selectedProfileIx = 0;
  closeWeaponPopup(); clearLines(); clearEffects(); paint(); setStatus('');
}

// ── Stored handler refs (for cleanup) ───────────────────
let _svgMousemove = null;
let _svgMouseleave = null;
let _svgIntercept = null;
let _docKeydown = null;
let _btnEndShoot = null;

function bindShootOverrides(){
  const svg = $('#bf-svg'); if (!svg) return;
  _svgMousemove = (e) => {
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    let node = e.target;
    while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
    if (!node) return;
    const uid = node.dataset.unitId;
    if (!isEnemy(uid)) return;
    const options = getValidProfilesForTarget(uid); if (!options.length) return;
    state.hoveredTargetId = uid; drawHoverLines(uid); paint();
  };
  svg.addEventListener('mousemove', _svgMousemove, true);
  _svgMouseleave = () => {
    if (state.targetId) return;
    state.hoveredTargetId = null; clearLines(); paint();
  };
  svg.addEventListener('mouseleave', _svgMouseleave, true);
  _svgIntercept = (e) => {
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    let node = e.target;
    while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
    if (!node) return;
    const uid = node.dataset.unitId;
    if (!isEnemy(uid)) return;
    if (!getValidProfilesForTarget(uid).length) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type === 'click') onEnemyInteract(uid);
  };
  svg.addEventListener('mousedown', _svgIntercept, true);
  svg.addEventListener('click', _svgIntercept, true);
}

// ── Init ───────────────────────────────────────────────
export function initShooting() {
  callbacks.selectUnit = wrappedSelectUnit;
  window.selectUnit = wrappedSelectUnit;

  _btnEndShoot = () => setStatus('END SHOOTING NOT WIRED IN MOCKUP');
  $('#btn-end-shoot')?.addEventListener('click', _btnEndShoot);
  $('#card-close')?.addEventListener('click', () => baseSelectUnit(null));

  _docKeydown = (e) => {
    if (e.key === 'Escape') { baseSelectUnit(null); }
  };
  document.addEventListener('keydown', _docKeydown);

  window.__shootDebug = {
    state,
    selectAttacker,
    beginAttack,
    targetInfo,
    getValidProfilesForTarget,
    clearEffects,
    paint,
    rollDiceStage,
    playVolley
  };

  bindShootOverrides();
  paint();
}

export function cleanupShooting() {
  const svg = $('#bf-svg');
  if (svg) {
    if (_svgMousemove) svg.removeEventListener('mousemove', _svgMousemove, true);
    if (_svgMouseleave) svg.removeEventListener('mouseleave', _svgMouseleave, true);
    if (_svgIntercept) { svg.removeEventListener('mousedown', _svgIntercept, true); svg.removeEventListener('click', _svgIntercept, true); }
  }
  _svgMousemove = _svgMouseleave = _svgIntercept = null;
  if (_docKeydown) document.removeEventListener('keydown', _docKeydown);
  _docKeydown = null;
  if (_btnEndShoot) $('#btn-end-shoot')?.removeEventListener('click', _btnEndShoot);
  _btnEndShoot = null;

  state.attackerId = null; state.targetId = null; state.hoveredTargetId = null;
  state.selectedProfileIx = 0; state.shotUnits.clear();
  state.pinnedPopupTargetId = null; state.pinnedRollTargetId = null;
  if (state.overlayRaf) { cancelAnimationFrame(state.overlayRaf); state.overlayRaf = null; }

  clearLines(); clearEffects(); closeWeaponPopup(); clearRangeRings();
  $$('#layer-hulls .unit-hull').forEach(h => h.classList.remove('shoot-valid', 'shoot-invalid', 'shoot-target', 'shoot-attacker', 'shoot-partial'));
  $$('.wound-ring-layer').forEach(el => el.remove());
  callbacks.selectUnit = null; delete window.selectUnit;
  delete window.__shootDebug; delete window.__spentUnitIds;
}
