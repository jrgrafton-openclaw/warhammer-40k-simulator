import { BOARD, TERRAIN, UNIT_DEFS } from '../data/shoot-v06-data.js';

const COLORS = {
  board: '#0b1118',
  imp: '#00d4ff',
  impDim: '#0088aa',
  impTint: 'rgba(0,212,255,.04)',
  impSelTint: 'rgba(0,212,255,.1)',
  ork: '#ff4020',
  orkDim: '#aa2810',
  orkTint: 'rgba(255,64,32,.04)',
  spent: '#8a98ab',
  spentTint: 'rgba(138,152,171,.08)',
  ruin: 'rgba(58,64,64,.75)',
  ruinWall: 'rgba(106,114,114,.85)',
  scatter: 'rgba(58,48,24,.7)',
  depImp: 'rgba(0,80,160,.06)',
  depImpStroke: 'rgba(0,212,255,.15)',
  depOrk: 'rgba(255,64,32,.06)',
  depOrkStroke: 'rgba(255,64,32,.15)',
};

/**
 * Creates a Canvas2D world renderer that draws at native 720×528 SVG
 * coordinates. The parent #battlefield-inner applies CSS transform
 * (scale/translate) for zoom/pan — exactly like legacy v0.6.
 */
export async function createPixiWorld({ mount, state, onUnitClick, onUnitHover }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  canvas.width = BOARD.width;
  canvas.height = BOARD.height;
  canvas.style.width = BOARD.width + 'px';
  canvas.style.height = BOARD.height + 'px';
  mount.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // ── Pan / Zoom state (mirrors legacy battle-board.js) ──────
  let scale = 0.5;
  let tx = 0;
  let ty = 0;

  function applyTransform() {
    const inner = mount.closest('#battlefield-inner') || mount;
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    inner.style.transformOrigin = '0 0';
  }

  function fitBoard() {
    const bf = mount.closest('#battlefield');
    if (!bf) return;
    const card = bf.querySelector('#unit-card');
    const cardW = card ? card.offsetWidth + 20 : 0;
    const bfW = bf.clientWidth - cardW;
    const bfH = bf.clientHeight - 120; // account for action bar + phase header
    scale = Math.min(bfW / BOARD.width, bfH / BOARD.height) * 0.88;
    tx = (bfW - BOARD.width * scale) / 2;
    ty = 60 + (bfH - BOARD.height * scale) / 2;
    applyTransform();
  }

  // Zoom via mouse wheel on battlefield
  const battlefield = mount.closest('#battlefield');
  if (battlefield) {
    battlefield.addEventListener('wheel', (e) => {
      e.preventDefault();
      scale = Math.min(3, Math.max(0.35, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyTransform();
    }, { passive: false });

    // Pan via mouse drag on battlefield background
    let dragging = false, startX = 0, startY = 0;
    battlefield.addEventListener('mousedown', (e) => {
      if (e.target.closest('#unit-card,#vp-bar,#phase-header,#action-bar,.obj-hex-wrap')) return;
      dragging = true;
      startX = e.clientX - tx;
      startY = e.clientY - ty;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      tx = e.clientX - startX;
      ty = e.clientY - startY;
      applyTransform();
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // Reset button
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => { fitBoard(); });
  }

  fitBoard();

  // Re-fit on resize
  window.addEventListener('resize', () => { fitBoard(); render(state); });

  // ── Drawing helpers (all in native 720×528 coords) ─────────

  function drawBoard() {
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    // Deployment zones
    ctx.fillStyle = COLORS.depImp;
    ctx.fillRect(0, 0, 216, BOARD.height);
    ctx.strokeStyle = COLORS.depImpStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 216, BOARD.height);

    ctx.fillStyle = COLORS.depOrk;
    ctx.fillRect(504, 0, 216, BOARD.height);
    ctx.strokeStyle = COLORS.depOrkStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(504, 0, 216, BOARD.height);

    // Center + mid lines
    ctx.strokeStyle = 'rgba(201,163,82,.05)';
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(360, 0); ctx.lineTo(360, BOARD.height); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,163,82,.03)';
    ctx.setLineDash([4, 12]);
    ctx.beginPath(); ctx.moveTo(0, 264); ctx.lineTo(BOARD.width, 264); ctx.stroke();
    ctx.setLineDash([]);

    // Zone labels (subtle, matches legacy SVG layer)
    // Legacy doesn't render visible zone text — omitted for parity
  }

  function drawTerrain() {
    TERRAIN.forEach((piece) => {
      ctx.save();
      ctx.translate(piece.x, piece.y);
      if (piece.flipX) ctx.scale(-1, 1);
      if (piece.rot) ctx.rotate(piece.rot * Math.PI / 180);

      ctx.fillStyle = piece.kind === 'ruin' ? COLORS.ruin : COLORS.scatter;
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1;
      ctx.fillRect(0, 0, piece.w, piece.h);
      ctx.strokeRect(0, 0, piece.w, piece.h);

      if (piece.kind === 'ruin') {
        ctx.strokeStyle = COLORS.ruinWall;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(1.2, 1.2);
        ctx.lineTo(piece.w * 0.67, 1.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1.2, 1.2);
        ctx.lineTo(1.2, piece.h * 0.67);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  function getCenter(unit) {
    const s = unit.models.reduce((a, m) => ({ x: a.x + m.x, y: a.y + m.y }), { x: 0, y: 0 });
    return { x: s.x / unit.models.length, y: s.y / unit.models.length };
  }

  function getModelRadius(model) {
    return model.r || Math.max(model.w || 20, model.h || 20) / 2;
  }

  function drawHull(unit, strokeColor, fillColor, isSelected) {
    if (unit.models.length === 1) {
      const m = unit.models[0];
      const r = getModelRadius(m) + 6;
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash(unit.shot ? [8, 5] : isSelected ? [] : [5, 3]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      // Bounding capsule approximation for multi-model units
      const xs = unit.models.map(m => m.x);
      const ys = unit.models.map(m => m.y);
      const pad = 14;
      const minX = Math.min(...xs) - pad;
      const minY = Math.min(...ys) - pad;
      const maxX = Math.max(...xs) + pad;
      const maxY = Math.max(...ys) + pad;
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash(unit.shot ? [8, 5] : isSelected ? [] : [5, 3]);
      ctx.beginPath();
      ctx.roundRect(minX, minY, maxX - minX, maxY - minY, 18);
      ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawToken(unit, model, color) {
    const r = getModelRadius(model);
    ctx.fillStyle = '#081017';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    if (model.shape === 'rect') {
      ctx.beginPath();
      ctx.roundRect(model.x - model.w / 2, model.y - model.h / 2, model.w, model.h, 4);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(model.x, model.y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // Icon inside token
    const icon = UNIT_DEFS[unit.id]?.icon;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (icon === 'character') {
      for (let i = 0; i < 5; i++) {
        const a = (-Math.PI / 2) + (i * Math.PI * 2 / 5);
        const px = model.x + Math.cos(a) * r * 0.5;
        const py = model.y + Math.sin(a) * r * 0.5;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (icon === 'elite') {
      ctx.moveTo(model.x, model.y - r * 0.5);
      ctx.lineTo(model.x + r * 0.4, model.y);
      ctx.lineTo(model.x, model.y + r * 0.5);
      ctx.lineTo(model.x - r * 0.4, model.y);
      ctx.closePath();
    } else if (icon === 'vehicle') {
      const hw = r * 0.44, hh = r * 0.3;
      ctx.rect(model.x - hw, model.y - hh, hw * 2, hh * 2);
      ctx.moveTo(model.x - hw, model.y);
      ctx.lineTo(model.x + hw, model.y);
    } else {
      // infantry cross
      ctx.moveTo(model.x, model.y - r * 0.45);
      ctx.lineTo(model.x, model.y + r * 0.45);
      ctx.moveTo(model.x - r * 0.45, model.y);
      ctx.lineTo(model.x + r * 0.45, model.y);
    }
    ctx.stroke();
  }

  function drawWoundRing(unit) {
    if (!unit.carryWounds || unit.carryWounds <= 0) return;
    const wPer = Number(UNIT_DEFS[unit.id]?.stats?.W || 1);
    if (wPer <= 1) return;
    const focus = unit.models[unit.models.length - 1];
    const r = getModelRadius(focus) + 5;
    const remaining = Math.max(0, wPer - unit.carryWounds);
    const lostFrac = unit.carryWounds / wPer;

    // Track
    ctx.strokeStyle = 'rgba(30,42,56,.9)';
    ctx.lineWidth = 2.25;
    ctx.beginPath(); ctx.arc(focus.x, focus.y, r, 0, Math.PI * 2); ctx.stroke();

    // Remaining arc
    const lostSweep = Math.max(10 * Math.PI / 180, Math.PI * 2 * lostFrac);
    const remainSweep = Math.max(0, Math.PI * 2 - lostSweep - 8 * Math.PI / 180);
    if (remainSweep > 6 * Math.PI / 180) {
      ctx.strokeStyle = 'rgba(0,212,255,.92)';
      ctx.lineWidth = 2.25;
      ctx.beginPath();
      ctx.arc(focus.x, focus.y, r, -Math.PI / 2, -Math.PI / 2 + remainSweep);
      ctx.stroke();
    }
    // Lost arc
    const gapAngle = 8 * Math.PI / 180;
    ctx.strokeStyle = 'rgba(255,96,96,.95)';
    ctx.lineWidth = 2.25;
    ctx.beginPath();
    ctx.arc(focus.x, focus.y, r, -Math.PI / 2 + remainSweep + gapAngle, -Math.PI / 2 + Math.PI * 2);
    ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(8,12,16,.94)';
    ctx.strokeStyle = 'rgba(0,212,255,.22)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(focus.x - 13, focus.y + r + 4, 26, 12, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d7ecff';
    ctx.font = '700 8px Rajdhani';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${remaining}W`, focus.x, focus.y + r + 10);
  }

  function drawUnits(currentState) {
    currentState.units.forEach((unit) => {
      const isSelected = currentState.attackerId === unit.id;
      const isHover = currentState.hoveredTargetId === unit.id;
      const isImp = unit.faction === 'imp';
      const base = isImp ? COLORS.imp : COLORS.ork;
      const dim = isImp ? COLORS.impDim : COLORS.orkDim;
      const color = unit.shot ? COLORS.spent : (isSelected || isHover ? base : dim);
      const fillColor = unit.shot ? COLORS.spentTint : isSelected ? (isImp ? COLORS.impSelTint : 'rgba(255,64,32,.1)') : (isImp ? COLORS.impTint : COLORS.orkTint);

      drawHull(unit, color, fillColor, isSelected);
      unit.models.forEach((model) => drawToken(unit, model, color));
      drawWoundRing(unit);
    });
  }

  function drawTargetLines(currentState) {
    if (!currentState.attackerId || !currentState.hoveredTargetId) return;
    const attacker = currentState.units.find(u => u.id === currentState.attackerId);
    const target = currentState.units.find(u => u.id === currentState.hoveredTargetId);
    if (!attacker || !target) return;

    console.log('drawTargetLines', currentState.attackerId, '->', currentState.hoveredTargetId, 'attacker models:', attacker.models.length);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 5]);
    ctx.lineCap = 'round';
    attacker.models.forEach((am) => {
      // Find closest target model edge point
      let best = target.models[0];
      let bestDist = Infinity;
      target.models.forEach((tm) => {
        const d = Math.hypot(am.x - tm.x, am.y - tm.y);
        if (d < bestDist) { best = tm; bestDist = d; }
      });
      const r = getModelRadius(best);
      const dx = am.x - best.x, dy = am.y - best.y;
      const len = Math.hypot(dx, dy) || 1;
      const edgeX = best.x + (dx / len) * r;
      const edgeY = best.y + (dy / len) * r;

      ctx.beginPath();
      ctx.moveTo(am.x, am.y);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  }

  function render(currentState) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD.width * dpr;
    canvas.height = BOARD.height * dpr;
    canvas.style.width = BOARD.width + 'px';
    canvas.style.height = BOARD.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, BOARD.width, BOARD.height);
    drawBoard();
    drawTerrain();
    drawUnits(currentState);
    drawTargetLines(currentState);
    console.log('render complete', {attackerId: currentState.attackerId, hoveredTargetId: currentState.hoveredTargetId});
  }

  // ── Hit testing (in native coords) ─────────────────────
  function pointerToNative(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = BOARD.width / rect.width;
    const scaleY = BOARD.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function hitTest(point, units) {
    for (let i = units.length - 1; i >= 0; i--) {
      const unit = units[i];
      for (const model of unit.models) {
        const r = getModelRadius(model) + 4;
        if (Math.hypot(point.x - model.x, point.y - model.y) <= r) return unit;
      }
    }
    return null;
  }

  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor = 'default';

  canvas.addEventListener('click', (e) => {
    const hit = hitTest(pointerToNative(e), state.units);
    if (hit) onUnitClick?.(hit.id);
  });
  canvas.addEventListener('mousemove', (e) => {
    const hit = hitTest(pointerToNative(e), state.units);
    canvas.style.cursor = hit ? 'pointer' : 'default';
    onUnitHover?.(hit?.id ?? null);
  });
  canvas.addEventListener('mouseleave', () => {
    canvas.style.cursor = 'default';
    onUnitHover?.(null);
  });

  render(state);

  // ── worldToScreen: converts native coords → screen coords ──
  function worldToScreen(point) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (point.x / BOARD.width) * rect.width,
      y: rect.top + (point.y / BOARD.height) * rect.height,
    };
  }

  return {
    mount,
    render(nextState) { state = nextState; render(state); },
    worldToScreen,
    getUnitAnchor(unitId) {
      const unit = state.units.find(u => u.id === unitId);
      if (!unit) return { x: 0, y: 0, valid: false };
      const c = getCenter(unit);
      const bf = document.getElementById('battlefield');
      const bfRect = bf?.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const screenX = canvasRect.left + (c.x / BOARD.width) * canvasRect.width;
      const screenY = canvasRect.top + (c.y / BOARD.height) * canvasRect.height;
      return {
        x: bfRect ? screenX - bfRect.left : screenX,
        y: bfRect ? screenY - bfRect.top : screenY,
        valid: true,
      };
    },
    resetView() { fitBoard(); },
    destroy() {},
  };
}
