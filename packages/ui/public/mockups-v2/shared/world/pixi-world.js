import { Application, Container, Graphics, Text } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.10.0/+esm';
import { BOARD, OBJECTIVES, TERRAIN, UNIT_DEFS } from '../data/shoot-v06-data.js';

const COLORS = {
  bg: 0x080d12,
  board: 0x121920,
  boardAccent: 0xc8a85e,
  imp: 0x00d4ff,
  ork: 0xff5b3d,
  spent: 0x8795a9,
  ruin: 0x47515c,
  scatter: 0x6e5632,
  neutral: 0x9099a4,
  friendly: 0x00d4ff,
  enemy: 0xff5b3d,
  text: 0xe9edf2,
};

export async function createPixiWorld({ mount, state, onUnitClick, onUnitHover }) {
  const app = new Application();
  await app.init({
    resizeTo: mount,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
  });
  mount.appendChild(app.canvas);
  app.canvas.classList.add('world-canvas');

  const viewport = { scale: 1, x: 0, y: 0 };
  const root = new Container();
  const world = new Container();
  const overlay = new Container();
  root.addChild(world);
  root.addChild(overlay);
  app.stage.addChild(root);

  const refs = new Map();

  function layoutViewport() {
    const pad = 24;
    const scale = Math.min((mount.clientWidth - pad * 2) / BOARD.width, (mount.clientHeight - pad * 2) / BOARD.height);
    viewport.scale = Math.max(0.5, scale);
    viewport.x = (mount.clientWidth - BOARD.width * viewport.scale) / 2;
    viewport.y = (mount.clientHeight - BOARD.height * viewport.scale) / 2;
    world.position.set(viewport.x, viewport.y);
    world.scale.set(viewport.scale);
  }

  function worldToScreen(point) {
    return { x: viewport.x + point.x * viewport.scale, y: viewport.y + point.y * viewport.scale };
  }

  function unitCenter(unit) {
    const sum = unit.models.reduce((acc, model) => ({ x: acc.x + model.x, y: acc.y + model.y }), { x: 0, y: 0 });
    return { x: sum.x / unit.models.length, y: sum.y / unit.models.length };
  }

  function unitAnchor(unitId) {
    const unit = state.units.find((entry) => entry.id === unitId);
    if (!unit) return { x: 0, y: 0, valid: false };
    const center = unitCenter(unit);
    const anchor = worldToScreen(center);
    return { ...anchor, valid: true };
  }

  function drawBoard() {
    const g = new Graphics();
    g.rect(0, 0, BOARD.width, BOARD.height).fill(COLORS.board);
    g.rect(0, 0, BOARD.width, BOARD.height).stroke({ color: COLORS.boardAccent, width: 2, alpha: 0.85 });
    g.rect(0, 0, 216, BOARD.height).fill({ color: COLORS.imp, alpha: 0.05 });
    g.rect(504, 0, 216, BOARD.height).fill({ color: COLORS.ork, alpha: 0.05 });
    g.moveTo(360, 0).lineTo(360, BOARD.height).stroke({ color: COLORS.boardAccent, width: 1, alpha: 0.15 });
    g.moveTo(0, 264).lineTo(BOARD.width, 264).stroke({ color: COLORS.boardAccent, width: 1, alpha: 0.08 });
    world.addChild(g);
  }

  function drawTerrain() {
    TERRAIN.forEach((piece) => {
      const g = new Graphics();
      const alpha = piece.kind === 'ruin' ? 0.85 : 0.8;
      g.roundRect(piece.x, piece.y, piece.w, piece.h, 4).fill({ color: piece.kind === 'ruin' ? COLORS.ruin : COLORS.scatter, alpha });
      g.roundRect(piece.x, piece.y, piece.w, piece.h, 4).stroke({ color: 0x000000, width: 1, alpha: 0.3 });
      if (piece.kind === 'ruin') {
        g.moveTo(piece.x + 8, piece.y + 8).lineTo(piece.x + piece.w - 8, piece.y + 8).stroke({ color: 0xa3b0bf, width: 3, alpha: 0.65 });
        g.moveTo(piece.x + 8, piece.y + 8).lineTo(piece.x + 8, piece.y + piece.h - 8).stroke({ color: 0xa3b0bf, width: 3, alpha: 0.65 });
      }
      world.addChild(g);
    });
  }

  function drawObjectives() {
    OBJECTIVES.forEach((objective) => {
      const color = objective.state === 'friendly' ? COLORS.friendly : objective.state === 'enemy' ? COLORS.enemy : COLORS.neutral;
      const g = new Graphics();
      g.circle(objective.x, objective.y, 36).stroke({ color, width: 2, alpha: 0.25 });
      g.circle(objective.x, objective.y, 6).fill({ color, alpha: 0.9 });
      world.addChild(g);
    });
  }

  function drawUnits() {
    refs.clear();
    state.units.forEach((unit) => {
      const unitContainer = new Container();
      unitContainer.eventMode = 'static';
      unitContainer.cursor = 'pointer';
      unitContainer.on('pointertap', () => onUnitClick?.(unit.id));
      unitContainer.on('pointerover', () => onUnitHover?.(unit.id));
      unitContainer.on('pointerout', () => onUnitHover?.(null));

      const isSelected = state.attackerId === unit.id;
      const isHovered = state.hoveredTargetId === unit.id || state.hoveredUnitId === unit.id;
      const isTarget = state.targetId === unit.id;
      const color = unit.faction === 'imp' ? COLORS.imp : COLORS.ork;
      const activeColor = unit.shot ? COLORS.spent : color;
      const center = unitCenter(unit);

      const hull = new Graphics();
      if (unit.models.length === 1) {
        const m = unit.models[0];
        hull.roundRect((m.x - (m.w || m.r * 2) / 2) - 8, (m.y - (m.h || m.r * 2) / 2) - 8, (m.w || m.r * 2) + 16, (m.h || m.r * 2) + 16, 12);
      } else {
        const xs = unit.models.map((m) => m.x);
        const ys = unit.models.map((m) => m.y);
        hull.roundRect(Math.min(...xs) - 16, Math.min(...ys) - 16, Math.max(...xs) - Math.min(...xs) + 32, Math.max(...ys) - Math.min(...ys) + 32, 24);
      }
      hull.fill({ color: activeColor, alpha: isSelected ? 0.12 : 0.05 });
      hull.stroke({ color: isSelected || isHovered || isTarget ? color : activeColor, width: isSelected ? 2.5 : 1.5, alpha: unit.shot ? 0.7 : 0.8 });
      unitContainer.addChild(hull);

      unit.models.forEach((model) => {
        const token = new Graphics();
        if (model.shape === 'rect') {
          token.roundRect(model.x - model.w / 2, model.y - model.h / 2, model.w, model.h, 6).fill({ color: 0x090d12, alpha: 1 });
          token.roundRect(model.x - model.w / 2, model.y - model.h / 2, model.w, model.h, 6).stroke({ color: activeColor, width: 2, alpha: 0.9 });
        } else {
          token.circle(model.x, model.y, model.r).fill({ color: 0x090d12, alpha: 1 });
          token.circle(model.x, model.y, model.r).stroke({ color: activeColor, width: 2, alpha: 0.95 });
        }
        unitContainer.addChild(token);
      });

      if (unit.carryWounds > 0) {
        const wound = new Graphics();
        const focus = unit.models[unit.models.length - 1];
        wound.arc(focus.x, focus.y, (focus.r || 10) + 6, -Math.PI / 2, Math.PI * 1.25).stroke({ color: 0xff6b6b, width: 2.5, alpha: 0.95 });
        unitContainer.addChild(wound);
      }

      const label = new Text({
        text: UNIT_DEFS[unit.id]?.name || unit.id,
        style: { fill: COLORS.text, fontFamily: 'Rajdhani', fontSize: 10, fontWeight: '700' }
      });
      label.anchor.set(0.5, 1);
      label.position.set(center.x, center.y - 18);
      label.alpha = isHovered || isSelected ? 0.92 : 0.66;
      unitContainer.addChild(label);

      refs.set(unit.id, { container: unitContainer, center });
      world.addChild(unitContainer);
    });
  }

  function drawTargeting() {
    overlay.removeChildren();
    if (!state.attackerId || !state.hoveredTargetId) return;
    const attacker = state.units.find((entry) => entry.id === state.attackerId);
    const target = state.units.find((entry) => entry.id === state.hoveredTargetId);
    if (!attacker || !target) return;

    const g = new Graphics();
    attacker.models.forEach((model) => {
      const tx = target.models[0].x;
      const ty = target.models[0].y;
      g.moveTo(viewport.x + model.x * viewport.scale, viewport.y + model.y * viewport.scale);
      g.lineTo(viewport.x + tx * viewport.scale, viewport.y + ty * viewport.scale);
    });
    g.stroke({ color: COLORS.imp, width: 1.5, alpha: 0.75, cap: 'round' });
    overlay.addChild(g);
  }

  function render(nextState) {
    state = nextState;
    world.removeChildren();
    drawBoard();
    drawTerrain();
    drawObjectives();
    drawUnits();
    drawTargeting();
  }

  const resize = () => {
    layoutViewport();
    render(state);
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    mount,
    render,
    worldToScreen,
    getUnitAnchor: unitAnchor,
    destroy() { window.removeEventListener('resize', resize); app.destroy(true); }
  };
}
