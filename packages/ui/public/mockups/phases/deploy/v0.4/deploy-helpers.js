/**
 * deploy-helpers.js — Deployment zone constants, state, and zone/formation helpers.
 * ES module. Part of deployment v0.4.
 */

import { simState } from '../../../shared/state/store.js';
import { resolveUnitDragCollisions } from '../../../shared/world/collision.js';
import { finishPlacement, checkDeploymentComplete } from './deploy-ui.js';

// ── Constants ────────────────────────────────────────────
export var BOARD_W = 720;
export var BOARD_H = 528;
export var IMP_ZONE      = { xMin: 0,    xMax: 240,  yMin: 0,   yMax: BOARD_H };
export var ORK_ZONE      = { xMin: 480,  xMax: 720,  yMin: 0,   yMax: BOARD_H };
export var NML_ZONE      = { xMin: 240,  xMax: 480,  yMin: 0,   yMax: BOARD_H };
export var STAGING_ZONE  = { xMin: -540, xMax: -290, yMin: 20,  yMax: 508 };
export var DS_ZONE       = { xMin: -270, xMax: -20,  yMin: 20,  yMax: 250 };
export var RESERVES_ZONE = { xMin: -270, xMax: -20,  yMin: 278, yMax: 508 };

// ── Deployment state ─────────────────────────────────────
export var deployState = {
  activePlayer: 'imp',
  deployedUnits: new Set(),
  reserveUnits: new Set(),
  deepStrikeUnits: new Set(),
  placingUnit: null,
  stagingPositions: {},   // unit id → [{x,y}, ...] original staging model positions
  impTotal: 0,
  orkTotal: 0,
  locked: false
};

// Expose for renderModels to detect off-board units
window.__deployedUnitIds = deployState.deployedUnits;

// ── Zone helpers ─────────────────────────────────────────
export function getDeployZone(faction) {
  return faction === 'imp' ? IMP_ZONE : ORK_ZONE;
}

export function isInZone(x, y, r, zone) {
  return (x - r) >= zone.xMin && (x + r) <= zone.xMax &&
         (y - r) >= zone.yMin && (y + r) <= zone.yMax;
}

export function isPointInZone(x, y, zone) {
  return x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax;
}

export function isUnitInZone(unit, zone) {
  for (var i = 0; i < unit.models.length; i++) {
    var m = unit.models[i];
    var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
    if (!isInZone(m.x, m.y, r, zone)) return false;
  }
  return true;
}

export function detectZone(x, y) {
  if (isPointInZone(x, y, IMP_ZONE)) return 'imp';
  if (isPointInZone(x, y, ORK_ZONE)) return 'ork';
  if (isPointInZone(x, y, NML_ZONE)) return 'nml';
  if (isPointInZone(x, y, STAGING_ZONE)) return 'staging';
  if (isPointInZone(x, y, DS_ZONE)) return 'ds';
  if (isPointInZone(x, y, RESERVES_ZONE)) return 'reserves';
  return 'none';
}

export function getAnchorPos(unit) {
  var m = unit.models[0];
  return { x: m.x, y: m.y };
}

// ── Formation: arrange models in a coherent cluster ──────
export function arrangeModels(unit, cx, cy) {
  var models = unit.models;
  var n = models.length;
  if (n === 1) {
    models[0].x = cx;
    models[0].y = cy;
    return;
  }
  var spacing = 17;
  var cols = Math.ceil(Math.sqrt(n));
  var rows = Math.ceil(n / cols);
  var startX = cx - ((cols - 1) * spacing) / 2;
  var startY = cy - ((rows - 1) * spacing) / 2;
  for (var i = 0; i < n; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    models[i].x = startX + col * spacing;
    models[i].y = startY + row * spacing;
  }
}

