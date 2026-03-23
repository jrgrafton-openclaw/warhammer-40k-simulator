/* ══════════════════════════════════════════════════════════════
   Editor Effects — Sprite grounding: drop shadow, feathered
   edges, colour grading. All composed in SVG filter pipeline.
   Per-sprite shadow multiplier via shadowMul (0–1).
══════════════════════════════════════════════════════════════ */

Editor.Effects = {
  // Global state
  shadow: { on: true, dx: 3, dy: 3, blur: 6, opacity: 0.55, distance: 1.0 },
  feather: { on: false, radius: 10 },
  grade:   { on: true, brightness: 0.75, saturation: 0.7, sepia: 0.08 },
  modelShadow: { on: true, dx: 1, dy: 2, blur: 1.5, opacity: 0.35 },

  // Filter cache: key = quantised params string → filter id
  _filterCache: {},
  _filterId: 0,
  _ready: false,

  init() {
    this._ready = true;
    this.rebuildAll();
    this.rebuildModelShadows();
  },

  // ── Rebuild all sprite filters ──
  rebuildAll() {
    const sprites = Editor.Core.allSprites;
    sprites.forEach(sp => this._applyToSprite(sp));
  },

  // ── Apply correct filter to a single sprite ──
  _applyToSprite(sp) {
    const mul = sp.shadowMul != null ? sp.shadowMul : 1.0;
    const rot = sp.rot || 0;
    const flipX = sp.flipX ? -1 : 1;
    const flipY = sp.flipY ? -1 : 1;

    // Cropped sprites: filter goes on the outer wrapper <g> which is in
    // PARENT space (no transform). Use raw dx/dy — no counter-rotation needed.
    // Uncropped sprites: filter goes on the <image> which has rotate+scale
    // transform. Counter-rotate the offset so shadow appears correct in screen space.
    const isCropped = !!sp._clipWrap;
    const filterId = isCropped
      ? this._getOrCreateFilter(mul, 0, 1, 1)    // no counter-rotation for wrapper
      : this._getOrCreateFilter(mul, rot, flipX, flipY); // counter-rotate for image

    const filterVal = filterId ? `url(#${filterId})` : null;
    const filterTarget = isCropped ? sp._clipWrap : sp.el;
    if (filterVal) {
      filterTarget.setAttribute('filter', filterVal);
    } else {
      filterTarget.removeAttribute('filter');
    }
    // Ensure filter is NOT on the wrong element
    if (isCropped && sp.el.hasAttribute('filter')) {
      sp.el.removeAttribute('filter');
    }
    // Remove any lingering CSS filter
    sp.el.style.filter = '';
  },

  // ── Get or create a filter for given shadow multiplier + rotation ──
  _getOrCreateFilter(rawMul, rot, flipX, flipY) {
    // Quantise multiplier to nearest 0.1 to limit filter count
    const mul = Math.round((rawMul || 0) * 10) / 10;
    // Quantise rotation to nearest 5° to limit filter count
    const qRot = Math.round((rot || 0) / 5) * 5;

    const hasShadow = this.shadow.on && mul > 0;
    const hasFeather = this.feather.on;
    const hasGrade = this.grade.on;

    if (!hasShadow && !hasFeather && !hasGrade) return null;

    // Build cache key including rotation + flip for shadow direction
    const key = [
      hasShadow ? `s${this.shadow.dx},${this.shadow.dy},${this.shadow.blur},${this.shadow.opacity},${this.shadow.distance},${mul},r${qRot},fx${flipX},fy${flipY}` : '',
      hasFeather ? `f${this.feather.radius}` : '',
      hasGrade ? `g${this.grade.brightness},${this.grade.saturation},${this.grade.sepia}` : ''
    ].join('|');

    if (this._filterCache[key]) return this._filterCache[key];

    // Compute counter-rotated shadow offset so shadow is consistent in screen space.
    // The SVG filter operates in pre-transform (local) space, so we must inverse-rotate
    // the desired screen-space offset to get the correct local offset.
    const rad = (qRot || 0) * Math.PI / 180;
    const dist = this.shadow.distance != null ? this.shadow.distance : 1.0;
    const dx = this.shadow.dx * dist;
    const dy = this.shadow.dy * dist;
    // Counter-rotate AND counter-flip the shadow offset.
    // feOffset operates in LOCAL space (pre-transform). The element's transform
    // (rotate + scale/flip) is applied AFTER the filter. So we must inverse-transform
    // the desired screen-space offset to get correct local values.
    // For target screen offset (dx, dy) with transform rotate(rot) + scale(flipX, flipY):
    //   localDx = (dx*cos(rot) + dy*sin(rot)) / flipX = flipX * (dx*cos + dy*sin)
    //   localDy = (-dx*sin(rot) + dy*cos(rot)) / flipY = flipY * (-dx*sin + dy*cos)
    const localDx = flipX * (dx * Math.cos(rad) + dy * Math.sin(rad));
    const localDy = flipY * (-dx * Math.sin(rad) + dy * Math.cos(rad));

    const id = `spFx${this._filterId++}`;
    this._buildFilter(id, hasShadow, hasFeather, hasGrade, mul, localDx, localDy);
    this._filterCache[key] = id;
    return id;
  },

  // ── Build a combined SVG filter ──
  // localDx/localDy: counter-rotated shadow offset for screen-space consistency
  _buildFilter(id, hasShadow, hasFeather, hasGrade, shadowMul, localDx, localDy) {
    const NS = Editor.Core.NS;
    const defs = Editor.Core.svg.querySelector('defs');

    const f = document.createElementNS(NS, 'filter');
    f.id = id;
    f.setAttribute('x', '-100%'); f.setAttribute('y', '-100%');
    f.setAttribute('width', '300%'); f.setAttribute('height', '300%');
    f.setAttribute('color-interpolation-filters', 'sRGB');

    let currentInput = 'SourceGraphic';

    // ── Step 1: Feathered edges (erode alpha + blur → soft mask) ──
    if (hasFeather) {
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

      const comp = document.createElementNS(NS, 'feComposite');
      comp.setAttribute('in', 'SourceGraphic');
      comp.setAttribute('in2', 'softAlpha');
      comp.setAttribute('operator', 'in');
      comp.setAttribute('result', 'feathered');
      f.appendChild(comp);

      currentInput = 'feathered';
    }

    // ── Step 2: Color grading via feColorMatrix ──
    if (hasGrade) {
      // Build a combined matrix: brightness × saturation × sepia
      const matrix = this._gradeMatrix(this.grade.brightness, this.grade.saturation, this.grade.sepia);
      const cm = document.createElementNS(NS, 'feColorMatrix');
      cm.setAttribute('in', currentInput);
      cm.setAttribute('type', 'matrix');
      cm.setAttribute('values', matrix);
      cm.setAttribute('result', 'graded');
      f.appendChild(cm);
      currentInput = 'graded';
    }

    // ── Step 3: Drop shadow ──
    if (hasShadow) {
      const effOpacity = this.shadow.opacity * shadowMul;
      const effBlur = this.shadow.blur * shadowMul;

      // Extract alpha from current result
      const sa = document.createElementNS(NS, 'feColorMatrix');
      sa.setAttribute('in', currentInput);
      sa.setAttribute('type', 'matrix');
      sa.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0');
      sa.setAttribute('result', 'spriteAlpha');
      f.appendChild(sa);

      const off = document.createElementNS(NS, 'feOffset');
      off.setAttribute('in', 'spriteAlpha');
      off.setAttribute('dx', localDx != null ? localDx.toFixed(2) : this.shadow.dx);
      off.setAttribute('dy', localDy != null ? localDy.toFixed(2) : this.shadow.dy);
      off.setAttribute('result', 'offAlpha');
      f.appendChild(off);

      const sblur = document.createElementNS(NS, 'feGaussianBlur');
      sblur.setAttribute('in', 'offAlpha');
      sblur.setAttribute('stdDeviation', effBlur);
      sblur.setAttribute('result', 'blurAlpha');
      f.appendChild(sblur);

      const flood = document.createElementNS(NS, 'feFlood');
      flood.setAttribute('flood-color', '#000');
      flood.setAttribute('flood-opacity', effOpacity);
      flood.setAttribute('result', 'shadowColor');
      f.appendChild(flood);

      const compShadow = document.createElementNS(NS, 'feComposite');
      compShadow.setAttribute('in', 'shadowColor');
      compShadow.setAttribute('in2', 'blurAlpha');
      compShadow.setAttribute('operator', 'in');
      compShadow.setAttribute('result', 'shadow');
      f.appendChild(compShadow);

      // Merge: shadow behind sprite
      const merge = document.createElementNS(NS, 'feMerge');
      const mn1 = document.createElementNS(NS, 'feMergeNode');
      mn1.setAttribute('in', 'shadow');
      const mn2 = document.createElementNS(NS, 'feMergeNode');
      mn2.setAttribute('in', currentInput);
      merge.appendChild(mn1);
      merge.appendChild(mn2);
      f.appendChild(merge);
    }

    defs.appendChild(f);
  },

  // ── Color grading matrix: brightness × saturation × sepia ──
  _gradeMatrix(b, s, sep) {
    // Start with identity, apply brightness (scale RGB)
    // Then saturation (lerp towards luminance)
    // Then sepia tint

    // Luminance weights
    const lr = 0.2126, lg = 0.7152, lb = 0.0722;

    // Saturation matrix (applied after brightness)
    const sr = (1 - s) * lr, sg = (1 - s) * lg, sb = (1 - s) * lb;
    const m = [
      (sr + s) * b, sg * b,       sb * b,       0, 0,
      sr * b,       (sg + s) * b, sb * b,       0, 0,
      sr * b,       sg * b,       (sb + s) * b, 0, 0,
      0,            0,            0,            1, 0
    ];

    // Apply sepia as a lerp towards sepia tone
    if (sep > 0) {
      // Sepia target matrix
      const sp = [
        0.393, 0.769, 0.189, 0, 0,
        0.349, 0.686, 0.168, 0, 0,
        0.272, 0.534, 0.131, 0, 0,
        0,     0,     0,     1, 0
      ];
      for (let i = 0; i < 20; i++) {
        m[i] = m[i] * (1 - sep) + sp[i] * sep * b;
      }
      // Fix alpha row
      m[15] = 0; m[16] = 0; m[17] = 0; m[18] = 1; m[19] = 0;
    }

    return m.map(v => v.toFixed(4)).join(' ');
  },

  // ── Flush filter cache and rebuild ──
  _flush() {
    // Remove old generated filters from defs
    const defs = Editor.Core.svg.querySelector('defs');
    Object.values(this._filterCache).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    this._filterCache = {};
    this.rebuildAll();
  },

  // ── Global toggle/set handlers ──
  toggleShadow(btn) {
    this.shadow.on = !this.shadow.on;
    btn.classList.toggle('on', this.shadow.on);
    const ctrl = document.getElementById('fxShadowControls');
    if (ctrl) ctrl.style.display = this.shadow.on ? '' : 'none';
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  setShadowParam(param, value) {
    this.shadow[param] = value;
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  toggleFeather(btn) {
    this.feather.on = !this.feather.on;
    btn.classList.toggle('on', this.feather.on);
    const ctrl = document.getElementById('fxFeatherControls');
    if (ctrl) ctrl.style.display = this.feather.on ? '' : 'none';
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  setFeatherRadius(val) {
    this.feather.radius = val;
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  toggleGrade(btn) {
    this.grade.on = !this.grade.on;
    btn.classList.toggle('on', this.grade.on);
    const ctrl = document.getElementById('fxGradeControls');
    if (ctrl) ctrl.style.display = this.grade.on ? '' : 'none';
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  setGradeParam(param, value) {
    this.grade[param] = value;
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  // ── Per-sprite shadow multiplier ──
  setSpriteShadowMul(spriteId, val) {
    const sp = Editor.Core.allSprites.find(s => s.id === spriteId);
    if (!sp) return;
    sp.shadowMul = val;
    this._applyToSprite(sp);
    Editor.Core.updateDebug();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  // ── Model Shadow toggle/rebuild ──
  // Uses sprite grounding shadow settings (dx, dy, blur, opacity, distance)
  toggleModelShadow(btn) {
    this.modelShadow.on = !this.modelShadow.on;
    btn.classList.toggle('on', this.modelShadow.on);
    const ctrl = document.getElementById('fxModelShadowControls');
    if (ctrl) ctrl.style.display = this.modelShadow.on ? '' : 'none';
    this.rebuildModelShadows();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  setModelShadowParam(param, value) {
    this.modelShadow[param] = value;
    this.rebuildModelShadows();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  rebuildModelShadows() {
    const C = Editor.Core;
    const NS = C.NS;
    const shadowLayer = document.getElementById('modelShadowLayer');
    const modelLayer = document.getElementById('modelLayer');
    if (!shadowLayer || !modelLayer) return;

    // Ensure shadow layer is always immediately before model layer in DOM order,
    // regardless of z-order reordering that places sprites as direct SVG children.
    if (shadowLayer.nextElementSibling !== modelLayer) {
      modelLayer.parentNode.insertBefore(shadowLayer, modelLayer);
    }

    // Clear all existing shadows
    shadowLayer.innerHTML = '';
    C.allModels.forEach(m => { m.shadowEl = null; });

    if (!this.modelShadow.on) return;

    // Dedicated model shadow settings (decoupled from sprite grounding)
    const ms = this.modelShadow;
    const dx = ms.dx;
    const dy = ms.dy;
    const opacity = ms.opacity;
    const blur = ms.blur;

    // Update the SVG filter blur for models
    const f = document.getElementById('mf-model-shadow');
    if (f) {
      const blurEl = f.querySelector('feGaussianBlur');
      if (blurEl) blurEl.setAttribute('stdDeviation', blur);
    }

    C.allModels.forEach(m => {
      if (m.kind === 'circle') {
        const sh = document.createElementNS(NS, 'circle');
        sh.setAttribute('cx', m.x + dx); sh.setAttribute('cy', m.y + dy);
        sh.setAttribute('r', m.r);
        sh.setAttribute('fill', `rgba(0,0,0,${opacity})`);
        sh.setAttribute('filter', 'url(#mf-model-shadow)');
        sh.style.pointerEvents = 'none';
        shadowLayer.appendChild(sh);
        m.shadowEl = sh;
      } else {
        const sh = document.createElementNS(NS, 'rect');
        sh.setAttribute('x', m.x + dx); sh.setAttribute('y', m.y + dy);
        sh.setAttribute('width', m.w); sh.setAttribute('height', m.h); sh.setAttribute('rx', '4');
        sh.setAttribute('fill', `rgba(0,0,0,${opacity})`);
        sh.setAttribute('filter', 'url(#mf-model-shadow)');
        sh.style.pointerEvents = 'none';
        shadowLayer.appendChild(sh);
        m.shadowEl = sh;
      }
    });
  }
};
