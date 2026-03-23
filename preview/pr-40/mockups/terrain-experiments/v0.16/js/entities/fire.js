/* ══════════════════════════════════════════════════════════════
   Editor Fire FX — spark particles + flickering core circles
   Companion to smoke.js. Uses Editor.Smoke for shared lifecycle.
══════════════════════════════════════════════════════════════ */

Editor.Fire = {
  injectControls(sidebar) {
    const fCtrl = document.createElement('div');
    fCtrl.id = 'fireCtrl'; fCtrl.className = 'fx-controls smoke-controls'; fCtrl.style.display = 'none';
    fCtrl.innerHTML = `
      <div style="font-size:10px;color:#ff8844;margin-bottom:4px;font-weight:600">🔥 Fire</div>
      <label><span class="fx-lbl">Sparks</span><input type="range" id="fcSparks" min="3" max="30" value="10"><span class="fx-val" id="fcSparksVal">10</span></label>
      <label><span class="fx-lbl">Spark speed</span><input type="range" id="fcSpeed" min="1" max="10" value="5"><span class="fx-val" id="fcSpeedVal">5</span></label>
      <label><span class="fx-lbl">Spark size</span><input type="range" id="fcSize" min="1" max="5" value="2"><span class="fx-val" id="fcSizeVal">2</span></label>
      <label><span class="fx-lbl">Max height</span><input type="range" id="fcMaxH" min="10" max="150" value="40"><span class="fx-val" id="fcMaxHVal">40</span></label>
      <label><span class="fx-lbl">Direction</span><select id="fcDir"><option value="all">All</option><option value="up">Up</option><option value="angled">Angled</option></select></label>
      <label id="fcAngleRow" style="display:none"><span class="fx-lbl">Angle °</span><input type="range" id="fcAngle" min="0" max="360" value="0"><span class="fx-val" id="fcAngleVal">0°</span></label>
      <label><span class="fx-lbl">Color</span><input type="color" id="fcColor" value="#ff6600"><span class="fx-val" id="fcColorVal">#ff6600</span></label>
      <label><span class="fx-lbl">Glow radius</span><input type="range" id="fcGlow" min="0" max="100" value="30"><span class="fx-val" id="fcGlowVal">30</span></label>
      <label><span class="fx-lbl">Glow intensity</span><input type="range" id="fcGlowInt" min="5" max="100" value="20"><span class="fx-val" id="fcGlowIntVal">0.20</span></label>
      <label><span class="fx-lbl">Centers</span><input type="checkbox" id="fcCenters" checked><span class="fx-val">show</span></label>
      <div style="margin-top:4px"><button class="tbtn" style="color:#cc4444;border-color:#cc444433;font-size:9px;width:100%" onclick="Editor.Smoke.deleteSelected()">Delete Fire</button></div>`;
    sidebar.appendChild(fCtrl);

    const S = Editor.Smoke;
    const sw = (id, prop) => { document.getElementById(id).oninput = e => S.updateSelected(prop, +e.target.value); };
    sw('fcSparks','sparkCount'); sw('fcSpeed','sparkSpeed'); sw('fcSize','sparkSize');
    sw('fcMaxH','maxHeight'); sw('fcGlow','glowRadius'); sw('fcAngle','angle');
    document.getElementById('fcGlowInt').oninput = e => S.updateSelected('glowIntensity', +e.target.value / 100);
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
    document.getElementById('fcSpeedVal').textContent = fx.sparkSpeed;
    document.getElementById('fcSize').value = fx.sparkSize;
    document.getElementById('fcSizeVal').textContent = fx.sparkSize;
    document.getElementById('fcMaxH').value = fx.maxHeight;
    document.getElementById('fcMaxHVal').textContent = fx.maxHeight;
    document.getElementById('fcDir').value = fx.direction;
    document.getElementById('fcAngleRow').style.display = fx.direction === 'angled' ? '' : 'none';
    document.getElementById('fcAngle').value = fx.angle || 0;
    document.getElementById('fcAngleVal').textContent = (fx.angle || 0) + '°';
    document.getElementById('fcColor').value = fx.color;
    document.getElementById('fcColorVal').textContent = fx.color;
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
      direction: 'all', angle: 0, maxHeight: 40,
      color: '#ff6600', glowRadius: 30, glowIntensity: 0.2
    }, opts || {});

    const g = document.createElementNS(NS, 'g');
    g.id = id; g.style.cursor = 'grab';
    g.classList.add('smokefx-entity');

    const defs = C.svg.querySelector('defs');

    // Glow — radial gradient like lights (no filter = no square artifact!)
    const gradId = 'fire-grad-' + id;
    const grad = document.createElementNS(NS, 'radialGradient');
    grad.id = gradId;
    grad.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="${fx.glowIntensity}"/>
      <stop offset="60%" stop-color="${fx.color}" stop-opacity="${fx.glowIntensity * 0.4}"/>
      <stop offset="100%" stop-color="${fx.color}" stop-opacity="0"/>`;
    defs.appendChild(grad);
    fx._gradEl = grad; fx._gradId = gradId;

    const glow = document.createElementNS(NS, 'circle');
    glow.setAttribute('cx', fx.x); glow.setAttribute('cy', fx.y);
    glow.setAttribute('r', fx.glowRadius);
    glow.setAttribute('fill', `url(#${gradId})`);
    g.appendChild(glow);
    fx._glowEl = glow;

    // Transparent hit area for click/drag
    const hitArea = document.createElementNS(NS, 'circle');
    hitArea.setAttribute('cx', x); hitArea.setAttribute('cy', y);
    hitArea.setAttribute('r', Math.max(fx.glowRadius, fx.maxHeight));
    hitArea.setAttribute('fill', 'transparent'); hitArea.setAttribute('stroke', 'none');
    hitArea.style.pointerEvents = 'fill';
    g.appendChild(hitArea);
    fx._hitArea = hitArea;

    // Core — 4 overlapping flickering circles
    fx._coreEls = [];
    const coreColors = [fx.color, '#ffaa00', '#ffdd44', '#ff4400'];
    for (let i = 0; i < 4; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', fx.x); c.setAttribute('cy', fx.y);
      c.setAttribute('r', 3 + Math.random() * 4);
      c.setAttribute('fill', coreColors[i]);
      c.setAttribute('opacity', (0.5 + Math.random() * 0.4).toFixed(2));
      c.style.mixBlendMode = 'screen';
      g.appendChild(c);
      fx._coreEls.push(c);
    }

    // Center dot (toggleable)
    const center = document.createElementNS(NS, 'circle');
    center.setAttribute('cx', x); center.setAttribute('cy', y); center.setAttribute('r', '3');
    center.setAttribute('fill', '#ff8844'); center.setAttribute('opacity', '0.7');
    center.style.display = this.showCenters ? '' : 'none';
    g.appendChild(center);
    fx._centerDot = center;

    // Sparks container
    const sparksG = document.createElementNS(NS, 'g');
    sparksG.classList.add('fire-sparks');
    g.appendChild(sparksG);
    fx._sparksEl = sparksG;
    this._buildSparks(fx);

    const selUI = document.getElementById('selUI');
    C.svg.insertBefore(g, selUI);
    fx.el = g;
    C.allSmokeFx.push(fx);

    g.onmousedown = e => { e.stopPropagation(); SM.selectEffect(fx); SM.startDrag(e, fx); };
    if (!skipSelect) SM.selectEffect(fx);
    Editor.State.syncZOrderFromDOM();
    SM.startAnimation();
    return fx;
  },

  _buildSparks(fx) {
    const NS = Editor.Core.NS;
    while (fx._sparksEl.firstChild) fx._sparksEl.removeChild(fx._sparksEl.firstChild);
    for (let i = 0; i < fx.sparkCount; i++) {
      const spark = document.createElementNS(NS, 'circle');
      const angle = this._sparkAngle(fx.direction, fx.angle);
      const dist = Math.random() * fx.maxHeight * 0.3;
      spark.setAttribute('cx', fx.x + Math.cos(angle) * dist);
      spark.setAttribute('cy', fx.y + Math.sin(angle) * dist);
      spark.setAttribute('r', (0.5 + Math.random() * fx.sparkSize).toFixed(1));
      const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffdd88' : fx.color;
      spark.setAttribute('fill', col);
      spark.setAttribute('opacity', (0.4 + Math.random() * 0.5).toFixed(2));
      const dur = (0.6 + Math.random() * (1.2 / (fx.sparkSpeed * 0.2))).toFixed(2);
      const delay = (Math.random() * 2).toFixed(2);
      spark.style.animation = `sparkFloat ${dur}s ${delay}s ease-in infinite`;
      spark.style.setProperty('--spark-dist', `-${fx.maxHeight}px`);
      // Direction: set CSS custom properties for x offset
      const xDrift = this._sparkXDrift(fx.direction, fx.angle);
      spark.style.setProperty('--spark-x', `${xDrift}px`);
      fx._sparksEl.appendChild(spark);
    }
  },

  _sparkAngle(dir, angle) {
    if (dir === 'up') return -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    if (dir === 'angled') {
      const baseRad = ((angle || 0) - 90) * Math.PI / 180; // -90 because 0° = up
      return baseRad + (Math.random() - 0.5) * 0.8;
    }
    return Math.random() * Math.PI * 2;
  },

  _sparkXDrift(dir, angle) {
    if (dir === 'all') return (Math.random() - 0.5) * 20;
    if (dir === 'up') return (Math.random() - 0.5) * 6;
    if (dir === 'angled') {
      const baseRad = ((angle || 0)) * Math.PI / 180;
      return Math.sin(baseRad) * (10 + Math.random() * 15);
    }
    return 0;
  },

  applyEffect(fx) {
    // Update glow gradient
    if (fx._gradEl) {
      fx._gradEl.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="${fx.glowIntensity}"/>
        <stop offset="60%" stop-color="${fx.color}" stop-opacity="${fx.glowIntensity * 0.4}"/>
        <stop offset="100%" stop-color="${fx.color}" stop-opacity="0"/>`;
    }
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
      const colors = [fx.color, '#ffaa00', '#ffdd44', '#ff4400'];
      fx._coreEls.forEach((c, i) => {
        c.setAttribute('cx', fx.x); c.setAttribute('cy', fx.y);
        c.setAttribute('fill', colors[i % colors.length]);
      });
    }
    this._buildSparks(fx);
    if (fx.selRing) {
      fx.selRing.setAttribute('cx', fx.x); fx.selRing.setAttribute('cy', fx.y);
      fx.selRing.setAttribute('r', fx.maxHeight);
    }
  },

  tickFire(fx, t, idx) {
    // Flicker core circles
    if (fx._coreEls) {
      for (let j = 0; j < fx._coreEls.length; j++) {
        const c = fx._coreEls[j];
        c.setAttribute('opacity', (0.3 + 0.6 * Math.random()).toFixed(2));
        c.setAttribute('r', (2 + Math.random() * 5).toFixed(1));
        c.setAttribute('cx', fx.x + (Math.random() - 0.5) * 3);
        c.setAttribute('cy', fx.y + (Math.random() - 0.5) * 3);
      }
    }
    // Pulse glow intensity
    if (fx._glowEl) {
      const baseInt = fx.glowIntensity || 0.2;
      const pulse = baseInt * (0.7 + 0.3 * Math.sin(t * 0.004 + idx * 1.3));
      if (fx._gradEl) {
        fx._gradEl.innerHTML = `<stop offset="0%" stop-color="${fx.color}" stop-opacity="${pulse.toFixed(3)}"/>
          <stop offset="60%" stop-color="${fx.color}" stop-opacity="${(pulse * 0.4).toFixed(3)}"/>
          <stop offset="100%" stop-color="${fx.color}" stop-opacity="0"/>`;
      }
    }
  }
};
