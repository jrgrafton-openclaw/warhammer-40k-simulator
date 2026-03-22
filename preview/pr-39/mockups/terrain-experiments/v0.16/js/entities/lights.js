/* ══════════════════════════════════════════════════════════════
   Editor Lights — draggable point lights with color/radius/intensity
   Renders as radial gradient circles on the SVG battlefield.
══════════════════════════════════════════════════════════════ */

Editor.Lights = {
  lid: 0,
  selectedLight: null,
  showCenters: true,

  // ── Add light button (called from sidebar, injected at init) ──
  injectSidebarControls() {
    const sidebar = document.querySelector('.sidebar.left');
    const h = document.createElement('h3'); h.textContent = 'Lights';
    sidebar.appendChild(h);

    const row = document.createElement('div'); row.className = 'toggle-row';
    const btn = document.createElement('button'); btn.className = 'tbtn';
    btn.textContent = '+ Add Light';
    btn.onclick = () => {
      const light = this.addLight(360, 264, '#ffaa44', 80, 0.3);
      Editor.Undo.record(Editor.Commands.AddLight.create(Editor.Commands._captureLight(light)));
      Editor.State.dispatch({ type: 'ADD_LIGHT' });
      Editor.Layers.rebuild();
    };
    row.appendChild(btn);
    sidebar.appendChild(row);

    // Controls container (shown when a light is selected)
    const ctrl = document.createElement('div');
    ctrl.id = 'lightCtrl'; ctrl.className = 'light-controls'; ctrl.style.display = 'none';
    ctrl.innerHTML = `
      <label>Color <input type="color" id="lcColor" value="#ffaa44"> <span class="lc-val" id="lcColorVal">#ffaa44</span></label>
      <label>Radius <input type="range" id="lcRadius" min="20" max="300" value="80"> <span class="lc-val" id="lcRadiusVal">80</span></label>
      <label>Intensity <input type="range" id="lcIntensity" min="5" max="100" value="30"> <span class="lc-val" id="lcIntensityVal">0.30</span></label>
      <label>Animation <select id="lcPulseType"><option value="none">None</option><option value="pulse">Pulse</option><option value="flicker">Flicker</option><option value="breathe">Breathe</option></select></label>
      <div id="lcPulseExtras" style="display:none">
        <label id="lcPulseSpeedRow">Speed <input type="range" id="lcPulseSpeed" min="2" max="30" value="10"> <span class="lc-val" id="lcPulseSpeedVal">1.0</span></label>
        <label>Int. Amp <input type="range" id="lcPulseIntAmp" min="0" max="50" value="15"> <span class="lc-val" id="lcPulseIntAmpVal">0.15</span></label>
        <label>Rad. Amp <input type="range" id="lcPulseRadAmp" min="0" max="50" value="10"> <span class="lc-val" id="lcPulseRadAmpVal">10</span></label>
      </div>
    `;
    sidebar.appendChild(ctrl);

    // Wire up controls
    document.getElementById('lcColor').oninput = e => this.updateSelected('color', e.target.value);
    document.getElementById('lcRadius').oninput = e => this.updateSelected('radius', parseInt(e.target.value));
    document.getElementById('lcIntensity').oninput = e => this.updateSelected('intensity', parseInt(e.target.value) / 100);
    document.getElementById('lcPulseType').oninput = e => {
      this.updateSelected('pulseType', e.target.value);
      var extras = document.getElementById('lcPulseExtras');
      if (extras) extras.style.display = e.target.value === 'none' ? 'none' : '';
      var speedRow = document.getElementById('lcPulseSpeedRow');
      if (speedRow) speedRow.style.display = e.target.value === 'breathe' ? 'none' : '';
    };
    document.getElementById('lcPulseSpeed').oninput = e => {
      var v = parseInt(e.target.value) / 10;
      this.updateSelected('pulseSpeed', v);
      var span = document.getElementById('lcPulseSpeedVal');
      if (span) span.textContent = v.toFixed(1);
    };
    document.getElementById('lcPulseIntAmp').oninput = e => {
      var v = parseInt(e.target.value) / 100;
      this.updateSelected('pulseIntensityAmp', v);
      var span = document.getElementById('lcPulseIntAmpVal');
      if (span) span.textContent = v.toFixed(2);
    };
    document.getElementById('lcPulseRadAmp').oninput = e => {
      var v = parseInt(e.target.value);
      this.updateSelected('pulseRadiusAmp', v);
      var span = document.getElementById('lcPulseRadAmpVal');
      if (span) span.textContent = v;
    };
  },

  updateSelected(prop, val) {
    if (!this.selectedLight) return;
    this.selectedLight[prop] = val;
    this.applyLight(this.selectedLight);
    this.refreshControls();
    Editor.State.dispatch({ type: 'UPDATE_LIGHT' });
  },

  selectLight(light) {
    // Remove previous selection ring
    if (this.selectedLight) this.removeSelectionRing(this.selectedLight);
    this.selectedLight = light;
    this.applySelectionRing(light);
    this.refreshControls();
    document.getElementById('lightCtrl').style.display = '';
  },

  deselectLight() {
    if (this.selectedLight) this.removeSelectionRing(this.selectedLight);
    this.selectedLight = null;
    document.getElementById('lightCtrl').style.display = 'none';
  },

  applySelectionRing(light) {
    // Only show ring if this light is selected
    if (light !== this.selectedLight) return;
    this.removeSelectionRing(light);
    const NS = Editor.Core.NS;
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', light.x); ring.setAttribute('cy', light.y);
    ring.setAttribute('r', light.radius);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#00d4ff');
    ring.setAttribute('stroke-width', '1.5');
    ring.setAttribute('stroke-dasharray', '4,3');
    ring.classList.add('light-sel-ring');
    light.el.appendChild(ring);
    light.selRing = ring;
  },

  removeSelectionRing(light) {
    if (light.selRing) { light.selRing.remove(); light.selRing = null; }
  },

  refreshControls() {
    const l = this.selectedLight;
    if (!l) return;
    document.getElementById('lcColor').value = l.color;
    document.getElementById('lcColorVal').textContent = l.color;
    document.getElementById('lcRadius').value = l.radius;
    document.getElementById('lcRadiusVal').textContent = l.radius;
    document.getElementById('lcIntensity').value = Math.round(l.intensity * 100);
    document.getElementById('lcIntensityVal').textContent = l.intensity.toFixed(2);
    // Pulse controls
    var ptSel = document.getElementById('lcPulseType');
    if (ptSel) ptSel.value = l.pulseType || 'none';
    var psSlider = document.getElementById('lcPulseSpeed');
    if (psSlider) psSlider.value = Math.round((l.pulseSpeed || 1.0) * 10);
    var piSlider = document.getElementById('lcPulseIntAmp');
    if (piSlider) piSlider.value = Math.round((l.pulseIntensityAmp != null ? l.pulseIntensityAmp : 0.15) * 100);
    var prSlider = document.getElementById('lcPulseRadAmp');
    if (prSlider) prSlider.value = l.pulseRadiusAmp != null ? l.pulseRadiusAmp : 10;
    // Show/hide amplitude controls
    var pt = l.pulseType || 'none';
    var pulseExtras = document.getElementById('lcPulseExtras');
    if (pulseExtras) pulseExtras.style.display = pt === 'none' ? 'none' : '';
    // Hide speed slider for breathe (fixed at 0.3)
    var speedRow = document.getElementById('lcPulseSpeedRow');
    if (speedRow) speedRow.style.display = pt === 'breathe' ? 'none' : '';
  },

  addLight(x, y, color, radius, intensity, skipSelect, restoreId, pulseOpts) {
    const C = Editor.Core, NS = C.NS;
    const id = restoreId || ('l' + (this.lid++));

    // Create SVG group with radial gradient glow
    const g = document.createElementNS(NS, 'g');
    g.style.cursor = 'grab';

    // Unique gradient for this light
    const gradId = 'light-grad-' + id;
    const defs = C.svg.querySelector('defs');
    const grad = document.createElementNS(NS, 'radialGradient');
    grad.id = gradId;
    grad.innerHTML = `<stop offset="0%" stop-color="${color}" stop-opacity="${intensity}"/>
      <stop offset="70%" stop-color="${color}" stop-opacity="${intensity * 0.3}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>`;
    defs.appendChild(grad);

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r', radius); circle.setAttribute('fill', `url(#${gradId})`);
    g.appendChild(circle);

    // Center indicator (dot + crosshair)
    const centerG = document.createElementNS(NS, 'g');
    centerG.classList.add('light-center');
    if (!this.showCenters) centerG.style.display = 'none';
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 3);
    dot.setAttribute('fill', '#00d4ff'); dot.setAttribute('opacity', '0.9');
    const ch1 = document.createElementNS(NS, 'line');
    ch1.setAttribute('x1', x-8); ch1.setAttribute('y1', y); ch1.setAttribute('x2', x+8); ch1.setAttribute('y2', y);
    ch1.setAttribute('stroke', '#00d4ff'); ch1.setAttribute('stroke-width', '0.8'); ch1.setAttribute('opacity', '0.5');
    const ch2 = document.createElementNS(NS, 'line');
    ch2.setAttribute('x1', x); ch2.setAttribute('y1', y-8); ch2.setAttribute('x2', x); ch2.setAttribute('y2', y+8);
    ch2.setAttribute('stroke', '#00d4ff'); ch2.setAttribute('stroke-width', '0.8'); ch2.setAttribute('opacity', '0.5');
    centerG.appendChild(ch1); centerG.appendChild(ch2); centerG.appendChild(dot);
    g.appendChild(centerG);

    document.getElementById('lightLayer').appendChild(g);

    var po = pulseOpts || {};
    const light = {
      id, x, y, color, radius, intensity, el: g, circle, grad, gradId, centerG,
      pulseType: po.pulseType || 'none',
      pulseSpeed: po.pulseSpeed != null ? po.pulseSpeed : 1.0,
      pulseIntensityAmp: po.pulseIntensityAmp != null ? po.pulseIntensityAmp : 0.15,
      pulseRadiusAmp: po.pulseRadiusAmp != null ? po.pulseRadiusAmp : 10
    };
    C.allLights.push(light);

    g.onmousedown = e => { e.stopPropagation(); this.selectLight(light); this.startDrag(e, light); };

    if (!skipSelect) this.selectLight(light);
    return light;
  },

  applyLight(l) {
    l.circle.setAttribute('cx', l.x); l.circle.setAttribute('cy', l.y);
    l.circle.setAttribute('r', l.radius);
    this.applySelectionRing(l);
    // Update center indicator position
    if (l.centerG) {
      const els = l.centerG.children;
      // line horiz
      els[0].setAttribute('x1', l.x-8); els[0].setAttribute('y1', l.y);
      els[0].setAttribute('x2', l.x+8); els[0].setAttribute('y2', l.y);
      // line vert
      els[1].setAttribute('x1', l.x); els[1].setAttribute('y1', l.y-8);
      els[1].setAttribute('x2', l.x); els[1].setAttribute('y2', l.y+8);
      // dot
      els[2].setAttribute('cx', l.x); els[2].setAttribute('cy', l.y);
    }
    // Update gradient
    l.grad.innerHTML = `<stop offset="0%" stop-color="${l.color}" stop-opacity="${l.intensity}"/>
      <stop offset="70%" stop-color="${l.color}" stop-opacity="${l.intensity * 0.3}"/>
      <stop offset="100%" stop-color="${l.color}" stop-opacity="0"/>`;
  },

  startDrag(e, light) {
    e.preventDefault();
    const C = Editor.Core;
    const fromX = light.x, fromY = light.y;
    const p0 = C.svgPt(e.clientX, e.clientY), ox = p0.x - light.x, oy = p0.y - light.y;
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      light.x = p.x - ox; light.y = p.y - oy;
      this.applyLight(light);
    };
    const up = () => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      if (light.x !== fromX || light.y !== fromY) {
        Editor.Undo.record(Editor.Commands.MoveLight.create(light.id, fromX, fromY, light.x, light.y));
      }
      Editor.State.dispatch({ type: 'MOVE_LIGHT' });
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  removeLight(id) {
    const C = Editor.Core;
    const idx = C.allLights.findIndex(l => l.id === id);
    if (idx === -1) return;
    const light = C.allLights[idx];
    const data = Editor.Commands._captureLight(light);
    const cmd = Editor.Commands.DeleteLight.create(data);
    cmd.apply();
    Editor.Undo.record(cmd);
    Editor.State.dispatch({ type: 'DELETE_LIGHT' });
    Editor.Layers.rebuild();
  },

  removeAll() {
    const C = Editor.Core;
    C.allLights.forEach(l => { l.el.remove(); l.grad.remove(); });
    C.allLights = [];
    this.selectedLight = null;
  },

  toggleCenters() {
    this.showCenters = !this.showCenters;
    Editor.Core.allLights.forEach(l => {
      if (l.centerG) l.centerG.style.display = this.showCenters ? '' : 'none';
    });
  },

  serialize() {
    return Editor.Core.allLights.map(l => ({
      id: l.id, x: l.x, y: l.y, color: l.color, radius: l.radius, intensity: l.intensity,
      pulseType: l.pulseType || 'none',
      pulseSpeed: l.pulseSpeed != null ? l.pulseSpeed : 1.0,
      pulseIntensityAmp: l.pulseIntensityAmp != null ? l.pulseIntensityAmp : 0.15,
      pulseRadiusAmp: l.pulseRadiusAmp != null ? l.pulseRadiusAmp : 10
    }));
  },

  // ── Animation loop ──
  _animId: null,

  startAnimLoop() {
    var rAF = typeof window !== 'undefined' && window.requestAnimationFrame;
    if (!rAF) return;
    var self = this;
    function tick(time) {
      var t = time / 1000; // seconds
      var lights = Editor.Core.allLights;
      for (var i = 0; i < lights.length; i++) {
        var l = lights[i];
        if (!l.pulseType || l.pulseType === 'none') continue;

        var speed = l.pulseType === 'breathe' ? 0.3 : (l.pulseSpeed || 1.0);
        var intAmp = l.pulseIntensityAmp != null ? l.pulseIntensityAmp : 0.15;
        var radAmp = l.pulseRadiusAmp != null ? l.pulseRadiusAmp : 10;
        var mod;
        if (l.pulseType === 'flicker') {
          mod = Math.sin(t * speed * 7.3) * Math.sin(t * speed * 13.1) * Math.sin(t * speed * 23.7);
        } else {
          // pulse and breathe both use sine
          mod = Math.sin(t * speed * Math.PI * 2);
        }

        var visIntensity = l.intensity + intAmp * mod;
        visIntensity = Math.max(0, Math.min(1, visIntensity));
        var visRadius = l.radius + radAmp * mod;
        visRadius = Math.max(1, visRadius);

        // Update gradient stops (visual only)
        l.grad.innerHTML = '<stop offset="0%" stop-color="' + l.color + '" stop-opacity="' + visIntensity + '"/>' +
          '<stop offset="70%" stop-color="' + l.color + '" stop-opacity="' + (visIntensity * 0.3) + '"/>' +
          '<stop offset="100%" stop-color="' + l.color + '" stop-opacity="0"/>';
        l.circle.setAttribute('r', visRadius);
      }
      self._animId = rAF(tick);
    }
    this._animId = rAF(tick);
  },

  stopAnimLoop() {
    var cAF = typeof window !== 'undefined' && window.cancelAnimationFrame;
    if (this._animId != null && cAF) {
      cAF(this._animId);
      this._animId = null;
    }
  }
};

// Inject sidebar controls on load
Editor.Lights.injectSidebarControls();
Editor.Lights.startAnimLoop();
