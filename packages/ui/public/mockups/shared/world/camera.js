/**
 * camera.js — Board pan/zoom state and controls.
 *
 * Split from svg-renderer.js for maintainability.
 *
 * Pan limits are derived from MIN_ZOOM so that the reachable world-space
 * edges are identical at every zoom level. At MIN_ZOOM the viewport exactly
 * fills the content bounds (pan = 0). At higher zoom, panning lets you
 * reach those same edges.
 */

import { currentUnit, activeRangeTypes, callbacks } from '../state/store.js';

// ── Zoom limits ────────────────────────────────────────
var MIN_ZOOM = 0.47;
var MAX_ZOOM = 3;

// ── Pan / Zoom state (module-scoped) ───────────────────
var scale = MIN_ZOOM;
var tx = 0;
var ty = 0;

// ── Content boundaries (computed at init from MIN_ZOOM) ─
// At MIN_ZOOM with tx/ty=0 the viewport shows exactly this rectangle.
// These become the hard pan edges at every zoom level.
var SVG_MID_X = 360;  // viewBox 720 / 2
var SVG_MID_Y = 264;  // viewBox 528 / 2

// Width bounds are screen-independent: 720 / MIN_ZOOM / 2
var HALF_W = 720 / (2 * MIN_ZOOM);               // ≈766 SVG units
var CONTENT_LEFT  = SVG_MID_X - HALF_W;           // ≈-406
var CONTENT_RIGHT = SVG_MID_X + HALF_W;           // ≈1126

// Height bounds depend on viewport aspect ratio — computed in initBoard()
var CONTENT_TOP    = -300;  // safe defaults until initBoard runs
var CONTENT_BOTTOM =  828;

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
    var maxPositiveTx = (SVG_MID_X - CONTENT_LEFT) * pxPerUnit - bfW / 2;
    // Max negative tx = pan left enough to see rightmost content
    var maxNegativeTx = (CONTENT_RIGHT - SVG_MID_X) * pxPerUnit - bfW / 2;

    // Max positive ty = pan down enough to see topmost content
    var maxPositiveTy = (SVG_MID_Y - CONTENT_TOP) * pxPerUnit - bfH / 2;
    // Max negative ty = pan up enough to see bottommost content
    var maxNegativeTy = (CONTENT_BOTTOM - SVG_MID_Y) * pxPerUnit - bfH / 2;

    var clampedPosTx = Math.max(0, maxPositiveTx);
    var clampedNegTx = Math.max(0, maxNegativeTx);
    var clampedPosTy = Math.max(0, maxPositiveTy);
    var clampedNegTy = Math.max(0, maxNegativeTy);

    // Debug: log pan limits when zoom changes
    if (!applyTx._lastScale || Math.abs(applyTx._lastScale - scale) > 0.01) {
      var leftEdge  = SVG_MID_X - (clampedPosTx + bfW / 2) / pxPerUnit;
      var rightEdge = SVG_MID_X + (clampedNegTx + bfW / 2) / pxPerUnit;
      console.log('[camera] scale=' + scale.toFixed(2) +
        ' panX=[' + (-clampedNegTx).toFixed(0) + ', +' + clampedPosTx.toFixed(0) + ']' +
        ' panY=[' + (-clampedNegTy).toFixed(0) + ', +' + clampedPosTy.toFixed(0) + ']' +
        ' edges=[' + leftEdge.toFixed(0) + ', ' + rightEdge.toFixed(0) + ']');
      applyTx._lastScale = scale;
    }

    tx = Math.max(-clampedNegTx, Math.min(clampedPosTx, tx));
    ty = Math.max(-clampedNegTy, Math.min(clampedPosTy, ty));
  }

  inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
}

// ── Camera access ──────────────────────────────────────
export function getCamera() { return { scale: scale, tx: tx, ty: ty }; }

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
  var initialScale = opts.initialScale !== undefined ? opts.initialScale : MIN_ZOOM;
  scale = initialScale;
  tx = 0; ty = 0;

  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner || !bf) return;

  // ── Compute height bounds from actual viewport aspect ratio ──
  // Width bounds (CONTENT_LEFT/RIGHT) are derived from MIN_ZOOM and the
  // SVG viewBox width (720), so they're screen-independent.
  // Height bounds depend on the viewport's aspect ratio because the SVG
  // uses preserveAspectRatio="xMidYMid slice" (width determines ppu).
  var bfW = bf.clientWidth;
  var bfH = bf.clientHeight;
  var HALF_H = (bfH / bfW) * 720 / (2 * MIN_ZOOM);
  CONTENT_TOP    = SVG_MID_Y - HALF_H;
  CONTENT_BOTTOM = SVG_MID_Y + HALF_H;

  console.log('[camera] bounds L=' + CONTENT_LEFT.toFixed(0) +
    ' R=' + CONTENT_RIGHT.toFixed(0) +
    ' T=' + CONTENT_TOP.toFixed(0) +
    ' B=' + CONTENT_BOTTOM.toFixed(0) +
    ' (minZoom=' + MIN_ZOOM + ')');

  applyTx();

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
      scale = initialScale; tx = 0; ty = 0; applyTx();
      if (currentUnit && activeRangeTypes.size > 0) {
        setTimeout(function(){
          if (typeof callbacks.updateRangeCircles === 'function') callbacks.updateRangeCircles(currentUnit);
        }, 50);
      }
    });
  }
}
