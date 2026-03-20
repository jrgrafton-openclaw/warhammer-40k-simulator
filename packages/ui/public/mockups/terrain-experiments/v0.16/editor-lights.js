/* ══════════════════════════════════════════════════════════════
   Editor Lights — draggable point lights with color/radius/intensity
   Renders as radial gradient circles on the SVG battlefield.
══════════════════════════════════════════════════════════════ */

Editor.Lights = {
  lid: 0,
  selectedLight: null,

  // ── Add light button (called from sidebar, injected at init) ──
  injectSidebarControls() {
    const sidebar = document.querySelector('.sidebar.left');
    const h = document.createElement('h3'); h.textContent = 'Lights';
    sidebar.appendChild(h);

    const row = document.createElement('div'); row.className = 'toggle-row';
    const btn = document.createElement('button'); btn.className = 'tbtn';
    btn.textContent = '+ Add Light';
    btn.onclick = () => {
      Editor.Undo.push();
      this.addLight(360, 264, '#ffaa44', 80, 0.3);
      Editor.Persistence.save();
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
    `;
    sidebar.appendChild(ctrl);

    // Wire up controls
    document.getElementById('lcColor').oninput = e => this.updateSelected('color', e.target.value);
    document.getElementById('lcRadius').oninput = e => this.updateSelected('radius', parseInt(e.target.value));
    document.getElementById('lcIntensity').oninput = e => this.updateSelected('intensity', parseInt(e.target.value) / 100);
  },

  updateSelected(prop, val) {
    if (!this.selectedLight) return;
    this.selectedLight[prop] = val;
    this.applyLight(this.selectedLight);
    this.refreshControls();
    Editor.Persistence.save();
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
  },

  addLight(x, y, color, radius, intensity, skipSelect) {
    const C = Editor.Core, NS = C.NS;
    const id = 'l' + (this.lid++);

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

    document.getElementById('lightLayer').appendChild(g);

    const light = { id, x, y, color, radius, intensity, el: g, circle, grad, gradId };
    C.allLights.push(light);

    g.onmousedown = e => { e.stopPropagation(); this.selectLight(light); this.startDrag(e, light); };

    if (!skipSelect) this.selectLight(light);
    return light;
  },

  applyLight(l) {
    l.circle.setAttribute('cx', l.x); l.circle.setAttribute('cy', l.y);
    l.circle.setAttribute('r', l.radius);
    this.applySelectionRing(l);
    // Update gradient
    l.grad.innerHTML = `<stop offset="0%" stop-color="${l.color}" stop-opacity="${l.intensity}"/>
      <stop offset="70%" stop-color="${l.color}" stop-opacity="${l.intensity * 0.3}"/>
      <stop offset="100%" stop-color="${l.color}" stop-opacity="0"/>`;
  },

  startDrag(e, light) {
    e.preventDefault();
    const C = Editor.Core;
    Editor.Undo.push();
    const p0 = C.svgPt(e.clientX, e.clientY), ox = p0.x - light.x, oy = p0.y - light.y;
    const mv = e2 => {
      const p = C.svgPt(e2.clientX, e2.clientY);
      light.x = p.x - ox; light.y = p.y - oy;
      this.applyLight(light);
    };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); Editor.Persistence.save(); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },

  removeLight(id) {
    const C = Editor.Core;
    const idx = C.allLights.findIndex(l => l.id === id);
    if (idx === -1) return;
    Editor.Undo.push();
    const light = C.allLights[idx];
    light.el.remove();
    light.grad.remove();
    C.allLights.splice(idx, 1);
    if (this.selectedLight === light) this.deselectLight();
    Editor.Persistence.save();
    Editor.Layers.rebuild();
  },

  removeAll() {
    const C = Editor.Core;
    C.allLights.forEach(l => { l.el.remove(); l.grad.remove(); });
    C.allLights = [];
    this.selectedLight = null;
  },

  serialize() {
    return Editor.Core.allLights.map(l => ({ id: l.id, x: l.x, y: l.y, color: l.color, radius: l.radius, intensity: l.intensity }));
  }
};

// Inject sidebar controls on load
Editor.Lights.injectSidebarControls();
