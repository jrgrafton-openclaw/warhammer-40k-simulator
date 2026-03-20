/**
 * camera.js — Board pan/zoom state and controls.
 *
 * Pan limits derived from MIN_ZOOM so reachable world-space edges are
 * identical at every zoom level. MIN_ZOOM computed dynamically so the
 * full content area fits in the viewport regardless of aspect ratio.
 *
 * iOS-style rubber-band: dragging past the edge stretches with
 * diminishing resistance; releasing springs back with a CSS transition.
 */

import { currentUnit, activeRangeTypes, callbacks } from '../state/store.js';

// ── Zoom limits ────────────────────────────────────────
var MAX_ZOOM = 3;
var MIN_ZOOM = 0.35;  // safe default; computed in initBoard()

// ── Pan / Zoom state (module-scoped) ───────────────────
var scale = 0.5;
var tx = 0;
var ty = 0;

// ── Rubber-band parameters (tunable via debug panel) ───
var _rbEnabled    = true;
var _rbStretch    = 0.30;   // 0.1–0.8 — how far past edge you can pull
var _rbDampen     = 200;    // 50–500px — how quickly resistance ramps up
var _rbDuration   = 400;    // 200–800ms — spring-back duration
var _rbIsDragging = false;  // set by initBoard drag handlers

// ── Meaningful content bounds in SVG coordinates ───────
var CONTENT_W_LEFT   = -560;
var CONTENT_W_RIGHT  =  740;
var CONTENT_W_TOP    =  -20;
var CONTENT_W_BOTTOM =  548;

// ── Viewport bounds (computed at init from MIN_ZOOM) ───
var SVG_MID_X = 360;
var SVG_MID_Y = 264;
var BOUND_LEFT   = CONTENT_W_LEFT;
var BOUND_RIGHT  = CONTENT_W_RIGHT;
var BOUND_TOP    = CONTENT_W_TOP;
var BOUND_BOTTOM = CONTENT_W_BOTTOM;

// ── Rubber-band helpers ────────────────────────────────
function rubberBand(overshoot) {
  // Logarithmic resistance — matches iOS UIScrollView behaviour.
  // Returns the elastically-dampened overshoot in pixels.
  return overshoot * _rbStretch / (1 + Math.abs(overshoot) / _rbDampen);
}

function computeClamps(bfW, bfH) {
  var pxPerUnit = (bfW / 720) * scale;
  var maxPosTx = Math.max(0, (SVG_MID_X - BOUND_LEFT) * pxPerUnit - bfW / 2);
  var maxNegTx = Math.max(0, (BOUND_RIGHT - SVG_MID_X) * pxPerUnit - bfW / 2);
  var maxPosTy = Math.max(0, (SVG_MID_Y - BOUND_TOP) * pxPerUnit - bfH / 2);
  var maxNegTy = Math.max(0, (BOUND_BOTTOM - SVG_MID_Y) * pxPerUnit - bfH / 2);
  return { maxPosTx: maxPosTx, maxNegTx: maxNegTx, maxPosTy: maxPosTy, maxNegTy: maxNegTy };
}

// ── Apply Transform ────────────────────────────────────
export function applyTx() {
  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner) return;

  if (bf) {
    var bfW = bf.clientWidth;
    var bfH = bf.clientHeight;
    var c = computeClamps(bfW, bfH);

    // Debug: log pan limits when zoom changes
    if (!applyTx._lastScale || Math.abs(applyTx._lastScale - scale) > 0.01) {
      var ppu = (bfW / 720) * scale;
      console.log('[camera] scale=' + scale.toFixed(2) +
        ' panX=[' + (-c.maxNegTx).toFixed(0) + ', +' + c.maxPosTx.toFixed(0) + ']' +
        ' panY=[' + (-c.maxNegTy).toFixed(0) + ', +' + c.maxPosTy.toFixed(0) + ']' +
        ' edgesX=[' + (SVG_MID_X - (c.maxPosTx + bfW/2)/ppu).toFixed(0) + ', ' +
                      (SVG_MID_X + (c.maxNegTx + bfW/2)/ppu).toFixed(0) + ']');
      applyTx._lastScale = scale;
    }

    if (_rbEnabled && _rbIsDragging) {
      // ── Elastic overshoot during drag ──
      var clampedTx = Math.max(-c.maxNegTx, Math.min(c.maxPosTx, tx));
      var clampedTy = Math.max(-c.maxNegTy, Math.min(c.maxPosTy, ty));
      var overshootX = tx - clampedTx;
      var overshootY = ty - clampedTy;
      var elasticTx = clampedTx + (overshootX !== 0 ? rubberBand(overshootX) : 0);
      var elasticTy = clampedTy + (overshootY !== 0 ? rubberBand(overshootY) : 0);
      inner.style.transform = 'translate(' + elasticTx + 'px,' + elasticTy + 'px) scale(' + scale + ')';
    } else {
      // ── Hard clamp (not dragging or rubber-band disabled) ──
      tx = Math.max(-c.maxNegTx, Math.min(c.maxPosTx, tx));
      ty = Math.max(-c.maxNegTy, Math.min(c.maxPosTy, ty));
      inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    }
  }
}

