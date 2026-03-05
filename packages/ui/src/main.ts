/**
 * WH40K Simulator — Phase 3 Interactive Board
 *
 * Controls:
 *   Click gold unit  → select it
 *   M key / MOVE btn → enter move mode, click destination
 *   A key / ADV btn  → enter advance mode, click destination
 *   Esc              → deselect / cancel mode
 *   Enter / Space    → end phase
 */
import {
  Application, Graphics, Text, TextStyle, Container,
  type FederatedPointerEvent,
} from 'pixi.js';
import {
  GameEngine, SeededRng, TranscriptLog, createInitialState,
  type BlobUnit, type GameState, type Point,
} from '@wh40k/engine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOARD_W       = 60;          // game inches
const BOARD_H       = 44;
const BOARD_COLOR   = 0x1a1208;
const GRID_COLOR    = 0x2a1f0a;
const ACCENT        = 0xc7a84a;
const P1_COLOR      = 0xd4a930;   // Custodes gold
const P2_COLOR      = 0xaa1111;   // Chaos red
const SEL_COLOR     = 0x00ffcc;   // selection ring
const MOVE_COLOR    = 0x44aaff;   // move-range ring
const ADV_COLOR     = 0x22ddaa;   // advance-range ring

type Mode = 'select' | 'move' | 'advance';

// ---------------------------------------------------------------------------
// Hardcoded demo armies
// ---------------------------------------------------------------------------

function makeCustodes(pid: string): BlobUnit[] {
  const base = { playerId: pid, hasFired: false, hasCharged: false, hasFought: false, hasAdvanced: false, isInEngagement: false, movedThisPhase: false };
  return [
    { id: `${pid}-0`, datasheetId: 'blade-champion',    name: 'Blade Champion ★', center:{x:8,y:8},   radius:1,   movementInches:6,  remainingMove:6,  toughness:6,  save:2, invuln:4,    fnp:null, oc:2, wounds:8,  maxWounds:8,  ...base },
    { id: `${pid}-1`, datasheetId: 'custodian-guard',   name: 'Custodian Guard I',center:{x:21,y:7},  radius:3,   movementInches:6,  remainingMove:6,  toughness:6,  save:2, invuln:4,    fnp:null, oc:2, wounds:3,  maxWounds:3,  ...base },
    { id: `${pid}-2`, datasheetId: 'custodian-guard',   name: 'Custodian Guard II',center:{x:37,y:7}, radius:3,   movementInches:6,  remainingMove:6,  toughness:6,  save:2, invuln:4,    fnp:null, oc:2, wounds:3,  maxWounds:3,  ...base },
    { id: `${pid}-3`, datasheetId: 'allarus-custodians',name: 'Allarus Custodians',center:{x:50,y:8}, radius:2,   movementInches:5,  remainingMove:5,  toughness:7,  save:2, invuln:4,    fnp:null, oc:2, wounds:4,  maxWounds:4,  ...base },
    { id: `${pid}-4`, datasheetId: 'caladius-grav-tank',name: 'Caladius',          center:{x:30,y:10},radius:2.5, movementInches:10, remainingMove:10, toughness:11, save:2, invuln:5,    fnp:null, oc:4, wounds:14, maxWounds:14, ...base },
  ];
}

