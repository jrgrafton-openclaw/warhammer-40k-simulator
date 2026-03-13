import { createStore } from '../../../shared/core/store.js';
import { createScenarioUnits, UNIT_DEFS, PX_PER_INCH } from '../../../shared/data/shoot-v06-data.js';
import { createPixiWorld } from '../../../shared/world/pixi-world.js';
import { mountShootHud } from '../../../shared/ui/shoot-hud.js';

const initialState = {
  units: createScenarioUnits(),
  attackerId: 'assault-intercessors',
  hoveredUnitId: null,
  hoveredTargetId: null,
  targetId: null,
  popupTargetId: null,
  popupAnchor: null,
  weaponChoices: null,
  selectedWeaponIx: 0,
  rollSummary: null,
  rollAnchor: null,
};

const store = createStore(initialState);
window.__store = store; // debug
const root = document.getElementById('app');
let world;

function center(unit) {
  const sum = unit.models.reduce((acc, model) => ({ x: acc.x + model.x, y: acc.y + model.y }), { x: 0, y: 0 });
  return { x: sum.x / unit.models.length, y: sum.y / unit.models.length };
}

function getUnit(state, id) {
  return state.units.find((unit) => unit.id === id);
}

function getRangedWeapons(unitId) {
  return UNIT_DEFS[unitId].weapons.filter((weapon) => weapon.type === 'RANGED');
}

function distanceInches(a, b, state) {
  const ua = getUnit(state, a);
  const ub = getUnit(state, b);
  const ca = center(ua);
  const cb = center(ub);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y) / PX_PER_INCH;
}

function canTarget(state, attackerId, targetId, weaponIx = 0) {
  if (!attackerId || !targetId) return false;
  const attacker = getUnit(state, attackerId);
  const target = getUnit(state, targetId);
  if (!attacker || !target || attacker.faction === target.faction) return false;
  const weapons = getRangedWeapons(attackerId);
  const weapon = weapons[weaponIx];
  return !!weapon && distanceInches(attackerId, targetId, state) <= weapon.rng;
}

function resolveAttack(state, weaponIx) {
  const attackerId = state.attackerId;
  const weapon = getRangedWeapons(attackerId)[weaponIx];
  const attacks = weapon.a * Math.max(1, getUnit(state, attackerId).models.length);
  const hits = Math.max(1, Math.floor(attacks * 0.66));
  const wounds = Math.max(0, Math.floor(hits * 0.66));
  const failedSaves = Math.max(0, Math.floor(wounds * 0.5));
  const damagePerHit = typeof weapon.d === 'number' ? weapon.d : weapon.d === 'D3' ? 2 : Number(weapon.d) || 1;
  return { hits, wounds, failedSaves, damage: failedSaves * damagePerHit, weaponName: weapon.name };
}

const actions = {
  selectUnit(unitId) {
    const state = store.getState();
    const unit = getUnit(state, unitId);
    if (!unit) return;
    if (unit.faction === 'imp') {
      store.setState((current) => ({ ...current, attackerId: unitId, targetId: null, popupTargetId: null, popupAnchor: null, weaponChoices: null, rollSummary: null, rollAnchor: null }));
      return;
    }
    if (!state.attackerId) return;
    const weapons = getRangedWeapons(state.attackerId).filter((_, ix) => canTarget(state, state.attackerId, unitId, ix));
    if (!weapons.length) return;
    const popupAnchor = world?.getUnitAnchor(unitId) ?? null;
    store.setState((current) => ({ ...current, targetId: unitId, popupTargetId: unitId, popupAnchor, weaponChoices: weapons, rollSummary: null, rollAnchor: null }));
    if (weapons.length === 1) actions.pickWeapon(0);
  },
  hoverUnit(unitId) {
    const state = store.getState();
    const unit = unitId ? getUnit(state, unitId) : null;
    store.setState((current) => ({ ...current, hoveredUnitId: unitId, hoveredTargetId: unit?.faction === 'ork' ? unitId : null }));
  },
  pickWeapon(choiceIx) {
    const state = store.getState();
    const summary = resolveAttack(state, choiceIx);
    const rollAnchor = world?.getUnitAnchor(state.targetId) ?? null;
    store.setState((current) => ({
      ...current,
      selectedWeaponIx: choiceIx,
      weaponChoices: null,
      popupTargetId: null,
      popupAnchor: null,
      rollSummary: summary,
      rollAnchor,
      units: current.units.map((unit) => unit.id === current.attackerId ? { ...unit, shot: true } : unit),
    }));
  },
  dismissRoll() {
    store.setState((current) => ({ ...current, rollSummary: null, rollAnchor: null, targetId: null }));
  },
  clearSelection() {
    store.setState((current) => ({ ...current, attackerId: null, targetId: null, popupTargetId: null, popupAnchor: null, weaponChoices: null, rollSummary: null, rollAnchor: null }));
  },
  resetView() {
    world?.render(store.getState());
  }
};

const hud = mountShootHud({ root, store, actions });
world = await createPixiWorld({
  mount: hud.worldMount,
  state: store.getState(),
  onUnitClick(unitId) { actions.selectUnit(unitId); },
  onUnitHover(unitId) { actions.hoverUnit(unitId); }
});

store.subscribe((state) => { world.render(state); });