// ── Spring-back animation on release ───────────────────
function springBack() {
  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner || !bf) return;

  var bfW = bf.clientWidth;
  var bfH = bf.clientHeight;
  var c = computeClamps(bfW, bfH);

  // Clamp to valid range
  tx = Math.max(-c.maxNegTx, Math.min(c.maxPosTx, tx));
  ty = Math.max(-c.maxNegTy, Math.min(c.maxPosTy, ty));

  // Animate via CSS transition
  inner.style.transition = 'transform ' + _rbDuration + 'ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';

  // Clean up transition after it completes
  var cleanup = function() {
    inner.style.transition = '';
    inner.removeEventListener('transitionend', cleanup);
  };
  inner.addEventListener('transitionend', cleanup);
  // Fallback cleanup in case transitionend doesn't fire
  setTimeout(cleanup, _rbDuration + 50);
}

// ── Camera access ──────────────────────────────────────
export function getCamera() { return { scale: scale, tx: tx, ty: ty, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }; }

export function setCamera(newTx, newTy, newScale) {
  if (newTx !== undefined) tx = newTx;
  if (newTy !== undefined) ty = newTy;
  if (newScale !== undefined) scale = newScale;
  applyTx();
}

export function resetCamera(initialScale) {
  scale = initialScale !== undefined ? initialScale : MIN_ZOOM;
  tx = 0; ty = 0;
  applyTx();
}

// ── Rubber-band config (called by debug panel) ─────────
export function setRubberBand(opts) {
  if (opts.enabled !== undefined) _rbEnabled = opts.enabled;
  if (opts.stretch !== undefined) _rbStretch = opts.stretch;
  if (opts.dampen  !== undefined) _rbDampen  = opts.dampen;
  if (opts.duration !== undefined) _rbDuration = opts.duration;
  // Expose for debug panel readback
  window.__rubberBand = { enabled: _rbEnabled, stretch: _rbStretch, dampen: _rbDampen, duration: _rbDuration };
}

