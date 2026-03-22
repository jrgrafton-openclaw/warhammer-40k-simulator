/* fight-drag.js — Pile-in & consolidation drag logic for fight phase */
import { simState, PX_PER_INCH } from '../../../shared/state/store.js';
import { selectUnit as baseSelectUnit, renderModels } from '../../../shared/world/svg-renderer.js';
import { getModelRadius } from '../../../shared/lib/coord-helpers.js';
import { resolveTerrainCollision, resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { state, $, getUnit, setStatus, OBJECTIVES, fightApi } from './fight-helpers.js';
import { clearEffects } from './fight-fx.js';

// ── Enter drag mode ─────────────────────────────────────
export function enterDragMode(mode) {
  state.dragMode = mode;
  state.dragStarts = {};
  const unit = getUnit(state.attackerId);
  if (!unit) return;
  unit.models.forEach(m => { state.dragStarts[m.id] = { x: m.x, y: m.y }; });
  drawFightRangeRings(state.attackerId);
  renderFightOverlays(state.attackerId);
  fightApi.updateFightButtons();
  setStatus(mode === 'pile-in' ? '◉ PILE IN 3"' : '◉ CONSOLIDATE 3"',
    mode === 'pile-in' ? 'fight-pile-in' : 'fight-consolidate');
}

// ── Exit drag mode ──────────────────────────────────────
export function exitDragMode() {
  state.dragMode = null; state.dragStarts = {};
  clearFightRangeRings(); clearFightOverlays(); clearModelHighlights();
  const banner = document.getElementById('fight-invalid-banner');
  if (banner) banner.style.display = 'none';
  fightApi.updateFightButtons();
}

// ── Range rings (3" orange circles from dragStarts) ─────
function drawFightRangeRings(unitId) {
  const layer = document.getElementById('layer-range-rings');
  if (!layer) return; layer.innerHTML = '';
  const unit = getUnit(unitId); if (!unit) return;
  const NS = 'http://www.w3.org/2000/svg', radiusPx = 3 * PX_PER_INCH;
  unit.models.forEach(m => {
    const start = state.dragStarts[m.id]; if (!start) return;
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', start.x); circle.setAttribute('cy', start.y);
    circle.setAttribute('r', radiusPx);
    circle.setAttribute('fill', 'rgba(255,140,0,0.06)');
    circle.setAttribute('stroke', 'rgba(255,140,0,0.25)');
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('class', 'range-ring');
    circle.setAttribute('pointer-events', 'none');
    layer.appendChild(circle);
  });
}
export function clearFightRangeRings() {
  const layer = document.getElementById('layer-range-rings');
  if (layer) layer.innerHTML = '';
}

// ── Ghost circles + rulers ──────────────────────────────
function renderFightOverlays(unitId) {
  const layerGhosts = document.getElementById('layer-move-ghosts');
  const layerRulers = document.getElementById('layer-move-rulers');
  if (!layerGhosts || !layerRulers) return;
  layerGhosts.innerHTML = ''; layerRulers.innerHTML = '';
  if (!state.dragMode || !unitId) return;
  const unit = getUnit(unitId); if (!unit) return;
  const NS = 'http://www.w3.org/2000/svg', radiusPx = 3 * PX_PER_INCH;
  unit.models.forEach(m => {
    const start = state.dragStarts[m.id]; if (!start) return;
    const ghost = document.createElementNS(NS, 'circle');
    ghost.setAttribute('cx', start.x); ghost.setAttribute('cy', start.y);
    ghost.setAttribute('r', m.r || 8); ghost.setAttribute('class', 'move-ghost');
    ghost.style.stroke = '#ff8c00'; ghost.style.strokeWidth = '1.5';
    ghost.style.pointerEvents = 'none';
    layerGhosts.appendChild(ghost);
    const dx = m.x - start.x, dy = m.y - start.y, dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', start.x); line.setAttribute('y1', start.y);
    line.setAttribute('x2', m.x); line.setAttribute('y2', m.y);
    line.setAttribute('class', 'move-ruler');
    line.style.stroke = dist > radiusPx + 0.5 ? '#ff3333' : '#ff8c00';
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
export function clearFightOverlays() {
  ['layer-move-ghosts', 'layer-move-rulers', 'layer-range-rings'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '';
  });
}

// ── Direction validation helpers ────────────────────────
function closestEnemyDist(px, py, modelRadius, enemyModels) {
  let best = Infinity;
  for (const em of enemyModels) {
    const d = Math.hypot(px - em.x, py - em.y) - modelRadius - getModelRadius(em);
    if (d < best) best = d;
  }
  return Math.max(0, best);
}
function closestObjectiveDist(px, py) {
  let best = Infinity;
  for (const o of OBJECTIVES) { const d = Math.hypot(px - o.x, py - o.y); if (d < best) best = d; }
  return best;
}

export function updateDirectionFeedback() {
  const banner = document.getElementById('fight-invalid-banner');
  if (!banner) return;
  if (!state.dragMode || !state.attackerId) { banner.style.display = 'none'; clearModelHighlights(); return; }
  const unit = getUnit(state.attackerId);
  if (!unit) { banner.style.display = 'none'; clearModelHighlights(); return; }
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);
  const radiusPx = 3 * PX_PER_INCH;
  let anyInvalid = false;
  const invalidModelIds = new Set();
  unit.models.forEach(m => {
    const start = state.dragStarts[m.id]; if (!start) return;
    const moved = Math.hypot(m.x - start.x, m.y - start.y);
    if (moved < 0.5) return;
    if (moved > radiusPx + 0.5) { anyInvalid = true; invalidModelIds.add(m.id); return; }
    const r = getModelRadius(m);
    if (state.dragMode === 'pile-in') {
      if (allEnemyModels.length) {
        if (closestEnemyDist(m.x, m.y, r, allEnemyModels) > closestEnemyDist(start.x, start.y, r, allEnemyModels) + 0.5)
          { anyInvalid = true; invalidModelIds.add(m.id); }
      }
    } else if (state.dragMode === 'consolidate') {
      const distNow = allEnemyModels.length ? closestEnemyDist(m.x, m.y, r, allEnemyModels) : Infinity;
      const distBefore = allEnemyModels.length ? closestEnemyDist(start.x, start.y, r, allEnemyModels) : Infinity;
      if (distNow > distBefore + 0.5 && closestObjectiveDist(m.x, m.y) > closestObjectiveDist(start.x, start.y) + 0.5)
        { anyInvalid = true; invalidModelIds.add(m.id); }
    }
  });
  if (anyInvalid) {
    banner.textContent = state.dragMode === 'pile-in'
      ? '⚠ INVALID PILE IN — must move closer to enemy'
      : '⚠ INVALID CONSOLIDATION — must move toward enemy or objective';
    banner.style.display = 'block';
  } else { banner.style.display = 'none'; }
  highlightInvalidModels(invalidModelIds);
}

export function highlightInvalidModels(invalidIds) {
  document.querySelectorAll('#layer-models .model-base').forEach(g => g.classList.remove('fight-invalid-model'));
  invalidIds.forEach(modelId => {
    const el = document.querySelector(`#layer-models .model-base[data-model-id="${modelId}"]`);
    if (el) el.classList.add('fight-invalid-model');
  });
}
export function clearModelHighlights() {
  document.querySelectorAll('#layer-models .model-base').forEach(g => g.classList.remove('fight-invalid-model'));
}

export function isPileInDirectionValid(unitId) {
  const unit = getUnit(unitId); if (!unit) return false;
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);
  if (!allEnemyModels.length) return true;
  return unit.models.every(m => {
    const start = state.dragStarts[m.id]; if (!start) return true;
    if (Math.hypot(m.x - start.x, m.y - start.y) < 0.5) return true;
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
export function isConsolidateDirectionValid(unitId) {
  const unit = getUnit(unitId); if (!unit) return false;
  const enemies = simState.units.filter(u => u.faction !== unit.faction);
  const allEnemyModels = enemies.flatMap(e => e.models);
  return unit.models.every(m => {
    const start = state.dragStarts[m.id]; if (!start) return true;
    if (Math.hypot(m.x - start.x, m.y - start.y) < 0.5) return true;
    const r = getModelRadius(m);
    if (allEnemyModels.length) {
      const distNow = closestEnemyDist(m.x, m.y, r, allEnemyModels);
      const distBefore = closestEnemyDist(start.x, start.y, r, allEnemyModels);
      if (distNow <= distBefore + 0.5) return true;
      console.log(`[fight] consolidate: ${m.id} not closer to enemy (now=${distNow.toFixed(1)} before=${distBefore.toFixed(1)})`);
    }
    const objNow = closestObjectiveDist(m.x, m.y), objBefore = closestObjectiveDist(start.x, start.y);
    if (objNow > objBefore + 0.5) {
      console.log(`[fight] consolidate: ${m.id} not closer to objective either (now=${objNow.toFixed(1)} before=${objBefore.toFixed(1)})`);
      return false;
    }
    return true;
  });
}

export function isDragLegal(unitId) {
  const unit = getUnit(unitId); if (!unit) return false;
  const radiusPx = 3 * PX_PER_INCH;
  for (const m of unit.models) {
    const ts = state.dragStarts[m.id]; if (!ts) continue;
    const dist = Math.hypot(m.x - ts.x, m.y - ts.y);
    if (dist > radiusPx + 0.5) {
      console.log(`[fight] ${m.id} over range: ${(dist/PX_PER_INCH).toFixed(1)}" > 3"`);
      return false;
    }
  }
  if (state.dragMode === 'pile-in') { const v = isPileInDirectionValid(unitId); if (!v) console.log('[fight] pile-in direction invalid'); return v; }
  if (state.dragMode === 'consolidate') { const v = isConsolidateDirectionValid(unitId); if (!v) console.log('[fight] consolidate direction invalid'); return v; }
  return true;
}

// ── Confirm drag ────────────────────────────────────────
export function confirmDrag() {
  if (!isDragLegal(state.attackerId)) {
    const btn = $('#btn-confirm-fight');
    if (btn) { btn.classList.add('shake-error'); setTimeout(() => btn.classList.remove('shake-error'), 450); }
    return;
  }
  const mode = state.dragMode;
  exitDragMode();
  if (mode === 'pile-in') {
    state.phase = 'target-select';
    setStatus('Select enemy target', 'fight-target');
    fightApi.paint();
  } else if (mode === 'consolidate') {
    state.foughtUnits.add(state.attackerId);
    state.attackerId = null; state.targetId = null; state.phase = null;
    setStatus('— SELECT UNIT —');
    fightApi.closeWeaponPopup();
    clearEffects();
    baseSelectUnit(null);
    fightApi.paint();
  }
}

// ── Cancel drag ─────────────────────────────────────────
export function cancelDrag() {
  const currentPhase = state.phase;
  const unit = getUnit(state.attackerId);
  if (unit) unit.models.forEach(m => { const ts = state.dragStarts[m.id]; if (ts) { m.x = ts.x; m.y = ts.y; } });
  exitDragMode();
  renderModels();
  if (currentPhase === 'pile-in') {
    state.attackerId = null; state.phase = null;
    setStatus('— SELECT UNIT —');
    baseSelectUnit(null); fightApi.paint();
  } else if (currentPhase === 'consolidate') {
    state.phase = 'consolidate';
    enterDragMode('consolidate'); fightApi.paint();
  }
}

// ── Drag interceptor ────────────────────────────────────
export function installDragInterceptor() {
  let _drag = null;
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get() { return _drag; },
    set(value) {
      if (value !== null) {
        if (!state.dragMode) return;
        let unit = null;
        if (value.type === 'unit') unit = value.unit;
        else if (value.type === 'model') unit = simState.units.find(u => u.models.includes(value.model));
        if (unit) {
          if (unit.id !== state.attackerId) return;
          if (state.foughtUnits.has(unit.id)) return;
          if (unit.faction !== 'imp') return;
        }
      }
      _drag = value;
    }
  });
}

// ── Drag enforcement (mousemove) ────────────────────────
export function installDragEnforcement() {
  window.addEventListener('mouseup', () => {
    if (state.dragMode && state.attackerId) {
      requestAnimationFrame(() => { updateDirectionFeedback(); fightApi.updateFightButtons(); });
    }
  });
  window.addEventListener('mousemove', () => {
    const drag = simState.drag;
    if (!drag || !state.dragMode) return;
    const uid = state.attackerId; if (!uid) return;
    const radiusPx = 3 * PX_PER_INCH;
    if (drag.type === 'model') {
      const m = drag.model, ts = state.dragStarts[m.id]; if (!ts) return;
      const dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
      if (dist > radiusPx) { const sc = radiusPx / dist; m.x = ts.x + dx * sc; m.y = ts.y + dy * sc; }
      const tr = resolveTerrainCollision(m.x, m.y, m.r || 8, window._terrainAABBs || []);
      m.x = tr.x; m.y = tr.y;
    } else if (drag.type === 'unit') {
      resolveUnitDragCollisions(drag.unit, simState.units);
      drag.unit.models.forEach(m => {
        const ts = state.dragStarts[m.id]; if (!ts) return;
        const dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > radiusPx) { const sc = radiusPx / dist; m.x = ts.x + dx * sc; m.y = ts.y + dy * sc; }
      });
      drag.unit.models.forEach(m => {
        const tr = resolveTerrainCollision(m.x, m.y, m.r || 8, window._terrainAABBs || []);
        m.x = tr.x; m.y = tr.y;
      });
      resolveUnitDragCollisions(drag.unit, simState.units);
    }
    renderModels();
    drawFightRangeRings(uid); renderFightOverlays(uid);
    fightApi.updateFightButtons(); updateDirectionFeedback();
  });
}
