/**
 * camera.js — Board pan/zoom state and controls.
 *
 * Split from svg-renderer.js for maintainability.
 */

import { currentUnit, activeRangeTypes, callbacks } from '../state/store.js';

// ── Pan / Zoom state (module-scoped) ───────────────────
var scale = 0.5;
var tx = 0;
var ty = 0;

// ── Content boundaries in SVG coordinates ──────────────
// These define the world-space extent the user should be able to reach.
var CONTENT_LEFT   = -560;   // staging zone left edge + margin
var CONTENT_RIGHT  =  740;   // board right edge + margin
var CONTENT_TOP    =  -20;   // top margin
var CONTENT_BOTTOM =  548;   // board bottom + margin

// ── Apply Transform (with content-aware clamping) ──────
export function applyTx() {
  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner) return;

  // Clamp tx/ty so the user can always pan to see every content edge,
  // but no further. The reachable world extent stays constant at all zoom levels.
  if (bf) {
    var bfW = bf.clientWidth;
    var bfH = bf.clientHeight;

    // SVG viewBox is 720×528, centered in the inner element.
    // pxPerUnit converts SVG units → CSS pixels at the current scale.
    var pxPerUnit = (bfW / 720) * scale;

    // SVG midpoints (viewBox centre)
    var svgMidX = 360;
    var svgMidY = 264;

    // Max positive tx = pan right enough to see leftmost content
    var maxPositiveTx = (svgMidX - CONTENT_LEFT) * pxPerUnit - bfW / 2;
    // Max negative tx = pan left enough to see rightmost content
    var maxNegativeTx = (CONTENT_RIGHT - svgMidX) * pxPerUnit - bfW / 2;

    // Max positive ty = pan down enough to see topmost content
    var maxPositiveTy = (svgMidY - CONTENT_TOP) * pxPerUnit - bfH / 2;
    // Max negative ty = pan up enough to see bottommost content
    var maxNegativeTy = (CONTENT_BOTTOM - svgMidY) * pxPerUnit - bfH / 2;

    var clampedPosTx = Math.max(0, maxPositiveTx);
    var clampedNegTx = Math.max(0, maxNegativeTx);
    var clampedPosTy = Math.max(0, maxPositiveTy);
    var clampedNegTy = Math.max(0, maxNegativeTy);

    // Debug: log pan limits at each zoom level
    if (!applyTx._lastScale || Math.abs(applyTx._lastScale - scale) > 0.01) {
      console.log('[camera] scale=' + scale.toFixed(2) +
        ' panX=[' + (-clampedNegTx).toFixed(0) + ', +' + clampedPosTx.toFixed(0) + ']' +
        ' panY=[' + (-clampedNegTy).toFixed(0) + ', +' + clampedPosTy.toFixed(0) + ']' +
        ' worldRangeX=' + ((clampedPosTx + clampedNegTx) / pxPerUnit).toFixed(0) + ' SVG units');
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
  scale = initialScale !== undefined ? initialScale : 0.5;
  tx = 0; ty = 0;
  applyTx();
}

// ── initBoard — pan / zoom ─────────────────────────────
export function initBoard(opts) {
  opts = opts || {};
  var initialScale = opts.initialScale !== undefined ? opts.initialScale : 0.5;
  scale = initialScale;
  tx = 0; ty = 0;

  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner || !bf) return;

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
    var zoomFactor = 1 + ((window.__zoomSensitivity || 5) / 50); // 5 → 1.1, 10 → 1.2
    scale = Math.min(3, Math.max(.35, scale * (e.deltaY>0 ? 1/zoomFactor : zoomFactor)));
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
    var panMult = (window.__camPanSpeed || 5) / 5; // 5 → 1x, 10 → 2x
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
      scale=initialScale; tx=0; ty=0; applyTx();
      if (currentUnit && activeRangeTypes.size > 0) {
        setTimeout(function(){
          if (typeof callbacks.updateRangeCircles === 'function') callbacks.updateRangeCircles(currentUnit);
        }, 50);
      }
    });
  }
}