// ── initBoard — pan / zoom ─────────────────────────────
export function initBoard(opts) {
  opts = opts || {};

  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner || !bf) return;

  var bfW = bf.clientWidth;
  var bfH = bf.clientHeight;

  // ── Compute MIN_ZOOM dynamically ──────────────────────
  var contentW = CONTENT_W_RIGHT - CONTENT_W_LEFT;
  var contentH = CONTENT_W_BOTTOM - CONTENT_W_TOP;
  var maxZoomForWidth  = 720 / contentW;
  var maxZoomForHeight = (bfH / bfW) * 720 / contentH;

  MIN_ZOOM = Math.min(maxZoomForWidth, maxZoomForHeight);
  MIN_ZOOM = Math.max(0.15, MIN_ZOOM);

  // ── Compute viewport bounds at MIN_ZOOM ───────────────
  var contentMidX = (CONTENT_W_LEFT + CONTENT_W_RIGHT) / 2;
  var contentMidY = (CONTENT_W_TOP + CONTENT_W_BOTTOM) / 2;
  var viewportW = 720 / MIN_ZOOM;
  var viewportH = (bfH / bfW) * 720 / MIN_ZOOM;

  BOUND_LEFT   = contentMidX - viewportW / 2;
  BOUND_RIGHT  = contentMidX + viewportW / 2;
  BOUND_TOP    = contentMidY - viewportH / 2;
  BOUND_BOTTOM = contentMidY + viewportH / 2;

  console.log('[camera] minZoom=' + MIN_ZOOM.toFixed(3) +
    ' bounds L=' + BOUND_LEFT.toFixed(0) + ' R=' + BOUND_RIGHT.toFixed(0) +
    ' T=' + BOUND_TOP.toFixed(0) + ' B=' + BOUND_BOTTOM.toFixed(0) +
    ' (contentW=' + contentW + ' contentH=' + contentH +
    ' viewportW=' + viewportW.toFixed(0) + ' viewportH=' + viewportH.toFixed(0) + ')');

  // ── Set initial scale and pan ─────────────────────────
  var initialScale = opts.initialScale !== undefined ? opts.initialScale : MIN_ZOOM;
  initialScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialScale));
  scale = initialScale;

  // Start panned all the way left so staging zone is fully visible.
  var pxPerUnit = (bfW / 720) * scale;
  var maxPosTxInit = (SVG_MID_X - BOUND_LEFT) * pxPerUnit - bfW / 2;
  tx = Math.max(0, maxPosTxInit);
  ty = 0;

  applyTx();

  // ── Expose camera info for debug panel ────────────────
  window.__cameraInfo = {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    bounds: { left: BOUND_LEFT, right: BOUND_RIGHT, top: BOUND_TOP, bottom: BOUND_BOTTOM },
    content: { left: CONTENT_W_LEFT, right: CONTENT_W_RIGHT, top: CONTENT_W_TOP, bottom: CONTENT_W_BOTTOM }
  };
  window.__rubberBand = { enabled: _rbEnabled, stretch: _rbStretch, dampen: _rbDampen, duration: _rbDuration };

  // ── Drag state ────────────────────────────────────────
  var isDragging = false, startX, startY;
  var zoomEaseTimer = null;
  var zoomSettleTimer = null;
  var RC_IDS = ['range-move','range-advance','range-charge','range-ds',
                'range-move-label','range-advance-label','range-charge-label','range-ds-label'];

  function hideRangeCircles() {
    RC_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.opacity = '0';
    });
  }
  function showRangeCirclesNow() {
    if (!currentUnit || activeRangeTypes.size === 0) return;
    if (typeof callbacks.updateRangeCircles === 'function') callbacks.updateRangeCircles(currentUnit);
  }

  bf.addEventListener('wheel', function(e) {
    e.preventDefault();
    if (activeRangeTypes.size > 0) hideRangeCircles();
    if (!isDragging) {
      inner.classList.add('zoom-easing');
      clearTimeout(zoomEaseTimer);
      zoomEaseTimer = setTimeout(function(){ inner.classList.remove('zoom-easing'); }, 220);
    }
    var zoomFactor = 1 + ((window.__zoomSensitivity || 5) / 50);
    scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * (e.deltaY > 0 ? 1 / zoomFactor : zoomFactor)));
    applyTx();
    clearTimeout(zoomSettleTimer);
    zoomSettleTimer = setTimeout(showRangeCirclesNow, 220);
  }, {passive:false});

  var lastMX = 0, lastMY = 0;

  bf.addEventListener('mousedown', function(e) {
    if (e.target.closest('.token,.obj-hex-wrap,#unit-card,#vp-bar,#phase-header,#action-bar,#bf-svg')) return;
    isDragging = true;
    _rbIsDragging = true;
    startX = e.clientX - tx;
    startY = e.clientY - ty;
    lastMX = e.clientX;
    lastMY = e.clientY;
    inner.classList.add('dragging');
    inner.classList.remove('zoom-easing');
    // Cancel any running spring-back transition
    inner.style.transition = '';
  });

  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    var panMult = (window.__camPanSpeed || 5) / 5;
    var dx = (e.clientX - lastMX) * panMult;
    var dy = (e.clientY - lastMY) * panMult;
    lastMX = e.clientX;
    lastMY = e.clientY;
    tx += dx;
    ty += dy;
    applyTx();
    if (currentUnit && activeRangeTypes.size > 0 && typeof callbacks.updateRangeCircles === 'function') {
      callbacks.updateRangeCircles(currentUnit);
    }
  });

  document.addEventListener('mouseup', function() {
    if (!isDragging) return;
    isDragging = false;
    _rbIsDragging = false;
    inner.classList.remove('dragging');

    // Spring back if rubber-band is enabled and we overshot
    if (_rbEnabled) {
      var c = computeClamps(bfW, bfH);
      var overshot = tx < -c.maxNegTx || tx > c.maxPosTx ||
                     ty < -c.maxNegTy || ty > c.maxPosTy;
      if (overshot) {
        springBack();
      }
    }

    if (currentUnit && activeRangeTypes.size > 0 && typeof callbacks.updateRangeCircles === 'function') {
      callbacks.updateRangeCircles(currentUnit);
    }
  });

  var resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      scale = initialScale;
      var ppu = (bfW / 720) * scale;
      var maxPosReset = (SVG_MID_X - BOUND_LEFT) * ppu - bfW / 2;
      tx = Math.max(0, maxPosReset);
      ty = 0;
      applyTx();
      if (currentUnit && activeRangeTypes.size > 0) {
        setTimeout(function(){
          if (typeof callbacks.updateRangeCircles === 'function') callbacks.updateRangeCircles(currentUnit);
        }, 50);
      }
    });
  }
}
