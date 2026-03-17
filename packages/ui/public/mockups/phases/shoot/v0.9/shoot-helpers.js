/* shoot-helpers.js — Shared state, utilities, LoS, and targeting helpers.
 * Extracted from shooting.js — no logic changes.
 */

import { simState, PX_PER_INCH } from '../../../shared/state/store.js';
import { UNITS, KW_RULES, wgState } from '../../../shared/state/units.js';
import { getModelRadius } from '../../../shared/lib/coord-helpers.js';

export const ACTIVE = 'imp';

// Late-binding hooks — shooting.js registers functions here to avoid circular imports.
// shoot-resolve.js accesses them via this object at runtime (always populated by then).
export const _hooks = {};

export const state = {
  attackerId: null,
  targetId: null,
  hoveredTargetId: null,
  selectedProfileIx: 0,
  shotUnits: new Set(),
  seed: (Date.now() ^ 0x5f3759df) >>> 0,
  pinnedPopupTargetId: null,
  pinnedRollTargetId: null,
  overlayRaf: null
};

window.__spentUnitIds = state.shotUnits;

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => Array.from(document.querySelectorAll(s));

export function rng(){ state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
export function d6(){ return 1 + Math.floor(rng() * 6); }
export function getUnit(uid){ return simState.units.find(u => u.id === uid); }
export function isEnemy(uid){ const u = getUnit(uid); return u && u.faction !== ACTIVE; }
export function setStatus(msg){ const el = $('#move-mode-label'); if (el) el.textContent = msg || ''; }

// Per 40K 10th Ed: "measure to the closest point of that model's base"
export function distIn(a, b){
  const ua = getUnit(a), ub = getUnit(b);
  if (!ua || !ub) return Infinity;
  let minDist = Infinity;
  ua.models.forEach(ma => {
    const ra = getModelRadius(ma);
    ub.models.forEach(mb => {
      const rb = getModelRadius(mb);
      const d = Math.max(0, Math.hypot(ma.x - mb.x, ma.y - mb.y) - ra - rb);
      if (d < minDist) minDist = d;
    });
  });
  return minDist / PX_PER_INCH;
}

export function parseRange(weapon){ return parseInt(String(weapon?.rng || '').replace(/[^0-9]/g, '')) || 0; }
export function getBallisticSkill(uid){ return ({'assault-intercessors':3,'intercessor-squad-a':3,'hellblasters':3,'primaris-lieutenant':3,'redemptor-dreadnought':3,'boyz-mob':5,'boss-nob':5,'mekboy':5,'nobz-mob':5,'gretchin':5}[uid] || 4); }
export function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g, '')); return n || 7; }
export function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
export function damageValue(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return null; return Number(s) || 1; }
export function pickDamage(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng() * 3); return Number(s) || 1; }
export function attackCount(profile, attacker, visibleModelCount){
  const modelCount = (typeof visibleModelCount === 'number') ? visibleModelCount : attacker.models.length;
  return (Number(profile.a || 1) || 1) * Math.max(0, modelCount);
}

export function getProfiles(uid){
  const u = UNITS[uid];
  if (!u) return [];
  let w = [].concat(u.weapons || []);
  const wg = wgState?.[uid] || {};
  (u.wargear || []).forEach((opt, i) => { if (wg[i] && opt.adds) w.push(opt.adds); });
  return w.filter(x => x.type === 'RANGED');
}

export function keywordsFor(profile){
  return [].concat(profile?.keywords || profile?.kw || []).filter(Boolean).map(String);
}
export function kwTip(k){
  return (KW_RULES[k] && KW_RULES[k].tip) || 'Keyword ability.';
}
export function kwClass(k){
  const v = String(k).toLowerCase();
  if (v.includes('pistol')) return 'pistol';
  if (v.includes('assault')) return 'assault';
  if (v.includes('heavy')) return 'heavy';
  if (v.includes('hazard')) return 'hazardous';
  if (v.includes('rapid')) return 'rapid';
  if (v.includes('blast')) return 'blast';
  if (v.includes('melta')) return 'melta';
  return 'other';
}

