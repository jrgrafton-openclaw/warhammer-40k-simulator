/* ══════════════════════════════════════════════════════════════
   Editor Fire FX — spark particles + flickering core circles
   Companion to smoke.js. Uses Editor.Smoke for shared lifecycle.
   Sparks use rAF animation (not CSS) for reliable direction control.
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
      <label><span class="fx-lbl">Glow style</span><select id="fcGlowStyle"><option value="radial">Radial</option><option value="per-spark">Per-spark</option><option value="centroid">Centroid</option><option value="multi">Multi-glow</option></select></label>
      <label><span class="fx-lbl">Glow radius</span><input type="range" id="fcGlow" min="0" max="100" value="30"><span class="fx-val" id="fcGlowVal">30</span></label>
      <label><span class="fx-lbl">Glow intensity</span><input type="range" id="fcGlowInt" min="5" max="100" value="20"><span class="fx-val" id="fcGlowIntVal">0.20</span></label>
      <label><span class="fx-lbl">Centers</span><input type="checkbox" id="fcCenters" checked><span class="fx-val">show</span></label>
      <div style="margin-top:4px"><button class="tbtn" style="color:#cc4444;border-color:#cc444433;font-size:9px;width:100%" onclick="Editor.Smoke.deleteSelected()">Delete Fire</button></div>`;
    sidebar.appendChild(fCtrl);

    const S = Editor.Smoke;
    const sw = (id, prop) => { document.getElementById(id).oninput = e => S.updateSelected(prop, +e.target.value); };
    sw('fcSparks','sparkCount'); sw('fcSpeed','sparkSpeed'); sw('fcSize','sparkSize');
    sw('fcMaxH','maxHeight'); sw('fcGlow','glowRadius'); sw('fcAngle','angle'); sw('fcCore','coreSize');
    document.getElementById('fcGlowInt').oninput = e => S.updateSelected('glowIntensity', +e.target.value / 100);
    document.getElementById('fcGlowStyle').onchange = e => S.updateSelected('glowStyle', e.target.value);
    document.getElementById('fcColor').oninput = e => S.updateSelected('color', e.target.value);
    document.getElementById('fcDir').onchange = e => {
      S.updateSelected('direction', e.target.value);
      document.getElementById('fcAngleRow').style.display = e.target.value === 'angled' ? '' : 'none';
    };
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
    document.getElementById('fcGlowStyle').value = fx.glowStyle || 'radial';
    document.getElementById('fcGlow').value = fx.glowRadius;
    document.getElementById('fcGlowVal').textContent = fx.glowRadius;
    document.getElementById('fcGlowInt').value = Math.round(fx.glowIntensity * 100);
    document.getElementById('fcGlowIntVal').textContent = fx.glowIntensity.toFixed(2);
  },

  addFire(x, y, opts, skipSelect, restoreId) {
    const SM = Editor.Smoke;
    const C = Editor.Core, NS = C.NS;
    const id = restoreId || ('fx' + (SM.fxId++));
    const fx = Object.assign({
      id, type: 'fire', x, y,
      sparkCount: 10, sparkSpeed: 5, sparkSize: 2,
      direction: 'all', angle: 45, maxHeight: 40, coreSize: 4,
      color: '#ff6600', glowStyle: 'radial', glowRadius: 30, glowIntensity: 0.2
    }, opts || {});

    const g = document.createElementNS(NS, 'g');
    g.id = id; g.style.cursor = 'grab';
    g.classList.add('smokefx-entity');

    const defs = C.svg.querySelector('defs');

    // Glow — radial gradient (like lights, no filter = no square)
    const gradId = 'fire-grad-' + id;
    const grad = document.createElementNS(NS, 'radialGradient');
    grad.id = gradId;
    this._updateGradient(grad, fx);
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

    // Core — flickering circles (size controlled by coreSize, 0 = hidden)
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

    // Spark particles — rAF animated (not CSS), so direction actually works
    fx.sparks = [];
    this._initSparks(fx, g, NS);

    const selUI = document.getElementById('selUI');
    C.svg.insertBefore(g, selUI);
    fx.el = g;
    C.allSmokeFx.push(fx);

    g.onmousedown = e => { e.stopPropagation(); SM.selectEffect(fx); SM.startDrag(e, fx); };
    if (!skipSelect) SM.selectEffect(fx);
    Editor.State.syncZOrderFromDOM();
    SM.startAnimation();
    if (!restoreId && Editor.Undo && Editor.Commands && Editor.Commands._captureFx) {
      Editor.Undo.record(Editor.Commands.AddFx.create(Editor.Commands._captureFx(fx)));
    }
    return fx;
  },

  _updateGradient(grad, fx) {
    grad.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="${fx.glowIntensity}"/>
      <stop offset="60%" stop-color="${fx.color}" stop-opacity="${fx.glowIntensity * 0.4}"/>
      <stop offset="100%" stop-color="${fx.color}" stop-opacity="0"/>`;
  },

  _initSparks(fx, g, NS) {
    // Remove old spark elements
    fx.sparks.forEach(s => s.el.remove());
    fx.sparks = [];
    for (let i = 0; i < fx.sparkCount; i++) {
      const c = document.createElementNS(NS, 'circle');
      const r = 0.5 + Math.random() * fx.sparkSize;
      c.setAttribute('r', r);
      const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffdd88' : fx.color;
      c.setAttribute('fill', col);
      c.setAttribute('opacity', '0');
      g.appendChild(c);

      // Each spark has a direction vector based on the direction setting
      const dirAngle = this._getSparkDirection(fx);
      fx.sparks.push({
        el: c, r, progress: Math.random(),
        dirX: Math.cos(dirAngle),
        dirY: Math.sin(dirAngle),
        speed: 0.5 + Math.random() * 1.5  // per-spark speed variation
      });
    }
  },

  _getSparkDirection(fx) {
    if (fx.direction === 'up') {
      // Mostly upward with slight spread
      return -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    }
    if (fx.direction === 'angled') {
      // User-chosen angle (0° = right, 90° = down in SVG, so convert)
      // UI: 0° = up, 90° = right, 180° = down, 270° = left
      const baseRad = ((fx.angle || 45) - 90) * Math.PI / 180;
      return baseRad + (Math.random() - 0.5) * 0.6;
    }
    // 'all' — random direction
    return Math.random() * Math.PI * 2;
  },

  applyEffect(fx) {
    // Update glow
    if (fx._gradEl) this._updateGradient(fx._gradEl, fx);
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
    // Core size update
    if (fx._coreEls) {
      fx._coreEls.forEach(c => {
        c.setAttribute('cx', fx.x); c.setAttribute('cy', fx.y);
        if (fx.coreSize === 0) { c.setAttribute('opacity', '0'); c.setAttribute('r', '0'); }
      });
    }
    // Rebuild sparks if count changed
    if (fx.sparks && fx.sparks.length !== fx.sparkCount) {
      this._initSparks(fx, fx.el, Editor.Core.NS);
      if (fx === Editor.Smoke.selectedFx) Editor.Smoke.applySelectionRing(fx);
    }
    // Update spark colors
    if (fx.sparks) {
      fx.sparks.forEach((s, i) => {
        const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffdd88' : fx.color;
        s.el.setAttribute('fill', col);
        // Reassign direction when settings change
        const dirAngle = this._getSparkDirection(fx);
        s.dirX = Math.cos(dirAngle);
        s.dirY = Math.sin(dirAngle);
      });
    }
    if (fx.selRing) {
      fx.selRing.setAttribute('cx', fx.x); fx.selRing.setAttribute('cy', fx.y);
      fx.selRing.setAttribute('r', fx.maxHeight);
    }
  },

  // Called from the shared rAF loop in smoke.js
  tickFire(fx, t, idx) {
    const speed = fx.sparkSpeed * 0.1;  // finer control (0.0-2.0)
    const maxH = fx.maxHeight || 40;

    // Animate sparks via cx/cy attributes
    for (let j = 0; j < fx.sparks.length; j++) {
      const s = fx.sparks[j];
      s.progress += speed * s.speed * 0.012;
      if (s.progress >= 1) {
        s.progress = 0;
        const dirAngle = this._getSparkDirection(fx);
        s.dirX = Math.cos(dirAngle); s.dirY = Math.sin(dirAngle);
        s.speed = 0.5 + Math.random() * 1.5;
        s.r = 0.5 + Math.random() * fx.sparkSize;
        s.el.setAttribute('r', s.r);
      }
      const dist = s.progress * maxH;
      const sx = fx.x + s.dirX * dist;
      const sy = fx.y + s.dirY * dist;
      s.el.setAttribute('cx', sx); s.el.setAttribute('cy', sy);
      let alpha = s.progress < 0.1 ? s.progress / 0.1 : 1 - ((s.progress - 0.1) / 0.9);
      s.el.setAttribute('opacity', (Math.max(0, alpha) * 0.8).toFixed(3));
    }

    // Flicker core circles
    if (fx._coreEls && fx.coreSize > 0) {
      for (let j = 0; j < fx._coreEls.length; j++) {
        const c = fx._coreEls[j];
        c.setAttribute('opacity', (0.3 + 0.6 * Math.random()).toFixed(2));
        c.setAttribute('r', (fx.coreSize * 0.3 + Math.random() * fx.coreSize).toFixed(1));
        c.setAttribute('cx', fx.x + (Math.random() - 0.5) * fx.coreSize * 0.5);
        c.setAttribute('cy', fx.y + (Math.random() - 0.5) * fx.coreSize * 0.5);
      }
    }

    // Glow — 4 modes
    const style = fx.glowStyle || 'radial';
    const baseInt = fx.glowIntensity || 0.2;
    const pulse = baseInt * (0.7 + 0.3 * Math.sin(t * 0.004 + idx * 1.3));

    if (style === 'radial' && fx._glowEl) {
      // Mode 1: Static radial gradient centered on source
      fx._glowEl.style.display = fx.glowRadius > 0 ? '' : 'none';
      if (fx._gradEl && fx.glowRadius > 0) {
        fx._gradEl.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="${pulse.toFixed(3)}"/>
          <stop offset="60%" stop-color="${fx.color}" stop-opacity="${(pulse * 0.4).toFixed(3)}"/>
          <stop offset="100%" stop-color="${fx.color}" stop-opacity="0"/>`;
      }
    } else if (style === 'per-spark') {
      // Mode 2: Each spark IS its own glow (larger radius + screen blend)
      fx._glowEl.style.display = 'none';
      for (let j = 0; j < fx.sparks.length; j++) {
        const s = fx.sparks[j];
        const glowR = fx.glowRadius * 0.3 * (1 - s.progress);
        s.el.setAttribute('r', Math.max(s.r, glowR).toFixed(1));
        s.el.style.mixBlendMode = 'screen';
      }
    } else if (style === 'centroid') {
      // Mode 3: Single glow follows weighted centroid of active sparks
      let cx = 0, cy = 0, wt = 0;
      for (let j = 0; j < fx.sparks.length; j++) {
        const s = fx.sparks[j];
        const w = 1 - s.progress; // younger sparks weigh more
        cx += parseFloat(s.el.getAttribute('cx')) * w;
        cy += parseFloat(s.el.getAttribute('cy')) * w;
        wt += w;
      }
      if (wt > 0 && fx._glowEl) {
        fx._glowEl.style.display = '';
        fx._glowEl.setAttribute('cx', (cx / wt).toFixed(1));
        fx._glowEl.setAttribute('cy', (cy / wt).toFixed(1));
        if (fx._gradEl) {
          fx._gradEl.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="${pulse.toFixed(3)}"/>
            <stop offset="60%" stop-color="${fx.color}" stop-opacity="${(pulse * 0.4).toFixed(3)}"/>
            <stop offset="100%" stop-color="${fx.color}" stop-opacity="0"/>`;
        }
      }
    } else if (style === 'multi') {
      // Mode 4: 3 sub-glows tracking spark clusters (additive)
      fx._glowEl.style.display = 'none';
      if (!fx._multiGlows) this._initMultiGlows(fx);
      const third = Math.ceil(fx.sparks.length / 3);
      for (let g = 0; g < 3; g++) {
        let cx = 0, cy = 0, wt = 0;
        for (let j = g * third; j < Math.min((g + 1) * third, fx.sparks.length); j++) {
          const s = fx.sparks[j];
          const w = 1 - s.progress;
          cx += parseFloat(s.el.getAttribute('cx')) * w;
          cy += parseFloat(s.el.getAttribute('cy')) * w;
          wt += w;
        }
        if (wt > 0 && fx._multiGlows[g]) {
          fx._multiGlows[g].setAttribute('cx', (cx / wt).toFixed(1));
          fx._multiGlows[g].setAttribute('cy', (cy / wt).toFixed(1));
          fx._multiGlows[g].setAttribute('r', fx.glowRadius * 0.6);
          fx._multiGlows[g].setAttribute('opacity', (pulse * 0.5).toFixed(3));
        }
      }
    }
  },

  _initMultiGlows(fx) {
    const NS = Editor.Core.NS;
    fx._multiGlows = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', fx.glowRadius * 0.6);
      c.setAttribute('fill', fx.color); c.setAttribute('opacity', '0.05');
      c.style.mixBlendMode = 'screen';
      // Insert before sparks
      fx.el.insertBefore(c, fx._sparksEl || fx.el.firstChild);
      fx._multiGlows.push(c);
    }
  }
};
