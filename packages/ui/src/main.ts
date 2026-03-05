/**
 * WH40K Simulator — Interactive Board
 *
 * Movement (MOVEMENT phase):
 *   Drag gold unit   → move it (snaps back if out of range)
 *   A key / ADV btn  → switch to Advance mode, then drag
 *   M key / MOVE btn → switch back to Move mode
 *
 * Shooting (SHOOTING phase):
 *   Click gold unit  → select it
 *   Click red unit   → shoot with selected unit (auto-picks first ranged weapon)
 *   S key            → toggle shoot mode
 *
 * General:
 *   Esc              → deselect / cancel
 *   Enter / Space    → end phase
 */
import {
  Application, Graphics, Text, TextStyle, Container,
  type FederatedPointerEvent,
} from 'pixi.js';
import {
  GameEngine, SeededRng, TranscriptLog, createInitialState,
  type BlobUnit, type EngineWeapon, type GameState, type Point,
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

type Mode = 'select' | 'shoot';

// ---------------------------------------------------------------------------
// Hardcoded demo armies
// ---------------------------------------------------------------------------

// Weapon helpers
const w = (id: string, name: string, type: 'ranged'|'melee', range: number|'Melee', attacks: string, skill: number, strength: number, ap: number, damage: string, keywords: string[] = []): EngineWeapon =>
  ({ id, name, type, range, attacks, skill, strength, ap, damage, keywords });

const GUARDIAN_SPEAR_R = w('guardian-spear-r','Guardian Spear','ranged',24,'3',2,5,-1,'1');
const GUARDIAN_SPEAR_M = w('guardian-spear-m','Guardian Spear','melee','Melee','5',2,8,-3,'2');
const BALISTUS_GRENADE = w('balistus-grenade','Balistus Grenade Launcher','ranged',18,'D6',2,4,-1,'1');
const CASTELLAN_AXE    = w('castellan-axe','Castellan Axe','melee','Melee','4',2,8,-2,'2');
const ACCEL_CANNON     = w('accel-cannon','Illiastus Accelerator Cannons','ranged',36,'6',2,7,-2,'2');
const DAEMON_SWORD     = w('daemon-sword','Daemon Sword','melee','Melee','5',2,5,-2,'2');
const INFERNAL_AXE     = w('infernal-axe','Infernal Greataxe','melee','Melee','2',3,5,-1,'1');
const COMBI_WEAPON     = w('combi-weapon','Combi-weapon','ranged',24,'2',4,4,0,'1');
const POWER_FIST       = w('power-fist','Power Fist','melee','Melee','3',4,8,-2,'2');

function makeCustodes(pid: string): BlobUnit[] {
  const base = { playerId: pid, hasFired: false, hasCharged: false, hasFought: false, hasAdvanced: false, isInEngagement: false, movedThisPhase: false };
  return [
    { id: `${pid}-0`, datasheetId: 'blade-champion',    name: 'Blade Champion ★', center:{x:8,y:8},   radius:1,   movementInches:6,  remainingMove:6,  toughness:6,  save:2, invuln:4,    fnp:null, oc:2, wounds:8,  maxWounds:8,  weapons:[GUARDIAN_SPEAR_R,GUARDIAN_SPEAR_M], ...base },
    { id: `${pid}-1`, datasheetId: 'custodian-guard',   name: 'Custodian Guard I',center:{x:21,y:7},  radius:3,   movementInches:6,  remainingMove:6,  toughness:6,  save:2, invuln:4,    fnp:null, oc:2, wounds:3,  maxWounds:3,  weapons:[GUARDIAN_SPEAR_R,GUARDIAN_SPEAR_M], ...base },
    { id: `${pid}-2`, datasheetId: 'custodian-guard',   name: 'Custodian Guard II',center:{x:37,y:7}, radius:3,   movementInches:6,  remainingMove:6,  toughness:6,  save:2, invuln:4,    fnp:null, oc:2, wounds:3,  maxWounds:3,  weapons:[GUARDIAN_SPEAR_R,GUARDIAN_SPEAR_M], ...base },
    { id: `${pid}-3`, datasheetId: 'allarus-custodians',name: 'Allarus Custodians',center:{x:50,y:8}, radius:2,   movementInches:5,  remainingMove:5,  toughness:7,  save:2, invuln:4,    fnp:null, oc:2, wounds:4,  maxWounds:4,  weapons:[BALISTUS_GRENADE,CASTELLAN_AXE],    ...base },
    { id: `${pid}-4`, datasheetId: 'caladius-grav-tank',name: 'Caladius',          center:{x:30,y:10},radius:2.5, movementInches:10, remainingMove:10, toughness:11, save:2, invuln:5,    fnp:null, oc:4, wounds:14, maxWounds:14, weapons:[ACCEL_CANNON],                     ...base },
  ];
}

function makeOpponent(pid: string): BlobUnit[] {
  const base = { playerId: pid, hasFired: false, hasCharged: false, hasFought: false, hasAdvanced: false, isInEngagement: false, movedThisPhase: false };
  return [
    { id: `${pid}-0`, datasheetId: 'chaos-lord',        name: 'Chaos Lord',       center:{x:8,y:36},  radius:1,   movementInches:6, remainingMove:6, toughness:5, save:2, invuln:null, fnp:null, oc:2, wounds:6,  maxWounds:6,  weapons:[DAEMON_SWORD],              ...base },
    { id: `${pid}-1`, datasheetId: 'chaos-warriors',    name: 'Warriors I',       center:{x:22,y:37}, radius:3.5, movementInches:6, remainingMove:6, toughness:4, save:3, invuln:null, fnp:null, oc:2, wounds:2,  maxWounds:2,  weapons:[COMBI_WEAPON,INFERNAL_AXE], ...base },
    { id: `${pid}-2`, datasheetId: 'chaos-warriors',    name: 'Warriors II',      center:{x:38,y:37}, radius:3.5, movementInches:6, remainingMove:6, toughness:4, save:3, invuln:null, fnp:null, oc:2, wounds:2,  maxWounds:2,  weapons:[COMBI_WEAPON,INFERNAL_AXE], ...base },
    { id: `${pid}-3`, datasheetId: 'chaos-terminators', name: 'Chaos Terminators',center:{x:52,y:36}, radius:2,   movementInches:5, remainingMove:5, toughness:5, save:2, invuln:null, fnp:null, oc:2, wounds:3,  maxWounds:3,  weapons:[COMBI_WEAPON,POWER_FIST],   ...base },
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

const SHOOT_COLOR  = 0xff6622;   // shoot-range ring
const ZONE_MOVE    = 0x44aaff;   // move zone colour
const ZONE_ADV     = 0xffaa22;   // advance zone colour
const ZONE_OVER    = 0xff3333;   // beyond max

/** Draw a dashed line between two screen points */
function drawDashedLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash = 8, gap = 5): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.001) return;
  const dx = (x2 - x1) / len; const dy = (y2 - y1) / len;
  let pos = 0; let drawing = true;
  while (pos < len - 0.001) {
    const segLen = Math.min(drawing ? dash : gap, len - pos);
    if (drawing) {
      g.moveTo(x1 + dx * pos, y1 + dy * pos)
       .lineTo(x1 + dx * (pos + segLen), y1 + dy * (pos + segLen));
    }
    pos += segLen; drawing = !drawing;
  }
  g.stroke();
}