function makeOpponent(pid: string): BlobUnit[] {
  const base = { playerId: pid, hasFired: false, hasCharged: false, hasFought: false, hasAdvanced: false, isInEngagement: false, movedThisPhase: false };
  return [
    { id: `${pid}-0`, datasheetId: 'chaos-lord',        name: 'Chaos Lord',       center:{x:8,y:36},  radius:1,   movementInches:6, remainingMove:6, toughness:5, save:2, invuln:null, fnp:null, oc:2, wounds:6, maxWounds:6, ...base },
    { id: `${pid}-1`, datasheetId: 'chaos-warriors',    name: 'Warriors I',       center:{x:22,y:37}, radius:3.5, movementInches:6, remainingMove:6, toughness:4, save:3, invuln:null, fnp:null, oc:2, wounds:2, maxWounds:2, ...base },
    { id: `${pid}-2`, datasheetId: 'chaos-warriors',    name: 'Warriors II',      center:{x:38,y:37}, radius:3.5, movementInches:6, remainingMove:6, toughness:4, save:3, invuln:null, fnp:null, oc:2, wounds:2, maxWounds:2, ...base },
    { id: `${pid}-3`, datasheetId: 'chaos-terminators', name: 'Chaos Terminators',center:{x:52,y:36}, radius:2,   movementInches:5, remainingMove:5, toughness:5, save:2, invuln:null, fnp:null, oc:2, wounds:3, maxWounds:3, ...base },
  ];
}

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

interface Viewport { ox: number; oy: number; scale: number }

function makeViewport(screenW: number, screenH: number, hudH: number): Viewport {
  const pad = 50;
  const usableW = screenW - pad * 2;
  const usableH = screenH - hudH - pad * 2;
  const scale = Math.min(usableW / BOARD_W, usableH / BOARD_H);
  return {
    ox: (screenW - BOARD_W * scale) / 2,
    oy: hudH + (screenH - hudH - BOARD_H * scale) / 2,
    scale,
  };
}

function boardToScreen(vp: Viewport, p: Point): Point {
  return { x: vp.ox + p.x * vp.scale, y: vp.oy + p.y * vp.scale };
}
function screenToBoard(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.ox) / vp.scale, y: (p.y - vp.oy) / vp.scale };
}

// ---------------------------------------------------------------------------
// Hit test
// ---------------------------------------------------------------------------

function hitUnit(units: BlobUnit[], board: Point, minR = 1.5): BlobUnit | null {
  let best: BlobUnit | null = null;
  let bestD = Infinity;
  for (const u of units) {
    const d = Math.hypot(board.x - u.center.x, board.y - u.center.y);
    if (d <= Math.max(u.radius, minR) && d < bestD) { best = u; bestD = d; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Board renderer
// ---------------------------------------------------------------------------

function renderBoard(g: Graphics, vp: Viewport): void {
  const { ox: x, oy: y, scale: s } = vp;
  const bw = BOARD_W * s, bh = BOARD_H * s;

  g.rect(x, y, bw, bh).fill(BOARD_COLOR);

  // Deployment zones (12")
  const dz = 12 * s;
  g.setStrokeStyle({ width: 1, color: 0x3a2c10, alpha: 0.8 });
  g.moveTo(x, y + bh - dz).lineTo(x + bw, y + bh - dz).stroke();
  g.moveTo(x, y + dz).lineTo(x + bw, y + dz).stroke();

  // 6" grid
  const gs = 6 * s;
  g.setStrokeStyle({ width: 0.5, color: GRID_COLOR, alpha: 0.55 });
  for (let gx = x; gx <= x + bw + 1; gx += gs) g.moveTo(gx, y).lineTo(gx, y + bh);
  for (let gy = y; gy <= y + bh + 1; gy += gs) g.moveTo(x, gy).lineTo(x + bw, gy);
  g.stroke();

  // Objectives
  for (const [ox2, oy2] of [[15, 22], [30, 22], [45, 22]] as [number, number][]) {
    const sc = boardToScreen(vp, { x: ox2, y: oy2 });
    g.circle(sc.x, sc.y, 3 * s).fill({ color: 0xffffff, alpha: 0.07 });
    g.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.5 });
    g.circle(sc.x, sc.y, 3 * s).stroke();
    g.circle(sc.x, sc.y, 3).fill({ color: 0xffffff, alpha: 0.7 });
  }

  // Border
  g.setStrokeStyle({ width: 3, color: ACCENT, alpha: 0.9 });
  g.rect(x, y, bw, bh).stroke();
  for (const [cx, cy] of [[x,y],[x+bw,y],[x,y+bh],[x+bw,y+bh]] as [number,number][]) {
    g.circle(cx, cy, 6).fill(ACCENT);
  }

  // Zone labels
  const zs = new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 10, fill: 0x7a5820, letterSpacing: 2 });
  for (const [txt, lx, ly] of [['▲ PLAYER 1', x + 8, y + 3], ['▼ PLAYER 2', x + 8, y + bh - 14]] as [string,number,number][]) {
    const t = new Text({ text: txt, style: zs }); t.x = lx; t.y = ly; g.addChild(t);
  }
}

