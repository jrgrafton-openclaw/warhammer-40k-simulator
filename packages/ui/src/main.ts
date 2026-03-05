/**
 * WH40K Simulator — Phase 2 UI Placeholder
 * PixiJS renders a dark battlefield board with status overlay.
 */
import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';

const BOARD_COLOR = 0x1a1208;
const GRID_COLOR = 0x2a1f0a;
const ACCENT_COLOR = 0xc7a84a;  // Grimdark gold
const TEXT_COLOR = 0xe8d5a0;

async function init(): Promise<void> {
  const app = new Application();

  await app.init({
    resizeTo: window,
    backgroundColor: 0x0a0a0a,
    antialias: true,
    resolution: window.devicePixelRatio ?? 1,
    autoDensity: true,
  });

  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('No #app element');
  appEl.appendChild(app.canvas);

  // Build the scene
  const scene = new Container();
  app.stage.addChild(scene);

  // Board background
  const board = new Graphics();
  drawBoard(board, app.screen.width, app.screen.height);
  scene.addChild(board);

  // Header overlay
  const header = buildHeader();
  scene.addChild(header);

  // Center info card
  const card = buildInfoCard();
  card.x = app.screen.width / 2 - 320;
  card.y = app.screen.height / 2 - 160;
  scene.addChild(card);

  // Resize handler
  app.renderer.on('resize', (width: number, height: number) => {
    board.clear();
    drawBoard(board, width, height);
    card.x = width / 2 - 320;
    card.y = height / 2 - 160;
  });
}

function drawBoard(g: Graphics, w: number, h: number): void {
  // Battlefield surface
  g.rect(0, 0, w, h).fill(BOARD_COLOR);

  // Grid lines (every 60px ≈ 1 board inch at 1080p)
  const gridSpacing = 60;
  g.setStrokeStyle({ width: 1, color: GRID_COLOR, alpha: 0.6 });

  for (let x = 0; x < w; x += gridSpacing) {
    g.moveTo(x, 0).lineTo(x, h);
  }
  for (let y = 0; y < h; y += gridSpacing) {
    g.moveTo(0, y).lineTo(w, y);
  }
  g.stroke();

  // Board border
  g.setStrokeStyle({ width: 3, color: ACCENT_COLOR, alpha: 0.8 });
  const margin = 40;
  g.rect(margin, margin, w - margin * 2, h - margin * 2).stroke();

  // Corner skulls (decorative circles)
  const cornerSize = 8;
  for (const [cx, cy] of [
    [margin, margin], [w - margin, margin],
    [margin, h - margin], [w - margin, h - margin],
  ] as [number, number][]) {
    g.circle(cx, cy, cornerSize).fill(ACCENT_COLOR);
  }
}

function buildHeader(): Container {
  const c = new Container();

  const titleStyle = new TextStyle({
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 22,
    fontWeight: 'bold',
    fill: ACCENT_COLOR,
    letterSpacing: 4,
  });

  const title = new Text({ text: 'WARHAMMER 40,000 · 10TH EDITION SIMULATOR', style: titleStyle });
  title.x = 60;
  title.y = 12;
  c.addChild(title);

  return c;
}

function buildInfoCard(): Container {
  const c = new Container();

  // Card background
  const bg = new Graphics();
  bg.roundRect(0, 0, 640, 320, 8)
    .fill({ color: 0x0e0c08, alpha: 0.92 });
  bg.setStrokeStyle({ width: 2, color: ACCENT_COLOR, alpha: 0.7 });
  bg.roundRect(0, 0, 640, 320, 8).stroke();
  c.addChild(bg);

  const headStyle = new TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize: 28,
    fontWeight: 'bold',
    fill: ACCENT_COLOR,
    letterSpacing: 2,
  });

  const bodyStyle = new TextStyle({
    fontFamily: '"Courier New", monospace',
    fontSize: 14,
    fill: TEXT_COLOR,
    lineHeight: 24,
  });

  const dimStyle = new TextStyle({
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    fill: 0x666655,
    lineHeight: 20,
  });

  const heading = new Text({ text: 'Phase 2 — Content + Importer ✓', style: headStyle });
  heading.x = 32;
  heading.y = 24;
  c.addChild(heading);

  const phases = [
    '✅  Phase 0  Repo + CI + GitHub Pages',
    '✅  Phase 1  Deterministic Engine Skeleton',
    '✅  Phase 2  Content Schema + BattleScribe Importer',
    '⏳  Phase 3  Movement (Blob Units)',
    '⏳  Phase 4  Shooting Pipeline',
    '⏳  Phase 5  Charge + Fight',
    '⏳  Phase 6  Objectives + Scoring',
    '⏳  Phase 7  Terrain + LoS',
    '⏳  Phase 8  AI v1 + Coaching',
    '⏳  Phase 9  Scenario/Training Mode',
  ].join('\n');

  const phaseList = new Text({ text: phases, style: bodyStyle });
  phaseList.x = 32;
  phaseList.y = 72;
  c.addChild(phaseList);

  const footer = new Text({
    text: 'Content: Zod schemas · DiceExpr parser · BattleScribe roster importer (103 tests)',
    style: dimStyle,
  });
  footer.x = 32;
  footer.y = 288;
  c.addChild(footer);

  return c;
}

init().catch(console.error);
