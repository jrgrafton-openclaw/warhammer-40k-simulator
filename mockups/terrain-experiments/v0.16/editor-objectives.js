/* ══════════════════════════════════════════════════════════════
   Editor Objectives — SVG hex markers + area rings inside the
   battlefield SVG so they participate in SVG z-order.
   Positions stored as percentages for persistence compatibility.
══════════════════════════════════════════════════════════════ */

Editor.Objectives = {
  // SVG viewBox dimensions (must match battlefield SVG)
  VB_W: 720,
  VB_H: 528,
  // Ring radius in SVG units (CSS was 12.5% of container width / 2)
  RING_R: 45,
  // Hex marker dimensions in SVG units (CSS was 5.7% width, 84:97 aspect)
  HEX_W: 42,
  HEX_H: 48.5,

  // Default 5-objective layout (% positions)
  defaultPositions: [
    { idx: 0, leftPct: 50, topPct: 13.64 },
    { idx: 1, leftPct: 16.67, topPct: 50 },
    { idx: 2, leftPct: 50, topPct: 50 },
    { idx: 3, leftPct: 83.33, topPct: 50 },
    { idx: 4, leftPct: 50, topPct: 86.36 }
  ],

  _pctToSvg(leftPct, topPct) {
    return { x: leftPct / 100 * this.VB_W, y: topPct / 100 * this.VB_H };
  },

  _svgToPct(x, y) {
    return { leftPct: x / this.VB_W * 100, topPct: y / this.VB_H * 100 };
  },

  init() {
    const C = Editor.Core;
    const layer = document.getElementById('objectiveLayer');
    layer.innerHTML = '';
    C.allObjectives = [];

    // Also clear the HTML objectives container if it exists (legacy)
    const htmlContainer = document.getElementById('objectives');
    if (htmlContainer) htmlContainer.innerHTML = '';

    this.defaultPositions.forEach((pos, i) => {
      this._addObjective(pos.idx, pos.leftPct, pos.topPct);
    });
  },

  _addObjective(idx, leftPct, topPct) {
    const C = Editor.Core;
    const layer = document.getElementById('objectiveLayer');
    const num = String(idx + 1).padStart(2, '0');
    const { x, y } = this._pctToSvg(leftPct, topPct);
    const ns = 'http://www.w3.org/2000/svg';

    // Group for this objective
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${x},${y})`);
    g.style.cursor = 'grab';

    // Area ring (dashed circle)
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('r', String(this.RING_R));
    ring.setAttribute('fill', 'rgba(8,16,8,.1)');
    ring.setAttribute('stroke', 'rgba(74,96,128,.5)');
    ring.setAttribute('stroke-width', '1.5');
    ring.setAttribute('stroke-dasharray', '6,4');
    g.appendChild(ring);

    // Hex marker as nested <svg> for its own viewBox
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

    g.appendChild(hexSvg);
    layer.appendChild(g);

    const obj = { idx, leftPct, topPct, groupEl: g, ringEl: ring };
    g.addEventListener('mousedown', e => this.startDrag(e, obj));
    C.allObjectives.push(obj);
    return obj;
  },

  _updatePosition(obj) {
    const { x, y } = this._pctToSvg(obj.leftPct, obj.topPct);
    obj.groupEl.setAttribute('transform', `translate(${x},${y})`);
  },

  startDrag(e, obj) {
    e.stopPropagation(); e.preventDefault();
    Editor.Undo.push();
    const C = Editor.Core;

    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      const pct = this._svgToPct(p.x, p.y);
      obj.leftPct = Math.max(0, Math.min(100, pct.leftPct));
      obj.topPct = Math.max(0, Math.min(100, pct.topPct));
      this._updatePosition(obj);
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      Editor.Persistence.save();
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  restorePositions(positions) {
    const C = Editor.Core;
    if (!positions || !C.allObjectives.length) return;
    positions.forEach(p => {
      const obj = C.allObjectives[p.idx];
      if (!obj) return;
      obj.leftPct = p.leftPct;
      obj.topPct = p.topPct;
      this._updatePosition(obj);
    });
  },

  serialize() {
    return Editor.Core.allObjectives.map(o => ({ idx: o.idx, leftPct: o.leftPct, topPct: o.topPct }));
  }
};
