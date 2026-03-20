/**
 * camera.js — Board pan/zoom state and controls.
 *
 * Split from svg-renderer.js for maintainability.
 *
 * Pan limits are derived from the computed MIN_ZOOM so that the reachable
 * world-space edges are identical at every zoom level. MIN_ZOOM is computed
 * dynamically so the full content area fits in the viewport regardless of
 * screen aspect ratio (ultrawide, 16:9, etc.).
 */

import { currentUnit, activeRangeTypes, callbacks } from '../state/store.js';

// ── Zoom limits ────────────────────────────────────────
var MAX_ZOOM = 3;
var MIN_ZOOM = 0.35;  // safe default; computed properly in initBoard()

// ── Pan / Zoom state (module-scoped) ───────────────────
var scale = 0.5;
var tx = 0;
var ty = 0;

// ── Meaningful content bounds in SVG coordinates ───────
// These define the actual world content the user needs to see.
var CONTENT_W_LEFT   = -560;   // staging zone left edge + margin
var CONTENT_W_RIGHT  =  740;   // board right edge + margin
var CONTENT_W_TOP    =  -20;   // top margin
var CONTENT_W_BOTTOM =  548;   // board bottom + margin

// ── Viewport bounds (computed at init from MIN_ZOOM) ───
// The viewport extent at MIN_ZOOM — these become the hard pan edges.
// In the constraining dimension they equal the content bounds exactly;
// in the other dimension they may be slightly larger (symmetric padding).
var SVG_MID_X = 360;  // viewBox 720 / 2
var SVG_MID_Y = 264;  // viewBox 528 / 2
var BOUND_LEFT   = CONTENT_W_LEFT;
var BOUND_RIGHT  = CONTENT_W_RIGHT;
var BOUND_TOP    = CONTENT_W_TOP;
var BOUND_BOTTOM = CONTENT_W_BOTTOM;

// ── Apply Transform (with content-aware clamping) ──────
export function applyTx() {
  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner) return;

  if (bf) {
    var bfW = bf.clientWidth;
    var bfH = bf.clientHeight;

    // pxPerUnit converts SVG units → CSS pixels at the current scale.
    var pxPerUnit = (bfW / 720) * scale;

    // Max positive tx = pan right enough to see leftmost content
    var maxPositiveTx = (SVG_MID_X - BOUND_LEFT) * pxPerUnit - bfW / 2;
    // Max negative tx = pan left enough to see rightmost content
    var maxNegativeTx = (BOUND_RIGHT - SVG_MID_X) * pxPerUnit - bfW / 2;

    // Max positive ty = pan down enough to see topmost content
    var maxPositiveTy = (SVG_MID_Y - BOUND_TOP) * pxPerUnit - bfH / 2;
    // Max negative ty = pan up enough to see bottommost content
    var maxNegativeTy = (BOUND_BOTTOM - SVG_MID_Y) * pxPerUnit - bfH / 2;

    var clampedPosTx = Math.max(0, maxPositiveTx);
    var clampedNegTx = Math.max(0, maxNegativeTx);
    var clampedPosTy = Math.max(0, maxPositiveTy);
    var clampedNegTy = Math.max(0, maxNegativeTy);

    // Debug: log pan limits when zoom changes
    if (!applyTx._lastScale || Math.abs(applyTx._lastScale - scale) > 0.01) {
      var leftEdge  = SVG_MID_X - (clampedPosTx + bfW / 2) / pxPerUnit;
      var rightEdge = SVG_MID_X + (clampedNegTx + bfW / 2) / pxPerUnit;
      var topEdge   = SVG_MID_Y - (clampedPosTy + bfH / 2) / pxPerUnit;
      var bottomEdge = SVG_MID_Y + (clampedNegTy + bfH / 2) / pxPerUnit;
      console.log('[camera] scale=' + scale.toFixed(2) +
        ' panX=[' + (-clampedNegTx).toFixed(0) + ', +' + clampedPosTx.toFixed(0) + ']' +
        ' panY=[' + (-clampedNegTy).toFixed(0) + ', +' + clampedPosTy.toFixed(0) + ']' +
        ' edgesX=[' + leftEdge.toFixed(0) + ', ' + rightEdge.toFixed(0) + ']' +
        ' edgesY=[' + topEdge.toFixed(0) + ', ' + bottomEdge.toFixed(0) + ']');
      applyTx._lastScale = scale;
    }

    tx = Math.max(-clampedNegTx, Math.min(clampedPosTx, tx));
    ty = Math.max(-clampedNegTy, Math.min(clampedPosTy, ty));
  }

  inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
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

