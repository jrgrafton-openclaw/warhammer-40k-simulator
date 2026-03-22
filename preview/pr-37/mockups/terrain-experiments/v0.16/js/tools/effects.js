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
  scatterGlow: { on: false, color: '#8B6914', intensity: 0.5, blur: 3 },
  roofTint: { on: false, strength: 0.2 },
  groundPatch: { on: false, opacity: 0.3, extend: 15 },
  modelShadow: { on: false, blur: 1.5, opacity: 0.25, dx: 1, dy: 2 },

  // Filter cache: key = quantised params string → filter id
  _filterCache: {},
  _filterId: 0,
  _ready: false,

  init() {
    this._ready = true;
    this.rebuildAll();
  },

  // ── Rebuild all sprite filters ──
  rebuildAll() {
    const sprites = Editor.Core.allSprites;
    sprites.forEach(sp => this._applyToSprite(sp));
    this.rebuildGroundPatches();
  },

  // ── Apply correct filter to a single sprite ──
  _applyToSprite(sp) {
    const mul = sp.shadowMul != null ? sp.shadowMul : 1.0;
    const rot = sp.rot || 0;
    const flipX = sp.flipX ? -1 : 1;
    const flipY = sp.flipY ? -1 : 1;
    const isScatter = !!(sp.file && (sp.file.includes('scatter') || sp.file.includes('rubble')));
    const isTop = sp.layerType === 'top';

    // Cropped sprites: filter goes on the outer wrapper <g> which is in
    // PARENT space (no transform). Use raw dx/dy — no counter-rotation needed.
    // Uncropped sprites: filter goes on the <image> which has rotate+scale
    // transform. Counter-rotate the offset so shadow appears correct in screen space.
    const isCropped = !!sp._clipWrap;
    const filterId = isCropped
      ? this._getOrCreateFilter(mul, 0, 1, 1, isScatter, isTop)    // no counter-rotation for wrapper
      : this._getOrCreateFilter(mul, rot, flipX, flipY, isScatter, isTop); // counter-rotate for image

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
  _getOrCreateFilter(rawMul, rot, flipX, flipY, isScatter, isTop) {
    // Quantise multiplier to nearest 0.1 to limit filter count
    const mul = Math.round((rawMul || 0) * 10) / 10;
    // Quantise rotation to nearest 5° to limit filter count
    const qRot = Math.round((rot || 0) / 5) * 5;

    const hasShadow = this.shadow.on && mul > 0;
    const hasFeather = this.feather.on;
    const hasGrade = this.grade.on;
    const hasScatterGlow = this.scatterGlow.on && isScatter;
    const hasRoofTint = this.roofTint.on && isTop;

    if (!hasShadow && !hasFeather && !hasGrade && !hasScatterGlow && !hasRoofTint) return null;

    // Build cache key including rotation + flip for shadow direction
    const key = [
      hasShadow ? `s${this.shadow.dx},${this.shadow.dy},${this.shadow.blur},${this.shadow.opacity},${this.shadow.distance},${mul},r${qRot},fx${flipX},fy${flipY}` : '',
      hasFeather ? `f${this.feather.radius}` : '',
      hasGrade ? `g${this.grade.brightness},${this.grade.saturation},${this.grade.sepia}` : '',
      hasScatterGlow ? `sg${this.scatterGlow.color},${this.scatterGlow.intensity},${this.scatterGlow.blur}` : '',
      hasRoofTint ? `rt${this.roofTint.strength}` : ''
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
    this._buildFilter(id, hasShadow, hasFeather, hasGrade, mul, localDx, localDy, hasScatterGlow, hasRoofTint);
    this._filterCache[key] = id;
    return id;
  },

  // ── Build a combined SVG filter ──
  // localDx/localDy: counter-rotated shadow offset for screen-space consistency
  _buildFilter(id, hasShadow, hasFeather, hasGrade, shadowMul, localDx, localDy, hasScatterGlow, hasRoofTint) {
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

    // ── Step 2a: Roof Tint (blue-grey shift for top/roof sprites) ──
    if (hasRoofTint) {
      const s = this.roofTint.strength;
      // Lerp between identity and blue-grey matrix
      const I = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0];
      const B = [0.8,0,0.1,0,-0.02, 0,0.85,0.15,0,0, 0.1,0.1,1.1,0,0.03, 0,0,0,1,0];
      const vals = I.map((v, i) => (v * (1 - s) + B[i] * s).toFixed(4)).join(' ');
      const cm = document.createElementNS(NS, 'feColorMatrix');
      cm.setAttribute('in', currentInput);
      cm.setAttribute('type', 'matrix');
      cm.setAttribute('values', vals);
      cm.setAttribute('result', 'roofTinted');
      f.appendChild(cm);
      currentInput = 'roofTinted';
    }

    // ── Step 2b: Color grading via feColorMatrix ──
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
      merge.setAttribute('result', 'shadowMerged');
      const mn1 = document.createElementNS(NS, 'feMergeNode');
      mn1.setAttribute('in', 'shadow');
      const mn2 = document.createElementNS(NS, 'feMergeNode');
      mn2.setAttribute('in', currentInput);
      merge.appendChild(mn1);
      merge.appendChild(mn2);
      f.appendChild(merge);
      currentInput = 'shadowMerged';
    }

    // ── Step 4: Scatter Glow (warm edge glow for scatter/rubble sprites) ──
    if (hasScatterGlow) {
      const sg = this.scatterGlow;
      const glFlood = document.createElementNS(NS, 'feFlood');
      glFlood.setAttribute('flood-color', sg.color);
      glFlood.setAttribute('flood-opacity', sg.intensity);
      glFlood.setAttribute('result', 'glowColor');
      f.appendChild(glFlood);

      const glComp = document.createElementNS(NS, 'feComposite');
      glComp.setAttribute('in', 'glowColor');
      glComp.setAttribute('in2', 'SourceAlpha');
      glComp.setAttribute('operator', 'in');
      glComp.setAttribute('result', 'glowClipped');
      f.appendChild(glComp);

      const glMorph = document.createElementNS(NS, 'feMorphology');
      glMorph.setAttribute('in', 'glowClipped');
      glMorph.setAttribute('operator', 'dilate');
      glMorph.setAttribute('radius', sg.blur);
      glMorph.setAttribute('result', 'glowExpanded');
      f.appendChild(glMorph);

      const glBlur = document.createElementNS(NS, 'feGaussianBlur');
      glBlur.setAttribute('in', 'glowExpanded');
      glBlur.setAttribute('stdDeviation', sg.blur);
      glBlur.setAttribute('result', 'glowBlurred');
      f.appendChild(glBlur);

      const glMerge = document.createElementNS(NS, 'feMerge');
      const gmn1 = document.createElementNS(NS, 'feMergeNode');
      gmn1.setAttribute('in', 'glowBlurred');
      const gmn2 = document.createElementNS(NS, 'feMergeNode');
      gmn2.setAttribute('in', currentInput);
      glMerge.appendChild(gmn1);
      glMerge.appendChild(gmn2);
      f.appendChild(glMerge);
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

  // ── Scatter Glow toggle/set ──
  toggleScatterGlow(btn) {
    this.scatterGlow.on = !this.scatterGlow.on;
    btn.classList.toggle('on', this.scatterGlow.on);
    const ctrl = document.getElementById('fxScatterControls');
    if (ctrl) ctrl.style.display = this.scatterGlow.on ? '' : 'none';
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  setScatterParam(param, value) {
    this.scatterGlow[param] = value;
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  // ── Roof Tint toggle/set ──
  toggleRoofTint(btn) {
    this.roofTint.on = !this.roofTint.on;
    btn.classList.toggle('on', this.roofTint.on);
    const ctrl = document.getElementById('fxRoofControls');
    if (ctrl) ctrl.style.display = this.roofTint.on ? '' : 'none';
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  setRoofParam(param, value) {
    this.roofTint[param] = value;
    this._flush();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  // ── Ground Patches toggle/set ──
  toggleGroundPatch(btn) {
    this.groundPatch.on = !this.groundPatch.on;
    btn.classList.toggle('on', this.groundPatch.on);
    const ctrl = document.getElementById('fxPatchControls');
    if (ctrl) ctrl.style.display = this.groundPatch.on ? '' : 'none';
    this.rebuildGroundPatches();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  setGroundParam(param, value) {
    this.groundPatch[param] = value;
    this.rebuildGroundPatches();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  rebuildGroundPatches() {
    const NS = Editor.Core.NS;
    const svg = document.getElementById('battlefield');
    // Remove all existing ground patches
    svg.querySelectorAll('[data-ground-for]').forEach(el => el.remove());

    if (!this.groundPatch.on) return;

    const sprites = Editor.Core.allSprites;
    const ext = this.groundPatch.extend;
    const opacity = this.groundPatch.opacity;

    sprites.forEach(sp => {
      if (sp.hidden) return;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', sp.x - ext);
      rect.setAttribute('y', sp.y - ext);
      rect.setAttribute('width', sp.w + 2 * ext);
      rect.setAttribute('height', sp.h + 2 * ext);
      rect.setAttribute('fill', 'url(#terrain-ground-grad)');
      rect.setAttribute('opacity', opacity);
      rect.style.pointerEvents = 'none';
      rect.setAttribute('data-ground-for', sp.id);

      // Apply same transform as sprite
      const cx = sp.x + sp.w / 2;
      const cy = sp.y + sp.h / 2;
      const parts = [];
      if (sp.rot) parts.push(`rotate(${sp.rot} ${cx} ${cy})`);
      if (sp.flipX || sp.flipY) {
        const sx = sp.flipX ? -1 : 1;
        const sy = sp.flipY ? -1 : 1;
        parts.push(`translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`);
      }
      if (parts.length) rect.setAttribute('transform', parts.join(' '));

      // Insert before the sprite's root element
      const rootEl = sp._clipWrap || sp.el;
      if (rootEl.parentNode === svg) {
        svg.insertBefore(rect, rootEl);
      } else {
        // Sprite might be in a group — insert before the group
        const parent = rootEl.parentNode;
        if (parent && parent.parentNode === svg) {
          svg.insertBefore(rect, parent);
        }
      }
    });
  },

  // ── Model Shadows toggle/set ──
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
    // Update the filter stdDeviation
    const filterEl = document.getElementById('mf-model-shadow');
    if (filterEl) {
      const blur = filterEl.querySelector('feGaussianBlur');
      if (blur) blur.setAttribute('stdDeviation', this.modelShadow.blur);
    }
    this.rebuildModelShadows();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  },

  rebuildModelShadows() {
    const NS = Editor.Core.NS;
    const models = Editor.Core.allModels;
    // Remove all existing shadow elements
    models.forEach(m => {
      if (m.shadowEl) {
        m.shadowEl.remove();
        m.shadowEl = null;
      }
    });

    if (!this.modelShadow.on) return;

    const ms = this.modelShadow;
    models.forEach(m => {
      const g = m.el;
      const sh = document.createElementNS(NS, m.kind === 'circle' ? 'circle' : 'rect');
      if (m.kind === 'circle') {
        sh.setAttribute('cx', m.x + ms.dx);
        sh.setAttribute('cy', m.y + ms.dy);
        sh.setAttribute('r', m.r);
      } else {
        sh.setAttribute('x', m.x + ms.dx);
        sh.setAttribute('y', m.y + ms.dy);
        sh.setAttribute('width', m.w);
        sh.setAttribute('height', m.h);
        sh.setAttribute('rx', '4');
      }
      sh.setAttribute('fill', `rgba(0,0,0,${ms.opacity})`);
      sh.setAttribute('filter', 'url(#mf-model-shadow)');
      sh.style.pointerEvents = 'none';
      g.insertBefore(sh, g.firstChild);
      m.shadowEl = sh;
    });
  },

  // ── Per-sprite shadow multiplier ──
  setSpriteShadowMul(spriteId, val) {
    const sp = Editor.Core.allSprites.find(s => s.id === spriteId);
    if (!sp) return;
    sp.shadowMul = val;
    this._applyToSprite(sp);
    Editor.Core.updateDebug();
    Editor.State.dispatch({ type: 'SET_EFFECT' });
  }
};
