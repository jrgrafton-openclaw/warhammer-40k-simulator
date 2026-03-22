/**
 * phase-state.js — Centralized state map replacing window globals.
 *
 * Each phase stores its state under a prefix:
 *   phaseState.set('move.movedUnits', set);
 *   phaseState.get('move.movedUnits');
 *   phaseState.clear('move.');  // clears all move.* keys on cleanup
 *
 * Debug panel can call dump() to inspect all state.
 */

var store = new Map();

export function set(key, val) {
  store.set(key, val);
  // Keep window globals in sync for backwards compatibility
  // with svg-renderer.js (checks window.__movedUnitIds etc.)
  var legacyMap = {
    'deploy.deployedUnitIds': '__deployedUnitIds',
    'move.movedUnitIds': '__movedUnitIds',
    'shoot.spentUnitIds': '__spentUnitIds',
    'charge.chargedUnits': '__chargedUnitIds',
    'fight.foughtUnits': '__spentUnitIds',
    'terrain.aabbs': '_terrainAABBs',
    'terrain.losBlockers': '_losBlockers'
  };
  if (legacyMap[key]) window[legacyMap[key]] = val;
}

export function get(key) {
  return store.get(key);
}

export function clear(prefix) {
  var keysToDelete = [];
  store.forEach(function(val, key) {
    if (key.startsWith(prefix)) keysToDelete.push(key);
  });
  keysToDelete.forEach(function(key) {
    store.delete(key);
    // Also clear legacy window globals
    var legacyMap = {
      'deploy.deployedUnitIds': '__deployedUnitIds',
      'move.movedUnitIds': '__movedUnitIds',
      'shoot.spentUnitIds': '__spentUnitIds',
      'charge.chargedUnits': '__chargedUnitIds',
      'fight.foughtUnits': '__spentUnitIds',
      'terrain.losBlockers': '_losBlockers'
    };
    if (legacyMap[key]) {
      var global = window[legacyMap[key]];
      if (global && typeof global.clear === 'function') global.clear();
      else window[legacyMap[key]] = null;
    }
  });
}

export function dump() {
  var obj = {};
  store.forEach(function(val, key) {
    obj[key] = val instanceof Set ? Array.from(val) : val;
  });
  return obj;
}

export function has(key) {
  return store.has(key);
}