// ── initBoard — pan / zoom ─────────────────────────────
export function initBoard(opts) {
  opts = opts || {};

  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner || !bf) return;

  var bfW = bf.clientWidth;
  var bfH = bf.clientHeight;

  // ── Compute MIN_ZOOM dynamically ──────────────────────
  // Content must fit both horizontally AND vertically.
  // Width:  viewport SVG width  = 720 / scale → need 720/s >= contentW → s <= 720/contentW
  // Height: viewport SVG height = (bfH/bfW)*720/scale → need that >= contentH → s <= (bfH/bfW)*720/contentH
  var contentW = CONTENT_W_RIGHT - CONTENT_W_LEFT;    // 1300
  var contentH = CONTENT_W_BOTTOM - CONTENT_W_TOP;    // 568
  var maxZoomForWidth  = 720 / contentW;               // ~0.554
  var maxZoomForHeight = (bfH / bfW) * 720 / contentH;

  MIN_ZOOM = Math.min(maxZoomForWidth, maxZoomForHeight);
  // Floor at 0.15 to prevent absurdly zoomed-out views
  MIN_ZOOM = Math.max(0.15, MIN_ZOOM);

  // ── Compute viewport bounds at MIN_ZOOM ───────────────
  // In the constraining dimension, bounds = content bounds exactly.
  // In the other dimension, bounds exceed content symmetrically.
  // Content midpoints
  var contentMidX = (CONTENT_W_LEFT + CONTENT_W_RIGHT) / 2;   // 90
  var contentMidY = (CONTENT_W_TOP + CONTENT_W_BOTTOM) / 2;   // 264

  var viewportW = 720 / MIN_ZOOM;
  var viewportH = (bfH / bfW) * 720 / MIN_ZOOM;

  // Centre bounds on content midpoint so black space is symmetric
  BOUND_LEFT   = contentMidX - viewportW / 2;
  BOUND_RIGHT  = contentMidX + viewportW / 2;
  BOUND_TOP    = contentMidY - viewportH / 2;
  BOUND_BOTTOM = contentMidY + viewportH / 2;

  console.log('[camera] minZoom=' + MIN_ZOOM.toFixed(3) +
    ' bounds L=' + BOUND_LEFT.toFixed(0) +
    ' R=' + BOUND_RIGHT.toFixed(0) +
    ' T=' + BOUND_TOP.toFixed(0) +
    ' B=' + BOUND_BOTTOM.toFixed(0) +
    ' (contentW=' + contentW + ' contentH=' + contentH +
    ' viewportW=' + viewportW.toFixed(0) + ' viewportH=' + viewportH.toFixed(0) + ')');

  // ── Set initial scale and pan ─────────────────────────
  var initialScale = opts.initialScale !== undefined ? opts.initialScale : MIN_ZOOM;
  // Clamp initial scale to valid range
  initialScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialScale));
  scale = initialScale;

  // Start panned all the way left so the staging zone is fully visible.
  // This means tx = max positive tx (pan right to see leftmost content).
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

  var isDragging = false, startX, startY;
  var zoomEaseTimer = null;
  var zoomSettleTimer = null;
  var RC_IDS = ['range-move','range-advance','range-charge','range-ds','range-move-label','range-advance-label','range-charge-label','range-ds-label'];

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
    startX = e.clientX - tx;
    startY = e.clientY - ty;
    lastMX = e.clientX;
    lastMY = e.clientY;
    inner.classList.add('dragging');
    inner.classList.remove('zoom-easing');
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
    inner.classList.remove('dragging');
    if (currentUnit && activeRangeTypes.size > 0 && typeof callbacks.updateRangeCircles === 'function') {
      callbacks.updateRangeCircles(currentUnit);
    }
  });

  var resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      scale = initialScale;
      // Pan all the way left to show staging zone
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
