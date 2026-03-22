/* ══════════════════════════════════════════════════════════════
   Editor Models — model token rendering + always-draggable
   No Edit Models toggle — models are always interactive.
══════════════════════════════════════════════════════════════ */

Editor.Models = {
  mid: 0,
  selectedModel: null,

  init() {
    // Default model positions (v0.5a layout)
    // Imperium
    [[100,64],[117,64],[134,64],[108,81],[125,81]].forEach(([x,y]) => this.addCircle(x,y,8,'#0088aa','url(#mf-imp)','cross'));
    this.addCircle(120,160,9,'#0088aa','url(#mf-imp)','star');
    [[80,300],[97,300],[114,300],[88,317],[105,317]].forEach(([x,y]) => this.addCircle(x,y,8,'#0088aa','url(#mf-imp)','cross'));
    [[150,400],[167,400],[184,400],[158,417],[175,417]].forEach(([x,y]) => this.addCircle(x,y,8,'#0088aa','url(#mf-imp)','diamond'));
    this.addRect(38.5,467.5,43,25,'#0088aa','url(#mf-imp)');
    // Orks
    this.addCircle(560,100,9,'#aa2810','url(#mf-ork)','star');
    [[500,200],[517,200],[534,200],[551,200],[568,200],[500,217],[517,217],[534,217],[551,217],[568,217]].forEach(([x,y]) => this.addCircle(x,y,8,'#aa2810','url(#mf-ork)','cross'));
    this.addCircle(560,350,8,'#aa2810','url(#mf-ork)','diamond');
  },

  mkIcon(x, y, type) {
    if (type === 'cross') return `<line x1="${x}" y1="${y-3.06}" x2="${x}" y2="${y+3.06}" stroke="currentColor" stroke-width="1.224" stroke-linecap="round"/><line x1="${x-3.06}" y1="${y}" x2="${x+3.06}" y2="${y}" stroke="currentColor" stroke-width="1.224" stroke-linecap="round"/>`;
    if (type === 'star') { let p = ''; for (let i = 0; i < 10; i++) { const a = Math.PI/2 + i*Math.PI/5, r = i%2 ? 1.6 : 3.52; p += `${(x+r*Math.cos(a)).toFixed(2)},${(y-r*Math.sin(a)).toFixed(2)} `; } return `<polygon points="${p.trim()}" stroke="currentColor" stroke-width="0.765" fill="none"/>`; }
    if (type === 'diamond') return `<polygon points="${x},${y-3.196} ${x+2.5568},${y} ${x},${y+3.196} ${x-2.5568},${y}" stroke="currentColor" stroke-width="1.02" fill="none"/>`;
    return '';
  },

  applyModel(m) {
    if (m.kind === 'circle') {
      m.base.setAttribute('cx', m.x); m.base.setAttribute('cy', m.y);
      m.icon.setAttribute('color', m.s === '#0088aa' ? '#006688' : '#882010');
      m.icon.innerHTML = this.mkIcon(m.x, m.y, m.iconType);
    } else {
      m.base.setAttribute('x', m.x); m.base.setAttribute('y', m.y);
      m.icon.innerHTML = `<rect x="${m.x+m.w/2-6}" y="${m.y+m.h/2-4}" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.9" fill="none"/><line x1="${m.x+m.w/2-6}" y1="${m.y+m.h/2}" x2="${m.x+m.w/2+6}" y2="${m.y+m.h/2}" stroke="currentColor" stroke-width="1.2"/>`;
    }
    // Update model shadow position if it exists
    if (m.shadowEl && Editor.Effects.modelShadow) {
      const ms = Editor.Effects.modelShadow;
      if (m.kind === 'circle') {
        m.shadowEl.setAttribute('cx', m.x + ms.dx);
        m.shadowEl.setAttribute('cy', m.y + ms.dy);
      } else {
        m.shadowEl.setAttribute('x', m.x + ms.dx);
        m.shadowEl.setAttribute('y', m.y + ms.dy);
      }
    }
  },

  addCircle(cx, cy, r, s, f, iconType, restoreId) {
    const C = Editor.Core, NS = C.NS;
    const g = document.createElementNS(NS, 'g'); g.style.cursor = 'grab';
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', r); c.setAttribute('fill', 'url(#mg-fill)'); c.setAttribute('stroke', s);
    c.setAttribute('stroke-width', '1.5'); c.setAttribute('filter', f); g.appendChild(c);
    const ig = document.createElementNS(NS, 'g'); ig.setAttribute('fill', 'none'); g.appendChild(ig);
    document.getElementById('modelLayer').appendChild(g);
    const id = restoreId || ('m' + (this.mid++));
    const m = { id, kind:'circle', x:cx, y:cy, r, s, f, iconType, el:g, base:c, icon:ig };
    C.allModels.push(m);
    this.applyModel(m);
    g.onmousedown = e => this.startMove(e, m);
    return m;
  },

  addRect(x, y, w, h, s, f, restoreId) {
    const C = Editor.Core, NS = C.NS;
    const g = document.createElementNS(NS, 'g'); g.style.cursor = 'grab';
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('rx', '4');
    r.setAttribute('fill', 'url(#mg-fill)'); r.setAttribute('stroke', s);
    r.setAttribute('stroke-width', '1.5'); r.setAttribute('filter', f); g.appendChild(r);
    const ig = document.createElementNS(NS, 'g'); ig.setAttribute('color', '#006688'); ig.setAttribute('fill', 'none'); g.appendChild(ig);
    document.getElementById('modelLayer').appendChild(g);
    const id = restoreId || ('m' + (this.mid++));
    const m = { id, kind:'rect', x, y, w, h, s, f, el:g, base:r, icon:ig };
    C.allModels.push(m);
    this.applyModel(m);
    g.onmousedown = e => this.startMove(e, m);
    return m;
  },

  selectModel(m) {
    this.deselectModel();
    this.selectedModel = m;
    m.el.style.filter = 'drop-shadow(0 0 4px #00d4ff)';
    Editor.Selection.deselect();
    Editor.Lights.deselectLight();
    Editor.Layers.rebuild();
  },

  deselectModel() {
    if (this.selectedModel) {
      this.selectedModel.el.style.filter = '';
      // Restore original filter
      const f = this.selectedModel.f;
      if (f) this.selectedModel.base.setAttribute('filter', f);
      this.selectedModel = null;
    }
  },

  removeModel(id) {
    const C = Editor.Core;
    const idx = C.allModels.findIndex(m => m.id === id);
    if (idx === -1) return;
    const m = C.allModels[idx];
    const data = Editor.Commands._captureModel(m);
    const cmd = Editor.Commands.DeleteModel.create(data);
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.State.dispatch({ type: 'SET_PROPERTY' });
    Editor.Layers.rebuild();
  },

  startMove(e, m) {
    e.stopPropagation(); e.preventDefault();
    this.selectModel(m);
    const C = Editor.Core;
    const fromX = m.x, fromY = m.y;
    const p0 = C.svgPt(e.clientX, e.clientY), ox = p0.x - m.x, oy = p0.y - m.y;
    const mv = e2 => { const p = C.svgPt(e2.clientX, e2.clientY); m.x = p.x - ox; m.y = p.y - oy; this.applyModel(m); };
    const up = () => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      if (m.x !== fromX || m.y !== fromY) {
        Editor.Undo.record(Editor.Commands.MoveModel.create(m.id, fromX, fromY, m.x, m.y));
      }
      Editor.State.dispatch({ type: 'SET_PROPERTY' });
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
};
