/* ══════════════════════════════════════════════════════════════
   Editor Objectives — SVG hex markers + area rings in separate layers.
   Rings in #objectiveRings, hexes in #objectiveHexes for independent z-ordering.
══════════════════════════════════════════════════════════════ */

Editor.Objectives = {
  VB_W: 720,
  VB_H: 528,
  RING_R: 45,
  HEX_W: 42,
  HEX_H: 48.5,

  positions: [
    { idx: 0, leftPct: 50,    topPct: 13.64 },
    { idx: 1, leftPct: 16.67, topPct: 50 },
    { idx: 2, leftPct: 50,    topPct: 50 },
    { idx: 3, leftPct: 83.33, topPct: 50 },
    { idx: 4, leftPct: 50,    topPct: 86.36 }
  ],

  _pctToSvg(leftPct, topPct) {
    return { x: leftPct / 100 * this.VB_W, y: topPct / 100 * this.VB_H };
  },

  init() {
    const C = Editor.Core;
    document.getElementById('objectiveRings').innerHTML = '';
    document.getElementById('objectiveHexes').innerHTML = '';
    C.allObjectives = [];

    const htmlContainer = document.getElementById('objectives');
    if (htmlContainer) htmlContainer.innerHTML = '';

    this.positions.forEach(pos => {
      this._addObjective(pos.idx, pos.leftPct, pos.topPct);
    });
  },

  _addObjective(idx, leftPct, topPct) {
    const C = Editor.Core;
    const ringsLayer = document.getElementById('objectiveRings');
    const hexesLayer = document.getElementById('objectiveHexes');
    const num = String(idx + 1).padStart(2, '0');
    const { x, y } = this._pctToSvg(leftPct, topPct);
    const ns = 'http://www.w3.org/2000/svg';

    // Ring in its own layer
    const ringG = document.createElementNS(ns, 'g');
    ringG.setAttribute('transform', `translate(${x},${y})`);
    ringG.style.pointerEvents = 'none';

    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('r', String(this.RING_R));
    ring.setAttribute('fill', 'rgba(8,16,8,.1)');
    ring.setAttribute('stroke', 'rgba(74,96,128,.5)');
    ring.setAttribute('stroke-width', '1.5');
    ring.setAttribute('stroke-dasharray', '4,3');
    ringG.appendChild(ring);
    ringsLayer.appendChild(ringG);

    // Hex marker in its own layer
    const hexG = document.createElementNS(ns, 'g');
    hexG.setAttribute('transform', `translate(${x},${y})`);
    hexG.style.pointerEvents = 'none';

    const hexSvg = document.createElementNS(ns, 'svg');
    hexSvg.setAttribute('viewBox', '0 0 84 97');
    hexSvg.setAttribute('width', String(this.HEX_W));
    hexSvg.setAttribute('height', String(this.HEX_H));
    hexSvg.setAttribute('x', String(-this.HEX_W / 2));
    hexSvg.setAttribute('y', String(-this.HEX_H / 2));
    hexSvg.setAttribute('overflow', 'visible');

    const points = '42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5';

    const bg = document.createElementNS(ns, 'polygon');
    bg.setAttribute('points', points);
    bg.setAttribute('fill', 'rgba(8,12,16,.92)');
    hexSvg.appendChild(bg);

    const border = document.createElementNS(ns, 'polygon');
    border.setAttribute('points', points);
    border.setAttribute('fill', 'none');
    border.setAttribute('stroke', 'rgba(74,96,128,.55)');
    border.setAttribute('stroke-width', '1.5');
    hexSvg.appendChild(border);

    const numText = document.createElementNS(ns, 'text');
    numText.setAttribute('x', '42');
    numText.setAttribute('y', '44');
    numText.setAttribute('text-anchor', 'middle');
    numText.setAttribute('dominant-baseline', 'central');
    numText.setAttribute('font-family', "'Anton', sans-serif");
    numText.setAttribute('font-size', '22');
    numText.setAttribute('fill', 'var(--text-sec, #8090a0)');
    numText.textContent = num;
    hexSvg.appendChild(numText);

    const lblText = document.createElementNS(ns, 'text');
    lblText.setAttribute('x', '42');
    lblText.setAttribute('y', '62');
    lblText.setAttribute('text-anchor', 'middle');
    lblText.setAttribute('dominant-baseline', 'central');
    lblText.setAttribute('font-family', "'Rajdhani', sans-serif");
    lblText.setAttribute('font-size', '7');
    lblText.setAttribute('font-weight', '700');
    lblText.setAttribute('letter-spacing', '2.5');
    lblText.setAttribute('fill', 'var(--text-dis, #405060)');
    lblText.textContent = 'OBJ';
    hexSvg.appendChild(lblText);

    hexG.appendChild(hexSvg);
    hexesLayer.appendChild(hexG);

    const obj = { idx, leftPct, topPct, ringEl: ringG, hexEl: hexG };
    C.allObjectives.push(obj);
    return obj;
  },

  restorePositions() {},

  serialize() {
    return Editor.Core.allObjectives.map(o => ({ idx: o.idx, leftPct: o.leftPct, topPct: o.topPct }));
  }
};
