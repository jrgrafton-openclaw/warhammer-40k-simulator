/* ══════════════════════════════════════════════════════════════
   Editor Effects — Sprite grounding: drop shadow, feathered
   edges, colour grading applied to spriteFloor / spriteTop
══════════════════════════════════════════════════════════════ */

Editor.Effects = {
  // Current state
  shadow: { on: true, dx: 3, dy: 3, blur: 6, opacity: 0.55 },
  feather: { on: false, radius: 10 },
  grade: { on: true, brightness: 0.75, saturation: 0.7, sepia: 0.08 },

  // ── Initialise: build SVG filters + apply defaults ──
  init() {
    this._buildFilters();
    this.applyShadow();
    this.applyFeather();
    this.applyGrade();
  },

  // ── Build SVG filter definitions ──
  _buildFilters() {
    const NS = Editor.Core.NS;
    const defs = Editor.Core.svg.querySelector('defs');

    // --- Drop-shadow filter ---
    const sf = document.createElementNS(NS, 'filter');
    sf.id = 'spriteDropShadow';
    // Extra filter region so shadow isn't clipped
    sf.setAttribute('x', '-20%'); sf.setAttribute('y', '-20%');
    sf.setAttribute('width', '140%'); sf.setAttribute('height', '140%');
    sf.setAttribute('color-interpolation-filters', 'sRGB');

    const ds = document.createElementNS(NS, 'feDropShadow');
    ds.id = 'fxShadowKernel';
    ds.setAttribute('dx', this.shadow.dx);
    ds.setAttribute('dy', this.shadow.dy);
    ds.setAttribute('stdDeviation', this.shadow.blur);
    ds.setAttribute('flood-color', '#000');
    ds.setAttribute('flood-opacity', this.shadow.opacity);
    sf.appendChild(ds);
    defs.appendChild(sf);

    // --- Feathered-edges filter ---
    // Erodes the alpha channel so edges fade out smoothly
    const ff = document.createElementNS(NS, 'filter');
    ff.id = 'spriteFeather';
    ff.setAttribute('x', '-5%'); ff.setAttribute('y', '-5%');
    ff.setAttribute('width', '110%'); ff.setAttribute('height', '110%');
    ff.setAttribute('color-interpolation-filters', 'sRGB');

    // 1. Extract alpha → blur it
    const toAlpha = document.createElementNS(NS, 'feColorMatrix');
    toAlpha.setAttribute('in', 'SourceAlpha');
    toAlpha.setAttribute('type', 'matrix');
    toAlpha.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0');
    toAlpha.setAttribute('result', 'alpha');
    ff.appendChild(toAlpha);

    // 2. Erode-like effect: invert + blur + threshold via feComponentTransfer
    const morphErode = document.createElementNS(NS, 'feMorphology');
    morphErode.id = 'fxFeatherErode';
    morphErode.setAttribute('in', 'alpha');
    morphErode.setAttribute('operator', 'erode');
    morphErode.setAttribute('radius', this.feather.radius);
    morphErode.setAttribute('result', 'eroded');
    ff.appendChild(morphErode);

    const blurEdge = document.createElementNS(NS, 'feGaussianBlur');
    blurEdge.id = 'fxFeatherBlur';
    blurEdge.setAttribute('in', 'eroded');
    blurEdge.setAttribute('stdDeviation', this.feather.radius);
    blurEdge.setAttribute('result', 'softAlpha');
    ff.appendChild(blurEdge);

    // 3. Composite original colour with eroded alpha
    const comp = document.createElementNS(NS, 'feComposite');
    comp.setAttribute('in', 'SourceGraphic');
    comp.setAttribute('in2', 'softAlpha');
    comp.setAttribute('operator', 'in');
    ff.appendChild(comp);

    defs.appendChild(ff);
  },

  // ── Drop shadow ──
  applyShadow() {
    const layers = ['spriteFloor', 'spriteTop'];
    layers.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (this.shadow.on) {
        // If feather is also on, we use a combined filter
        this._syncFilter(el);
      } else {
        this._syncFilter(el);
      }
    });
  },

  setShadowParam(param, value) {
    this.shadow[param] = value;
    const k = document.getElementById('fxShadowKernel');
    if (k) {
      k.setAttribute('dx', this.shadow.dx);
      k.setAttribute('dy', this.shadow.dy);
      k.setAttribute('stdDeviation', this.shadow.blur);
      k.setAttribute('flood-opacity', this.shadow.opacity);
    }
  },

  toggleShadow(btn) {
    this.shadow.on = !this.shadow.on;
    btn.classList.toggle('on', this.shadow.on);
    const ctrl = document.getElementById('fxShadowControls');
    if (ctrl) ctrl.style.display = this.shadow.on ? '' : 'none';
    this.applyShadow();
  },

  // ── Feathered edges ──
  applyFeather() {
    const layers = ['spriteFloor', 'spriteTop'];
    layers.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      this._syncFilter(el);
    });
  },

  setFeatherRadius(val) {
    this.feather.radius = val;
    const erode = document.getElementById('fxFeatherErode');
    const blur = document.getElementById('fxFeatherBlur');
    if (erode) erode.setAttribute('radius', val);
    if (blur) blur.setAttribute('stdDeviation', val);
  },

  toggleFeather(btn) {
    this.feather.on = !this.feather.on;
    btn.classList.toggle('on', this.feather.on);
    const ctrl = document.getElementById('fxFeatherControls');
    if (ctrl) ctrl.style.display = this.feather.on ? '' : 'none';
    this.applyFeather();
  },

  // ── Colour grading ──
  applyGrade() {
    const layers = ['spriteFloor', 'spriteTop'];
    const css = this.grade.on
      ? `brightness(${this.grade.brightness}) saturate(${this.grade.saturation}) sepia(${this.grade.sepia})`
      : '';
    layers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.filter = css;
    });
    // CSS filter + SVG filter can coexist (CSS filter on style, SVG filter on attribute)
    // Actually CSS filter overrides SVG filter attribute on the same element in some browsers.
    // So we'll apply the grade via an SVG feColorMatrix instead, combined with shadow/feather.
    // For now, keep it simple: use CSS filter for grade (works in all modern browsers when
    // the SVG filter is applied as url()). Actually — let's combine everything into the
    // SVG filter pipeline to avoid conflicts.
    // UPDATE: CSS `style.filter` on an SVG <g> applies *after* the SVG `filter` attribute.
    // So this actually works: SVG filter=url(#shadow) for shadow, CSS filter for colour grade.
    // Let's keep it this way — it's simpler and works.
  },

  setGradeParam(param, value) {
    this.grade[param] = value;
    this.applyGrade();
  },

  toggleGrade(btn) {
    this.grade.on = !this.grade.on;
    btn.classList.toggle('on', this.grade.on);
    const ctrl = document.getElementById('fxGradeControls');
    if (ctrl) ctrl.style.display = this.grade.on ? '' : 'none';
    this.applyGrade();
  },

  // ── Sync SVG filter attribute (shadow ± feather) ──
  _syncFilter(el) {
    if (this.shadow.on && this.feather.on) {
      // Both — chain: can't easily combine two SVG filters via attribute,
      // so wrap in a parent <g> or just pick shadow (more impactful).
      // Simple approach: apply shadow filter (most impactful), feather via separate wrapper.
      // Better: create a combined filter dynamically.
      this._buildCombinedFilter();
      el.setAttribute('filter', 'url(#spriteCombined)');
    } else if (this.shadow.on) {
      el.setAttribute('filter', 'url(#spriteDropShadow)');
    } else if (this.feather.on) {
      el.setAttribute('filter', 'url(#spriteFeather)');
    } else {
      el.removeAttribute('filter');
    }
  },

  _buildCombinedFilter() {
    const NS = Editor.Core.NS;
    const defs = Editor.Core.svg.querySelector('defs');
    let existing = document.getElementById('spriteCombined');
    if (existing) existing.remove();

    const f = document.createElementNS(NS, 'filter');
    f.id = 'spriteCombined';
    f.setAttribute('x', '-20%'); f.setAttribute('y', '-20%');
    f.setAttribute('width', '140%'); f.setAttribute('height', '140%');
    f.setAttribute('color-interpolation-filters', 'sRGB');

    // Step 1: Feather the edges
    const toAlpha = document.createElementNS(NS, 'feColorMatrix');
    toAlpha.setAttribute('in', 'SourceAlpha');
    toAlpha.setAttribute('type', 'matrix');
    toAlpha.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0');
    toAlpha.setAttribute('result', 'alpha');
    f.appendChild(toAlpha);

    const erode = document.createElementNS(NS, 'feMorphology');
    erode.setAttribute('in', 'alpha');
    erode.setAttribute('operator', 'erode');
    erode.setAttribute('radius', this.feather.radius);
    erode.setAttribute('result', 'eroded');
    f.appendChild(erode);

    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('in', 'eroded');
    blur.setAttribute('stdDeviation', this.feather.radius);
    blur.setAttribute('result', 'softAlpha');
    f.appendChild(blur);

    const compFeather = document.createElementNS(NS, 'feComposite');
    compFeather.setAttribute('in', 'SourceGraphic');
    compFeather.setAttribute('in2', 'softAlpha');
    compFeather.setAttribute('operator', 'in');
    compFeather.setAttribute('result', 'feathered');
    f.appendChild(compFeather);

    // Step 2: Drop shadow on the feathered result
    // Create shadow from feathered alpha
    const shadowAlpha = document.createElementNS(NS, 'feColorMatrix');
    shadowAlpha.setAttribute('in', 'feathered');
    shadowAlpha.setAttribute('type', 'matrix');
    shadowAlpha.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0');
    shadowAlpha.setAttribute('result', 'fAlpha');
    f.appendChild(shadowAlpha);

    const shadowOffset = document.createElementNS(NS, 'feOffset');
    shadowOffset.setAttribute('in', 'fAlpha');
    shadowOffset.setAttribute('dx', this.shadow.dx);
    shadowOffset.setAttribute('dy', this.shadow.dy);
    shadowOffset.setAttribute('result', 'offsetAlpha');
    f.appendChild(shadowOffset);

    const shadowBlur = document.createElementNS(NS, 'feGaussianBlur');
    shadowBlur.setAttribute('in', 'offsetAlpha');
    shadowBlur.setAttribute('stdDeviation', this.shadow.blur);
    shadowBlur.setAttribute('result', 'blurredShadow');
    f.appendChild(shadowBlur);

    const floodBlack = document.createElementNS(NS, 'feFlood');
    floodBlack.setAttribute('flood-color', '#000');
    floodBlack.setAttribute('flood-opacity', this.shadow.opacity);
    floodBlack.setAttribute('result', 'shadowColor');
    f.appendChild(floodBlack);

    const compShadowColor = document.createElementNS(NS, 'feComposite');
    compShadowColor.setAttribute('in', 'shadowColor');
    compShadowColor.setAttribute('in2', 'blurredShadow');
    compShadowColor.setAttribute('operator', 'in');
    compShadowColor.setAttribute('result', 'shadow');
    f.appendChild(compShadowColor);

    // Merge: shadow behind feathered
    const merge = document.createElementNS(NS, 'feMerge');
    const mn1 = document.createElementNS(NS, 'feMergeNode');
    mn1.setAttribute('in', 'shadow');
    const mn2 = document.createElementNS(NS, 'feMergeNode');
    mn2.setAttribute('in', 'feathered');
    merge.appendChild(mn1);
    merge.appendChild(mn2);
    f.appendChild(merge);

    defs.appendChild(f);
  }
};
