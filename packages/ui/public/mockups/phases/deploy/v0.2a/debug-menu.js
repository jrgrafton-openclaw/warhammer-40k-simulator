/**
 * debug-menu.js — v0.2a Edgeless Battlefield Debug Menu
 * Toggle with 'D' key. All values persist in localStorage.
 */
(function initDebugMenu() {
  var STORAGE_KEY = 'wh40k-debug-v02a';
  var NS = 'http://www.w3.org/2000/svg';

  // ── Defaults ──────────────────────────────────────────
  var defaults = {
    bgColor: '#000000',
    fog1On: true, fog1Opacity: 1.0, fog1Speed: 20,
    fog2On: true, fog2Opacity: 1.0, fog2Speed: 15,
    fog3On: true, fog3Opacity: 1.0, fog3Speed: 11,
    vigTOn: true, vigTDepth: 400, vigTOpacity: 0.95,
    vigBOn: true, vigBDepth: 400, vigBOpacity: 0.95,
    vigLOn: true, vigLDepth: 400, vigLOpacity: 0.95,
    vigROn: true, vigRDepth: 400, vigROpacity: 0.95,
    vigColor: '#000000',
    zoneStaging: true, zoneDS: true, zoneReserves: true, zoneSeparator: true,
    fxOn: true, fxIntensity: 5, fxSpeed: 1.0,
    wispsOn: true
  };

  // ── Load / Save ───────────────────────────────────────
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign({}, defaults, JSON.parse(raw));
    } catch(e) { /* ignore */ }
    return Object.assign({}, defaults);
  }
  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) { /* ignore */ }
  }

  var state = load();

  // ── Build DOM ─────────────────────────────────────────
  var menu = document.createElement('div');
  menu.className = 'debug-menu';

  // Title
  menu.innerHTML = '<div class="dbg-title"><span>DEBUG MENU</span><span class="dbg-title-key">D</span></div>';

  // Helper: create section
  function section(title) {
    var sec = document.createElement('div');
    sec.className = 'dbg-section collapsed';
    var hdr = document.createElement('div');
    hdr.className = 'dbg-section-hdr';
    hdr.innerHTML = '<span>' + title + '</span><span class="dbg-chev">▾</span>';
    hdr.addEventListener('click', function() { sec.classList.toggle('collapsed'); });
    sec.appendChild(hdr);
    var body = document.createElement('div');
    body.className = 'dbg-section-body';
    sec.appendChild(body);
    menu.appendChild(sec);
    return body;
  }

  // Helper: toggle row
  function toggleRow(parent, label, on, onChange) {
    var row = document.createElement('div');
    row.className = 'dbg-row';
    var lbl = document.createElement('span');
    lbl.className = 'dbg-row-label';
    lbl.textContent = label;
    var tog = document.createElement('div');
    tog.className = 'dbg-toggle' + (on ? ' on' : '');
    tog.addEventListener('click', function() {
      var isOn = tog.classList.toggle('on');
      onChange(isOn);
    });
    row.appendChild(lbl);
    row.appendChild(tog);
    parent.appendChild(row);
    return tog;
  }

  // Helper: slider row
  function sliderRow(parent, label, min, max, step, val, unit, onChange) {
    var row = document.createElement('div');
    row.className = 'dbg-row';
    var lbl = document.createElement('span');
    lbl.className = 'dbg-row-label';
    lbl.textContent = label;
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'dbg-slider';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(val);
    var valSpan = document.createElement('span');
    valSpan.className = 'dbg-slider-val';
    valSpan.textContent = formatVal(val, unit);
    slider.addEventListener('input', function() {
      var v = parseFloat(slider.value);
      valSpan.textContent = formatVal(v, unit);
      onChange(v);
    });
    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(valSpan);
    parent.appendChild(row);
    return slider;
  }

  function formatVal(v, unit) {
    if (unit === 'px') return Math.round(v) + 'px';
    if (unit === 's') return v.toFixed(0) + 's';
    if (unit === 'x') return v.toFixed(1) + 'x';
    return v.toFixed(2);
  }

  // Helper: color row
  function colorRow(parent, label, val, onChange) {
    var row = document.createElement('div');
    row.className = 'dbg-row';
    var lbl = document.createElement('span');
    lbl.className = 'dbg-row-label';
    lbl.textContent = label;
    var picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'dbg-color';
    picker.value = val;
    picker.addEventListener('input', function() { onChange(picker.value); });
    row.appendChild(lbl);
    row.appendChild(picker);
    parent.appendChild(row);
    return picker;
  }

  // Helper: sub-label
  function subLabel(parent, text) {
    var d = document.createElement('div');
    d.className = 'dbg-sub-label';
    d.textContent = text;
    parent.appendChild(d);
  }

  // ══════════════════════════════════════════════════════
  // BACKGROUND SECTION
  // ══════════════════════════════════════════════════════
  var bgBody = section('BACKGROUND');
  colorRow(bgBody, 'Color', state.bgColor, function(v) {
    state.bgColor = v; applyBg(); save(state);
  });

  // ══════════════════════════════════════════════════════
  // FOG LAYERS SECTION
  // ══════════════════════════════════════════════════════
  var fogBody = section('FOG LAYERS');

  var fogLayers = [
    { key: '1', el: 'foglayer_01', onKey: 'fog1On', opKey: 'fog1Opacity', spKey: 'fog1Speed' },
    { key: '2', el: 'foglayer_02', onKey: 'fog2On', opKey: 'fog2Opacity', spKey: 'fog2Speed' },
    { key: '3', el: 'foglayer_03', onKey: 'fog3On', opKey: 'fog3Opacity', spKey: 'fog3Speed' }
  ];

  fogLayers.forEach(function(fl) {
    subLabel(fogBody, 'Layer ' + fl.key);
    toggleRow(fogBody, 'Visible', state[fl.onKey], function(on) {
      state[fl.onKey] = on; applyFog(); save(state);
    });
    sliderRow(fogBody, 'Opacity', 0, 1, 0.01, state[fl.opKey], '', function(v) {
      state[fl.opKey] = v; applyFog(); save(state);
    });
    sliderRow(fogBody, 'Speed', 3, 60, 1, state[fl.spKey], 's', function(v) {
      state[fl.spKey] = v; applyFog(); save(state);
    });
  });

  // ══════════════════════════════════════════════════════
  // VIGNETTE / EDGE GRADIENTS SECTION
  // ══════════════════════════════════════════════════════
  var vigBody = section('VIGNETTE');

  colorRow(vigBody, 'Color (all sides)', state.vigColor, function(v) {
    state.vigColor = v; applyVignette(); save(state);
  });

  var vigSides = [
    { label: 'Top', onKey: 'vigTOn', dKey: 'vigTDepth', oKey: 'vigTOpacity', rectId: 'vig-rect-t', gradId: 'vig-t', axis: 'h' },
    { label: 'Bottom', onKey: 'vigBOn', dKey: 'vigBDepth', oKey: 'vigBOpacity', rectId: 'vig-rect-b', gradId: 'vig-b', axis: 'h' },
    { label: 'Left', onKey: 'vigLOn', dKey: 'vigLDepth', oKey: 'vigLOpacity', rectId: 'vig-rect-l', gradId: 'vig-l', axis: 'w' },
    { label: 'Right', onKey: 'vigROn', dKey: 'vigRDepth', oKey: 'vigROpacity', rectId: 'vig-rect-r', gradId: 'vig-r', axis: 'w' }
  ];

  vigSides.forEach(function(vs) {
    subLabel(vigBody, vs.label);
    toggleRow(vigBody, 'Visible', state[vs.onKey], function(on) {
      state[vs.onKey] = on; applyVignette(); save(state);
    });
    sliderRow(vigBody, 'Depth', 0, 800, 10, state[vs.dKey], 'px', function(v) {
      state[vs.dKey] = v; applyVignette(); save(state);
    });
    sliderRow(vigBody, 'Opacity', 0, 1, 0.01, state[vs.oKey], '', function(v) {
      state[vs.oKey] = v; applyVignette(); save(state);
    });
  });

  // ══════════════════════════════════════════════════════
  // ZONES SECTION
  // ══════════════════════════════════════════════════════
  var zoneBody = section('ZONES');

  toggleRow(zoneBody, 'Staging', state.zoneStaging, function(on) {
    state.zoneStaging = on; applyZones(); save(state);
  });
  toggleRow(zoneBody, 'Deep Strike', state.zoneDS, function(on) {
    state.zoneDS = on; applyZones(); save(state);
  });
  toggleRow(zoneBody, 'Reserves', state.zoneReserves, function(on) {
    state.zoneReserves = on; applyZones(); save(state);
  });
  toggleRow(zoneBody, 'Board Edge Separator', state.zoneSeparator, function(on) {
    state.zoneSeparator = on; applyZones(); save(state);
  });

  // ══════════════════════════════════════════════════════
  // EXPLOSIONS SECTION
  // ══════════════════════════════════════════════════════
  var fxBody = section('EXPLOSIONS');

  toggleRow(fxBody, 'Enabled', state.fxOn, function(on) {
    state.fxOn = on; applyFx(); save(state);
  });
  sliderRow(fxBody, 'Intensity', 1, 10, 1, state.fxIntensity, '', function(v) {
    state.fxIntensity = v; applyFx(); save(state);
  });
  sliderRow(fxBody, 'Speed', 0.5, 3.0, 0.1, state.fxSpeed, 'x', function(v) {
    state.fxSpeed = v; applyFx(); save(state);
  });

  // ══════════════════════════════════════════════════════
  // WISPS / DEBRIS SECTION
  // ══════════════════════════════════════════════════════
  var wispBody = section('WISPS / DEBRIS');

  toggleRow(wispBody, 'Enabled', state.wispsOn, function(on) {
    state.wispsOn = on; applyFx(); save(state);
  });

  // ── Append menu to body ───────────────────────────────
  document.body.appendChild(menu);

  // ── Toggle with 'D' key ───────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.key === 'd' || e.key === 'D') {
      // Don't toggle if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      menu.classList.toggle('visible');
    }
  });

  // ══════════════════════════════════════════════════════
  // APPLY FUNCTIONS
  // ══════════════════════════════════════════════════════

  function applyBg() {
    var bf = document.getElementById('battlefield');
    if (bf) bf.style.background = state.bgColor;
    document.body.style.background = state.bgColor;
  }

  function applyFog() {
    fogLayers.forEach(function(fl) {
      var el = document.getElementById(fl.el);
      if (!el) return;
      el.style.display = state[fl.onKey] ? '' : 'none';
      // Set opacity multiplier — caps the animation's peak
      el.style.opacity = state[fl.opKey];
      // Modify scroll animation speed
      var scrollName = fl.key === '1' ? 'fog_scroll_slow' :
                       fl.key === '2' ? 'fog_scroll_med' : 'fog_scroll_fast';
      var opName = fl.key === '1' ? 'fog_opacity_01' :
                   fl.key === '2' ? 'fog_opacity_02' : 'fog_opacity_03';
      var opDuration = fl.key === '1' ? '14s' : fl.key === '2' ? '18s' : '12s';
      el.style.animationDuration = opDuration + ', ' + state[fl.spKey] + 's';
    });
  }

  function applyVignette() {
    // Update gradient stop colors
    vigSides.forEach(function(vs) {
      var grad = document.getElementById(vs.gradId);
      if (grad) {
        var stops = grad.querySelectorAll('stop');
        for (var i = 0; i < stops.length; i++) {
          stops[i].setAttribute('stop-color', state.vigColor);
        }
        // Set first stop opacity
        if (stops.length > 0) {
          stops[0].setAttribute('stop-opacity', String(state[vs.oKey]));
        }
      }

      var rect = document.getElementById(vs.rectId);
      if (!rect) return;

      // Visibility
      rect.style.display = state[vs.onKey] ? '' : 'none';

      // Depth — adjust width for L/R, height for T/B
      var depth = state[vs.dKey];
      if (vs.axis === 'w') {
        rect.setAttribute('width', String(depth));
        // Reposition right side
        if (vs.rectId === 'vig-rect-r') {
          rect.setAttribute('x', String(720 + 720 - depth));
        }
      } else {
        rect.setAttribute('height', String(depth));
        // Reposition bottom
        if (vs.rectId === 'vig-rect-b') {
          rect.setAttribute('y', String(528 + 528 - depth));
        }
      }
    });
  }

  function applyZones() {
    // Staging
    var stagingBgs = document.querySelectorAll('.staging-zone-bg');
    var stagingLabels = document.querySelectorAll('.offboard-zone-label:not(.ds-label):not(.reserves-label)');
    setDisplay(stagingBgs, state.zoneStaging);
    setDisplay(stagingLabels, state.zoneStaging);

    // Deep Strike
    var dsBgs = document.querySelectorAll('.ds-zone-bg');
    var dsLabels = document.querySelectorAll('.ds-label');
    setDisplay(dsBgs, state.zoneDS);
    setDisplay(dsLabels, state.zoneDS);

    // Reserves
    var resBgs = document.querySelectorAll('.reserves-zone-bg');
    var resLabels = document.querySelectorAll('.reserves-label');
    setDisplay(resBgs, state.zoneReserves);
    setDisplay(resLabels, state.zoneReserves);

    // Board edge separator
    var seps = document.querySelectorAll('.board-edge-separator');
    setDisplay(seps, state.zoneSeparator);
  }

  function setDisplay(nodeList, show) {
    for (var i = 0; i < nodeList.length; i++) {
      nodeList[i].style.display = show ? '' : 'none';
    }
  }

  function applyFx() {
    window._fogFxEnabled = state.fxOn;
    window._fogWispsEnabled = state.wispsOn;
    window._fogExplosionCount = state.fxIntensity;
    window._fogFxSpeedMult = state.fxSpeed;
  }

  // ── Apply all on load ─────────────────────────────────
  applyBg();
  applyFog();
  applyVignette();
  applyZones();
  applyFx();
})();