// ── Clamp unit into zone as a GROUP (preserve relative layout) ─
export function _clampToZone(unit, zone) {
  // Find the minimum shift to bring ALL models inside the zone
  var needRight = 0, needLeft = 0, needDown = 0, needUp = 0;
  unit.models.forEach(function(m) {
    var r = m.shape === 'rect' ? Math.max(m.w, m.h) / 2 : m.r;
    var minX = zone.xMin + r, maxX = zone.xMax - r;
    var minY = zone.yMin + r, maxY = zone.yMax - r;
    if (m.x < minX) needRight = Math.max(needRight, minX - m.x);
    if (m.x > maxX) needLeft  = Math.max(needLeft,  m.x - maxX);
    if (m.y < minY) needDown  = Math.max(needDown,  minY - m.y);
    if (m.y > maxY) needUp    = Math.max(needUp,    m.y - maxY);
  });
  var dx = needRight - needLeft;
  var dy = needDown - needUp;
  if (dx !== 0 || dy !== 0) {
    unit.models.forEach(function(m) { m.x += dx; m.y += dy; });
  }
  // No terrain push-back — wall collision shown as orange highlight.
  // User repositions manually (matches movement phase UX).
  resolveUnitDragCollisions(unit, simState.units);
}

export function _snapBack(uid, unit) {
  var saved = deployState.stagingPositions[uid];
  if (saved) {
    unit.models.forEach(function(m, i) {
      if (saved[i]) { m.x = saved[i].x; m.y = saved[i].y; }
    });
  }
  // Restore previous deployment status
  var prevZone = deployState._preDragZone || 'staging';
  if (prevZone === 'imp') {
    deployState.deployedUnits.add(uid);
    unit.deployed = true;
  } else if (prevZone === 'ds') {
    deployState.deepStrikeUnits.add(uid);
  } else if (prevZone === 'reserves') {
    deployState.reserveUnits.add(uid);
  }
  deployState.placingUnit = null;
  showZoneWarning();
  finishPlacement();
  checkDeploymentComplete();
}

// ── Zone highlighting ────────────────────────────────────
export function highlightZones(active) {
  var impZone = document.querySelector('.deploy-zone-bg.imp-zone');
  var stagingZone = document.querySelector('.offboard-zone.staging-zone-bg');
  var dsZone = document.querySelector('.offboard-zone.ds-zone-bg');
  var reservesZone = document.querySelector('.offboard-zone.reserves-zone-bg');

  if (impZone) impZone.classList.toggle('zone-active', active);
  if (stagingZone) stagingZone.classList.toggle('zone-active', active);
  if (dsZone) dsZone.classList.toggle('zone-active', active);
  if (reservesZone) reservesZone.classList.toggle('zone-active', active);
}

export function highlightAllZonesByDetection(activeZoneName) {
  var impZone = document.querySelector('.deploy-zone-bg.imp-zone');
  var stagingZone = document.querySelector('.offboard-zone.staging-zone-bg');
  var dsZone = document.querySelector('.offboard-zone.ds-zone-bg');
  var reservesZone = document.querySelector('.offboard-zone.reserves-zone-bg');

  if (impZone) impZone.classList.toggle('zone-active', activeZoneName === 'imp');
  if (stagingZone) stagingZone.classList.toggle('zone-active', activeZoneName === 'staging');
  if (dsZone) dsZone.classList.toggle('zone-active', activeZoneName === 'ds');
  if (reservesZone) reservesZone.classList.toggle('zone-active', activeZoneName === 'reserves');
}

export function showZoneWarning(msg) {
  var warn = document.getElementById('zone-warning');
  if (!warn) return;
  if (msg) warn.textContent = msg;
  else warn.textContent = 'OUTSIDE DEPLOYMENT ZONE';
  warn.classList.add('visible');
  setTimeout(function() { warn.classList.remove('visible'); }, 1500);
}

// ── Global handlers needed by inline onclick in HTML ─────
window.toggleFaction = function(header) {
  var body = header.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  var chev = header.querySelector('.faction-chevron');
  if (chev) chev.textContent = body.style.display === 'none' ? '▸' : '▾';
};
window.toggleAA = function(header) {
  var body = header.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  var chev = header.querySelector('.aa-chev');
  if (chev) chev.textContent = body.style.display === 'none' ? '▸' : '▾';
};