// ---------------------------------------------------------------------------
// Unit renderer
// ---------------------------------------------------------------------------

const SHORT: Record<string, string> = {
  'Custodian Guard I': 'Guard I', 'Custodian Guard II': 'Guard II',
  'Allarus Custodians': 'Allarus', 'Caladius': 'Caladius',
  'Blade Champion ★': 'Champion★',
  'Chaos Lord': 'C.Lord', 'Warriors I': 'War.I', 'Warriors II': 'War.II',
  'Chaos Terminators': 'C.Terms',
};

function renderUnits(g: Graphics, units: BlobUnit[], vp: Viewport, selId: string | null): void {
  for (const u of units) {
    const sc = boardToScreen(vp, u.center);
    const sr = u.radius * vp.scale;
    const col = u.playerId === 'player1' ? P1_COLOR : P2_COLOR;
    const alpha = u.movedThisPhase ? 0.45 : 1;

    g.circle(sc.x + 2, sc.y + 2, sr).fill({ color: 0x000000, alpha: 0.3 * alpha });
    g.circle(sc.x, sc.y, sr).fill({ color: col, alpha });
    g.setStrokeStyle({ width: Math.max(1, sr * 0.07), color: 0x000000, alpha: 0.35 });
    g.circle(sc.x, sc.y, sr * 0.68).stroke();

    if (u.id === selId) {
      g.setStrokeStyle({ width: 3, color: SEL_COLOR });
      g.circle(sc.x, sc.y, sr + 4).stroke();
    }

    // Wound pip
    const wf = u.wounds / u.maxWounds;
    const pc = wf > 0.5 ? 0x44ee44 : wf > 0.25 ? 0xffaa00 : 0xff2222;
    g.circle(sc.x + sr * 0.6, sc.y + sr * 0.6, Math.max(3, sr * 0.18)).fill(pc);

    // Label
    const fs = Math.max(9, Math.min(13, sr * 0.5));
    const ls = new TextStyle({ fontFamily: '"Courier New",monospace', fontSize: fs, fill: 0xffffff, align: 'center',
      dropShadow: { color: 0x000000, alpha: 0.9, blur: 3, distance: 1, angle: Math.PI / 4 } });
    const lbl = new Text({ text: SHORT[u.name] ?? u.name.slice(0, 10), style: ls });
    lbl.anchor.set(0.5, 0.5); lbl.x = sc.x; lbl.y = sc.y;
    g.addChild(lbl);

    if (sr > 22) {
      const ss = new TextStyle({ fontFamily: '"Courier New",monospace', fontSize: Math.max(7, sr * 0.28), fill: 0xddddcc, align: 'center' });
      const inv = u.invuln ? `/${u.invuln}+` : '';
      const st = new Text({ text: `T${u.toughness} ${u.save}+${inv}`, style: ss });
      st.anchor.set(0.5, 0); st.x = sc.x; st.y = sc.y + sr * 0.32;
      g.addChild(st);
    }
  }
}

// ---------------------------------------------------------------------------
// Selection overlay
// ---------------------------------------------------------------------------