// ── Point-in-polygon (ray casting) for local-space polygons ──
export function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Ray-polygon intersection for tall ruin LoS blocking ──
export function rayIntersectsTallRuins(x1, y1, x2, y2, blockers, aCx, aCy, tCx, tCy) {
  let bestT = Infinity;
  let bestHitLocal = null;
  let bestBlocker = null;

  for (let bi = 0; bi < blockers.length; bi++) {
    const b = blockers[bi];
    const lx1 = b.iA * x1 + b.iC * y1 + b.iE;
    const ly1 = b.iB * x1 + b.iD * y1 + b.iF;
    const lx2 = b.iA * x2 + b.iC * y2 + b.iE;
    const ly2 = b.iB * x2 + b.iD * y2 + b.iF;

    if (aCx !== undefined && aCy !== undefined && tCx !== undefined && tCy !== undefined) {
      const acLocal_x = b.iA * aCx + b.iC * aCy + b.iE;
      const acLocal_y = b.iB * aCx + b.iD * aCy + b.iF;
      const tcLocal_x = b.iA * tCx + b.iC * tCy + b.iE;
      const tcLocal_y = b.iB * tCx + b.iD * tCy + b.iF;
      if (pointInPolygon(acLocal_x, acLocal_y, b.polygon) || pointInPolygon(tcLocal_x, tcLocal_y, b.polygon)) continue;
    } else {
      if (pointInPolygon(lx1, ly1, b.polygon) || pointInPolygon(lx2, ly2, b.polygon)) continue;
    }

    const poly = b.polygon;
    const n = poly.length;
    const rdx = lx2 - lx1, rdy = ly2 - ly1;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = poly[j].x - poly[i].x, ey = poly[j].y - poly[i].y;
      const denom = rdx * ey - rdy * ex;
      if (Math.abs(denom) < 1e-10) continue;

      const dx = poly[i].x - lx1, dy = poly[i].y - ly1;
      const t = (dx * ey - dy * ex) / denom;
      const u = (dx * rdy - dy * rdx) / denom;

      if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) {
        if (t < bestT) {
          bestT = t;
          bestHitLocal = { x: lx1 + t * rdx, y: ly1 + t * rdy };
          bestBlocker = b;
        }
      }
    }
  }

  if (bestBlocker && bestHitLocal) {
    const svgX = bestBlocker.fA * bestHitLocal.x + bestBlocker.fC * bestHitLocal.y + bestBlocker.fE;
    const svgY = bestBlocker.fB * bestHitLocal.x + bestBlocker.fD * bestHitLocal.y + bestBlocker.fF;
    return { blocked: true, hitPoint: { x: svgX, y: svgY }, t: bestT };
  }
  return { blocked: false, hitPoint: null, t: 1 };
}

