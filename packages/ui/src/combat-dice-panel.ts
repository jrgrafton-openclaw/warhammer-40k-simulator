/**
 * CombatDicePanel — Delightful sequential dice animation
 * Shows hit → wound → save phases with tumbling pip dice in a sliding panel.
 *
 * State machine:
 *   SLIDE_IN (15f) → HIT_TUMBLE (25f) → HIT_SETTLE (15f) → HIT_HOLD (20f)
 *   → WOUND_TUMBLE (25f) → WOUND_SETTLE (15f) → WOUND_HOLD (20f)
 *   → SAVE_TUMBLE (25f) → SAVE_SETTLE (15f)
 *   → RESULT_HOLD (∞, click or 3s) → SLIDE_OUT (15f)
 */
import { Application, Container, Graphics, Text, TextStyle, Rectangle } from 'pixi.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CombatRollData {
  attackerName: string;
  targetName: string;
  weaponName: string;
  weaponStats: string; // e.g. "A3 · WS2+ · S7 · AP−2 · D2"
  hitRolls: Array<{ value: number; needed: number; success: boolean }>;
  woundRolls: Array<{ value: number; needed: number; success: boolean }>;
  saveRolls: Array<{ value: number; needed: number; success: boolean; isInvuln: boolean }>;
  totalDamage: number;
  targetDestroyed: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]],
};

const DIE_SIZE = 48;
const DIE_GAP = 8;
const ACCENT = 0xc7a84a;
const PAD = 16;
const LABEL_W = 200; // left column (row labels)
const ROW_H = 70;    // height of each dice row
const TITLE_H = 28;
const WEAPON_H = 22;
const DIV_H = 10;    // divider gap
const DAMAGE_H = 46;
const HUD_H = 55;    // approximate HUD height to keep panel above it

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

type PanelState =
  | 'SLIDE_IN'
  | 'HIT_TUMBLE' | 'HIT_SETTLE' | 'HIT_HOLD'
  | 'WOUND_TUMBLE' | 'WOUND_SETTLE' | 'WOUND_HOLD'
  | 'SAVE_TUMBLE' | 'SAVE_SETTLE'
  | 'RESULT_HOLD'
  | 'SLIDE_OUT';

// ---------------------------------------------------------------------------
// Die state
// ---------------------------------------------------------------------------

