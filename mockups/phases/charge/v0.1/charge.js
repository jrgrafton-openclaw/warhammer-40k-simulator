/**
 * charge.js — Charge phase main entry point (ES module).
 * State machine: IDLE → SELECT_CHARGER → SELECT_TARGET → ROLLING → CHARGE_MOVE → RESOLVED
 */
import { simState, PX_PER_INCH, callbacks } from '../../../shared/state/store.js';
import { selectUnit as baseSelectUnit, renderModels, resolveOverlaps } from '../../../shared/world/svg-renderer.js';
import { resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { clearRangeRings } from '../../../shared/world/range-rings.js';

import {
  state, $, $$, ACTIVE,
  getUnit, isEnemy, isFriendly, doTerrainCollision,
  getValidTargets, isEligibleCharger, isInEngagementRange,
  checkEngagementReached, captureTurnStarts,
  setModeLabel, updateButtons, updateCardRanges
} from './charge-helpers.js';

import {
  paintHulls, clearChargeOverlays,
  rollChargeDice,
  drawChargeZones, drawEngagementRings, drawGhostsAndRulers,
  confirmCharge, cancelChargeMove
} from './charge-resolve.js';

// ── Phase transitions ─────────────────────────────────
function enterSelectCharger() {
  if (state._resetTimer) { clearTimeout(state._resetTimer); state._resetTimer = null; }
  state.phase = 'SELECT_CHARGER';
  state.chargerId = null;
  state.chargeTargetId = null;
  state.chargeRoll = 0;
  clearChargeOverlays();
  clearRangeRings();
  const card = document.getElementById('unit-card');
  if (card) card.classList.remove('visible');
  paintHulls();
  updateButtons();
}

function selectCharger(uid) {
  if (!isEligibleCharger(uid)) return;
  state.chargerId = uid;
  state.chargeTargetId = null;
  state.phase = 'SELECT_TARGET';
  captureTurnStarts(uid);
  baseSelectUnit(uid);
  updateCardRanges(uid);
  paintHulls();
  updateButtons();
}

async function clickTarget(uid) {
  if (state.phase !== 'SELECT_TARGET') return;
  if (!isEnemy(uid)) return;
  const validTargets = getValidTargets(state.chargerId);
  if (!validTargets.includes(uid)) return;

  state.chargeTargetId = uid;
  paintHulls();
  state.phase = 'ROLLING';
  updateButtons();

  const result = await rollChargeDice(uid);
  state.die1 = result.die1;
  state.die2 = result.die2;
  state.chargeRoll = result.total;

  if (result.success) {
    state.phase = 'CHARGE_MOVE';
    setModeLabel(`⚡ CHARGE ${result.total}" — place models`);
    updateCardRanges(state.chargerId, result.total);
    clearRangeRings();
    drawChargeZones();
    drawEngagementRings();
    drawGhostsAndRulers();
    updateButtons();
  } else {
    state.failedUnits.add(state.chargerId);
    setModeLabel(`✕ CHARGE FAILED (${result.total})`);
    updateCardRanges(state.chargerId, result.total, true);
    state.phase = 'RESOLVED';
    clearChargeOverlays();
    clearRangeRings();
    paintHulls();
    updateButtons();
    setTimeout(() => { baseSelectUnit(null); enterSelectCharger(); }, 2000);
  }
}

// ── Click handling ────────────────────────────────────
function handleSvgClick(e) {
  let node = e.target;
  while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) {
    node = node.parentElement;
  }
  if (!node) return;
  const uid = node.dataset.unitId;
  if (!uid) return;

  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

  if (state.phase === 'IDLE' || state.phase === 'SELECT_CHARGER' || state.phase === 'RESOLVED') {
    if (isFriendly(uid) && isEligibleCharger(uid)) {
      selectCharger(uid);
    } else if (isFriendly(uid)) {
      baseSelectUnit(uid);
      if (state.chargedUnits.has(uid)) setModeLabel('ALREADY CHARGED');
      else if (state.failedUnits.has(uid)) setModeLabel('CHARGE FAILED');
      else if (isInEngagementRange(uid)) setModeLabel('ALREADY IN ENGAGEMENT');
    } else {
      baseSelectUnit(uid);
    }
    return;
  }
  if (state.phase === 'SELECT_TARGET') {
    if (isEnemy(uid)) {
      clickTarget(uid);
    } else if (isFriendly(uid) && uid !== state.chargerId && isEligibleCharger(uid)) {
      clearChargeOverlays(); clearRangeRings(); selectCharger(uid);
    }
    return;
  }
}