function renderOverlay(g: Graphics, unit: BlobUnit | null, vp: Viewport, mode: Mode): void {
  if (!unit) return;
  const sc = boardToScreen(vp, unit.center);
  const sr = unit.radius * vp.scale;

  if (!unit.movedThisPhase) {
    const mr = (unit.remainingMove + unit.radius) * vp.scale;
    const ar = (unit.movementInches + 6 + unit.radius) * vp.scale;
    g.circle(sc.x, sc.y, mr).fill({ color: MOVE_COLOR, alpha: 0.07 });
    g.setStrokeStyle({ width: 2, color: MOVE_COLOR, alpha: 0.75 }); g.circle(sc.x, sc.y, mr).stroke();
    g.setStrokeStyle({ width: 1.5, color: ADV_COLOR, alpha: 0.4 }); g.circle(sc.x, sc.y, ar).stroke();
  }

  // Mode badge
  if (mode !== 'select') {
    const ms = new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 13, fontWeight: 'bold', fill: mode === 'move' ? MOVE_COLOR : ADV_COLOR });
    const mt = new Text({ text: mode === 'move' ? '→ MOVE: click destination' : '→ ADVANCE: click destination', style: ms });
    mt.anchor.set(0.5, 1); mt.x = sc.x; mt.y = sc.y - sr - 8;
    g.addChild(mt);
  }

  // Stat tooltip
  const ts = new TextStyle({ fontFamily: '"Courier New",monospace', fontSize: 12, fill: 0xe8d5a0, lineHeight: 18 });
  const inv2 = unit.invuln ? ` / ${unit.invuln}+inv` : '';
  const flags = [unit.movedThisPhase && '[MOVED]', unit.hasAdvanced && '[ADV]'].filter(Boolean).join(' ');
  const moveLine = unit.movedThisPhase ? 'Already moved this phase' : `Move: ${unit.remainingMove.toFixed(1)}"   Advance max: ${unit.movementInches + 6}"`;
  const tt = new Text({ text: [`${unit.name} ${flags}`, `T${unit.toughness} SV${unit.save}+${inv2}  W${unit.wounds}/${unit.maxWounds}  OC${unit.oc}`, moveLine].join('\n'), style: ts });
  const ttx = Math.max(4, sc.x + sr + 8);
  const tty = Math.max(4, sc.y - 24);
  const ttw = tt.width + 16; const tth = tt.height + 12;
  const bg = new Graphics();
  bg.roundRect(ttx - 8, tty - 6, ttw, tth, 4).fill({ color: 0x0e0c08, alpha: 0.9 });
  bg.setStrokeStyle({ width: 1, color: ACCENT, alpha: 0.55 }); bg.roundRect(ttx - 8, tty - 6, ttw, tth, 4).stroke();
  g.addChild(bg);
  tt.x = ttx; tt.y = tty; g.addChild(tt);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

interface HUD {
  container: Container;
  height: number;
  update(state: GameState, log: string, selId: string | null, mode: Mode): void;
  endPhaseBtn: Graphics;
  moveBtn: Graphics;
  advBtn: Graphics;
}

