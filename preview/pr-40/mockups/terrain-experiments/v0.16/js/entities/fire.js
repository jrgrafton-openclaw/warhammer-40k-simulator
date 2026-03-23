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
      <label><span class="fx-lbl">Direction</span><select id="fcDir"><option value="all">All</option><option value="up">Up</option><option value="angled">Angled</option></select></label>
      <label><span class="fx-lbl">Decay dist</span><input type="range" id="fcDecay" min="10" max="100" value="40"><span class="fx-val" id="fcDecayVal">40</span></label>
      <label><span class="fx-lbl">Color</span><input type="color" id="fcColor" value="#ff6600"><span class="fx-val" id="fcColorVal">#ff6600</span></label>
      <label><span class="fx-lbl">Glow radius</span><input type="range" id="fcGlow" min="0" max="50" value="15"><span class="fx-val" id="fcGlowVal">15</span></label>
      <div style="margin-top:4px"><button class="tbtn" style="color:#cc4444;border-color:#cc444433;font-size:9px;width:100%" onclick="Editor.Smoke.deleteSelected()">Delete Fire</button></div>`;
    sidebar.appendChild(fCtrl);

    // Wire fire controls
    const S = Editor.Smoke;
    const sw = (id, prop) => { document.getElementById(id).oninput = e => S.updateSelected(prop, +e.target.value); };
    sw('fcSparks','sparkCount'); sw('fcSpeed','sparkSpeed'); sw('fcSize','sparkSize');
    sw('fcDecay','decayDist'); sw('fcGlow','glowRadius');
    document.getElementById('fcColor').oninput = e => S.updateSelected('color', e.target.value);
    document.getElementById('fcDir').onchange = e => S.updateSelected('direction', e.target.value);
  },

  refreshControls(fx) {
    document.getElementById('fcSparks').value = fx.sparkCount;
    document.getElementById('fcSparksVal').textContent = fx.sparkCount;
    document.getElementById('fcSpeed').value = fx.sparkSpeed;
    document.getElementById('fcSpeedVal').textContent = fx.sparkSpeed;
    document.getElementById('fcSize').value = fx.sparkSize;
    document.getElementById('fcSizeVal').textContent = fx.sparkSize;
    document.getElementById('fcDir').value = fx.direction;
    document.getElementById('fcDecay').value = fx.decayDist;
    document.getElementById('fcDecayVal').textContent = fx.decayDist;
    document.getElementById('fcColor').value = fx.color;
    document.getElementById('fcColorVal').textContent = fx.color;
    document.getElementById('fcGlow').value = fx.glowRadius;
    document.getElementById('fcGlowVal').textContent = fx.glowRadius;
  },

  addFire(x, y, opts, skipSelect, restoreId) {
    const SM = Editor.Smoke;
    const C = Editor.Core, NS = C.NS;
    const id = restoreId || ('fx' + (SM.fxId++));
    const fx = Object.assign({
      id, type: 'fire', x, y,
      sparkCount: 10, sparkSpeed: 5, sparkSize: 2,
      direction: 'all', decayDist: 40,
      color: '#ff6600', glowRadius: 15
    }, opts || {});

    const g = document.createElementNS(NS, 'g');
    g.id = id; g.style.cursor = 'grab';
    g.classList.add('smokefx-entity');

    const defs = C.svg.querySelector('defs');

    // Glow — blurred circle (objectBoundingBox, no square artifacts)
    if (fx.glowRadius > 0) {
      const glowFiltId = 'gfilt-' + id;
      const gf = document.createElementNS(NS, 'filter');
      gf.id = glowFiltId;
      const gb = document.createElementNS(NS, 'feGaussianBlur');
      gb.setAttribute('stdDeviation', String(fx.glowRadius * 0.6));
      gf.appendChild(gb); defs.appendChild(gf);
      fx._glowFiltId = glowFiltId; fx._glowFiltEl = gf; fx._glowBlur = gb;

      const glow = document.createElementNS(NS, 'circle');
      glow.setAttribute('cx', fx.x); glow.setAttribute('cy', fx.y);
      glow.setAttribute('r', fx.glowRadius);
      glow.setAttribute('fill', fx.color); glow.setAttribute('opacity', '0.08');
      glow.setAttribute('filter', `url(#${glowFiltId})`);
      glow.classList.add('fire-glow');
      g.appendChild(glow);
      fx._glowEl = glow;
    }

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
      const angle = this._sparkAngle(fx.direction);
      const dist = Math.random() * fx.decayDist * 0.5;
      spark.setAttribute('cx', fx.x + Math.cos(angle) * dist);
      spark.setAttribute('cy', fx.y + Math.sin(angle) * dist);
      spark.setAttribute('r', (0.5 + Math.random() * fx.sparkSize).toFixed(1));
      const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffdd88' : fx.color;
      spark.setAttribute('fill', col);
      spark.setAttribute('opacity', (0.4 + Math.random() * 0.5).toFixed(2));
      const dur = (0.6 + Math.random() * (1.2 / (fx.sparkSpeed * 0.2))).toFixed(2);
      const delay = (Math.random() * 2).toFixed(2);
      spark.style.animation = `sparkFloat ${dur}s ${delay}s ease-in infinite`;
      spark.style.setProperty('--spark-dist', `-${fx.decayDist}px`);
      fx._sparksEl.appendChild(spark);
    }
  },

  _sparkAngle(dir) {
    if (dir === 'up') return -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    if (dir === 'angled') return -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    return Math.random() * Math.PI * 2;
  },

  applyEffect(fx) {
    if (fx._glowEl) {
      fx._glowEl.setAttribute('cx', fx.x); fx._glowEl.setAttribute('cy', fx.y);
      fx._glowEl.setAttribute('r', fx.glowRadius);
      fx._glowEl.setAttribute('fill', fx.color);
      if (fx._glowBlur) fx._glowBlur.setAttribute('stdDeviation', String(fx.glowRadius * 0.6));
      fx._glowEl.style.display = fx.glowRadius > 0 ? '' : 'none';
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
      fx.selRing.setAttribute('r', fx.decayDist);
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
    // Pulse glow
    if (fx._glowEl) {
      const pulse = 0.04 + 0.04 * Math.sin(t * 0.003 + idx * 1.3);
      fx._glowEl.setAttribute('opacity', pulse.toFixed(3));
    }
  }
};