interface DieState {
  currentFace: number;
  targetFace: number;
  settled: boolean;
  scale: number;
  rollData: { value: number; needed: number; success: boolean };
  gfx: Graphics;  // one Graphics per die, positioned in its parent container
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Clear and redraw a single die Graphics in local space (0,0) to (DIE_SIZE,DIE_SIZE). */
function drawDie(die: DieState): void {
  const g = die.gfx;
  g.clear();

  const size = Math.round(DIE_SIZE * die.scale);
  const offset = (DIE_SIZE - size) / 2; // centre the scaled die
  const radius = Math.max(2, 6 * die.scale);

  let fillColor: number;
  let strokeColor: number;

  if (!die.settled) {
    fillColor  = 0x222222;
    strokeColor = 0x666666;
  } else if (die.rollData.success) {
    fillColor  = 0x1a3a1a;
    strokeColor = 0x44ff44;
  } else {
    fillColor  = 0x3a1a1a;
    strokeColor = 0xaa2222;
  }

  g.roundRect(offset, offset, size, size, radius).fill({ color: fillColor });
  g.setStrokeStyle({ width: 2, color: strokeColor });
  g.roundRect(offset, offset, size, size, radius).stroke();

  const pips = PIPS[die.currentFace] ?? [];
  const pipR = Math.max(2, size * 0.075);
  for (const [fx, fy] of pips) {
    g.circle(offset + fx * size, offset + fy * size, pipR).fill({ color: 0xffffff });
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function randFace(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function showCombatPanel(
  app: Application,
  layer: Container,
  data: CombatRollData,
  onDismiss?: () => void,
): void {
  const sw = app.screen.width;
  const sh = app.screen.height;

  const PW = Math.min(640, sw - 40);
  const PH =
    PAD + TITLE_H + WEAPON_H + DIV_H +
    ROW_H + DIV_H +
    ROW_H + DIV_H +
    ROW_H + DIV_H +
    DAMAGE_H + PAD;

  const panelX      = (sw - PW) / 2;
  const panelYFinal = sh - HUD_H - PH - 12;
  const panelYStart = sh + 10; // off-screen below

  // ---- Container hierarchy ----
  const panelContainer = new Container();
  panelContainer.x = panelX;
  panelContainer.y = panelYStart;
  layer.addChild(panelContainer);

  // Background (drawn once)
  const bgGfx = new Graphics();
  bgGfx.roundRect(0, 0, PW, PH, 10).fill({ color: 0x0a0806, alpha: 0.96 });
  bgGfx.setStrokeStyle({ width: 2, color: ACCENT, alpha: 0.8 });
  bgGfx.roundRect(0, 0, PW, PH, 10).stroke();
  panelContainer.addChild(bgGfx);

  // Row dividers
  const divY0 = PAD + TITLE_H + WEAPON_H + DIV_H / 2;
  for (let i = 0; i < 4; i++) {
    const dy = divY0 + i * (ROW_H + DIV_H);
    bgGfx.setStrokeStyle({ width: 1, color: 0x3a2c10, alpha: 0.65 });
    bgGfx.moveTo(PAD, dy).lineTo(PW - PAD, dy).stroke();
  }

  // ---- Texts ----
  const titleTxt = new Text({
    text: `⚔  ${data.attackerName} → ${data.targetName}`,
    style: new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 14, fontWeight: 'bold', fill: ACCENT, letterSpacing: 2 }),
  });
  titleTxt.x = PAD; titleTxt.y = PAD + 2;
  panelContainer.addChild(titleTxt);

  const weaponTxt = new Text({
    text: `   ${data.weaponName}  ·  ${data.weaponStats}`,
    style: new TextStyle({ fontFamily: '"Courier New",monospace', fontSize: 11, fill: 0xccbb88 }),
  });
  weaponTxt.x = PAD; weaponTxt.y = PAD + TITLE_H + 2;
  panelContainer.addChild(weaponTxt);

  // Row Y positions (relative to panelContainer)
  const rowsTopY = PAD + TITLE_H + WEAPON_H + DIV_H;
  const hitRowY   = rowsTopY;
  const woundRowY = rowsTopY + ROW_H + DIV_H;
  const saveRowY  = rowsTopY + 2 * (ROW_H + DIV_H);
  const dmgRowY   = rowsTopY + 3 * (ROW_H + DIV_H);

  const diceX    = PAD + LABEL_W; // x where dice columns start
  const diePadY  = Math.floor((ROW_H - DIE_SIZE) / 2);
  const labelPadY = Math.floor((ROW_H - 16) / 2);

  // Helper for row labels
  function makeRowLabel(txt: string, rowY: number): Text {
    const t = new Text({
      text: txt,
      style: new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 12, fill: 0xe8d5a0 }),
    });
    t.x = PAD; t.y = rowY + labelPadY;
    panelContainer.addChild(t);
    return t;
  }