function buildHUD(screenW: number): HUD {
  const H = 50;
  const c = new Container();

  const bg = new Graphics();
  bg.rect(0, 0, screenW, H).fill({ color: 0x080609, alpha: 0.97 });
  bg.setStrokeStyle({ width: 1, color: ACCENT, alpha: 0.3 }); bg.moveTo(0, H).lineTo(screenW, H).stroke();
  c.addChild(bg);

  const phStyle = new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 15, fontWeight: 'bold', fill: ACCENT, letterSpacing: 3 });
  const phText = new Text({ text: '', style: phStyle });
  phText.x = 16; phText.y = 9; c.addChild(phText);

  const lgStyle = new TextStyle({ fontFamily: '"Courier New",monospace', fontSize: 11, fill: 0x888866 });
  const lgText = new Text({ text: 'Select a Custodes (gold) unit to begin.', style: lgStyle });
  lgText.x = 16; lgText.y = 31; c.addChild(lgText);

  const vpStyle = new TextStyle({ fontFamily: '"Courier New",monospace', fontSize: 13, fill: 0xccbb88 });
  const vpText = new Text({ text: 'VP: 0 — 0', style: vpStyle });
  vpText.anchor.set(0.5, 0); vpText.x = screenW / 2; vpText.y = 17; c.addChild(vpText);

  function btn(label: string, color: number, rx: number): Graphics {
    const bw = 140; const bh = 34;
    const b = new Graphics();
    b.roundRect(0, 0, bw, bh, 6).fill({ color });
    b.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.2 }); b.roundRect(0, 0, bw, bh, 6).stroke();
    const ts = new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 13, fontWeight: 'bold', fill: 0xffffff, letterSpacing: 1 });
    const t = new Text({ text: label, style: ts }); t.anchor.set(0.5, 0.5); t.x = bw / 2; t.y = bh / 2;
    b.addChild(t); b.x = screenW - rx; b.y = 8; b.interactive = true; b.cursor = 'pointer';
    c.addChild(b); return b;
  }

  const endBtn = btn('⏭ END PHASE', 0x5a2a0e, 148);
  const mBtn   = btn('⬡ MOVE [M]',  0x0e3a7a, 298);
  const aBtn   = btn('⚡ ADVANCE [A]', 0x0e5a3a, 448);

  function update(state: GameState, log: string, selId: string | null, mode: Mode): void {
    const p1 = state.players[0]; const p2 = state.players[1];
    const label = state.activePlayer === 'player1' ? '⚜ CUSTODES' : '☠ CHAOS';
    phText.text = `Turn ${state.turn}  ·  ${state.phase}  ·  ${label}`;
    lgText.text = log.slice(0, 100);
    vpText.text = `VP: ${p1?.victoryPoints ?? 0} — ${p2?.victoryPoints ?? 0}`;
    vpText.x = screenW / 2;

    const canAct = state.phase === 'MOVEMENT' && state.activePlayer === 'player1' && !!selId;
    mBtn.alpha = canAct ? 1 : 0.3; mBtn.interactive = canAct;
    aBtn.alpha = canAct ? 1 : 0.3; aBtn.interactive = canAct;
    mBtn.tint = mode === 'move' ? 0x88ddff : 0xffffff;
    aBtn.tint = mode === 'advance' ? 0x88ffcc : 0xffffff;

    // Resize bg
    (bg.children[0] as undefined); // no-op to avoid unused warning
    bg.clear();
    bg.rect(0, 0, screenW, H).fill({ color: 0x080609, alpha: 0.97 });
    bg.setStrokeStyle({ width: 1, color: ACCENT, alpha: 0.3 }); bg.moveTo(0, H).lineTo(screenW, H).stroke();

    // Reposition buttons for width
    endBtn.x = screenW - 148;
    mBtn.x = screenW - 298;
    aBtn.x = screenW - 448;
  }

  return { container: c, height: H, update, endPhaseBtn: endBtn, moveBtn: mBtn, advBtn: aBtn };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, backgroundColor: 0x08080a, antialias: true, resolution: window.devicePixelRatio ?? 1, autoDensity: true });
  const el = document.getElementById('app');
  if (!el) throw new Error('Missing #app');
  el.appendChild(app.canvas);

  // Engine
  const engine = new GameEngine(
    Object.assign(
      createInitialState(['player1', 'player2'], { rngSeed: Date.now() }),
      {
        units: [...makeCustodes('player1'), ...makeOpponent('player2')],
        objectives: [
          { id: 'obj-a', position: {x:15,y:22}, radius:3, controlledBy:null, contestedOcPerPlayer:{} },
          { id: 'obj-b', position: {x:30,y:22}, radius:3, controlledBy:null, contestedOcPerPlayer:{} },
          { id: 'obj-c', position: {x:45,y:22}, radius:3, controlledBy:null, contestedOcPerPlayer:{} },
        ],
      }
    ),
    new SeededRng(Date.now()),
    new TranscriptLog(),
  );

  // Layers
  const boardLayer   = new Graphics();
  const unitLayer    = new Graphics();
  const overlayLayer = new Graphics();
  app.stage.addChild(boardLayer, unitLayer, overlayLayer);

  // HUD
  const hud = buildHUD(app.screen.width);
  app.stage.addChild(hud.container);

  // State
  let sel: string | null = null;
  let mode: Mode = 'select';
  let log = 'Select a Custodes (gold) unit to move.';

  // Render
  function render(): void {
    const state = engine.getState();
    const vp = makeViewport(app.screen.width, app.screen.height, hud.height);

    boardLayer.clear(); boardLayer.removeChildren(); renderBoard(boardLayer, vp);
    unitLayer.clear();  unitLayer.removeChildren();  renderUnits(unitLayer, state.units, vp, sel);
    overlayLayer.clear(); overlayLayer.removeChildren();
    const selUnit = sel ? (state.units.find(u => u.id === sel) ?? null) : null;
    renderOverlay(overlayLayer, selUnit, vp, mode);

    hud.update(state, log, sel, mode);
  }

  // Input
  app.stage.interactive = true;
  app.stage.hitArea = app.screen;

  app.stage.on('pointertap', (e: FederatedPointerEvent) => {
    const state = engine.getState();
    const vp = makeViewport(app.screen.width, app.screen.height, hud.height);
    const bp = screenToBoard(vp, { x: e.global.x, y: e.global.y });
    if (bp.x < 0 || bp.x > BOARD_W || bp.y < 0 || bp.y > BOARD_H) return;

    if (mode === 'select') {
      const hit = hitUnit(state.units, bp);
      if (hit) {
        if (hit.playerId === state.activePlayer) {
          sel = sel === hit.id ? null : hit.id;
          log = sel ? `Selected: ${hit.name}` : 'Deselected.';
        } else {
          log = `${hit.name} — T${hit.toughness} SV${hit.save}+ W${hit.wounds}/${hit.maxWounds}`;
        }
      } else { sel = null; log = 'No unit here.'; }
    } else {
      if (!sel) { mode = 'select'; render(); return; }
      const action = mode === 'move'
        ? ({ type: 'MOVE_UNIT'    as const, unitId: sel, destination: bp })
        : ({ type: 'ADVANCE_UNIT' as const, unitId: sel, destination: bp });
      const res = engine.dispatch(action);
      if (res.success) {
        const moved = engine.getState().units.find(u => u.id === sel);
        log = `${moved?.name ?? ''} ${mode === 'move' ? 'moved' : 'ADVANCED'} → (${bp.x.toFixed(1)}", ${bp.y.toFixed(1)}")`;
        mode = 'select';
      } else { log = `⚠ ${res.error}`; }
    }
    render();
  });

  function endPhase(): void {
    engine.dispatch({ type: 'END_PHASE' });
    sel = null; mode = 'select';
    const ph = engine.getState().phase;
    const tips: Record<string, string> = {
      MOVEMENT: 'Select a gold unit then press M to move or A to advance.',
      SHOOTING: 'Shooting phase (Phase 4). Press Enter to continue.',
      CHARGE: 'Charge phase (Phase 5). Press Enter to continue.',
      FIGHT: 'Fight phase (Phase 5). Press Enter to continue.',
      END: 'End phase. Press Enter to close the turn.',
      COMMAND: 'New turn! Check VPs. Select a unit to act.',
    };
    log = tips[ph] ?? `Phase: ${ph}`;
    render();
  }

  hud.endPhaseBtn.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); endPhase(); });
  hud.moveBtn.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); if (sel) { mode = mode === 'move' ? 'select' : 'move'; render(); } });
  hud.advBtn.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); if (sel) { mode = mode === 'advance' ? 'select' : 'advance'; render(); } });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { sel = null; mode = 'select'; log = 'Deselected.'; render(); }
    else if ((e.key === 'm' || e.key === 'M') && sel) { mode = mode === 'move' ? 'select' : 'move'; render(); }
    else if ((e.key === 'a' || e.key === 'A') && sel) { mode = mode === 'advance' ? 'select' : 'advance'; render(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endPhase(); }
  });

  app.renderer.on('resize', () => render());
  render();
}

init().catch(console.error);
