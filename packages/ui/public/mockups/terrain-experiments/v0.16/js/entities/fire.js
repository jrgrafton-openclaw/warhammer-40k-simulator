/* ══════════════════════════════════════════════════════════════
   Editor Fire FX — spark particles + flickering core + radial glow
   Companion to smoke.js. Uses Editor.Smoke for shared lifecycle.
   Sparks use rAF animation for reliable direction control.
   Glow uses radial gradient (like lights) with pulse/flicker/breathe.
══════════════════════════════════════════════════════════════ */

Editor.Fire = {
  injectControls(sidebar) {
    const fCtrl = document.createElement('div');
    fCtrl.id = 'fireCtrl'; fCtrl.className = 'fx-controls smoke-controls'; fCtrl.style.display = 'none';
    fCtrl.innerHTML = `
      <div style="font-size:10px;color:#ff8844;margin-bottom:4px;font-weight:600">🔥 Fire</div>
      <label><span class="fx-lbl">Sparks</span><input type="range" id="fcSparks" min="3" max="30" value="10"><span class="fx-val" id="fcSparksVal">10</span></label>
      <label><span class="fx-lbl">Spark speed</span><input type="range" id="fcSpeed" min="0" max="20" step="1" value="5"><span class="fx-val" id="fcSpeedVal">0.5</span></label>
      <label><span class="fx-lbl">Spark size</span><input type="range" id="fcSize" min="1" max="5" value="2"><span class="fx-val" id="fcSizeVal">2</span></label>
      <label><span class="fx-lbl">Max height</span><input type="range" id="fcMaxH" min="10" max="150" value="40"><span class="fx-val" id="fcMaxHVal">40</span></label>
      <label><span class="fx-lbl">Core size</span><input type="range" id="fcCore" min="0" max="10" value="4"><span class="fx-val" id="fcCoreVal">4</span></label>
      <label><span class="fx-lbl">Direction</span><select id="fcDir"><option value="all">All</option><option value="up">Up</option><option value="angled">Angled</option></select></label>
      <label id="fcAngleRow" style="display:none"><span class="fx-lbl">Angle °</span><input type="range" id="fcAngle" min="0" max="360" value="45"><span class="fx-val" id="fcAngleVal">45°</span></label>
      <label><span class="fx-lbl">Color</span><input type="color" id="fcColor" value="#ff6600"><span class="fx-val" id="fcColorVal">#ff6600</span></label>
      <label><span class="fx-lbl">Glow radius</span><input type="range" id="fcGlow" min="0" max="100" value="30"><span class="fx-val" id="fcGlowVal">30</span></label>
      <label><span class="fx-lbl">Glow intensity</span><input type="range" id="fcGlowInt" min="5" max="100" value="20"><span class="fx-val" id="fcGlowIntVal">0.20</span></label>
      <label><span class="fx-lbl">Animation</span><select id="fcPulseType"><option value="none">None</option><option value="pulse">Pulse</option><option value="flicker">Flicker</option><option value="breathe">Breathe</option></select></label>
      <div id="fcPulseExtras" style="display:none">
        <label id="fcPulseSpeedRow"><span class="fx-lbl">Anim speed</span><input type="range" id="fcPulseSpeed" min="1" max="30" value="10"><span class="fx-val" id="fcPulseSpeedVal">1.0</span></label>
        <label><span class="fx-lbl">Int. amp</span><input type="range" id="fcPulseIntAmp" min="0" max="50" value="15"><span class="fx-val" id="fcPulseIntAmpVal">0.15</span></label>
        <label><span class="fx-lbl">Rad. amp</span><input type="range" id="fcPulseRadAmp" min="0" max="50" value="10"><span class="fx-val" id="fcPulseRadAmpVal">10</span></label>
      </div>
      <label><span class="fx-lbl">Centers</span><input type="checkbox" id="fcCenters" checked><span class="fx-val">show</span></label>
      <div style="margin-top:4px"><button class="tbtn" style="color:#cc4444;border-color:#cc444433;font-size:9px;width:100%" onclick="Editor.Smoke.deleteSelected()">Delete Fire</button></div>`;
    sidebar.appendChild(fCtrl);

    const S = Editor.Smoke;
    const sw = (id, prop) => { document.getElementById(id).oninput = e => S.updateSelected(prop, +e.target.value); };
    sw('fcSparks','sparkCount'); sw('fcSpeed','sparkSpeed'); sw('fcSize','sparkSize');
    sw('fcMaxH','maxHeight'); sw('fcGlow','glowRadius'); sw('fcAngle','angle'); sw('fcCore','coreSize');
    document.getElementById('fcGlowInt').oninput = e => S.updateSelected('glowIntensity', +e.target.value / 100);
    document.getElementById('fcColor').oninput = e => S.updateSelected('color', e.target.value);
    document.getElementById('fcDir').onchange = e => {
      S.updateSelected('direction', e.target.value);
      document.getElementById('fcAngleRow').style.display = e.target.value === 'angled' ? '' : 'none';
    };
    document.getElementById('fcPulseType').onchange = e => {
      S.updateSelected('pulseType', e.target.value);
      document.getElementById('fcPulseExtras').style.display = e.target.value === 'none' ? 'none' : '';
      document.getElementById('fcPulseSpeedRow').style.display = e.target.value === 'breathe' ? 'none' : '';
    };
    document.getElementById('fcPulseSpeed').oninput = e => S.updateSelected('pulseSpeed', +e.target.value / 10);
    document.getElementById('fcPulseIntAmp').oninput = e => S.updateSelected('pulseIntensityAmp', +e.target.value / 100);
    document.getElementById('fcPulseRadAmp').oninput = e => S.updateSelected('pulseRadiusAmp', +e.target.value);
    document.getElementById('fcCenters').onchange = e => { this.showCenters = e.target.checked; this.updateAllCenters(); };
  },

  showCenters: true,

  updateAllCenters() {
    Editor.Core.allSmokeFx.filter(f => f.type === 'fire').forEach(fx => {
      if (fx._centerDot) fx._centerDot.style.display = this.showCenters ? '' : 'none';
    });
  },

  refreshControls(fx) {
    document.getElementById('fcSparks').value = fx.sparkCount;
    document.getElementById('fcSparksVal').textContent = fx.sparkCount;
    document.getElementById('fcSpeed').value = fx.sparkSpeed;
    document.getElementById('fcSpeedVal').textContent = (fx.sparkSpeed * 0.1).toFixed(1);
    document.getElementById('fcSize').value = fx.sparkSize;
    document.getElementById('fcSizeVal').textContent = fx.sparkSize;
    document.getElementById('fcMaxH').value = fx.maxHeight;
    document.getElementById('fcMaxHVal').textContent = fx.maxHeight;
    document.getElementById('fcCore').value = fx.coreSize;
    document.getElementById('fcCoreVal').textContent = fx.coreSize;
    document.getElementById('fcDir').value = fx.direction;
    document.getElementById('fcAngleRow').style.display = fx.direction === 'angled' ? '' : 'none';
    document.getElementById('fcAngle').value = fx.angle || 45;
    document.getElementById('fcAngleVal').textContent = (fx.angle || 45) + '°';
    document.getElementById('fcColor').value = fx.color;
    document.getElementById('fcColorVal').textContent = fx.color;
    document.getElementById('fcGlow').value = fx.glowRadius;
    document.getElementById('fcGlowVal').textContent = fx.glowRadius;
    document.getElementById('fcGlowInt').value = Math.round(fx.glowIntensity * 100);
    document.getElementById('fcGlowIntVal').textContent = fx.glowIntensity.toFixed(2);
    // Animation controls
    const pt = fx.pulseType || 'none';
    document.getElementById('fcPulseType').value = pt;
    document.getElementById('fcPulseExtras').style.display = pt === 'none' ? 'none' : '';
    document.getElementById('fcPulseSpeedRow').style.display = pt === 'breathe' ? 'none' : '';
    document.getElementById('fcPulseSpeed').value = Math.round((fx.pulseSpeed || 1.0) * 10);
    document.getElementById('fcPulseSpeedVal').textContent = (fx.pulseSpeed || 1.0).toFixed(1);
    document.getElementById('fcPulseIntAmp').value = Math.round((fx.pulseIntensityAmp || 0.15) * 100);
    document.getElementById('fcPulseIntAmpVal').textContent = (fx.pulseIntensityAmp || 0.15).toFixed(2);
    document.getElementById('fcPulseRadAmp').value = fx.pulseRadiusAmp || 10;
    document.getElementById('fcPulseRadAmpVal').textContent = fx.pulseRadiusAmp || 10;
  },

  addFire(x, y, opts, skipSelect, restoreId) {
    const SM = Editor.Smoke;
    const C = Editor.Core, NS = C.NS;
    const id = restoreId || ('fx' + (SM.fxId++));
    const fx = Object.assign({
      id, type: 'fire', x, y,
      sparkCount: 10, sparkSpeed: 5, sparkSize: 2,
      direction: 'all', angle: 45, maxHeight: 40, coreSize: 4,
      color: '#ff6600', glowRadius: 30, glowIntensity: 0.2,
      pulseType: 'flicker', pulseSpeed: 1.0, pulseIntensityAmp: 0.15, pulseRadiusAmp: 10
    }, opts || {});

    const g = document.createElementNS(NS, 'g');
    g.id = id; g.style.cursor = 'grab';
    g.classList.add('smokefx-entity');

    const defs = C.svg.querySelector('defs');

    // Glow — radial gradient (like lights)
    const gradId = 'fire-grad-' + id;
    const grad = document.createElementNS(NS, 'radialGradient');
    grad.id = gradId;
    this._updateGradient(grad, fx.color, fx.glowIntensity);
    defs.appendChild(grad);
    fx._gradEl = grad; fx._gradId = gradId;

    const glow = document.createElementNS(NS, 'circle');
    glow.setAttribute('cx', fx.x); glow.setAttribute('cy', fx.y);
    glow.setAttribute('r', fx.glowRadius);
    glow.setAttribute('fill', `url(#${gradId})`);
    g.appendChild(glow);
    fx._glowEl = glow;

    // Transparent hit area
    const hitArea = document.createElementNS(NS, 'circle');
    hitArea.setAttribute('cx', x); hitArea.setAttribute('cy', y);
    hitArea.setAttribute('r', Math.max(fx.glowRadius, fx.maxHeight));
    hitArea.setAttribute('fill', 'transparent'); hitArea.setAttribute('stroke', 'none');
    hitArea.style.pointerEvents = 'fill';
    g.appendChild(hitArea);
    fx._hitArea = hitArea;

    // Core — flickering circles
    fx._coreEls = [];
    for (let i = 0; i < 4; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', fx.x); c.setAttribute('cy', fx.y);
      c.setAttribute('r', fx.coreSize > 0 ? (fx.coreSize * 0.5 + Math.random() * fx.coreSize) : 0);
      c.setAttribute('fill', ['#ffdd44','#ffaa00','#ff4400',fx.color][i]);
      c.setAttribute('opacity', fx.coreSize > 0 ? '0.6' : '0');
      c.style.mixBlendMode = 'screen';
      g.appendChild(c);
      fx._coreEls.push(c);
    }

    // Center dot
    const center = document.createElementNS(NS, 'circle');
    center.setAttribute('cx', x); center.setAttribute('cy', y); center.setAttribute('r', '3');
    center.setAttribute('fill', '#ff8844'); center.setAttribute('opacity', '0.7');
    center.style.display = this.showCenters ? '' : 'none';
    g.appendChild(center);
    fx._centerDot = center;

    // Spark particles
    fx.sparks = [];
    this._initSparks(fx, g, NS);

    const selUI = document.getElementById('selUI');
    C.svg.insertBefore(g, selUI);
    fx.el = g;
    C.allSmokeFx.push(fx);

    g.onmousedown = e => {
      e.stopPropagation();
      if (e.shiftKey && SM.selectedFx) {
        if (!SM.multiSelFx.includes(fx)) SM.multiSelFx.push(fx);
        else SM.multiSelFx = SM.multiSelFx.filter(f => f !== fx);
        if (!SM.multiSelFx.includes(SM.selectedFx)) SM.multiSelFx.push(SM.selectedFx);
        SM.applySelectionRing(fx);
        Editor.Layers.rebuild();
      } else {
        SM.selectEffect(fx);
      }
      SM.startDrag(e, fx);
    };
    if (!skipSelect) SM.selectEffect(fx);
    Editor.State.syncZOrderFromDOM();
    SM.startAnimation();
    if (!restoreId && Editor.Undo && Editor.Commands && Editor.Commands._captureFx) {
      Editor.Undo.record(Editor.Commands.AddFx.create(Editor.Commands._captureFx(fx)));
    }
    return fx;
  },

  _updateGradient(grad, color, intensity) {
    grad.innerHTML = `<stop offset="0%" stop-color="${color}" stop-opacity="${intensity}"/>
      <stop offset="60%" stop-color="${color}" stop-opacity="${intensity * 0.4}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>`;
  },

  _initSparks(fx, g, NS) {
    fx.sparks.forEach(s => s.el.remove());
    fx.sparks = [];
    for (let i = 0; i < fx.sparkCount; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', 0.5 + Math.random() * fx.sparkSize);
      c.setAttribute('fill', i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffdd88' : fx.color);
      c.setAttribute('opacity', '0');
      g.appendChild(c);
      const dirAngle = this._getSparkDirection(fx);
      fx.sparks.push({
        el: c, progress: Math.random(),
        dirX: Math.cos(dirAngle), dirY: Math.sin(dirAngle),
        speed: 0.5 + Math.random() * 1.5
      });
    }
  },

  _getSparkDirection(fx) {
    if (fx.direction === 'up') return -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    if (fx.direction === 'angled') {
      return ((fx.angle || 45) - 90) * Math.PI / 180 + (Math.random() - 0.5) * 0.6;
    }
    return Math.random() * Math.PI * 2;
  },

  applyEffect(fx) {
    if (fx._glowEl) {
      fx._glowEl.setAttribute('cx', fx.x); fx._glowEl.setAttribute('cy', fx.y);
      fx._glowEl.setAttribute('r', fx.glowRadius);
      fx._glowEl.style.display = fx.glowRadius > 0 ? '' : 'none';
    }
    if (fx._hitArea) {
      fx._hitArea.setAttribute('cx', fx.x); fx._hitArea.setAttribute('cy', fx.y);
      fx._hitArea.setAttribute('r', Math.max(fx.glowRadius, fx.maxHeight));
    }
    if (fx._centerDot) {
      fx._centerDot.setAttribute('cx', fx.x); fx._centerDot.setAttribute('cy', fx.y);
    }
    if (fx._coreEls) {
      fx._coreEls.forEach(c => {
        c.setAttribute('cx', fx.x); c.setAttribute('cy', fx.y);
        if (fx.coreSize === 0) { c.setAttribute('opacity', '0'); c.setAttribute('r', '0'); }
      });
    }
    if (fx.sparks && fx.sparks.length !== fx.sparkCount) {
      this._initSparks(fx, fx.el, Editor.Core.NS);
      if (fx === Editor.Smoke.selectedFx) Editor.Smoke.applySelectionRing(fx);
    }
    if (fx.sparks) {
      fx.sparks.forEach((s, i) => {
        s.el.setAttribute('fill', i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffdd88' : fx.color);
        const d = this._getSparkDirection(fx);
        s.dirX = Math.cos(d); s.dirY = Math.sin(d);
      });
    }
    if (fx.selRing) {
      fx.selRing.setAttribute('cx', fx.x); fx.selRing.setAttribute('cy', fx.y);
      fx.selRing.setAttribute('r', fx.maxHeight);
    }
  },

  tickFire(fx, t, idx) {
    const speed = fx.sparkSpeed * 0.1;
    const maxH = fx.maxHeight || 40;

    // Animate sparks
    for (let j = 0; j < fx.sparks.length; j++) {
      const s = fx.sparks[j];
      s.progress += speed * s.speed * 0.012;
      if (s.progress >= 1) {
        s.progress = 0;
        const d = this._getSparkDirection(fx);
        s.dirX = Math.cos(d); s.dirY = Math.sin(d);
        s.speed = 0.5 + Math.random() * 1.5;
        s.el.setAttribute('r', (0.5 + Math.random() * fx.sparkSize).toFixed(1));
      }
      s.el.setAttribute('cx', fx.x + s.dirX * s.progress * maxH);
      s.el.setAttribute('cy', fx.y + s.dirY * s.progress * maxH);
      let a = s.progress < 0.1 ? s.progress / 0.1 : 1 - ((s.progress - 0.1) / 0.9);
      s.el.setAttribute('opacity', (Math.max(0, a) * 0.8).toFixed(3));
    }

    // Flicker core
    if (fx._coreEls && fx.coreSize > 0) {
      for (let j = 0; j < fx._coreEls.length; j++) {
        const c = fx._coreEls[j];
        c.setAttribute('opacity', (0.3 + 0.6 * Math.random()).toFixed(2));
        c.setAttribute('r', (fx.coreSize * 0.3 + Math.random() * fx.coreSize).toFixed(1));
        c.setAttribute('cx', fx.x + (Math.random() - 0.5) * fx.coreSize * 0.5);
        c.setAttribute('cy', fx.y + (Math.random() - 0.5) * fx.coreSize * 0.5);
      }
    }

    // Glow animation (pulse/flicker/breathe — same math as lights)
    if (fx._glowEl && fx.glowRadius > 0) {
      const pt = fx.pulseType || 'none';
      const ts = t / 1000; // seconds
      const baseInt = fx.glowIntensity || 0.2;
      const baseRad = fx.glowRadius;

      if (pt === 'none') {
        // Static glow — no animation
        this._updateGradient(fx._gradEl, fx.color, baseInt);
        fx._glowEl.setAttribute('r', baseRad);
      } else {
        const spd = pt === 'breathe' ? 0.3 : (fx.pulseSpeed || 1.0);
        const intAmp = fx.pulseIntensityAmp != null ? fx.pulseIntensityAmp : 0.15;
        const radAmp = fx.pulseRadiusAmp != null ? fx.pulseRadiusAmp : 10;
        let mod;
        if (pt === 'flicker') {
          // Three incommensurate sine waves = chaotic pseudo-random
          mod = Math.sin(ts * spd * 7.3) * Math.sin(ts * spd * 13.1) * Math.sin(ts * spd * 23.7);
        } else {
          mod = Math.sin(ts * spd * Math.PI * 2);
        }
        const visInt = Math.max(0, Math.min(1, baseInt + intAmp * mod));
        const visRad = Math.max(1, baseRad + radAmp * mod);
        this._updateGradient(fx._gradEl, fx.color, visInt);
        fx._glowEl.setAttribute('r', visRad);
      }
    }
  }
};
