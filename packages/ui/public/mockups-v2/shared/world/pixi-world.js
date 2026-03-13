import { BOARD, TERRAIN, UNIT_DEFS } from '../data/shoot-v06-data.js';

const COLORS = {
  board: '#0b1118',
  ruin: 'rgba(58,64,64,.75)',
  ruinWall: 'rgba(106,114,114,.85)',
  scatter: 'rgba(58,48,24,.7)',
  depImp: 'rgba(0,80,160,.06)',
  depImpStroke: 'rgba(0,212,255,.15)',
  depOrk: 'rgba(255,64,32,.06)',
  depOrkStroke: 'rgba(255,64,32,.15)',
};

export async function createPixiWorld({ mount, state, onUnitClick, onUnitHover }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  canvas.width = BOARD.width;
  canvas.height = BOARD.height;
  canvas.style.width = BOARD.width + 'px';
  canvas.style.height = BOARD.height + 'px';
  mount.appendChild(canvas);
  const ctx = canvas.getContext('2d');

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
    const bfH = bf.clientHeight - 120;
    scale = Math.min(bfW / BOARD.width, bfH / BOARD.height) * 0.88;
    tx = (bfW - BOARD.width * scale) / 2;
    ty = 60 + (bfH - BOARD.height * scale) / 2;
    applyTransform();
  }

  const battlefield = mount.closest('#battlefield');
  if (battlefield) {
    battlefield.addEventListener('wheel', (e) => {
      e.preventDefault();
      scale = Math.min(3, Math.max(0.35, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyTransform();
    }, { passive: false });

    let dragging = false, startX = 0, startY = 0;
    battlefield.addEventListener('mousedown', (e) => {
      if (e.target.closest('#unit-card,#vp-bar,#phase-header,#action-bar,.obj-marker')) return;
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

  document.getElementById('reset-btn')?.addEventListener('click', fitBoard);
  fitBoard();
  window.addEventListener('resize', () => { fitBoard(); render(state); });

  function drawBoard() {
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    ctx.fillStyle = COLORS.depImp;
    ctx.fillRect(0, 0, 216, BOARD.height);
    ctx.strokeStyle = COLORS.depImpStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 216, BOARD.height);

    ctx.fillStyle = COLORS.depOrk;
    ctx.fillRect(504, 0, 216, BOARD.height);
    ctx.strokeStyle = COLORS.depOrkStroke;
    ctx.strokeRect(504, 0, 216, BOARD.height);

    ctx.strokeStyle = 'rgba(201,163,82,.05)';
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(360, 0); ctx.lineTo(360, BOARD.height); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,163,82,.03)';
    ctx.setLineDash([4, 12]);
    ctx.beginPath(); ctx.moveTo(0, 264); ctx.lineTo(BOARD.width, 264); ctx.stroke();
    ctx.setLineDash([]);
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
        ctx.beginPath(); ctx.moveTo(1.2, 1.2); ctx.lineTo(piece.w * 0.67, 1.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1.2, 1.2); ctx.lineTo(1.2, piece.h * 0.67); ctx.stroke();
      }
      ctx.restore();
    });
  }

  function getCenter(unit) {
    const sum = unit.models.reduce((acc, model) => ({ x: acc.x + model.x, y: acc.y + model.y }), { x: 0, y: 0 });
    return { x: sum.x / unit.models.length, y: sum.y / unit.models.length };
  }

  function getTokenMetrics(unit) {
    const count = unit.models.length;
    const vehicle = UNIT_DEFS[unit.id]?.icon === 'vehicle' || unit.models[0]?.shape === 'rect';
    if (vehicle) return { shape: 'vehicle', width: 80, height: 70, radius: 14 };
    const size = count === 1 ? 46 : count <= 5 ? 58 : 74;
    return { shape: 'circle', width: size, height: size, radius: size / 2 };
  }

  function getTokenPalette(unit, isSelected) {
    const def = UNIT_DEFS[unit.id] || {};
    const isCharacter = def.factionSubtitle?.includes('CHARACTER') || def.icon === 'character';
    const isImp = unit.faction === 'imp';
    const stroke = isSelected ? '#00d4ff' : isCharacter ? '#c9a352' : isImp ? (def.factionColor || '#2266dd') : '#882222';
    const glow = isSelected ? 'rgba(0,212,255,0.7)' : isCharacter ? 'rgba(201,163,82,0.45)' : isImp ? 'rgba(30,100,220,0.5)' : 'rgba(180,30,30,0.5)';
    const gradInner = isImp ? '#1a3060' : '#3d0e0e';
    const gradOuter = isImp ? '#0a1830' : '#1c0505';
    return { stroke, glow, gradInner, gradOuter };
  }

  function applyShapePath(x, y, metrics) {
    ctx.beginPath();
    if (metrics.shape === 'vehicle') {
      ctx.roundRect(x - metrics.width / 2, y - metrics.height / 2, metrics.width, metrics.height, metrics.radius);
    } else {
      ctx.arc(x, y, metrics.radius, 0, Math.PI * 2);
    }
  }

  function drawHull(unit, isSelected) {
    const center = getCenter(unit);
    const metrics = getTokenMetrics(unit);
    const palette = getTokenPalette(unit, isSelected);

    ctx.save();
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = isSelected ? 20 : 14;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2.5;
    applyShapePath(center.x, center.y, metrics);
    ctx.stroke();
    ctx.restore();
  }

  function drawToken(unit, isSelected) {
    const center = getCenter(unit);
    const metrics = getTokenMetrics(unit);
    const palette = getTokenPalette(unit, isSelected);
    const gradRadius = Math.max(metrics.width, metrics.height) * 0.7;
    const gradient = ctx.createRadialGradient(center.x - metrics.width * 0.18, center.y - metrics.height * 0.2, 4, center.x, center.y, gradRadius);
    gradient.addColorStop(0, palette.gradInner);
    gradient.addColorStop(1, palette.gradOuter);

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = isSelected ? 20 : 14;
    applyShapePath(center.x, center.y, metrics);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = isSelected ? 20 : 14;
    applyShapePath(center.x, center.y, metrics);
    ctx.stroke();
    ctx.restore();

    const icon = UNIT_DEFS[unit.id]?.icon;
    const r = Math.min(metrics.width, metrics.height) * 0.22;
    ctx.save();
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    if (icon === 'character') {
      for (let i = 0; i < 5; i++) {
        const a = (-Math.PI / 2) + (i * Math.PI * 2 / 5);
        const px = center.x + Math.cos(a) * r * 1.15;
        const py = center.y + Math.sin(a) * r * 1.15;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (icon === 'elite') {
      ctx.moveTo(center.x, center.y - r * 1.1);
      ctx.lineTo(center.x + r, center.y);
      ctx.lineTo(center.x, center.y + r * 1.1);
      ctx.lineTo(center.x - r, center.y);
      ctx.closePath();
    } else if (icon === 'vehicle') {
      ctx.roundRect(center.x - r * 1.4, center.y - r, r * 2.8, r * 2, 3);
      ctx.moveTo(center.x - r * 1.4, center.y);
      ctx.lineTo(center.x + r * 1.4, center.y);
    } else {
      ctx.moveTo(center.x, center.y - r * 1.3);
      ctx.lineTo(center.x, center.y + r * 1.3);
      ctx.moveTo(center.x - r * 1.3, center.y);
      ctx.lineTo(center.x + r * 1.3, center.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawWoundRing(unit) {
    if (!unit.carryWounds || unit.carryWounds <= 0) return;
    const focus = getCenter(unit);
    const metrics = getTokenMetrics(unit);
    const r = metrics.shape === 'vehicle' ? Math.max(metrics.width, metrics.height) / 2 + 8 : metrics.radius + 6;
    const wPer = Number(UNIT_DEFS[unit.id]?.stats?.W || 1);
    if (wPer <= 1) return;
    const remaining = Math.max(0, wPer - unit.carryWounds);
    const lostFrac = unit.carryWounds / wPer;
    ctx.strokeStyle = 'rgba(30,42,56,.9)';
    ctx.lineWidth = 2.25;
    ctx.beginPath(); ctx.arc(focus.x, focus.y, r, 0, Math.PI * 2); ctx.stroke();
    const lostSweep = Math.max(10 * Math.PI / 180, Math.PI * 2 * lostFrac);
    const remainSweep = Math.max(0, Math.PI * 2 - lostSweep - 8 * Math.PI / 180);
    if (remainSweep > 6 * Math.PI / 180) {
      ctx.strokeStyle = 'rgba(0,212,255,.92)';
      ctx.beginPath(); ctx.arc(focus.x, focus.y, r, -Math.PI / 2, -Math.PI / 2 + remainSweep); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,96,96,.95)';
    ctx.beginPath(); ctx.arc(focus.x, focus.y, r, -Math.PI / 2 + remainSweep + 8 * Math.PI / 180, -Math.PI / 2 + Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(8,12,16,.94)';
    ctx.strokeStyle = 'rgba(0,212,255,.22)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.roundRect(focus.x - 13, focus.y + r + 4, 26, 12, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d7ecff';
    ctx.font = '700 8px Rajdhani';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${remaining}W`, focus.x, focus.y + r + 10);
  }

  function drawUnits(currentState) {
    currentState.units.forEach((unit) => {
      const isSelected = currentState.attackerId === unit.id || currentState.hoveredTargetId === unit.id;
      drawHull(unit, isSelected);
      drawToken(unit, isSelected);
      drawWoundRing(unit);
    });
  }

  function drawTargetLines(currentState) {
    if (!currentState.attackerId || !currentState.hoveredTargetId) return;
    const attacker = currentState.units.find((unit) => unit.id === currentState.attackerId);
    const target = currentState.units.find((unit) => unit.id === currentState.hoveredTargetId);
    if (!attacker || !target) return;
    const from = getCenter(attacker);
    const to = getCenter(target);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 5]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
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
  }

  function pointerToNative(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (BOARD.width / rect.width),
      y: (event.clientY - rect.top) * (BOARD.height / rect.height),
    };
  }

  function hitTest(point, units) {
    for (let i = units.length - 1; i >= 0; i--) {
      const unit = units[i];
      const center = getCenter(unit);
      const metrics = getTokenMetrics(unit);
      if (metrics.shape === 'vehicle') {
        const left = center.x - metrics.width / 2;
        const top = center.y - metrics.height / 2;
        if (point.x >= left && point.x <= left + metrics.width && point.y >= top && point.y <= top + metrics.height) return unit;
      } else if (Math.hypot(point.x - center.x, point.y - center.y) <= metrics.radius) {
        return unit;
      }
    }
    return null;
  }

  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor = 'default';
  canvas.addEventListener('click', (e) => { const hit = hitTest(pointerToNative(e), state.units); if (hit) onUnitClick?.(hit.id); });
  canvas.addEventListener('mousemove', (e) => {
    const hit = hitTest(pointerToNative(e), state.units);
    canvas.style.cursor = hit ? 'pointer' : 'default';
    onUnitHover?.(hit?.id ?? null);
  });
  canvas.addEventListener('mouseleave', () => { canvas.style.cursor = 'default'; onUnitHover?.(null); });
  render(state);

  return {
    mount,
    render(nextState) { state = nextState; render(state); },
    worldToScreen(point) {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (point.x / BOARD.width) * rect.width, y: rect.top + (point.y / BOARD.height) * rect.height };
    },
    getUnitAnchor(unitId) {
      const unit = state.units.find((entry) => entry.id === unitId);
      if (!unit) return { x: 0, y: 0, valid: false };
      const c = getCenter(unit);
      const bfRect = document.getElementById('battlefield')?.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const screenX = canvasRect.left + (c.x / BOARD.width) * canvasRect.width;
      const screenY = canvasRect.top + (c.y / BOARD.height) * canvasRect.height;
      return { x: bfRect ? screenX - bfRect.left : screenX, y: bfRect ? screenY - bfRect.top : screenY, valid: true };
    },
    resetView() { fitBoard(); },
    destroy() {},
  };
}
