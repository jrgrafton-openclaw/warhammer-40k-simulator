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

// ── Apply Transform (with clamping) ────────────────────
export function applyTx() {
  var inner = document.getElementById('battlefield-inner');
  var bf    = document.getElementById('battlefield');
  if (!inner) return;

  // Clamp tx/ty to pan limits before writing transform
  if (bf) {
    var bfW = bf.clientWidth;
    var bfH = bf.clientHeight;
    var maxPanX = Math.max(0, (bfW * scale) * 0.4);
    var maxPanY = Math.max(0, (bfH * scale) * 0.4);
    tx = Math.max(-maxPanX, Math.min(maxPanX, tx));
    ty = Math.max(-maxPanY, Math.min(maxPanY, ty));
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