function handleSvgMousedown(e) {
  let node = e.target;
  while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) {
    node = node.parentElement;
  }
  if (!node) return;
  if (state.phase === 'SELECT_CHARGER' || state.phase === 'SELECT_TARGET') {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }
}

// ── selectUnit wrapper ────────────────────────────────
function chargeSelectUnit(uid) {
  clearRangeRings();
  baseSelectUnit(uid);
  if (!uid) {
    if (state.phase === 'SELECT_TARGET') { clearChargeOverlays(); enterSelectCharger(); }
    return;
  }
  const u = getUnit(uid);
  if (u && u.faction === ACTIVE && isEligibleCharger(uid)) {
    if (state.phase === 'IDLE' || state.phase === 'SELECT_CHARGER' || state.phase === 'RESOLVED' || state.phase === 'SELECT_TARGET') {
      if (state.phase === 'SELECT_TARGET') { clearChargeOverlays(); clearRangeRings(); }
      selectCharger(uid);
    }
  }
}

// ── Stratagem modal wiring ────────────────────────────
function wireStratModal() {
  const btn = $('#btn-strat'), modalBg = $('#modal-bg'), modalClose = $('#modal-close');
  if (btn && modalBg) btn.addEventListener('click', () => { modalBg.classList.add('visible'); });
  if (modalClose && modalBg) modalClose.addEventListener('click', () => { modalBg.classList.remove('visible'); });
  if (modalBg) modalBg.addEventListener('click', (e) => { if (e.target === modalBg) modalBg.classList.remove('visible'); });
}

// ── Drag interceptor ──────────────────────────────────
function installDragInterceptor() {
  let _drag = null;
  Object.defineProperty(simState, 'drag', {
    configurable: true,
    get() { return _drag; },
    set(value) {
      if (value !== null) {
        let unit = null;
        if (value.type === 'unit') unit = value.unit;
        else if (value.type === 'model') unit = simState.units.find(u => u.models.includes(value.model));
        if (unit) {
          if (state.phase === 'CHARGE_MOVE') { if (unit.id !== state.chargerId) return; }
          else { return; }
        }
      }
      _drag = value;
    }
  });
}

// ── Drag enforcement ──────────────────────────────────
function installDragEnforcement() {
  window.addEventListener('mousemove', () => {
    const drag = simState.drag;
    if (!drag || state.phase !== 'CHARGE_MOVE' || !state.chargerId) return;
    const rangePx = state.chargeRoll * PX_PER_INCH;

    if (drag.type === 'model') {
      const m = drag.model;
      const ts = state.turnStarts[m.id];
      if (ts) {
        const dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > rangePx) {
          const sc = rangePx / dist;
          m.x = ts.x + dx * sc; m.y = ts.y + dy * sc;
          const reRes = resolveOverlaps(m, m.x, m.y);
          m.x = reRes.x; m.y = reRes.y;
        }
        const tr = doTerrainCollision(m.x, m.y, m.r);
        m.x = tr.x; m.y = tr.y;
      }
    } else if (drag.type === 'unit') {
      const unit = drag.unit;
      resolveUnitDragCollisions(unit, simState.units);
      unit.models.forEach(m => {
        const ts = state.turnStarts[m.id];
        if (!ts) return;
        const dx = m.x - ts.x, dy = m.y - ts.y, dist = Math.hypot(dx, dy);
        if (dist > rangePx) {
          const sc = rangePx / dist;
          m.x = ts.x + dx * sc; m.y = ts.y + dy * sc;
        }
      });
      let maxPX = 0, maxPY = 0;
      unit.models.forEach(m => {
        const tr = doTerrainCollision(m.x, m.y, m.r);
        const px = tr.x - m.x, py = tr.y - m.y;
        if (Math.abs(px) > Math.abs(maxPX)) maxPX = px;
        if (Math.abs(py) > Math.abs(maxPY)) maxPY = py;
      });
      if (maxPX !== 0 || maxPY !== 0) unit.models.forEach(m => { m.x += maxPX; m.y += maxPY; });
      resolveUnitDragCollisions(unit, simState.units);
    }
    renderModels(); drawGhostsAndRulers(); drawEngagementRings();
    paintHulls(); updateButtons();
    const dragUnitId = state.chargerId;
    if (dragUnitId) {
      ['layer-hulls', 'layer-models'].forEach(layerId => {
        const layer = document.getElementById(layerId);
        if (!layer) return;
        Array.from(layer.children).forEach(el => {
          if (el.dataset && el.dataset.unitId === dragUnitId) layer.appendChild(el);
        });
      });
    }
  });
}

