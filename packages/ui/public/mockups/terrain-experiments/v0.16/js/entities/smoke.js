/* ══════════════════════════════════════════════════════════════
   Editor Smoke & Fire FX — draggable atmospheric effects
   Two types: smoke (organic drifting) and fire (flickering + sparks)
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
    btnF.onclick = () => { this.addFire(360, 264); Editor.State.dispatch({ type: 'ADD_FX' }); };
    row.appendChild(btnS); row.appendChild(btnF);
    sidebar.appendChild(row);

    const ctrl = document.createElement('div');
    ctrl.id = 'smokeFxCtrl'; ctrl.className = 'fx-controls smoke-controls'; ctrl.style.display = 'none';
    ctrl.innerHTML = `
      <div id="sfxLabel" style="font-size:10px;color:#aabbcc;margin-bottom:4px;font-weight:600"></div>
      <label><span class="fx-lbl">Radius</span><input type="range" id="sfxRadius" min="10" max="200" value="60"><span class="fx-val" id="sfxRadiusVal">60</span></label>
      <label><span class="fx-lbl">Color</span><input type="color" id="sfxColor" value="#333333"><span class="fx-val" id="sfxColorVal">#333333</span></label>
      <label id="sfxOpacityRow"><span class="fx-lbl">Opacity</span><input type="range" id="sfxOpacity" min="0" max="100" value="40"><span class="fx-val" id="sfxOpacityVal">40%</span></label>
      <label id="sfxSpeedRow"><span class="fx-lbl">Drift</span><input type="range" id="sfxSpeed" min="0" max="50" value="20"><span class="fx-val" id="sfxSpeedVal">2.0</span></label>
      <label id="sfxTurbRow"><span class="fx-lbl">Turbulence</span><input type="range" id="sfxTurb" min="0" max="10" value="5"><span class="fx-val" id="sfxTurbVal">5</span></label>
      <label id="sfxIntensityRow"><span class="fx-lbl">Intensity</span><input type="range" id="sfxIntensity" min="1" max="10" value="5"><span class="fx-val" id="sfxIntensityVal">5</span></label>
      <label id="sfxDensityRow"><span class="fx-lbl">Sparks</span><input type="range" id="sfxDensity" min="0" max="10" value="3"><span class="fx-val" id="sfxDensityVal">3</span></label>
      <label><span class="fx-lbl">Style</span><select id="sfxStyle">
        <option value="billowing">Billowing</option>
        <option value="wispy">Wispy</option>
        <option value="ground-fog">Ground Fog</option>
        <option value="ember-glow">Ember Glow</option>
        <option value="raging">Raging</option>
        <option value="smouldering">Smouldering</option>
      </select></label>
      <div style="margin-top:4px"><button class="tbtn" style="color:#cc4444;border-color:#cc444433;font-size:9px;width:100%" onclick="Editor.Smoke.deleteSelected()">Delete FX</button></div>
    `;
    sidebar.appendChild(ctrl);

    document.getElementById('sfxRadius').oninput = e => this.updateSelected('radius', +e.target.value);
    document.getElementById('sfxColor').oninput = e => this.updateSelected('color', e.target.value);
    document.getElementById('sfxOpacity').oninput = e => this.updateSelected('opacity', +e.target.value / 100);
    document.getElementById('sfxSpeed').oninput = e => this.updateSelected('speed', +e.target.value / 10);
    document.getElementById('sfxTurb').oninput = e => this.updateSelected('turbulence', +e.target.value);
    document.getElementById('sfxIntensity').oninput = e => this.updateSelected('intensity', +e.target.value);
    document.getElementById('sfxDensity').oninput = e => this.updateSelected('density', +e.target.value);
    document.getElementById('sfxStyle').onchange = e => this.updateSelected('style', e.target.value);
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
    document.getElementById('smokeFxCtrl').style.display = '';
  },

  deselectEffect() {
    if (this.selectedFx) this.removeSelectionRing(this.selectedFx);
    this.selectedFx = null;
    document.getElementById('smokeFxCtrl').style.display = 'none';
  },

  applySelectionRing(fx) {
    if (fx !== this.selectedFx) return;
    this.removeSelectionRing(fx);
    const NS = Editor.Core.NS;
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', fx.x); ring.setAttribute('cy', fx.y); ring.setAttribute('r', fx.radius);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', fx.type === 'fire' ? '#ff8844' : '#88aacc');
    ring.setAttribute('stroke-width', '1.5'); ring.setAttribute('stroke-dasharray', '4,3');
    ring.classList.add('smoke-sel-ring');
    fx.el.appendChild(ring);
    fx.selRing = ring;
  },

  removeSelectionRing(fx) {
    if (fx.selRing) { fx.selRing.remove(); fx.selRing = null; }
  },

  refreshControls() {
    const fx = this.selectedFx; if (!fx) return;
    document.getElementById('sfxLabel').textContent = fx.type === 'fire' ? '🔥 Fire' : '💨 Smoke';
    document.getElementById('sfxRadius').value = fx.radius;
    document.getElementById('sfxRadiusVal').textContent = fx.radius;
    document.getElementById('sfxColor').value = fx.color;
    document.getElementById('sfxColorVal').textContent = fx.color;
    const isFire = fx.type === 'fire';
    document.getElementById('sfxOpacityRow').style.display = isFire ? 'none' : '';
    document.getElementById('sfxSpeedRow').style.display = isFire ? 'none' : '';
    document.getElementById('sfxTurbRow').style.display = isFire ? 'none' : '';
    document.getElementById('sfxIntensityRow').style.display = isFire ? '' : 'none';
    document.getElementById('sfxDensityRow').style.display = isFire ? '' : 'none';
    if (!isFire) {
      document.getElementById('sfxOpacity').value = Math.round(fx.opacity * 100);
      document.getElementById('sfxOpacityVal').textContent = Math.round(fx.opacity * 100) + '%';
      document.getElementById('sfxSpeed').value = Math.round(fx.speed * 10);
      document.getElementById('sfxSpeedVal').textContent = fx.speed.toFixed(1);
      document.getElementById('sfxTurb').value = fx.turbulence;
      document.getElementById('sfxTurbVal').textContent = fx.turbulence;
    } else {
      document.getElementById('sfxIntensity').value = fx.intensity;
      document.getElementById('sfxIntensityVal').textContent = fx.intensity;
      document.getElementById('sfxDensity').value = fx.density;
      document.getElementById('sfxDensityVal').textContent = fx.density;
    }
    document.getElementById('sfxStyle').value = fx.style;
  },

  // ── Add Smoke ──
  addSmoke(x, y, opts, skipSelect, restoreId) {
    const C = Editor.Core, NS = C.NS;
    const id = restoreId || ('fx' + (this.fxId++));
    const fx = Object.assign({ id, type: 'smoke', x, y,
      radius: 60, color: '#333333', opacity: 0.4,
      speed: 2, style: 'billowing', turbulence: 5, _seed: Math.random() * 100 }, opts || {});

    const g = document.createElementNS(NS, 'g');
    g.style.cursor = 'grab'; g.style.mixBlendMode = 'screen';

    const defs = C.svg.querySelector('defs');
    const filtId = 'smoke-filt-' + id;
    const filt = document.createElementNS(NS, 'filter');
    filt.id = filtId;
    filt.setAttribute('x', '-80%'); filt.setAttribute('y', '-80%');
    filt.setAttribute('width', '260%'); filt.setAttribute('height', '260%');
    const turb = document.createElementNS(NS, 'feTurbulence');
    turb.setAttribute('type', 'fractalNoise'); turb.setAttribute('baseFrequency', this._smokeFreq(fx.style));
    turb.setAttribute('numOctaves', '4'); turb.setAttribute('seed', fx._seed.toFixed(1)); turb.setAttribute('result', 'noise');
    const disp = document.createElementNS(NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic'); disp.setAttribute('in2', 'noise');
    disp.setAttribute('scale', String(fx.turbulence * 4 + 10)); disp.setAttribute('xChannelSelector', 'R'); disp.setAttribute('yChannelSelector', 'G'); disp.setAttribute('result', 'displaced');
    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('in', 'displaced'); blur.setAttribute('stdDeviation', '6');
    filt.appendChild(turb); filt.appendChild(disp); filt.appendChild(blur);
    defs.appendChild(filt);

    for (let i = 0; i < 3; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', fx.radius * (0.6 + i * 0.2));
      c.setAttribute('fill', fx.color); c.setAttribute('opacity', (fx.opacity * (1 - i * 0.25)).toFixed(3));
      c.setAttribute('filter', `url(#${filtId})`); c.classList.add('smoke-layer');
      g.appendChild(c);
    }
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 3);
    dot.setAttribute('fill', '#88aacc'); dot.setAttribute('opacity', '0.6'); dot.classList.add('smoke-center');
    g.appendChild(dot);

    document.getElementById('smokeLayer').appendChild(g);
    fx.el = g; fx.filt = filt; fx.turb = turb; fx.disp = disp;
    C.allSmokeFx.push(fx);
    g.onmousedown = e => { e.stopPropagation(); this.selectEffect(fx); this.startDrag(e, fx); };
    if (!skipSelect) this.selectEffect(fx);
    this.startAnimation();
    return fx;
  },

  _smokeFreq(style) {
    return style === 'wispy' ? '0.04' : style === 'ground-fog' ? '0.015' : '0.025';
  },

  // ── Add Fire ──
  addFire(x, y, opts, skipSelect, restoreId) {
    const C = Editor.Core, NS = C.NS;
    const id = restoreId || ('fx' + (this.fxId++));
    const fx = Object.assign({ id, type: 'fire', x, y,
      radius: 30, color: '#ff6600', intensity: 5,
      style: 'ember-glow', density: 3, _seed: Math.random() * 100 }, opts || {});

    const g = document.createElementNS(NS, 'g');
    g.style.cursor = 'grab'; g.style.mixBlendMode = 'screen';
    const defs = C.svg.querySelector('defs');
    const filtId = 'fire-filt-' + id, gradId = 'fire-grad-' + id, blurFiltId = 'fire-blur-' + id;

    const grad = document.createElementNS(NS, 'radialGradient');
    grad.id = gradId;
    grad.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="${fx.color}" stop-opacity="0.65"/>
      <stop offset="80%" stop-color="#ff2200" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#ff0000" stop-opacity="0"/>`;
    defs.appendChild(grad);

    const blurFilt = document.createElementNS(NS, 'filter');
    blurFilt.id = blurFiltId;
    const blurEl = document.createElementNS(NS, 'feGaussianBlur');
    blurEl.setAttribute('stdDeviation', '12');
    blurFilt.appendChild(blurEl);
    defs.appendChild(blurFilt);

    const filt = document.createElementNS(NS, 'filter');
    filt.id = filtId;
    filt.setAttribute('x', '-60%'); filt.setAttribute('y', '-60%');
    filt.setAttribute('width', '220%'); filt.setAttribute('height', '220%');
    const turb = document.createElementNS(NS, 'feTurbulence');
    turb.setAttribute('type', 'turbulence'); turb.setAttribute('baseFrequency', '0.05 0.12');
    turb.setAttribute('numOctaves', '3'); turb.setAttribute('seed', fx._seed.toFixed(1)); turb.setAttribute('result', 'noise');
    const disp = document.createElementNS(NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic'); disp.setAttribute('in2', 'noise');
    disp.setAttribute('scale', String(fx.intensity * 4)); disp.setAttribute('xChannelSelector', 'R'); disp.setAttribute('yChannelSelector', 'G');
    filt.appendChild(turb); filt.appendChild(disp);
    defs.appendChild(filt);

    const glow = document.createElementNS(NS, 'circle');
    glow.setAttribute('cx', x); glow.setAttribute('cy', y); glow.setAttribute('r', fx.radius * 1.8);
    glow.setAttribute('fill', fx.color); glow.setAttribute('opacity', '0.06');
    glow.setAttribute('filter', `url(#${blurFiltId})`); glow.classList.add('fire-glow');
    g.appendChild(glow);

    const core = document.createElementNS(NS, 'circle');
    core.setAttribute('cx', x); core.setAttribute('cy', y); core.setAttribute('r', fx.radius);
    core.setAttribute('fill', `url(#${gradId})`); core.setAttribute('filter', `url(#${filtId})`);
    core.classList.add('fire-core');
    g.appendChild(core);

    const sparks = document.createElementNS(NS, 'g'); sparks.classList.add('fire-sparks');
    g.appendChild(sparks);

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 3);
    dot.setAttribute('fill', '#ff8844'); dot.setAttribute('opacity', '0.7'); dot.classList.add('fire-center');
    g.appendChild(dot);

    document.getElementById('smokeLayer').appendChild(g);
    fx.el = g; fx.filt = filt; fx.turb = turb; fx.disp = disp;
    fx.grad = grad; fx.glowEl = glow; fx.coreEl = core; fx.sparksEl = sparks;
    C.allSmokeFx.push(fx);
    this._buildSparks(fx);
    g.onmousedown = e => { e.stopPropagation(); this.selectEffect(fx); this.startDrag(e, fx); };
    if (!skipSelect) this.selectEffect(fx);
    this.startAnimation();
    return fx;
  },

  _buildSparks(fx) {
    const NS = Editor.Core.NS;
    while (fx.sparksEl.firstChild) fx.sparksEl.removeChild(fx.sparksEl.firstChild);
    const count = Math.round(fx.density * 3);
    for (let i = 0; i < count; i++) {
      const spark = document.createElementNS(NS, 'circle');
      const angle = Math.random() * Math.PI * 2, dist = Math.random() * fx.radius * 0.75;
      spark.setAttribute('cx', fx.x + Math.cos(angle) * dist);
      spark.setAttribute('cy', fx.y + Math.sin(angle) * dist);
      spark.setAttribute('r', (0.5 + Math.random() * 1.5).toFixed(1));
      const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffdd88' : fx.color;
      spark.setAttribute('fill', col); spark.setAttribute('opacity', (0.5 + Math.random() * 0.5).toFixed(2));
      const delay = (Math.random() * 2).toFixed(2), dur = (0.8 + Math.random() * 1.5).toFixed(2);
      spark.style.animation = `sparkFloat ${dur}s ${delay}s ease-in infinite`;
      fx.sparksEl.appendChild(spark);
    }
  },

  applyEffect(fx) {
    const allDots = fx.el.querySelectorAll('.smoke-center, .fire-center');
    allDots.forEach(d => { d.setAttribute('cx', fx.x); d.setAttribute('cy', fx.y); });
    if (fx.selRing) { fx.selRing.setAttribute('cx', fx.x); fx.selRing.setAttribute('cy', fx.y); fx.selRing.setAttribute('r', fx.radius); }

    if (fx.type === 'smoke') {
      fx.el.querySelectorAll('.smoke-layer').forEach((c, i) => {
        c.setAttribute('cx', fx.x); c.setAttribute('cy', fx.y);
        c.setAttribute('r', fx.radius * (0.6 + i * 0.2));
        c.setAttribute('fill', fx.color);
        c.setAttribute('opacity', (fx.opacity * (1 - i * 0.25)).toFixed(3));
      });
      fx.turb.setAttribute('baseFrequency', this._smokeFreq(fx.style));
      fx.disp.setAttribute('scale', String(fx.turbulence * 4 + 10));
    } else {
      fx.coreEl.setAttribute('cx', fx.x); fx.coreEl.setAttribute('cy', fx.y); fx.coreEl.setAttribute('r', fx.radius);
      fx.glowEl.setAttribute('cx', fx.x); fx.glowEl.setAttribute('cy', fx.y); fx.glowEl.setAttribute('r', fx.radius * 1.8);
      fx.glowEl.setAttribute('fill', fx.color);
      fx.disp.setAttribute('scale', String(fx.intensity * 4));
      fx.grad.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="0.95"/>
        <stop offset="45%" stop-color="${fx.color}" stop-opacity="0.65"/>
        <stop offset="80%" stop-color="#ff2200" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#ff0000" stop-opacity="0"/>`;
      this._buildSparks(fx);
    }
  },

  startDrag(e, fx) {
    e.preventDefault();
    const C = Editor.Core;
    const p0 = C.svgPt(e.clientX, e.clientY), ox = p0.x - fx.x, oy = p0.y - fx.y;
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      fx.x = p.x - ox; fx.y = p.y - oy;
      this.applyEffect(fx);
    };
    const up = () => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      Editor.State.dispatch({ type: 'MOVE_FX' });
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  removeEffect(id) {
    const C = Editor.Core;
    const idx = C.allSmokeFx.findIndex(f => f.id === id);
    if (idx === -1) return;
    const fx = C.allSmokeFx[idx];
    fx.el.remove();
    if (fx.filt) fx.filt.remove();
    if (fx.grad) fx.grad.remove();
    C.allSmokeFx.splice(idx, 1);
    if (this.selectedFx === fx) { this.selectedFx = null; document.getElementById('smokeFxCtrl').style.display = 'none'; }
    if (C.allSmokeFx.length === 0) this.stopAnimation();
    Editor.State.dispatch({ type: 'DELETE_FX' });
  },

  deleteSelected() { if (this.selectedFx) this.removeEffect(this.selectedFx.id); },

  removeAll() {
    Editor.Core.allSmokeFx.forEach(fx => { fx.el.remove(); if (fx.filt) fx.filt.remove(); if (fx.grad) fx.grad.remove(); });
    Editor.Core.allSmokeFx = []; this.selectedFx = null; this.stopAnimation();
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
      if (fx.type === 'smoke') {
        fx._seed = (fx._seed + (fx.speed || 1) * 0.025) % 1000;
        fx.turb.setAttribute('seed', fx._seed.toFixed(2));
      } else {
        fx._seed = (fx._seed + 0.18) % 1000;
        fx.turb.setAttribute('seed', fx._seed.toFixed(2));
        if (fx.glowEl) {
          const pulse = 0.04 + 0.035 * Math.sin(t * 0.003 + i * 1.3);
          fx.glowEl.setAttribute('opacity', pulse.toFixed(3));
        }
      }
    }
  },

  serialize() {
    return Editor.Core.allSmokeFx.map(fx => {
      const b = { id: fx.id, type: fx.type, x: fx.x, y: fx.y, radius: fx.radius, color: fx.color, style: fx.style };
      if (fx.type === 'smoke') return Object.assign(b, { opacity: fx.opacity, speed: fx.speed, turbulence: fx.turbulence });
      return Object.assign(b, { intensity: fx.intensity, density: fx.density });
    });
  },

  init() {
    document.addEventListener('keydown', e => {
      if (!this.selectedFx) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      e.preventDefault(); this.deleteSelected();
    });
  }
};

Editor.Smoke.injectSidebarControls();