function renderOverlay(g: Graphics, unit: BlobUnit | null, vp: Viewport, _mode: Mode, phase: string): void {
  if (!unit) return;
  const sc = boardToScreen(vp, unit.center);
  const sr = unit.radius * vp.scale;

  if (phase === 'MOVEMENT' && !unit.movedThisPhase) {
    const mr = (unit.remainingMove + unit.radius) * vp.scale;
    const ar = (unit.movementInches + 6 + unit.radius) * vp.scale;
    g.circle(sc.x, sc.y, mr).fill({ color: ZONE_MOVE, alpha: 0.06 });
    g.setStrokeStyle({ width: 2, color: ZONE_MOVE, alpha: 0.8 }); g.circle(sc.x, sc.y, mr).stroke();
    g.setStrokeStyle({ width: 1.5, color: ZONE_ADV, alpha: 0.45 }); g.circle(sc.x, sc.y, ar).stroke();
    // Zone label
    const zs = new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 10, fill: ZONE_ADV });
    const zt = new Text({ text: `${unit.remainingMove.toFixed(0)}" move / ${unit.movementInches + 6}" advance`, style: zs });
    zt.anchor.set(0.5, 1); zt.x = sc.x; zt.y = sc.y - ar - 4;
    g.addChild(zt);
  }

  // Shoot range ring (first ranged weapon)
  if (phase === 'SHOOTING' && !unit.hasFired) {
    const rangedWeapon = unit.weapons.find((w) => w.type === 'ranged');
    if (rangedWeapon && typeof rangedWeapon.range === 'number') {
      const rr = (rangedWeapon.range + unit.radius) * vp.scale;
      g.circle(sc.x, sc.y, rr).fill({ color: SHOOT_COLOR, alpha: 0.05 });
      g.setStrokeStyle({ width: 2, color: SHOOT_COLOR, alpha: 0.7 }); g.circle(sc.x, sc.y, rr).stroke();
      const rs = new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 11, fill: SHOOT_COLOR });
      const rt = new Text({ text: `${rangedWeapon.name} ${rangedWeapon.range}"`, style: rs });
      rt.anchor.set(0.5, 1); rt.x = sc.x; rt.y = sc.y - rr - 4;
      g.addChild(rt);
    }
  }

  void sr; // suppress unused warning

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

  function update(state: GameState, log: string, _selId: string | null, _mode: Mode): void {
    const p1 = state.players[0]; const p2 = state.players[1];
    const label = state.activePlayer === 'player1' ? '⚜ CUSTODES' : '☠ CHAOS';
    phText.text = `Turn ${state.turn}  ·  ${state.phase}  ·  ${label}`;
    lgText.text = log.slice(0, 100);
    vpText.text = `VP: ${p1?.victoryPoints ?? 0} — ${p2?.victoryPoints ?? 0}`;
    vpText.x = screenW / 2;

    bg.clear();
    bg.rect(0, 0, screenW, H).fill({ color: 0x080609, alpha: 0.97 });
    bg.setStrokeStyle({ width: 1, color: ACCENT, alpha: 0.3 }); bg.moveTo(0, H).lineTo(screenW, H).stroke();

    endBtn.x = screenW - 148;
  }

  return { container: c, height: H, update, endPhaseBtn: endBtn };
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
  let log = 'Drag a gold unit — drop in move ring or advance ring.';

  // Drag state — tracks an in-progress unit drag
  interface DragState { unitId: string; downScreen: Point; ghostBP: Point }
  let drag: DragState | null = null;

  // Render
  function render(): void {
    const state = engine.getState();
    const vp = makeViewport(app.screen.width, app.screen.height, hud.height);

    boardLayer.clear(); boardLayer.removeChildren(); renderBoard(boardLayer, vp);

    // Render units; during drag, show dragging unit at 30% opacity (origin position)
    unitLayer.clear(); unitLayer.removeChildren();
    if (drag) {
      const dimmed = state.units.map(u => u.id === drag!.unitId ? { ...u, movedThisPhase: true } : u);
      renderUnits(unitLayer, dimmed, vp, sel);
    } else {
      renderUnits(unitLayer, state.units, vp, sel);
    }

    overlayLayer.clear(); overlayLayer.removeChildren();
    const selUnit = sel ? (state.units.find(u => u.id === sel) ?? null) : null;
    // During drag, show rings around ORIGIN (where it came from), not ghost position
    const overlayUnit = drag ? (state.units.find(u => u.id === drag!.unitId) ?? null) : selUnit;
    renderOverlay(overlayLayer, overlayUnit, vp, mode, state.phase);

    // Drag: unit at cursor + ghost ring at origin + dashed ruler
    if (drag) {
      const draggingUnit = state.units.find(u => u.id === drag!.unitId);
      if (draggingUnit) {
        const originSC = boardToScreen(vp, draggingUnit.center);
        const ghostSC  = boardToScreen(vp, drag.ghostBP);
        const sr = draggingUnit.radius * vp.scale;

        // Determine zone
        const dist = Math.hypot(drag.ghostBP.x - draggingUnit.center.x, drag.ghostBP.y - draggingUnit.center.y);
        const moveMax = draggingUnit.remainingMove;
        const advMax  = draggingUnit.movementInches + 6;
        const inMove    = dist <= moveMax + 0.001;
        const inAdvance = !inMove && dist <= advMax + 0.001;
        const zoneColor = inMove ? ZONE_MOVE : inAdvance ? ZONE_ADV : ZONE_OVER;

        // Ghost ring at origin
        overlayLayer.setStrokeStyle({ width: 2, color: zoneColor, alpha: 0.5 });
        overlayLayer.circle(originSC.x, originSC.y, sr + 3).stroke();

        // Dashed ruler
        overlayLayer.setStrokeStyle({ width: 1.5, color: zoneColor, alpha: 0.9 });
        drawDashedLine(overlayLayer, originSC.x, originSC.y, ghostSC.x, ghostSC.y);

        // Unit at cursor (bright)
        overlayLayer.circle(ghostSC.x + 2, ghostSC.y + 2, sr).fill({ color: 0x000000, alpha: 0.18 });
        overlayLayer.circle(ghostSC.x, ghostSC.y, sr).fill({ color: P1_COLOR, alpha: 0.9 });
        overlayLayer.setStrokeStyle({ width: 3, color: zoneColor });
        overlayLayer.circle(ghostSC.x, ghostSC.y, sr + 4).stroke();

        // Distance label + zone hint
        const zone = inMove ? 'MOVE' : inAdvance ? 'ADVANCE ⚄' : `MAX ${advMax.toFixed(0)}"`;
        const labelColor = zoneColor;
        const ls = new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 13, fontWeight: 'bold', fill: labelColor });
        const lt = new Text({ text: `${dist.toFixed(1)}"  ${zone}`, style: ls });
        lt.anchor.set(0.5, 1); lt.x = ghostSC.x; lt.y = ghostSC.y - sr - 8;
        overlayLayer.addChild(lt);
      }
    }

    hud.update(state, log, sel, mode);
  }

  // ---------------------------------------------------------------------------
  // Shoot helper (shared between tap and shoot mode)
  // ---------------------------------------------------------------------------
  function doShoot(attackerId: string, targetId: string): void {
    const state = engine.getState();
    const attacker = state.units.find((u) => u.id === attackerId);
    const weaponIdx = attacker?.weapons.findIndex((w) => w.type === 'ranged') ?? -1;
    if (weaponIdx < 0) { log = '⚠ No ranged weapons on selected unit'; render(); return; }
    const res = engine.dispatch({ type: 'SHOOT', attackerId, targetId, weaponIndex: weaponIdx });
    if (res.success) {
      const tr = engine.getTranscript();
      const hits = tr.getByType('HIT_ROLL').filter((r) => r.success).length;
      const wounds = tr.getByType('WOUND_ROLL').filter((r) => r.success).length;
      const saves = tr.getByType('SAVE_ROLL').filter((r) => r.success).length;
      const dmg = tr.getByType('DAMAGE_APPLIED').reduce((s, d) => s + d.amount, 0);
      const target = state.units.find(u => u.id === targetId);
      const destroyed = !engine.getState().units.find(u => u.id === targetId);
      const suffix = destroyed ? ' 💀 DESTROYED' : ` → ${(target?.wounds ?? 0) - dmg}/${target?.maxWounds ?? 0}W`;
      log = `${attacker?.name ?? ''} ⟶ ${target?.name ?? ''}: ${hits}h ${wounds}w ${saves}sv ${dmg}dmg${suffix}`;
    } else { log = `⚠ ${res.error}`; }
    render();
  }

  // ---------------------------------------------------------------------------
  // Input — drag for movement, tap for selection/shooting
  // ---------------------------------------------------------------------------
  app.stage.interactive = true;
  app.stage.hitArea = app.screen;
  app.stage.eventMode = 'static';

  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    const state = engine.getState();
    const vp = makeViewport(app.screen.width, app.screen.height, hud.height);
    const bp = screenToBoard(vp, { x: e.global.x, y: e.global.y });
    if (bp.x < 0 || bp.x > BOARD_W || bp.y < 0 || bp.y > BOARD_H) return;

    const hit = hitUnit(state.units, bp);

    // Start drag if: MOVEMENT phase + hit a friendly unit that hasn't moved
    if (state.phase === 'MOVEMENT' && hit && hit.playerId === state.activePlayer && !hit.movedThisPhase) {
      sel = hit.id;
      drag = { unitId: hit.id, downScreen: { x: e.global.x, y: e.global.y }, ghostBP: { ...hit.center } };
      log = `Dragging ${hit.name} — drop in blue ring (move) or orange ring (advance 🎲)`;
      render();
    }
  });

  app.stage.on('pointermove', (e: FederatedPointerEvent) => {
    if (!drag) return;
    const vp = makeViewport(app.screen.width, app.screen.height, hud.height);
    const bp = screenToBoard(vp, { x: e.global.x, y: e.global.y });
    // Clamp to board
    drag.ghostBP = {
      x: Math.max(0, Math.min(BOARD_W, bp.x)),
      y: Math.max(0, Math.min(BOARD_H, bp.y)),
    };
    render();
  });

  app.stage.on('pointerup', (e: FederatedPointerEvent) => {
    const vp = makeViewport(app.screen.width, app.screen.height, hud.height);
    const upScreen = { x: e.global.x, y: e.global.y };
    const bp = screenToBoard(vp, upScreen);

    if (drag) {
      // Determine if this was a real drag (> 6px screen movement) or just a tap
      const screenDist = Math.hypot(upScreen.x - drag.downScreen.x, upScreen.y - drag.downScreen.y);
      const unitId = drag.unitId;
      drag = null;

      if (screenDist > 6) {
        // Auto-detect zone from drop distance
        const stateNow = engine.getState();
        const dragUnit = stateNow.units.find(u => u.id === unitId);
        const rawDest = { x: Math.max(0, Math.min(BOARD_W, bp.x)), y: Math.max(0, Math.min(BOARD_H, bp.y)) };

        if (dragUnit) {
          const dist = Math.hypot(rawDest.x - dragUnit.center.x, rawDest.y - dragUnit.center.y);
          const moveMax = dragUnit.remainingMove;
          const advMax  = dragUnit.movementInches + 6;

          if (dist <= moveMax + 0.001) {
            // MOVE zone
            const res = engine.dispatch({ type: 'MOVE_UNIT', unitId, destination: rawDest });
            if (res.success) {
              const moved = engine.getState().units.find(u => u.id === unitId);
              log = `${moved?.name ?? ''} moved → (${rawDest.x.toFixed(1)}", ${rawDest.y.toFixed(1)}")`;
            } else { log = `⚠ ${res.error}`; }
          } else {
            // ADVANCE zone (or clamped beyond max — engine clamps internally)
            const dest = dist <= advMax + 0.001
              ? rawDest
              : (() => {
                  const ratio = advMax / dist;
                  return {
                    x: dragUnit.center.x + (rawDest.x - dragUnit.center.x) * ratio,
                    y: dragUnit.center.y + (rawDest.y - dragUnit.center.y) * ratio,
                  };
                })();
            const res = engine.dispatch({ type: 'ADVANCE_UNIT', unitId, destination: dest });
            if (res.success) {
              // Read D6 result from transcript
              const tr = engine.getTranscript();
              const advRolls = tr.getByType('ROLL').filter((r: { rollType: string }) => r.rollType === 'ADVANCE');
              const advRoll = advRolls[advRolls.length - 1];
              const rollText = advRoll ? ` 🎲 +${advRoll.value}"` : '';
              const moved = engine.getState().units.find(u => u.id === unitId);
              const finalPos = moved?.center ?? dest;
              log = `${dragUnit.name} ADVANCED${rollText} → (${finalPos.x.toFixed(1)}", ${finalPos.y.toFixed(1)}")`;
            } else { log = `⚠ ${res.error}`; }
          }
        }
      }
      // (tap on friendly = already selected via pointerdown; no extra action needed)
      render();
      return;
    }

    // No drag in progress — handle as tap (selection / shooting)
    if (bp.x < 0 || bp.x > BOARD_W || bp.y < 0 || bp.y > BOARD_H) return;
    const state = engine.getState();
    const hit = hitUnit(state.units, bp);

    if (state.phase === 'SHOOTING') {
      if (hit) {
        if (hit.playerId === state.activePlayer) {
          sel = sel === hit.id ? null : hit.id;
          log = sel ? `Selected: ${hit.name}` : 'Deselected.';
        } else if (sel) {
          doShoot(sel, hit.id);
          return;
        } else {
          log = `${hit.name} — T${hit.toughness} SV${hit.save}+ W${hit.wounds}/${hit.maxWounds}`;
        }
      } else { sel = null; log = 'Select a Custodes unit, then click an enemy to shoot.'; }
    } else {
      // Other phases — tap = select
      if (hit && hit.playerId === state.activePlayer) {
        sel = sel === hit.id ? null : hit.id;
        log = sel ? `Selected: ${hit.name}` : 'Deselected.';
      } else if (hit) {
        log = `${hit.name} — T${hit.toughness} SV${hit.save}+ W${hit.wounds}/${hit.maxWounds}`;
      } else {
        sel = null; log = 'No unit here.';
      }
    }
    render();
  });

  function endPhase(): void {
    engine.dispatch({ type: 'END_PHASE' });
    sel = null; mode = 'select';
    const ph = engine.getState().phase;
    const tips: Record<string, string> = {
      MOVEMENT: 'Drag within move ring = normal move. Drag into advance ring = auto-rolls D6.',
      SHOOTING: 'Shooting phase! Click a Custodes unit, then click an enemy to shoot.',
      CHARGE: 'Charge phase. Press Enter to continue.',
      FIGHT: 'Fight phase (Phase 5). Press Enter to continue.',
      END: 'End phase. Press Enter to close the turn.',
      COMMAND: 'New turn! Check VPs. Select a unit to act.',
    };
    log = tips[ph] ?? `Phase: ${ph}`;
    render();
  }

  hud.endPhaseBtn.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); endPhase(); });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { sel = null; mode = 'select'; drag = null; log = 'Deselected.'; render(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endPhase(); }
  });

  app.renderer.on('resize', () => render());
  render();
}

init().catch(console.error);