// ── Stored handler refs (for cleanup) ─────────────────
let _chargeMouseover = null;
let _chargeMouseout = null;
let _chargeKeydown = null;

// ── Init ──────────────────────────────────────────────
export function initCharge() {
  callbacks.selectUnit = chargeSelectUnit;
  window.selectUnit = chargeSelectUnit;
  installDragInterceptor();
  installDragEnforcement();

  $('#btn-confirm-charge')?.addEventListener('click', () => confirmCharge(enterSelectCharger));
  $('#btn-end-charge')?.addEventListener('click', () => {
    var btn = $('#btn-end-charge');
    if (btn) {
      btn.textContent = '✓ CHARGE COMPLETE'; btn.disabled = true;
      btn.style.background = 'var(--success-dim, rgba(0,200,80,0.15))';
      btn.style.borderColor = 'var(--success, rgba(0,200,80,0.4))';
      btn.style.color = 'var(--success, #00c850)';
    }
  });
  wireStratModal();

  const svg = $('#bf-svg');
  if (svg) {
    svg.addEventListener('click', handleSvgClick, true);
    svg.addEventListener('mousedown', handleSvgMousedown, true);
    _chargeMouseover = (e) => {
      if (state.phase !== 'SELECT_TARGET') return;
      let node = e.target;
      while (node && !node.classList?.contains('unit-hull') && !node.classList?.contains('model-base')) node = node.parentElement;
      if (!node) return;
      const uid = node.dataset.unitId;
      if (uid && isEnemy(uid) && uid !== state.hoveredTargetId) { state.hoveredTargetId = uid; paintHulls(); }
    };
    svg.addEventListener('mouseover', _chargeMouseover);
    _chargeMouseout = (e) => {
      if (!state.hoveredTargetId) return;
      let related = e.relatedTarget;
      while (related && !related.classList?.contains('unit-hull') && !related.classList?.contains('model-base')) related = related.parentElement;
      const newUid = related?.dataset?.unitId;
      if (newUid !== state.hoveredTargetId) { state.hoveredTargetId = null; paintHulls(); }
    };
    svg.addEventListener('mouseout', _chargeMouseout);
  }

  _chargeKeydown = (e) => {
    if (e.key === 'Escape') {
      if (state.phase === 'CHARGE_MOVE') cancelChargeMove(enterSelectCharger);
      else if (state.phase === 'SELECT_TARGET') { clearChargeOverlays(); clearRangeRings(); enterSelectCharger(); baseSelectUnit(null); }
      else baseSelectUnit(null);
    }
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT') $('#btn-strat')?.click();
    if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT') $('#btn-end-charge')?.click();
  };
  document.addEventListener('keydown', _chargeKeydown);

  enterSelectCharger();
  renderModels();
  window.__chargeDebug = { state, getValidTargets, checkEngagementReached, isEligibleCharger };
}

// ── Cleanup ───────────────────────────────────────────
export function cleanupCharge() {
  const svg = $('#bf-svg');
  if (svg) {
    svg.removeEventListener('click', handleSvgClick, true);
    svg.removeEventListener('mousedown', handleSvgMousedown, true);
    if (_chargeMouseover) svg.removeEventListener('mouseover', _chargeMouseover);
    if (_chargeMouseout) svg.removeEventListener('mouseout', _chargeMouseout);
  }
  _chargeMouseover = null; _chargeMouseout = null;
  if (_chargeKeydown) document.removeEventListener('keydown', _chargeKeydown);
  _chargeKeydown = null;
  delete simState.drag; simState.drag = null;
  clearChargeOverlays(); clearRangeRings();
  $$('#layer-hulls .unit-hull').forEach(h => {
    h.classList.remove('shoot-valid', 'shoot-invalid', 'shoot-target', 'shoot-attacker', 'shoot-partial', 'charge-target');
  });
  const overlay = $('#roll-overlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.innerHTML = ''; }
  state.phase = 'IDLE'; state.chargerId = null; state.chargeTargetId = null;
  state.hoveredTargetId = null; state.chargeRoll = 0;
  state.chargedUnits.clear(); state.failedUnits.clear();
  state.turnStarts = {}; state.isDragging = false;
  if (state.overlayRaf) { cancelAnimationFrame(state.overlayRaf); state.overlayRaf = null; }
  callbacks.selectUnit = null; callbacks.afterRender = null;
  delete window.selectUnit; delete window.__chargeDebug;
}