  // Helper for result text (initially hidden)
  function makeResultTxt(rowY: number): Text {
    const t = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 13, fontWeight: 'bold', fill: 0x88ff88 }),
    });
    t.x = diceX; t.y = rowY + Math.floor((ROW_H - 18) / 2);
    t.visible = false;
    panelContainer.addChild(t);
    return t;
  }

  const hitLabel   = makeRowLabel(`HIT ROLLS (WS ${data.hitRolls[0]?.needed ?? '?'}+)`, hitRowY);
  void hitLabel;
  const woundLabel = makeRowLabel(
    `WOUND ROLLS (→ ${data.woundRolls[0]?.needed ?? '?'}+)`,
    woundRowY,
  );
  void woundLabel;
  const saveLabel  = makeRowLabel(
    `SAVE ROLLS (→ ${data.saveRolls[0]?.needed ?? '?'}+${data.saveRolls[0]?.isInvuln ? ' inv' : ''})`,
    saveRowY,
  );
  void saveLabel;

  const hitResultTxt   = makeResultTxt(hitRowY);
  const woundResultTxt = makeResultTxt(woundRowY);
  const saveResultTxt  = makeResultTxt(saveRowY);

  const dmgTxt = new Text({
    text: '',
    style: new TextStyle({ fontFamily: 'Georgia,serif', fontSize: 15, fontWeight: 'bold', fill: 0xffffff }),
  });
  dmgTxt.x = PAD; dmgTxt.y = dmgRowY + Math.floor((DAMAGE_H - 20) / 2);
  dmgTxt.visible = false;
  panelContainer.addChild(dmgTxt);

  // ---- Dice containers ----
  function makeDiceCont(rowY: number, visible: boolean): Container {
    const c = new Container();
    c.x = diceX; c.y = rowY + diePadY;
    c.visible = visible;
    panelContainer.addChild(c);
    return c;
  }

  const hitDiceCont   = makeDiceCont(hitRowY, true);
  const woundDiceCont = makeDiceCont(woundRowY, false);
  const saveDiceCont  = makeDiceCont(saveRowY, false);

  // ---- Die state objects ----
  function createDies(
    cont: Container,
    rolls: Array<{ value: number; needed: number; success: boolean }>,
  ): DieState[] {
    return rolls.map((roll, i) => {
      const gfx = new Graphics();
      gfx.x = i * (DIE_SIZE + DIE_GAP);
      gfx.y = 0;
      cont.addChild(gfx);
      const die: DieState = {
        currentFace: randFace(),
        targetFace: roll.value,
        settled: false,
        scale: 1.0,
        rollData: roll,
        gfx,
      };
      drawDie(die);
      return die;
    });
  }

  const hitDies   = createDies(hitDiceCont, data.hitRolls);
  const woundDies = createDies(woundDiceCont, data.woundRolls);
  const saveDies  = createDies(saveDiceCont, data.saveRolls);

  // ---- Animation helpers ----

  function tumble(dies: DieState[], f: number): void {
    if (f % 2 === 0) {
      for (const d of dies) { if (!d.settled) d.currentFace = randFace(); }
    }
    for (const d of dies) drawDie(d);
  }

  function settle(dies: DieState[], f: number): void {
    for (let i = 0; i < dies.length; i++) {
      const d = dies[i]!;
      const settleAt = i * 3;
      if (f >= settleAt) {
        d.settled      = true;
        d.currentFace  = d.targetFace;
        const bf = f - settleAt;
        d.scale = bf < 5 ? 1.0 + 0.15 * Math.sin(Math.PI * bf / 4) : 1.0;
      }
    }
    for (const d of dies) drawDie(d);
  }

  function showResult(
    txt: Text,
    dies: DieState[],
    type: 'hit' | 'wound' | 'save',
  ): void {
    const succ = dies.filter(d => d.rollData.success).length;
    const fail = dies.filter(d => !d.rollData.success).length;

    let label: string;
    let color: number;

    if (type === 'hit') {
      label = `→ ${succ} hit${succ !== 1 ? 's' : ''}`;
      color = succ > 0 ? 0x88ff88 : 0xff6666;
    } else if (type === 'wound') {
      label = `→ ${succ} wound${succ !== 1 ? 's' : ''}`;
      color = succ > 0 ? 0x88ff88 : 0xff6666;
    } else {
      label = `→ ${fail} unsaved`;
      color = fail > 0 ? 0xff6666 : 0x88ff88;
    }

    txt.style = new TextStyle({
      fontFamily: 'Georgia,serif',
      fontSize: 13,
      fontWeight: 'bold',
      fill: color,
    });
    txt.text   = label;
    txt.x      = diceX + dies.length * (DIE_SIZE + DIE_GAP) + 8;
    txt.visible = true;
  }

  function showDamage(): void {
    const core = data.targetDestroyed
      ? `💀 ${data.targetName} DESTROYED!`
      : `💀 DAMAGE: ${data.totalDamage}W`;
    dmgTxt.text    = core + '   click to dismiss';
    dmgTxt.visible = true;
  }

  // ---- Dismiss ----
  let dismissed = false;

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    panelState = 'SLIDE_OUT';  // eslint-disable-line @typescript-eslint/no-use-before-define
    stateFrame = 0;             // eslint-disable-line @typescript-eslint/no-use-before-define
    panelContainer.interactive = false;
    panelContainer.hitArea     = null;
  }

  function enableDismissClick(): void {
    panelContainer.interactive = true;
    panelContainer.cursor      = 'pointer';
    panelContainer.hitArea     = new Rectangle(0, 0, PW, PH);
    panelContainer.on('pointertap', () => dismiss());
  }

  function transitionToResult(): void {
    showDamage();
    if (saveDies.length > 0) showResult(saveResultTxt, saveDies, 'save');
    nextState('RESULT_HOLD');  // eslint-disable-line @typescript-eslint/no-use-before-define
    enableDismissClick();
  }

  // ---- State machine ----
  let panelState: PanelState = 'SLIDE_IN';
  let stateFrame   = 0;
  let resultTimer  = 0;
  const RESULT_TIMEOUT = 180; // 3 s @ 60 fps

  function nextState(s: PanelState): void {
    panelState = s;
    stateFrame = 0;
  }

  // ---- Ticker ----
  const tick = (): void => {
    stateFrame++;

    switch (panelState) {
      // ------------------------------------------------------------------
      case 'SLIDE_IN': {
        const t = Math.min(1, stateFrame / 15);
        panelContainer.y = panelYStart + (panelYFinal - panelYStart) * easeOutCubic(t);
        if (stateFrame >= 15) {
          panelContainer.y = panelYFinal;
          nextState('HIT_TUMBLE');
        }
        break;
      }

      // ------------------------------------------------------------------
      case 'HIT_TUMBLE':
        if (hitDies.length === 0) { nextState('HIT_SETTLE'); break; }
        tumble(hitDies, stateFrame);
        if (stateFrame >= 25) nextState('HIT_SETTLE');
        break;

      case 'HIT_SETTLE':
        if (hitDies.length === 0) { nextState('HIT_HOLD'); break; }
        settle(hitDies, stateFrame);
        if (stateFrame >= 15) nextState('HIT_HOLD');
        break;

      case 'HIT_HOLD':
        if (stateFrame === 1) showResult(hitResultTxt, hitDies, 'hit');
        if (stateFrame >= 20) {
          if (woundDies.length > 0) {
            woundDiceCont.visible = true;
            for (const d of woundDies) drawDie(d);
            nextState('WOUND_TUMBLE');
          } else {
            // No wounds — jump to result
            if (saveDies.length > 0) {
              saveDiceCont.visible = true;
              for (const d of saveDies) drawDie(d);
              nextState('SAVE_TUMBLE');
            } else {
              transitionToResult();
            }
          }
        }
        break;

      // ------------------------------------------------------------------
      case 'WOUND_TUMBLE':
        if (woundDies.length === 0) { nextState('WOUND_SETTLE'); break; }
        tumble(woundDies, stateFrame);
        if (stateFrame >= 25) nextState('WOUND_SETTLE');
        break;

      case 'WOUND_SETTLE':
        if (woundDies.length === 0) { nextState('WOUND_HOLD'); break; }
        settle(woundDies, stateFrame);
        if (stateFrame >= 15) nextState('WOUND_HOLD');
        break;

      case 'WOUND_HOLD':
        if (stateFrame === 1) showResult(woundResultTxt, woundDies, 'wound');
        if (stateFrame >= 20) {
          if (saveDies.length > 0) {
            saveDiceCont.visible = true;
            for (const d of saveDies) drawDie(d);
            nextState('SAVE_TUMBLE');
          } else {
            transitionToResult();
          }
        }
        break;

      // ------------------------------------------------------------------
      case 'SAVE_TUMBLE':
        if (saveDies.length === 0) { nextState('SAVE_SETTLE'); break; }
        tumble(saveDies, stateFrame);
        if (stateFrame >= 25) nextState('SAVE_SETTLE');
        break;

      case 'SAVE_SETTLE':
        if (saveDies.length === 0) { transitionToResult(); break; }
        settle(saveDies, stateFrame);
        if (stateFrame >= 15) transitionToResult();
        break;

      // ------------------------------------------------------------------
      case 'RESULT_HOLD':
        resultTimer++;
        if (resultTimer >= RESULT_TIMEOUT) dismiss();
        break;

      // ------------------------------------------------------------------
      case 'SLIDE_OUT': {
        const t = Math.min(1, stateFrame / 15);
        // ease-in: quadratic
        panelContainer.y = panelYFinal + (panelYStart - panelYFinal) * (t * t);
        if (stateFrame >= 15) {
          app.ticker.remove(tick);
          if (panelContainer.parent) {
            panelContainer.parent.removeChild(panelContainer);
          }
          onDismiss?.();
        }
        break;
      }
    }
  };

  app.ticker.add(tick);
}
