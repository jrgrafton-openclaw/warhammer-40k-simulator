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
    fogParallax: 0.35,
    fog1On: true, fog1Opacity: 1.0, fog1Speed: 3,
    fog2On: true, fog2Opacity: 1.0, fog2Speed: 4,
    fog3On: true, fog3Opacity: 1.0, fog3Speed: 5.5,
    vigTOn: true, vigTDepth: 200, vigTOpacity: 0.95,
    vigBOn: true, vigBDepth: 200, vigBOpacity: 0.95,
    vigLOn: true, vigLDepth: 200, vigLOpacity: 0.95,
    vigROn: true, vigRDepth: 200, vigROpacity: 0.95,
    vigLock: true,
    vigNoiseScale: 0,
    groundStyle: 'gradient',
    groundWidth: 1440, groundHeight: 1056,
    gridOn: true, gridOpacity: 1.0, gridWidth: 5000, gridHeight: 5000,
    gridMinorOpacity: 0.025, gridMajorOpacity: 0.055, gridAboveGround: false,
    zoneStaging: true, zoneDS: true, zoneReserves: true, zoneSeparator: true,
    zoneDeployment: true,
    fxOn: true, fxFrequency: 0.5, fxSpeed: 0.5, fxOpacity: 0.5,
    wispsOn: true,
    offboardBorders: false, offboardFillOpacity: 0.04, offboardSoftness: 55
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

  // ── Collapsed sections state ───────────────────────────
  var COLLAPSE_KEY = 'wh40k-debug-v02a-collapsed';
  function loadCollapsed() {
    try {
      var raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) { /* ignore */ }
    return {};
  }
  function saveCollapsed(obj) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(obj)); } catch(e) { /* ignore */ }
  }
  var collapsedState = loadCollapsed();

  // ── Build DOM ─────────────────────────────────────────
  var menu = document.createElement('div');
  menu.className = 'debug-menu';

  // Title + Reset button
  menu.innerHTML = '<div class="dbg-title"><span>DEBUG MENU</span><div class="dbg-title-right"><button class="dbg-reset-btn" id="dbg-reset">RESET</button><span class="dbg-title-key">D</span></div></div>';

  // Helper: create section
  function section(title) {
    var sec = document.createElement('div');
    sec.className = 'dbg-section';
    // Restore collapsed state from localStorage (default: expanded)
    if (collapsedState[title]) sec.classList.add('collapsed');
    var hdr = document.createElement('div');
    hdr.className = 'dbg-section-hdr';
    hdr.innerHTML = '<span>' + title + '</span><span class="dbg-chev">▾</span>';
    hdr.addEventListener('click', function() {
      sec.classList.toggle('collapsed');
      collapsedState[title] = sec.classList.contains('collapsed');
      saveCollapsed(collapsedState);
    });
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
    if (unit === '%') return Math.round(v) + '%';
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
  // GROUND SECTION
  // ══════════════════════════════════════════════════════
  var groundBody = section('GROUND');

  (function() {
    var row = document.createElement('div');
    row.className = 'dbg-row';
    var lbl = document.createElement('span');
    lbl.className = 'dbg-row-label';
    lbl.textContent = 'Style';
    var sel = document.createElement('select');
    sel.className = 'dbg-select';
    var opts = [
      { value: 'none', text: 'None' },
      { value: 'gradient', text: 'Gradient Depth' },
      { value: 'warm', text: 'Warm Core' },
      { value: 'dual', text: 'Dual Light Pools' }
    ];
    opts.forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.text;
      if (o.value === state.groundStyle) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function() {
      state.groundStyle = sel.value; applyGround(); save(state);
    });
    row.appendChild(lbl);
    row.appendChild(sel);
    groundBody.appendChild(row);
  })();

  sliderRow(groundBody, 'Width', 720, 3000, 10, state.groundWidth, 'px', function(v) {
    state.groundWidth = v; applyGround(); save(state);
  });
  sliderRow(groundBody, 'Height', 528, 2000, 10, state.groundHeight, 'px', function(v) {
    state.groundHeight = v; applyGround(); save(state);
  });

  // ══════════════════════════════════════════════════════
  // GRID SECTION
  // ══════════════════════════════════════════════════════
  var gridBody = section('GRID');

  toggleRow(gridBody, 'Visible', state.gridOn, function(on) {
    state.gridOn = on; applyGrid(); save(state);
  });
  sliderRow(gridBody, 'Opacity', 0, 1, 0.01, state.gridOpacity, '', function(v) {
    state.gridOpacity = v; applyGrid(); save(state);
  });
  sliderRow(gridBody, 'Width', 100, 8000, 50, state.gridWidth, 'px', function(v) {
    state.gridWidth = v; applyGrid(); save(state);
  });
  sliderRow(gridBody, 'Height', 100, 8000, 50, state.gridHeight, 'px', function(v) {
    state.gridHeight = v; applyGrid(); save(state);
  });
  sliderRow(gridBody, 'Minor Line Opacity', 0, 0.2, 0.005, state.gridMinorOpacity, '', function(v) {
    state.gridMinorOpacity = v; applyGrid(); save(state);
  });
  sliderRow(gridBody, 'Major Line Opacity', 0, 0.2, 0.005, state.gridMajorOpacity, '', function(v) {
    state.gridMajorOpacity = v; applyGrid(); save(state);
  });
  toggleRow(gridBody, 'Above Ground', state.gridAboveGround, function(on) {
    state.gridAboveGround = on; applyGrid(); save(state);
  });

  // ══════════════════════════════════════════════════════
  // FOG LAYERS SECTION
  // ══════════════════════════════════════════════════════
  var fogBody = section('FOG LAYERS');

  sliderRow(fogBody, 'Parallax', 0, 1, 0.01, state.fogParallax, '', function(v) {
    state.fogParallax = v; window._fogParallax = v; save(state);
  });

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
    sliderRow(fogBody, 'Speed', 1, 10, 0.5, state[fl.spKey], 'x', function(v) {
      state[fl.spKey] = v; applyFog(); save(state);
    });
  });

  // ══════════════════════════════════════════════════════
  // VIGNETTE / EDGE GRADIENTS SECTION
  // ══════════════════════════════════════════════════════
  var vigBody = section('VIGNETTE');

  // Lock toggle
  toggleRow(vigBody, 'Lock All Sides', state.vigLock, function(on) {
    state.vigLock = on; save(state);
  });

  // Noise displacement scale
  sliderRow(vigBody, 'Noise Scale', 0, 100, 1, state.vigNoiseScale, 'px', function(v) {
    state.vigNoiseScale = v; applyVignette(); save(state);
  });

  var vigSides = [
    { label: 'Top', onKey: 'vigTOn', dKey: 'vigTDepth', oKey: 'vigTOpacity', rectId: 'vig-rect-t', gradId: 'vig-t', axis: 'h' },
    { label: 'Bottom', onKey: 'vigBOn', dKey: 'vigBDepth', oKey: 'vigBOpacity', rectId: 'vig-rect-b', gradId: 'vig-b', axis: 'h' },
    { label: 'Left', onKey: 'vigLOn', dKey: 'vigLDepth', oKey: 'vigLOpacity', rectId: 'vig-rect-l', gradId: 'vig-l', axis: 'w' },
    { label: 'Right', onKey: 'vigROn', dKey: 'vigRDepth', oKey: 'vigROpacity', rectId: 'vig-rect-r', gradId: 'vig-r', axis: 'w' }
  ];

  // Track sliders for lock sync
  var vigSliders = {};

  vigSides.forEach(function(vs) {
    subLabel(vigBody, vs.label);
    toggleRow(vigBody, 'Visible', state[vs.onKey], function(on) {
      state[vs.onKey] = on; applyVignette(); save(state);
    });
    var dSlider = sliderRow(vigBody, 'Depth', 0, 800, 10, state[vs.dKey], 'px', function(v) {
      state[vs.dKey] = v;
      if (state.vigLock) {
        vigSides.forEach(function(other) {
          if (other.dKey !== vs.dKey) {
            state[other.dKey] = v;
            vigSliders[other.dKey].value = v;
            var valSpan = vigSliders[other.dKey].nextElementSibling;
            if (valSpan) valSpan.textContent = Math.round(v) + 'px';
          }
        });
      }
      applyVignette(); save(state);
    });
    vigSliders[vs.dKey] = dSlider;

    var oSlider = sliderRow(vigBody, 'Opacity', 0, 1, 0.01, state[vs.oKey], '', function(v) {
      state[vs.oKey] = v;
      if (state.vigLock) {
        vigSides.forEach(function(other) {
          if (other.oKey !== vs.oKey) {
            state[other.oKey] = v;
            vigSliders[other.oKey].value = v;
            var valSpan = vigSliders[other.oKey].nextElementSibling;
            if (valSpan) valSpan.textContent = v.toFixed(2);
          }
        });
      }
      applyVignette(); save(state);
    });
    vigSliders[vs.oKey] = oSlider;
  });

  // ══════════════════════════════════════════════════════
  // ZONES SECTION
  // ══════════════════════════════════════════════════════
  var zoneBody = section('ZONES');

  toggleRow(zoneBody, 'Deployment Zones', state.zoneDeployment, function(on) {
    state.zoneDeployment = on; applyZones(); save(state);
  });
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

  subLabel(zoneBody, 'OFF-BOARD STYLE');
  toggleRow(zoneBody, 'Borders', state.offboardBorders, function(on) {
    state.offboardBorders = on; applyOffboard(); save(state);
  });
  sliderRow(zoneBody, 'Fill Opacity', 0, 0.15, 0.005, state.offboardFillOpacity, '', function(v) {
    state.offboardFillOpacity = v; applyOffboard(); save(state);
  });
  sliderRow(zoneBody, 'Edge Softness', 30, 80, 1, state.offboardSoftness, '%', function(v) {
    state.offboardSoftness = v; applyOffboard(); save(state);
  });

  // ══════════════════════════════════════════════════════
  // EXPLOSIONS SECTION
  // ══════════════════════════════════════════════════════
  var fxBody = section('EXPLOSIONS');

  toggleRow(fxBody, 'Enabled', state.fxOn, function(on) {
    state.fxOn = on; applyFx(); save(state);
  });
  sliderRow(fxBody, 'Frequency', 0, 5, 0.1, state.fxFrequency, 'x', function(v) {
    state.fxFrequency = v; applyFx(); save(state);
  });
  sliderRow(fxBody, 'Speed', 0.05, 2, 0.05, state.fxSpeed, 'x', function(v) {
    state.fxSpeed = v; applyFx(); save(state);
  });
  sliderRow(fxBody, 'Opacity', 0, 1, 0.01, state.fxOpacity, '', function(v) {
    state.fxOpacity = v; window._fogFxOpacity = v; save(state);
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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      menu.classList.toggle('visible');
    }
  });

  // ── Reset button ──────────────────────────────────────
  document.getElementById('dbg-reset').addEventListener('click', function() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COLLAPSE_KEY);
    location.reload();
  });

  // ══════════════════════════════════════════════════════
  // APPLY FUNCTIONS
  // ══════════════════════════════════════════════════════

  function applyBg() {
    // SVG board surface rect
    var surface = document.getElementById('board-surface');
    if (surface) surface.setAttribute('fill', state.bgColor);
    // CSS backgrounds
    var bf = document.getElementById('battlefield');
    if (bf) bf.style.background = state.bgColor;
    document.body.style.background = state.bgColor;
    // Sync vignette gradient colors to match background
    ['vig-l','vig-r','vig-t','vig-b'].forEach(function(id) {
      var grad = document.getElementById(id);
      if (grad) {
        var stops = grad.querySelectorAll('stop');
        for (var i = 0; i < stops.length; i++) {
          stops[i].setAttribute('stop-color', state.bgColor);
        }
      }
    });
  }

  function applyFog() {
    // Set parallax global
    window._fogParallax = state.fogParallax;

    fogLayers.forEach(function(fl) {
      var el = document.getElementById(fl.el);
      if (!el) return;
      el.style.display = state[fl.onKey] ? '' : 'none';
      // Use CSS filter opacity — multiplies with animated opacity (Issue 6)
      el.style.filter = 'opacity(' + state[fl.opKey] + ')';
      // Speed slider = speed factor; duration = 60/speed (Issue 4)
      var opDuration = fl.key === '1' ? '14s' : fl.key === '2' ? '18s' : '12s';
      var scrollDuration = Math.max(1, 60 / state[fl.spKey]);
      el.style.animationDuration = opDuration + ', ' + scrollDuration + 's';
    });
  }

  function applyGround() {
    var ids = ['ground-gradient', 'ground-warm', 'ground-dual'];
    var map = { gradient: 'ground-gradient', warm: 'ground-warm', dual: 'ground-dual' };
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (state.groundStyle !== 'none' && map[state.groundStyle]) {
      var active = document.getElementById(map[state.groundStyle]);
      if (active) active.style.display = '';
    }
    // Resize all ground rects to match current ground dimensions
    var gw = state.groundWidth;
    var gh = state.groundHeight;
    var gx = 360 - gw / 2;
    var gy = 264 - gh / 2;
    ['ground-gradient', 'ground-warm', 'ground-dual'].forEach(function(id) {
      var g = document.getElementById(id);
      if (!g) return;
      var rects = g.querySelectorAll('rect');
      rects.forEach(function(r) {
        r.setAttribute('x', String(gx));
        r.setAttribute('y', String(gy));
        r.setAttribute('width', String(gw));
        r.setAttribute('height', String(gh));
      });
    });
    applyVignette();
  }

  function applyVignette() {
    // Compute ground bounds from current dimensions
    var gw = state.groundWidth || 1440;
    var gh = state.groundHeight || 1056;
    var gx = 360 - gw / 2;
    var gy = 264 - gh / 2;

    vigSides.forEach(function(vs) {
      // Set first stop opacity
      var grad = document.getElementById(vs.gradId);
      if (grad) {
        var stops = grad.querySelectorAll('stop');
        if (stops.length > 0) {
          stops[0].setAttribute('stop-opacity', String(state[vs.oKey]));
        }
      }

      var rect = document.getElementById(vs.rectId);
      if (!rect) return;

      // Visibility
      rect.style.display = state[vs.onKey] ? '' : 'none';

      // Depth — positioned at ground texture boundary
      var depth = state[vs.dKey];
      if (vs.axis === 'w') {
        rect.setAttribute('width', String(depth));
        rect.setAttribute('y', String(gy));
        rect.setAttribute('height', String(gh));
        if (vs.rectId === 'vig-rect-l') {
          rect.setAttribute('x', String(gx));
        } else if (vs.rectId === 'vig-rect-r') {
          rect.setAttribute('x', String(gx + gw - depth));
        }
      } else {
        rect.setAttribute('height', String(depth));
        rect.setAttribute('x', String(gx));
        rect.setAttribute('width', String(gw));
        if (vs.rectId === 'vig-rect-t') {
          rect.setAttribute('y', String(gy));
        } else if (vs.rectId === 'vig-rect-b') {
          rect.setAttribute('y', String(gy + gh - depth));
        }
      }
    });

    // Noise displacement: remove filter when scale is 0 to avoid grey artifacts
    var vigGroup = document.querySelector('#bf-svg-vignette g');
    if (vigGroup) {
      if (state.vigNoiseScale > 0) {
        vigGroup.setAttribute('filter', 'url(#vig-noise)');
        var dm = document.querySelector('#vig-noise feDisplacementMap');
        if (dm) dm.setAttribute('scale', String(state.vigNoiseScale));
      } else {
        vigGroup.removeAttribute('filter');
      }
    }
  }

  function applyGrid() {
    var gridRect = document.getElementById('board-grid-rect');
    var boardSurface = document.getElementById('board-surface');
    // Center origin: battlefield midpoint is (360, 264)
    var cx = 360, cy = 264;
    if (gridRect) {
      gridRect.style.display = state.gridOn ? '' : 'none';
      gridRect.style.opacity = state.gridOpacity;
      gridRect.setAttribute('x', String(cx - state.gridWidth / 2));
      gridRect.setAttribute('y', String(cy - state.gridHeight / 2));
      gridRect.setAttribute('width', String(state.gridWidth));
      gridRect.setAttribute('height', String(state.gridHeight));
    }
    // Also resize board surface to match
    if (boardSurface) {
      var surfW = Math.max(state.gridWidth, 5000);
      var surfH = Math.max(state.gridHeight, 5000);
      boardSurface.setAttribute('x', String(cx - surfW / 2));
      boardSurface.setAttribute('y', String(cy - surfH / 2));
      boardSurface.setAttribute('width', String(surfW));
      boardSurface.setAttribute('height', String(surfH));
    }
    // Reorder grid relative to ground layers
    var terrainSvg = document.getElementById('bf-svg-terrain');
    if (terrainSvg && gridRect) {
      if (state.gridAboveGround) {
        var groundDual = document.getElementById('ground-dual');
        if (groundDual && groundDual.nextSibling) {
          terrainSvg.insertBefore(gridRect, groundDual.nextSibling);
        }
      } else {
        var boardSurface = document.getElementById('board-surface');
        if (boardSurface) {
          boardSurface.after(gridRect);
        }
      }
    }
    // Update grid pattern line opacities
    var pat = document.getElementById('board-grid');
    if (pat) {
      var minors = pat.querySelectorAll('line[data-grid="minor"]');
      var majors = pat.querySelectorAll('line[data-grid="major"]');
      for (var i = 0; i < minors.length; i++) {
        minors[i].setAttribute('stroke', 'rgba(201,163,82,' + state.gridMinorOpacity + ')');
      }
      for (var j = 0; j < majors.length; j++) {
        majors[j].setAttribute('stroke', 'rgba(201,163,82,' + state.gridMajorOpacity + ')');
      }
    }
  }

  function applyZones() {
    // Deployment zones
    var deployClasses = ['deploy-zone-bg', 'deploy-zone-border', 'deploy-zone-label',
      'deploy-zone-sublabel', 'nml-zone-bg', 'nml-label'];
    deployClasses.forEach(function(cls) {
      setDisplay(document.querySelectorAll('.' + cls), state.zoneDeployment);
    });

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

  function applyOffboard() {
    var zoneInfo = [
      { cls: 'staging-zone-bg', gradId: 'zone-staging-grad', color: '0,212,255' },
      { cls: 'ds-zone-bg', gradId: 'zone-ds-grad', color: '255,170,0' },
      { cls: 'reserves-zone-bg', gradId: 'zone-reserves-grad', color: '186,126,255' }
    ];
    zoneInfo.forEach(function(zi) {
      var rect = document.querySelector('.' + zi.cls);
      if (!rect) return;
      // Borders — use style to override any CSS
      if (state.offboardBorders) {
        rect.style.stroke = 'rgba(' + zi.color + ',0.2)';
        rect.style.strokeWidth = '1.5';
        rect.style.strokeDasharray = '8 4';
      } else {
        rect.style.stroke = 'none';
      }
      // Gradient fill opacity (first stop)
      var grad = document.getElementById(zi.gradId);
      if (grad) {
        var stops = grad.querySelectorAll('stop');
        if (stops.length > 0) {
          stops[0].setAttribute('stop-opacity', String(state.offboardFillOpacity));
        }
        // Edge softness (gradient radius)
        grad.setAttribute('r', state.offboardSoftness + '%');
      }
    });
  }

  function applyFx() {
    window._fogFxEnabled = state.fxOn;
    window._fogWispsEnabled = state.wispsOn;
    window._fogFxFrequency = state.fxFrequency;
    window._fogFxSpeedMult = state.fxSpeed;
    window._fogFxOpacity = state.fxOpacity;
  }

  // ── Apply all on load ─────────────────────────────────
  // scene.js is type="module" (deferred) — SVG elements don't exist yet.
  // Wait for window.load which fires after all modules have executed.
  function applyAll() {
    applyBg();
    applyGround();
    applyGrid();
    applyFog();
    applyVignette();
    applyZones();
    applyOffboard();
    applyFx();
  }
  if (document.readyState === 'complete') {
    applyAll();
  } else {
    window.addEventListener('load', applyAll);
  }
})();
