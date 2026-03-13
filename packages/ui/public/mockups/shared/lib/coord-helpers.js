/* coord-helpers.js — Coordinate conversion utilities (ES module) */

import { simState } from '../state/store.js';

var $ = function(s) { return document.querySelector(s); };
var $$ = function(s) { return Array.from(document.querySelectorAll(s)); };

export function battlefieldRect() {
  return $('#battlefield')?.getBoundingClientRect() || null;
}

export function battlefieldInnerRect() {
  return $('#battlefield-inner')?.getBoundingClientRect() || null;
}

function elementCenterRelativeTo(el, rect) {
  var elRect = el?.getBoundingClientRect();
  if (!elRect || !rect) return { x: 0, y: 0, valid: false };
  return {
    x: elRect.left - rect.left + elRect.width / 2,
    y: elRect.top - rect.top + elRect.height / 2,
    valid: true
  };
}

export function elementCenterInBattlefield(el) {
  return elementCenterRelativeTo(el, battlefieldRect());
}

export function elementCenterInBattlefieldInner(el) {
  return elementCenterRelativeTo(el, battlefieldInnerRect());
}

export function getUnitElements(unitId) {
  return $$('#layer-models .model-base[data-unit-id="' + unitId + '"]');
}

export function toBattlefieldCoords(svgX, svgY) {
  var svg = $('#bf-svg'), field = $('#battlefield');
  if (!Number.isFinite(svgX) || !Number.isFinite(svgY)) return { x: 0, y: 0, valid: false };
  if (!svg || !field) return { x: svgX, y: svgY, valid: true };
  var ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0, valid: false };
  var pt = svg.createSVGPoint();
  pt.x = svgX; pt.y = svgY;
  var screen = pt.matrixTransform(ctm);
  var rect = field.getBoundingClientRect();
  return { x: screen.x - rect.left, y: screen.y - rect.top, valid: true };
}

export function center(unit) {
  if (!unit || !Array.isArray(unit.models) || unit.models.length === 0) return { x: 0, y: 0, valid: false };
  var p = unit.models.reduce(function(a, m) { return { x: a.x + m.x, y: a.y + m.y }; }, { x: 0, y: 0 });
  return { x: p.x / unit.models.length, y: p.y / unit.models.length, valid: true };
}

export function getUnitAnchor(targetId, mode) {
  mode = mode || 'popup';
  var unit = simState.units.find(function(u) { return u.id === targetId; });
  if (!unit) return { x: 0, y: 0, valid: false };
  var c = center(unit);
  if (!c.valid) return { x: 0, y: 0, valid: false };
  var pos = toBattlefieldCoords(c.x, c.y);
  if (!pos.valid) return { x: 0, y: 0, valid: false };
  return { x: pos.x, y: pos.y + (mode === 'roll' ? 46 : 28), valid: true };
}

export function modelScreenCenter(model) {
  var el = document.querySelector('#layer-models .model-base[data-model-id="' + model.id + '"]');
  return elementCenterInBattlefieldInner(el);
}

export function projectileAnchor(model) {
  var svg = $('#bf-svg');
  var layer = $('#proj-container');
  if (!model || !svg || !layer || !Number.isFinite(model.x) || !Number.isFinite(model.y)) {
    return { x: 0, y: 0, valid: false };
  }
  var ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0, valid: false };
  var pt = svg.createSVGPoint();
  pt.x = model.x;
  pt.y = model.y;
  var screen = pt.matrixTransform(ctm);
  var rect = layer.getBoundingClientRect();
  var inner = $('#battlefield-inner');
  var scale = inner ? new DOMMatrixReadOnly(window.getComputedStyle(inner).transform).a || 1 : 1;
  return {
    x: (screen.x - rect.left) / scale,
    y: (screen.y - rect.top) / scale,
    valid: true
  };
}

export function getModelRadius(model) {
  return model.r || Math.max(model.w || 20, model.h || 20) / 2;
}
