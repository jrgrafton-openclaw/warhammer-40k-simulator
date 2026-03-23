/* ══════════════════════════════════════════════════════════════
   Editor Smoke & Fire FX — particle-based atmospheric effects
   Shared manager + smoke particles. Fire logic in fire.js.
   Each effect is its own <g> appended to SVG (per-entity layers).
══════════════════════════════════════════════════════════════ */

Editor.Smoke = {
  fxId: 0,
  selectedFx: null,
  _animFrame: null,

  injectSidebarControls() {
    const sidebar = document.querySelector('.sidebar.left');
    const h = document.createElement('h3'); h.textContent = 'Smoke & Fire';
    sidebar.appendChild(h);

    const row = document.createElement('div'); row.className = 'toggle-row';
    const btnS = document.createElement('button'); btnS.className = 'tbtn';
    btnS.textContent = '+ Add Smoke';
    btnS.onclick = () => { this.addSmoke(360, 264); Editor.State.dispatch({ type: 'ADD_FX' }); };
    const btnF = document.createElement('button'); btnF.className = 'tbtn';
    btnF.textContent = '+ Add Fire';
    btnF.onclick = () => { Editor.Fire.addFire(360, 264); Editor.State.dispatch({ type: 'ADD_FX' }); };
    row.appendChild(btnS); row.appendChild(btnF);
    sidebar.appendChild(row);

    // Smoke controls
    const sCtrl = document.createElement('div');
    sCtrl.id = 'smokeCtrl'; sCtrl.className = 'fx-controls smoke-controls'; sCtrl.style.display = 'none';
    sCtrl.innerHTML = `
      <div style="font-size:10px;color:#88aacc;margin-bottom:4px;font-weight:600">💨 Smoke</div>
      <label><span class="fx-lbl">Particles</span><input type="range" id="scCount" min="5" max="50" value="20"><span class="fx-val" id="scCountVal">20</span></label>
      <label><span class="fx-lbl">Size min</span><input type="range" id="scSizeMin" min="2" max="15" value="4"><span class="fx-val" id="scSizeMinVal">4</span></label>
      <label><span class="fx-lbl">Size max</span><input type="range" id="scSizeMax" min="5" max="25" value="12"><span class="fx-val" id="scSizeMaxVal">12</span></label>
      <label><span class="fx-lbl">Rise speed</span><input type="range" id="scSpeed" min="0" max="20" step="1" value="4"><span class="fx-val" id="scSpeedVal">0.4</span></label>
      <label><span class="fx-lbl">Max height</span><input type="range" id="scMaxH" min="10" max="200" value="80"><span class="fx-val" id="scMaxHVal">80</span></label>
      <label><span class="fx-lbl">Spread</span><input type="range" id="scSpread" min="5" max="100" value="40"><span class="fx-val" id="scSpreadVal">40</span></label>
      <label><span class="fx-lbl">Opacity</span><input type="range" id="scOpacity" min="0" max="100" value="30"><span class="fx-val" id="scOpacityVal">30%</span></label>
      <label><span class="fx-lbl">Color</span><input type="color" id="scColor" value="#555555"><span class="fx-val" id="scColorVal">#555555</span></label>
      <label><span class="fx-lbl">Fade rate</span><input type="range" id="scFade" min="1" max="10" value="5"><span class="fx-val" id="scFadeVal">5</span></label>
      <label><span class="fx-lbl">Centers</span><input type="checkbox" id="scCenters" checked><span class="fx-val">show</span></label>
      <div style="margin-top:4px"><button class="tbtn" style="color:#cc4444;border-color:#cc444433;font-size:9px;width:100%" onclick="Editor.Smoke.deleteSelected()">Delete Smoke</button></div>`;
    sidebar.appendChild(sCtrl);

    // Fire controls (injected by fire.js)
    Editor.Fire.injectControls(sidebar);

    // Wire smoke controls
    const sw = (id, prop) => { document.getElementById(id).oninput = e => this.updateSelected(prop, +e.target.value); };
    sw('scCount','particleCount'); sw('scSizeMin','sizeMin'); sw('scSizeMax','sizeMax');
    sw('scSpeed','riseSpeed'); sw('scSpread','spread'); sw('scFade','fadeRate'); sw('scMaxH','maxHeight');
    document.getElementById('scOpacity').oninput = e => this.updateSelected('opacity', +e.target.value / 100);
    document.getElementById('scColor').oninput = e => this.updateSelected('color', e.target.value);
    document.getElementById('scCenters').onchange = e => { this.showCenters = e.target.checked; this.updateAllCenters(); };
  },

  updateSelected(prop, val) {
    if (!this.selectedFx) return;
    this.selectedFx[prop] = val;
    this.applyEffect(this.selectedFx);
    this.refreshControls();
    Editor.State.dispatch({ type: 'UPDATE_FX' });
  },

  selectEffect(fx) {
    if (this.selectedFx) this.removeSelectionRing(this.selectedFx);
    this.selectedFx = fx;
    this.applySelectionRing(fx);
    this.refreshControls();
    document.getElementById('smokeCtrl').style.display = fx.type === 'smoke' ? '' : 'none';
    document.getElementById('fireCtrl').style.display = fx.type === 'fire' ? '' : 'none';
    if (Editor.Layers) Editor.Layers.rebuild();
  },

  deselectEffect() {
    if (this.selectedFx) this.removeSelectionRing(this.selectedFx);
    this.selectedFx = null;
    document.getElementById('smokeCtrl').style.display = 'none';
    document.getElementById('fireCtrl').style.display = 'none';
    if (Editor.Layers) Editor.Layers.rebuild();
  },

  applySelectionRing(fx) {
    if (fx !== this.selectedFx) return;
    this.removeSelectionRing(fx);
    const NS = Editor.Core.NS;
    const ring = document.createElementNS(NS, 'circle');
    const r = fx.type === 'smoke' ? fx.spread : fx.decayDist;
    ring.setAttribute('cx', fx.x); ring.setAttribute('cy', fx.y); ring.setAttribute('r', r);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', fx.type === 'fire' ? '#ff8844' : '#88aacc');
    ring.setAttribute('stroke-width', '1.5'); ring.setAttribute('stroke-dasharray', '4,3');
    ring.classList.add('smoke-sel-ring');
    fx.el.appendChild(ring);
    fx.selRing = ring;
  },

  removeSelectionRing(fx) {
    if (fx && fx.selRing) { fx.selRing.remove(); fx.selRing = null; }
  },

  refreshControls() {
    const fx = this.selectedFx; if (!fx) return;
    if (fx.type === 'smoke') {
      document.getElementById('scCount').value = fx.particleCount;
      document.getElementById('scCountVal').textContent = fx.particleCount;
      document.getElementById('scSizeMin').value = fx.sizeMin;
      document.getElementById('scSizeMinVal').textContent = fx.sizeMin;
      document.getElementById('scSizeMax').value = fx.sizeMax;
      document.getElementById('scSizeMaxVal').textContent = fx.sizeMax;
      document.getElementById('scSpeed').value = fx.riseSpeed;
      document.getElementById('scSpeedVal').textContent = (fx.riseSpeed * 0.1).toFixed(1);
      document.getElementById('scMaxH').value = fx.maxHeight;
      document.getElementById('scMaxHVal').textContent = fx.maxHeight;
      document.getElementById('scSpread').value = fx.spread;
      document.getElementById('scSpreadVal').textContent = fx.spread;
      document.getElementById('scOpacity').value = Math.round(fx.opacity * 100);
      document.getElementById('scOpacityVal').textContent = Math.round(fx.opacity * 100) + '%';
      document.getElementById('scColor').value = fx.color;
      document.getElementById('scColorVal').textContent = fx.color;
      document.getElementById('scFade').value = fx.fadeRate;
      document.getElementById('scFadeVal').textContent = fx.fadeRate;
    } else {
      Editor.Fire.refreshControls(fx);
    }
  },

  showCenters: true,

  updateAllCenters() {
    Editor.Core.allSmokeFx.forEach(fx => {
      if (fx._centerDot) fx._centerDot.style.display = this.showCenters ? '' : 'none';
    });
  },

  // ── Add Smoke ──
  addSmoke(x, y, opts, skipSelect, restoreId) {
    const C = Editor.Core, NS = C.NS;
    const id = restoreId || ('fx' + (this.fxId++));
    const fx = Object.assign({
      id, type: 'smoke', x, y,
      particleCount: 20, sizeMin: 4, sizeMax: 12,
      riseSpeed: 4, spread: 40, opacity: 0.3,
      color: '#555555', fadeRate: 5, maxHeight: 80
    }, opts || {});

    const g = document.createElementNS(NS, 'g');
    g.id = id; g.style.cursor = 'grab';
    g.classList.add('smokefx-entity');

    // Transparent hit area for click/drag (covers the full spread area)
    const hitArea = document.createElementNS(NS, 'circle');
    hitArea.setAttribute('cx', x); hitArea.setAttribute('cy', y);
    hitArea.setAttribute('r', fx.spread);
    hitArea.setAttribute('fill', 'transparent'); hitArea.setAttribute('stroke', 'none');
    hitArea.style.pointerEvents = 'fill';
    g.appendChild(hitArea);
    fx._hitArea = hitArea;

    // Center dot (toggleable like lights)
    const center = document.createElementNS(NS, 'circle');
    center.setAttribute('cx', x); center.setAttribute('cy', y); center.setAttribute('r', '3');
    center.setAttribute('fill', '#88aacc'); center.setAttribute('opacity', '0.6');
    center.style.display = this.showCenters ? '' : 'none';
    g.appendChild(center);
    fx._centerDot = center;

    // Shared blur filter — use objectBoundingBox to avoid square clipping
    const filtId = 'sfilt-' + id;
    const defs = C.svg.querySelector('defs');
    const filt = document.createElementNS(NS, 'filter');
    filt.id = filtId;
    filt.setAttribute('x', '-50%'); filt.setAttribute('y', '-50%');
    filt.setAttribute('width', '200%'); filt.setAttribute('height', '200%');
    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '3');
    filt.appendChild(blur); defs.appendChild(filt);
    fx._filtId = filtId; fx._filtEl = filt;

    fx.particles = [];
    this._initSmokeParticles(fx, g, NS, filtId);

    const selUI = document.getElementById('selUI');
    C.svg.insertBefore(g, selUI);
    fx.el = g;
    C.allSmokeFx.push(fx);
    g.onmousedown = e => { e.stopPropagation(); this.selectEffect(fx); this.startDrag(e, fx); };
    if (!skipSelect) this.selectEffect(fx);
    Editor.State.syncZOrderFromDOM();
    this.startAnimation();
    // Record undo for user-initiated adds (not restores)
    if (!restoreId && Editor.Undo && Editor.Commands) {
      Editor.Undo.record(Editor.Commands.AddFx.create(Editor.Commands._captureFx(fx)));
    }
    return fx;
  },

  _initSmokeParticles(fx, g, NS, filtId) {
    fx.particles.forEach(p => p.el.remove());
    fx.particles = [];
    for (let i = 0; i < fx.particleCount; i++) {
      const c = document.createElementNS(NS, 'circle');
      const r = fx.sizeMin + Math.random() * (fx.sizeMax - fx.sizeMin);
      c.setAttribute('r', r); c.setAttribute('fill', fx.color);
      c.setAttribute('filter', `url(#${filtId})`); c.setAttribute('opacity', '0');
      g.appendChild(c);
      fx.particles.push({
        el: c, r, progress: Math.random(),
        offsetX: (Math.random() - 0.5) * 2 * fx.spread,
        wobblePhase: Math.random() * Math.PI * 2
      });
    }
  },

  applyEffect(fx) {
    if (fx.type === 'fire') { Editor.Fire.applyEffect(fx); return; }
    const NS = Editor.Core.NS;
    if (fx.particles.length !== fx.particleCount) {
      this._initSmokeParticles(fx, fx.el, NS, fx._filtId);
      if (fx === this.selectedFx) this.applySelectionRing(fx);
    }
    fx.particles.forEach(p => p.el.setAttribute('fill', fx.color));
    // Update hit area + center dot position
    if (fx._hitArea) {
      fx._hitArea.setAttribute('cx', fx.x); fx._hitArea.setAttribute('cy', fx.y);
      fx._hitArea.setAttribute('r', Math.max(fx.spread, fx.maxHeight));
    }
    if (fx._centerDot) {
      fx._centerDot.setAttribute('cx', fx.x); fx._centerDot.setAttribute('cy', fx.y);
    }
    if (fx.selRing) {
      fx.selRing.setAttribute('cx', fx.x); fx.selRing.setAttribute('cy', fx.y);
      fx.selRing.setAttribute('r', fx.spread);
    }
  },

  startDrag(e, fx) {
    e.preventDefault();
    const C = Editor.Core;
    const startX = fx.x, startY = fx.y;
    const p0 = C.svgPt(e.clientX, e.clientY), ox = p0.x - fx.x, oy = p0.y - fx.y;
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      fx.x = p.x - ox; fx.y = p.y - oy;
      this.applyEffect(fx);
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      if ((fx.x !== startX || fx.y !== startY) && Editor.Undo && Editor.Commands) {
        Editor.Undo.record(Editor.Commands.MoveFx.create(fx.id, startX, startY, fx.x, fx.y));
      }
      Editor.State.dispatch({ type: 'MOVE_FX' });
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  removeEffect(id) {
    const C = Editor.Core;
    const idx = C.allSmokeFx.findIndex(f => f.id === id);
    if (idx === -1) return;
    const fx = C.allSmokeFx[idx];
    // Capture for undo before removing
    if (Editor.Undo && Editor.Commands) {
      const fxData = Editor.Commands._captureFx(fx);
      Editor.Undo.record(Editor.Commands.RemoveFx.create(fxData));
    }
    Editor.Commands._removeFx(id);
    Editor.State.dispatch({ type: 'DELETE_FX' });
    Editor.Layers.rebuild();
  },

  deleteSelected() { if (this.selectedFx) this.removeEffect(this.selectedFx.id); },

  removeAll() {
    Editor.Core.allSmokeFx.forEach(fx => {
      fx.el.remove();
      if (fx._filtEl) fx._filtEl.remove();
      if (fx._glowFiltEl) fx._glowFiltEl.remove();
    });
    Editor.Core.allSmokeFx = []; this.selectedFx = null; this.stopAnimation();
  },

  toggleAll(btn) {
    btn.classList.toggle('on');
    const show = btn.classList.contains('on');
    Editor.Core.allSmokeFx.forEach(fx => { fx.el.style.display = show ? '' : 'none'; });
  },

  startAnimation() {
    if (this._animFrame) return;
    const tick = t => { this._tick(t); this._animFrame = requestAnimationFrame(tick); };
    this._animFrame = requestAnimationFrame(tick);
  },

  stopAnimation() { if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; } },

  _tick(t) {
    const fxList = Editor.Core.allSmokeFx;
    for (let i = 0; i < fxList.length; i++) {
      const fx = fxList[i];
      if (fx.type === 'smoke') this._tickSmoke(fx);
      else Editor.Fire.tickFire(fx, t, i);
    }
  },

  _tickSmoke(fx) {
    const speed = fx.riseSpeed * 0.1;  // much finer control (0.0 - 2.0)
    const maxH = fx.maxHeight || 80;
    const fadeNorm = fx.fadeRate * 0.1;
    for (let j = 0; j < fx.particles.length; j++) {
      const p = fx.particles[j];
      p.progress += speed * 0.012;
      if (p.progress >= 1) {
        p.progress = 0;
        p.offsetX = (Math.random() - 0.5) * 2 * fx.spread;
        p.wobblePhase = Math.random() * Math.PI * 2;
        p.r = fx.sizeMin + Math.random() * (fx.sizeMax - fx.sizeMin);
        p.el.setAttribute('r', p.r);
      }
      const wobble = Math.sin(p.wobblePhase + p.progress * 6) * fx.spread * 0.3;
      p.el.setAttribute('cx', fx.x + p.offsetX + wobble);
      // maxHeight controls how far particles rise
      p.el.setAttribute('cy', fx.y - p.progress * maxH);
      // Fade: ramp up 0-15%, then fade out based on fadeRate
      let alpha;
      if (p.progress < 0.15) alpha = p.progress / 0.15;
      else {
        const fadeProgress = (p.progress - 0.15) / 0.85;
        alpha = Math.pow(1 - fadeProgress, fadeNorm);
      }
      alpha = Math.max(0, alpha * fx.opacity);
      p.el.setAttribute('opacity', alpha.toFixed(3));
    }
  },

  serialize() {
    return Editor.Core.allSmokeFx.map(fx => {
      const b = { id: fx.id, type: fx.type, x: fx.x, y: fx.y, color: fx.color };
      if (fx.type === 'smoke') {
        return Object.assign(b, {
          particleCount: fx.particleCount, sizeMin: fx.sizeMin, sizeMax: fx.sizeMax,
          riseSpeed: fx.riseSpeed, spread: fx.spread, opacity: fx.opacity,
          fadeRate: fx.fadeRate, maxHeight: fx.maxHeight
        });
      }
      return Object.assign(b, {
        sparkCount: fx.sparkCount, sparkSpeed: fx.sparkSpeed, sparkSize: fx.sparkSize,
        direction: fx.direction, angle: fx.angle || 0, maxHeight: fx.maxHeight,
        glowRadius: fx.glowRadius, glowIntensity: fx.glowIntensity
      });
    });
  },

  init() {
    document.addEventListener('keydown', e => {
      if (!this.selectedFx) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      const fx = this.selectedFx;
      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); return; }
      // Arrow keys to move
      const step = e.shiftKey ? 10 : 1;
      const _arrowMove = (dx, dy) => {
        e.preventDefault();
        const oldX = fx.x, oldY = fx.y;
        fx.x += dx; fx.y += dy;
        this.applyEffect(fx);
        if (Editor.Undo && Editor.Commands) {
          Editor.Undo.record(Editor.Commands.MoveFx.create(fx.id, oldX, oldY, fx.x, fx.y));
        }
        Editor.State.dispatch({ type: 'MOVE_FX' });
      };
      if (e.key === 'ArrowLeft')  _arrowMove(-step, 0);
      if (e.key === 'ArrowRight') _arrowMove(step, 0);
      if (e.key === 'ArrowUp')    _arrowMove(0, -step);
      if (e.key === 'ArrowDown')  _arrowMove(0, step);
    });
  }
};

Editor.Smoke.injectSidebarControls();
