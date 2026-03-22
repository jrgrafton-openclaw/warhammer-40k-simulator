/* fight-helpers.js — Shared state, helpers, and constants for fight phase */
import { simState, PX_PER_INCH } from '../../../shared/state/store.js';
import { UNITS, KW_RULES, wgState } from '../../../shared/state/units.js';
import { getModelRadius } from '../../../shared/lib/coord-helpers.js';

export const ACTIVE = 'imp';
export const state = {
  attackerId: null, targetId: null, hoveredTargetId: null,
  selectedProfileIx: 0, foughtUnits: new Set(),
  seed: (Date.now() ^ 0x5f3759df) >>> 0,
  pinnedPopupTargetId: null, pinnedRollTargetId: null, overlayRaf: null,
  dragMode: null, dragStarts: {}, phase: null, killsThisAttack: 0
};
window.__spentUnitIds = state.foughtUnits;

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => Array.from(document.querySelectorAll(s));
/** Late-binding API (populated by fight.js at module load) */
export const fightApi = {};

// ── Seeded RNG ──────────────────────────────────────────
export function rng(){ state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
export function d6(){ return 1 + Math.floor(rng() * 6); }

// ── Helpers ─────────────────────────────────────────────
export function getUnit(uid){ return simState.units.find(u => u.id === uid); }
export function isEnemy(uid){ const u = getUnit(uid); return u && u.faction !== ACTIVE; }
export function setStatus(msg, cls){
  const el = $('#move-mode-label');
  if (!el) return;
  el.textContent = msg || '';
  el.className = cls || '';
}
export function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g, '')); return n || 7; }
export function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
export function damageValue(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return null; return Number(s) || 1; }
export function pickDamage(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng() * 3); return Number(s) || 1; }

// ── Weapon Skill lookup ─────────────────────────────────
export function getWeaponSkill(uid){
  return ({ 'assault-intercessors':3, 'primaris-lieutenant':2, 'intercessor-squad-a':3,
    'hellblasters':3, 'redemptor-dreadnought':3, 'boss-nob':2,
    'nobz-mob':3, 'mekboy':3, 'gretchin':5 }[uid] || 4);
}

// ── Melee weapon profiles ───────────────────────────────
export function getProfiles(uid){
  const u = UNITS[uid]; if (!u) return [];
  let w = [].concat(u.weapons || []);
  const wg = wgState?.[uid] || {};
  (u.wargear || []).forEach((opt, i) => { if (wg[i] && opt.adds) w.push(opt.adds); });
  return w.filter(x => x.type === 'MELEE');
}
export function keywordsFor(profile){ return [].concat(profile?.keywords || profile?.kw || []).filter(Boolean).map(String); }
export function kwTip(k){ return (KW_RULES[k] && KW_RULES[k].tip) || 'Keyword ability.'; }
export function kwClass(k){ return String(k).toLowerCase().includes('melee') ? 'melee' : 'other'; }

// ── Engagement Range (1" edge-to-edge) ──────────────────
export function modelDistance(m1, m2){
  return Math.hypot(m1.x - m2.x, m1.y - m2.y) - getModelRadius(m1) - getModelRadius(m2);
}
export function inEngagementRange(m1, m2){ return modelDistance(m1, m2) <= PX_PER_INCH; }
export function isInEngagement(unitId){
  const unit = getUnit(unitId); if (!unit) return false;
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  return unit.models.some(m => enemies.some(enemy => enemy.models.some(em => inEngagementRange(m, em))));
}
export function isEngagedWith(unitIdA, unitIdB){
  const a = getUnit(unitIdA), b = getUnit(unitIdB);
  if (!a || !b) return false;
  return a.models.some(am => b.models.some(bm => inEngagementRange(am, bm)));
}

// ── Objective marker positions (SVG coords) ─────────────
export const OBJECTIVES = [
  { x: 360, y: 72 }, { x: 120, y: 264 }, { x: 360, y: 264 },
  { x: 600, y: 264 }, { x: 360, y: 456 }
];

// ── Thresholds (melee: no cover bonus) ──────────────────
export function deriveThresholds(profile, attacker, target){
  const ws = getWeaponSkill(attacker.id);
  const hit = Math.min(6, Math.max(2, ws));
  const t = Number(UNITS[target.id]?.stats?.T || 4);
  const rawSave = parseSave(UNITS[target.id]?.stats?.Sv);
  const ap = Number(profile.ap || 0);
  const save = Math.min(7, Math.max(2, rawSave - ap));
  return { hit, wound: woundTarget(Number(profile.s || 0), t), save };
}
export function attackCount(profile, attacker){
  return (Number(profile.a || 1) || 1) * Math.max(0, attacker.models.length);
}