// ── Edge-to-edge LoS helpers ────────────────────────────
export function modelEdgePoints(model) {
  const r = getModelRadius(model);
  const cx = model.x, cy = model.y;
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

export function canModelSeeModel(attackerModel, targetModel, blockers) {
  const aPts = modelEdgePoints(attackerModel);
  const tPts = modelEdgePoints(targetModel);
  let bestClearRay = null;

  const aCx = attackerModel.x, aCy = attackerModel.y;
  const tCx = targetModel.x, tCy = targetModel.y;

  for (let ai = 0; ai < aPts.length; ai++) {
    const ap = aPts[ai];
    for (let ti = 0; ti < tPts.length; ti++) {
      const tp = tPts[ti];
      const result = rayIntersectsTallRuins(ap.x, ap.y, tp.x, tp.y, blockers, aCx, aCy, tCx, tCy);
      if (!result.blocked) {
        const dist = Math.hypot(ap.x - tp.x, ap.y - tp.y);
        if (!bestClearRay || dist < bestClearRay.dist) {
          bestClearRay = { from: ap, to: tp, dist };
        }
      }
    }
  }
  return { canSee: !!bestClearRay, bestRay: bestClearRay };
}

// ── Per-model line-of-sight ──────────────────────────────
export function losState(attackerId, targetId) {
  const a = getUnit(attackerId), t = getUnit(targetId);
  if (!a || !t) return { state: 'blocked', visibleAttackerCount: 0, totalAttackerCount: 0, perModel: new Map(), visibleTargetModelIds: new Set() };

  const blockers = window._losBlockers || [];
  const perModel = new Map();
  const visibleTargetModelIds = new Set();
  let visibleCount = 0;
  const totalCount = a.models.length;

  if (!blockers.length) {
    t.models.forEach(tm => visibleTargetModelIds.add(tm.id));
    a.models.forEach(am => {
      const closest = t.models.reduce((best, tm) => {
        const d = Math.hypot(am.x - tm.x, am.y - tm.y);
        return (!best || d < best.dist) ? { model: tm, dist: d, hitPoint: null } : best;
      }, null);
      perModel.set(am.id, { canSee: true, bestTarget: closest, bestRay: null });
    });
    return { state: 'clear', visibleAttackerCount: totalCount, totalAttackerCount: totalCount, perModel, visibleTargetModelIds };
  }

  a.models.forEach(am => {
    let canSee = false;
    let bestVisibleTarget = null;
    let bestVisibleRay = null;
    let bestBlockedTarget = null;

    t.models.forEach(tm => {
      const edgeResult = canModelSeeModel(am, tm, blockers);

      if (edgeResult.canSee) {
        canSee = true;
        visibleTargetModelIds.add(tm.id);
        const dist = Math.hypot(am.x - tm.x, am.y - tm.y);
        if (!bestVisibleTarget || dist < bestVisibleTarget.dist) {
          bestVisibleTarget = { model: tm, dist, hitPoint: null };
          bestVisibleRay = edgeResult.bestRay;
        }
      } else {
        const ccResult = rayIntersectsTallRuins(am.x, am.y, tm.x, tm.y, blockers, am.x, am.y, tm.x, tm.y);
        const dist = Math.hypot(am.x - tm.x, am.y - tm.y);
        if (!bestBlockedTarget || dist < bestBlockedTarget.dist) {
          bestBlockedTarget = { model: tm, dist, hitPoint: ccResult.hitPoint };
        }
      }
    });

    if (canSee) visibleCount++;
    perModel.set(am.id, {
      canSee,
      bestTarget: canSee ? bestVisibleTarget : bestBlockedTarget,
      bestRay: canSee ? bestVisibleRay : null
    });
  });

  let losStateStr;
  if (visibleCount === 0) losStateStr = 'blocked';
  else if (visibleCount === totalCount) losStateStr = 'clear';
  else losStateStr = 'partial';

  return { state: losStateStr, visibleAttackerCount: visibleCount, totalAttackerCount: totalCount, perModel, visibleTargetModelIds };
}

export function targetInfo(enemyId, profileIx = state.selectedProfileIx){
  if(!state.attackerId) return {valid:false, reason:'Select attacker first', los:'blocked'};
  const profiles = getProfiles(state.attackerId);
  const p = profiles[profileIx];
  if(!p) return {valid:false, reason:'No ranged weapon', los:'blocked'};
  const r=parseRange(p); const d=distIn(state.attackerId, enemyId);
  const losResult = losState(state.attackerId, enemyId);
  const losStr = losResult.state;
  if(d>r) return {valid:false, reason:`Out of range (${d.toFixed(1)}" > ${r}")`, d, r, los: losStr, losResult};
  if(losStr==='blocked') return {valid:false, reason:'No line of sight', d, r, los: losStr, losResult};
  let reason;
  if (losStr === 'partial') {
    reason = `${losResult.visibleAttackerCount}/${losResult.totalAttackerCount} models have LoS · ${d.toFixed(1)}" / ${r}"`;
  } else {
    reason = `Clear LoS ${d.toFixed(1)}" / ${r}"`;
  }
  return {valid:true, reason, d, r, los: losStr, losResult};
}

export function getValidProfilesForTarget(targetId){
  return getProfiles(state.attackerId).map((p, i)=>({profile:p, i, info:targetInfo(targetId, i)})).filter(x=>x.info.valid);
}

export function unitHasCover(unitId) {
  const unit = getUnit(unitId);
  if (!unit) return false;
  const blockers = window._losBlockers || [];
  if (!blockers.length) return false;
  return unit.models.some(m => {
    return blockers.some(b => {
      const lx = b.iA * m.x + b.iC * m.y + b.iE;
      const ly = b.iB * m.x + b.iD * m.y + b.iF;
      return pointInPolygon(lx, ly, b.polygon);
    });
  });
}

export function deriveThresholds(profile, attacker, target){
  const bs = getBallisticSkill(attacker.id);
  const hit = Math.min(6, Math.max(2, bs));
  const t = Number(UNITS[target.id]?.stats?.T || 4);
  const rawSave = parseSave(UNITS[target.id]?.stats?.Sv);
  const ap = Number(profile.ap || 0);
  const inCover = unitHasCover(target.id);

  let coverBonus = 0;
  if (inCover) {
    const skipCover = (rawSave <= 3 && ap === 0);
    if (!skipCover) coverBonus = 1;
  }

  const save = Math.min(7, Math.max(2, rawSave - ap - coverBonus));
  return { hit, wound: woundTarget(Number(profile.s || 0), t), save, inCover, coverBonus };
}

export function modelEdgePointToward(model, tx, ty) {
  const r = getModelRadius(model);
  const dx = tx - model.x, dy = ty - model.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: model.x + (dx / len) * r, y: model.y + (dy / len) * r };
}

export function closestTargetEdgePoint(attackerModel, targetUnit){
  let best = null;
  targetUnit.models.forEach(m => {
    const radius = getModelRadius(m);
    const dx = attackerModel.x - m.x; const dy = attackerModel.y - m.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = m.x + (dx / len) * radius; const py = m.y + (dy / len) * radius;
    const dist = Math.hypot(attackerModel.x - px, attackerModel.y - py);
    if (!best || dist < best.dist) best = { x: px, y: py, dist };
  });
  return best || { x: targetUnit.models[0]?.x || 0, y: targetUnit.models[0]?.y || 0 };
}
