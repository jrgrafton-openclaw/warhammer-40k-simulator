(function(){
  'use strict';
  const B = window.BattleUI;
  const { simState, UNITS, PX_PER_INCH } = B;
  const ACTIVE = 'imp';

  const state = {
    attackerId: null,
    targetId: null,
    hoveredTargetId: null,
    selectedProfileIx: 0,
    shotUnits: new Set(),
    seed: (Date.now() ^ 0x5f3759df) >>> 0,
    pinnedPopupTargetId: null,
    pinnedRollTargetId: null,
    overlayRaf: null
  };

  window.__spentUnitIds = state.shotUnits;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function rng(){ state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
  function d6(){ return 1 + Math.floor(rng() * 6); }
  function getUnit(uid){ return simState.units.find(u => u.id === uid); }
  function isEnemy(uid){ const u = getUnit(uid); return u && u.faction !== ACTIVE; }
  function center(unit){
    if (!unit || !Array.isArray(unit.models) || unit.models.length === 0) return { x: 0, y: 0, valid: false };
    const p = unit.models.reduce((a, m) => ({ x: a.x + m.x, y: a.y + m.y }), { x: 0, y: 0 });
    return { x: p.x / unit.models.length, y: p.y / unit.models.length, valid: true };
  }
  function setStatus(msg){ const el = $('#move-mode-label'); if (el) el.textContent = msg || ''; }
  function distIn(a, b){ const ca = center(getUnit(a)), cb = center(getUnit(b)); return Math.hypot(ca.x - cb.x, ca.y - cb.y) / PX_PER_INCH; }
  function parseRange(weapon){ return parseInt(String(weapon?.rng || '').replace(/[^0-9]/g, '')) || 0; }
  function getBallisticSkill(uid){ return ({'assault-intercessors':3,'intercessor-squad-a':3,'hellblasters':3,'primaris-lieutenant':3,'redemptor-dreadnought':3,'boyz-mob':5,'boss-nob':5,'mekboy':5,'nobz-mob':5,'gretchin':5}[uid] || 4); }
  function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g, '')); return n || 7; }
  function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
  function damageValue(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return null; return Number(s) || 1; }
  function pickDamage(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng() * 3); return Number(s) || 1; }
  function attackCount(profile, attacker, visibleModelCount){ 
    const modelCount = (typeof visibleModelCount === 'number') ? visibleModelCount : attacker.models.length;
    return (Number(profile.a || 1) || 1) * Math.max(0, modelCount);
  }
  function getModelRadius(model){ return model.r || Math.max(model.w || 20, model.h || 20) / 2; }

  function getProfiles(uid){
    const u = UNITS[uid];
    if (!u) return [];
    let w = [].concat(u.weapons || []);
    const wg = B.wgState?.[uid] || {};
    (u.wargear || []).forEach((opt, i) => { if (wg[i] && opt.adds) w.push(opt.adds); });
    return w.filter(x => x.type === 'RANGED');
  }

  function keywordsFor(profile){
    return [].concat(profile?.keywords || profile?.kw || []).filter(Boolean).map(String);
  }
  function kwTip(k){
    return (B.KW_RULES && B.KW_RULES[k] && B.KW_RULES[k].tip) || 'Keyword ability.';
  }
  function kwClass(k){
    const v = String(k).toLowerCase();
    if (v.includes('pistol')) return 'pistol';
    if (v.includes('assault')) return 'assault';
    if (v.includes('heavy')) return 'heavy';
    if (v.includes('hazard')) return 'hazardous';
    if (v.includes('rapid')) return 'rapid';
    if (v.includes('blast')) return 'blast';
    if (v.includes('melta')) return 'melta';
    return 'other';
  }

  // ── Point-in-polygon (ray casting) for local-space polygons ──
  function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ── Ray-polygon intersection for tall ruin LoS blocking ──
  // Tests a line segment (in SVG space) against all tall ruin footprint blockers.
  // Per 40K rules: a ruin does NOT block LoS if the attacker or target is inside it.
  // Returns { blocked: bool, hitPoint: {x,y}|null, t: number (0-1, parametric along ray) }
  function rayIntersectsTallRuins(x1, y1, x2, y2, blockers) {
    let bestT = Infinity;
    let bestHitLocal = null;
    let bestBlocker = null;

    for (let bi = 0; bi < blockers.length; bi++) {
      const b = blockers[bi];
      // Transform ray endpoints to LOCAL space
      const lx1 = b.iA * x1 + b.iC * y1 + b.iE;
      const ly1 = b.iB * x1 + b.iD * y1 + b.iF;
      const lx2 = b.iA * x2 + b.iC * y2 + b.iE;
      const ly2 = b.iB * x2 + b.iD * y2 + b.iF;

      // Skip this ruin if attacker or target is INSIDE its footprint
      // (units within a ruin can see out; units can shoot into ruins)
      if (pointInPolygon(lx1, ly1, b.polygon) || pointInPolygon(lx2, ly2, b.polygon)) continue;

      const poly = b.polygon;
      const n = poly.length;

      // Test segment against each polygon edge
      const rdx = lx2 - lx1, rdy = ly2 - ly1;

      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = poly[j].x - poly[i].x, ey = poly[j].y - poly[i].y;
        const denom = rdx * ey - rdy * ex;
        if (Math.abs(denom) < 1e-10) continue;

        const dx = poly[i].x - lx1, dy = poly[i].y - ly1;
        const t = (dx * ey - dy * ex) / denom;  // parametric along ray
        const u = (dx * rdy - dy * rdx) / denom; // parametric along edge

        if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) {
          if (t < bestT) {
            bestT = t;
            bestHitLocal = { x: lx1 + t * rdx, y: ly1 + t * rdy };
            bestBlocker = b;
          }
        }
      }
    }

    if (bestBlocker && bestHitLocal) {
      // Transform hit point back to SVG space
      const svgX = bestBlocker.fA * bestHitLocal.x + bestBlocker.fC * bestHitLocal.y + bestBlocker.fE;
      const svgY = bestBlocker.fB * bestHitLocal.x + bestBlocker.fD * bestHitLocal.y + bestBlocker.fF;
      return { blocked: true, hitPoint: { x: svgX, y: svgY }, t: bestT };
    }
    return { blocked: false, hitPoint: null, t: 1 };
  }

  // ── Edge-to-edge LoS helpers ────────────────────────────
  // Generate 8 edge points around a circular model base (compass directions)
  function modelEdgePoints(model) {
    const r = getModelRadius(model);
    const cx = model.x, cy = model.y;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return pts;
  }

  // Test edge-to-edge visibility between two models.
  // Returns { canSee, bestRay: { from, to, dist } | null }
  function canModelSeeModel(attackerModel, targetModel, blockers) {
    const aPts = modelEdgePoints(attackerModel);
    const tPts = modelEdgePoints(targetModel);
    let bestClearRay = null;

    for (let ai = 0; ai < aPts.length; ai++) {
      const ap = aPts[ai];
      for (let ti = 0; ti < tPts.length; ti++) {
        const tp = tPts[ti];
        const result = rayIntersectsTallRuins(ap.x, ap.y, tp.x, tp.y, blockers);
        if (!result.blocked) {
          const dist = Math.hypot(ap.x - tp.x, ap.y - tp.y);
          if (!bestClearRay || dist < bestClearRay.dist) {
            bestClearRay = { from: ap, to: tp, dist };
          }
          // Early exit: one clear ray is enough to confirm visibility
          // but keep looking for a shorter ray for better visualization
        }
      }
    }
    return { canSee: !!bestClearRay, bestRay: bestClearRay };
  }

  // ── Per-model line-of-sight ──────────────────────────────
  // Returns { state, visibleAttackerCount, totalAttackerCount, perModel, visibleTargetModelIds }
  function losState(attackerId, targetId) {
    const a = getUnit(attackerId), t = getUnit(targetId);
    if (!a || !t) return { state: 'blocked', visibleAttackerCount: 0, totalAttackerCount: 0, perModel: new Map(), visibleTargetModelIds: new Set() };

    const blockers = window._losBlockers || [];
    const perModel = new Map();
    const visibleTargetModelIds = new Set();
    let visibleCount = 0;
    const totalCount = a.models.length;

    if (!blockers.length) {
      // No blockers → all clear
      t.models.forEach(tm => visibleTargetModelIds.add(tm.id));
      a.models.forEach(am => {
        const closest = t.models.reduce((best, tm) => {
          const d = Math.hypot(am.x - tm.x, am.y - tm.y);
          return (!best || d < best.dist) ? { model: tm, dist: d, hitPoint: null } : best;
        }, null);
        perModel.set(am.id, { canSee: true, bestTarget: closest, bestRay: null });
      });
      return { state: 'clear', visibleAttackerCount: totalCount, totalAttackerCount: totalCount, perModel, visibleTargetModelIds };
    }

    a.models.forEach(am => {
      let canSee = false;
      let bestVisibleTarget = null;
      let bestVisibleRay = null;
      let bestBlockedTarget = null;

      t.models.forEach(tm => {
        const edgeResult = canModelSeeModel(am, tm, blockers);

        if (edgeResult.canSee) {
          canSee = true;
          visibleTargetModelIds.add(tm.id);
          const dist = Math.hypot(am.x - tm.x, am.y - tm.y);
          if (!bestVisibleTarget || dist < bestVisibleTarget.dist) {
            bestVisibleTarget = { model: tm, dist, hitPoint: null };
            bestVisibleRay = edgeResult.bestRay;
          }
        } else {
          // All 64 rays blocked — find best blocked ray via center-to-center for visualization
          const ccResult = rayIntersectsTallRuins(am.x, am.y, tm.x, tm.y, blockers);
          const dist = Math.hypot(am.x - tm.x, am.y - tm.y);
          if (!bestBlockedTarget || dist < bestBlockedTarget.dist) {
            bestBlockedTarget = { model: tm, dist, hitPoint: ccResult.hitPoint };
          }
        }
      });

      if (canSee) visibleCount++;
      perModel.set(am.id, {
        canSee,
        bestTarget: canSee ? bestVisibleTarget : bestBlockedTarget,
        bestRay: canSee ? bestVisibleRay : null
      });
    });

    let state;
    if (visibleCount === 0) state = 'blocked';
    else if (visibleCount === totalCount) state = 'clear';
    else state = 'partial';

    return { state, visibleAttackerCount: visibleCount, totalAttackerCount: totalCount, perModel, visibleTargetModelIds };
  }

  function targetInfo(enemyId, profileIx = state.selectedProfileIx){
    if(!state.attackerId) return {valid:false, reason:'Select attacker first', los:'blocked'};
    const profiles = getProfiles(state.attackerId);
    const p = profiles[profileIx];
    if(!p) return {valid:false, reason:'No ranged weapon', los:'blocked'};
    const r=parseRange(p); const d=distIn(state.attackerId, enemyId);
    const losResult = losState(state.attackerId, enemyId);
    const losStr = losResult.state;
    if(d>r) return {valid:false, reason:`Out of range (${d.toFixed(1)}" > ${r}")`, d, r, los: losStr, losResult};
    if(losStr==='blocked') return {valid:false, reason:'No line of sight', d, r, los: losStr, losResult};
    let reason;
    if (losStr === 'partial') {
      reason = `${losResult.visibleAttackerCount}/${losResult.totalAttackerCount} models have LoS · ${d.toFixed(1)}" / ${r}"`;
    } else {
      reason = `Clear LoS ${d.toFixed(1)}" / ${r}"`;
    }
    return {valid:true, reason, d, r, los: losStr, losResult};
  }

  function getValidProfilesForTarget(targetId){
    return getProfiles(state.attackerId).map((p, i)=>({profile:p, i, info:targetInfo(targetId, i)})).filter(x=>x.info.valid);
  }

  // Check if a unit has Benefit of Cover (any model wholly within a ruin footprint)
  function unitHasCover(unitId) {
    const unit = getUnit(unitId);
    if (!unit) return false;
    const blockers = window._losBlockers || [];
    if (!blockers.length) return false;
    // A unit has cover if ANY of its models is wholly within a ruin footprint
    return unit.models.some(m => {
      return blockers.some(b => {
        // Transform model center to local space
        const lx = b.iA * m.x + b.iC * m.y + b.iE;
        const ly = b.iB * m.x + b.iD * m.y + b.iF;
        return pointInPolygon(lx, ly, b.polygon);
      });
    });
  }

  function deriveThresholds(profile, attacker, target){
    const bs = getBallisticSkill(attacker.id);
    const hit = Math.min(6, Math.max(2, bs));
    const t = Number(UNITS[target.id]?.stats?.T || 4);
    const rawSave = parseSave(UNITS[target.id]?.stats?.Sv);
    const ap = Number(profile.ap || 0);
    const inCover = unitHasCover(target.id);

    // Benefit of Cover: +1 to save roll (i.e. save threshold improves by 1)
    // Exception: if base save is 3+ or better AND AP is 0, no cover bonus
    let coverBonus = 0;
    if (inCover) {
      const skipCover = (rawSave <= 3 && ap === 0);
      if (!skipCover) coverBonus = 1;
    }

    const save = Math.min(7, Math.max(2, rawSave - ap - coverBonus));
    return { hit, wound: woundTarget(Number(profile.s || 0), t), save, inCover, coverBonus };
  }

  function updateSpentIndicators(){
    $$('.rail-unit').forEach(row => row.classList.toggle('attacked', state.shotUnits.has(row.dataset.unit)));
    const badge = $('#unit-state-badge');
    if (badge) badge.classList.toggle('visible', !!state.attackerId && state.shotUnits.has(state.attackerId));
  }

  function describeWoundState(uid){
    const unit = getUnit(uid);
    if (!unit) return null;
    const wPer = Number(UNITS[uid]?.stats?.W || 1);
    const carry = unit._carryWounds || 0;
    if (wPer <= 1 || carry <= 0) return null;
    return { unit, wPer, carry, remaining: Math.max(0, wPer - carry), lostFrac: carry / wPer };
  }

  function circleArcPath(cx, cy, r, startDeg, endDeg){
    const toRad = (deg) => (deg - 90) * Math.PI / 180;
    const sx = cx + r * Math.cos(toRad(startDeg));
    const sy = cy + r * Math.sin(toRad(startDeg));
    const ex = cx + r * Math.cos(toRad(endDeg));
    const ey = cy + r * Math.sin(toRad(endDeg));
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
  }

  function updateWoundOverlays(){
    const NS = 'http://www.w3.org/2000/svg';
    $$('#layer-models .model-base').forEach(g => {
      const uid = g.dataset.unitId;
      const wound = describeWoundState(uid);
      const existing = g.querySelector('.wound-ring-layer');
      if (existing) existing.remove();
      if (!wound) return;
      const focusModel = wound.unit.models[wound.unit.models.length - 1];
      if (!focusModel || focusModel.id !== g.dataset.modelId) return;
      const m = focusModel;
      const ring = document.createElementNS(NS, 'g');
      ring.setAttribute('class', 'wound-ring-layer');
      const r = getModelRadius(m) + 5;
      const cx = m.x, cy = m.y;

      const track = document.createElementNS(NS, 'circle');
      track.setAttribute('class', 'wound-ring-track');
      track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
      ring.appendChild(track);

      const lostSweep = Math.max(10, 360 * wound.lostFrac);
      const remainSweep = Math.max(0, 360 - lostSweep - 8);
      if (remainSweep > 6) {
        const remain = document.createElementNS(NS, 'path');
        remain.setAttribute('class', 'wound-ring-remain');
        remain.setAttribute('d', circleArcPath(cx, cy, r, 0, remainSweep));
        ring.appendChild(remain);
      }
      const lost = document.createElementNS(NS, 'path');
      lost.setAttribute('class', 'wound-ring-lost');
      lost.setAttribute('d', circleArcPath(cx, cy, r, remainSweep + 8, 360));
      ring.appendChild(lost);

      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('class', 'wound-ring-label-bg');
      bg.setAttribute('x', cx - 13); bg.setAttribute('y', cy + r + 4); bg.setAttribute('rx', '4');
      bg.setAttribute('width', '26'); bg.setAttribute('height', '12');
      ring.appendChild(bg);
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('class', 'wound-ring-label');
      txt.setAttribute('x', cx); txt.setAttribute('y', cy + r + 13);
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = `${wound.remaining}W`;
      ring.appendChild(txt);

      g.appendChild(ring);
    });
  }

  function clearLines(){ const g = $('#layer-target-lines'); if (g) g.innerHTML = ''; }

  function closestTargetEdgePoint(attackerModel, targetUnit){
    let best = null;
    targetUnit.models.forEach(m => {
      const radius = getModelRadius(m);
      const dx = attackerModel.x - m.x; const dy = attackerModel.y - m.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = m.x + (dx / len) * radius; const py = m.y + (dy / len) * radius;
      const dist = Math.hypot(attackerModel.x - px, attackerModel.y - py);
      if (!best || dist < best.dist) best = { x: px, y: py, dist };
    });
    return best || center(targetUnit);
  }

  function battlefieldRect(){
    return $('#battlefield')?.getBoundingClientRect() || null;
  }

  function battlefieldInnerRect(){
    return $('#battlefield-inner')?.getBoundingClientRect() || null;
  }

  function elementCenterRelativeTo(el, rect){
    const elRect = el?.getBoundingClientRect();
    if (!elRect || !rect) return { x: 0, y: 0, valid: false };
    return {
      x: elRect.left - rect.left + elRect.width / 2,
      y: elRect.top - rect.top + elRect.height / 2,
      valid: true
    };
  }

  function elementCenterInBattlefield(el){
    return elementCenterRelativeTo(el, battlefieldRect());
  }

  function elementCenterInBattlefieldInner(el){
    return elementCenterRelativeTo(el, battlefieldInnerRect());
  }

  function getUnitElements(unitId){
    return $$(`#layer-models .model-base[data-unit-id="${unitId}"]`);
  }

  function toBattlefieldCoords(svgX, svgY){
    const svg = $('#bf-svg'), field = $('#battlefield');
    if (!Number.isFinite(svgX) || !Number.isFinite(svgY)) return { x: 0, y: 0, valid: false };
    if (!svg || !field) return { x: svgX, y: svgY, valid: true };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0, valid: false };
    const pt = svg.createSVGPoint();
    pt.x = svgX; pt.y = svgY;
    const screen = pt.matrixTransform(ctm);
    const rect = field.getBoundingClientRect();
    return { x: screen.x - rect.left, y: screen.y - rect.top, valid: true };
  }

  function getUnitAnchor(targetId, mode='popup'){
    const unit = getUnit(targetId); if (!unit) return { x: 0, y: 0, valid: false };
    const c = center(unit);
    if (!c.valid) return { x: 0, y: 0, valid: false };
    const pos = toBattlefieldCoords(c.x, c.y);
    if (!pos.valid) return { x: 0, y: 0, valid: false };
    return { x: pos.x, y: pos.y + (mode === 'roll' ? 46 : 28), valid: true };
  }

  function getTargetAnchor(targetId, mode='popup'){
    return getUnitAnchor(targetId, mode);
  }

  function ensureOverlayPinLoop(){
    if (state.overlayRaf) return;
    const tick = () => {
      const roll = $('#roll-overlay');
      if (roll && !roll.classList.contains('hidden')) {
        roll.style.left = '50%';
        roll.style.top = 'auto';
        roll.style.bottom = '68px';
      }
      if (roll && !roll.classList.contains('hidden'))
        state.overlayRaf = requestAnimationFrame(tick);
      else state.overlayRaf = null;
    };
    state.overlayRaf = requestAnimationFrame(tick);
  }

  function drawHoverLines(targetId){
    const g = $('#layer-target-lines'); if (!g) return; g.innerHTML='';
    if (!state.attackerId || !targetId) return;
    const attacker = getUnit(state.attackerId), target = getUnit(targetId); if (!attacker || !target) return;
    const NS = 'http://www.w3.org/2000/svg';
    const losResult = losState(state.attackerId, targetId);

    attacker.models.forEach(m => {
      const modelLos = losResult.perModel.get(m.id);
      if (!modelLos || !modelLos.bestTarget) return;

      if (modelLos.canSee && modelLos.bestRay) {
        // Edge-to-edge clear ray
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', modelLos.bestRay.from.x); line.setAttribute('y1', modelLos.bestRay.from.y);
        line.setAttribute('x2', modelLos.bestRay.to.x); line.setAttribute('y2', modelLos.bestRay.to.y);
        line.setAttribute('class', 'target-line-clear');
        g.appendChild(line);
      } else if (modelLos.canSee) {
        // Clear but no bestRay (no blockers case) — center to edge
        const tm = modelLos.bestTarget.model;
        const edge = closestTargetEdgePoint(m, { models: [tm] });
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', m.x); line.setAttribute('y1', m.y);
        line.setAttribute('x2', edge.x); line.setAttribute('y2', edge.y);
        line.setAttribute('class', 'target-line-clear');
        g.appendChild(line);
      } else {
        // Blocked: blue to hit point, then red/dashed to target (center-to-center)
        const tm = modelLos.bestTarget.model;
        const edge = closestTargetEdgePoint(m, { models: [tm] });
        const hp = modelLos.bestTarget.hitPoint;
        if (hp) {
          const blueLine = document.createElementNS(NS, 'line');
          blueLine.setAttribute('x1', m.x); blueLine.setAttribute('y1', m.y);
          blueLine.setAttribute('x2', hp.x); blueLine.setAttribute('y2', hp.y);
          blueLine.setAttribute('class', 'target-line-clear');
          g.appendChild(blueLine);

          const redLine = document.createElementNS(NS, 'line');
          redLine.setAttribute('x1', hp.x); redLine.setAttribute('y1', hp.y);
          redLine.setAttribute('x2', edge.x); redLine.setAttribute('y2', edge.y);
          redLine.setAttribute('class', 'target-line-blocked');
          g.appendChild(redLine);
        } else {
          const line = document.createElementNS(NS, 'line');
          line.setAttribute('x1', m.x); line.setAttribute('y1', m.y);
          line.setAttribute('x2', edge.x); line.setAttribute('y2', edge.y);
          line.setAttribute('class', 'target-line-blocked');
          g.appendChild(line);
        }
      }
    });
  }

  function clearEffects(){
    const proj = $('#proj-container');
    const hit = $('#hit-flash-layer');
    if (proj) proj.innerHTML = '';
    if (hit) hit.innerHTML = '';
  }

  function modelScreenCenter(model){
    const el = document.querySelector(`#layer-models .model-base[data-model-id="${model.id}"]`);
    return elementCenterInBattlefieldInner(el);
  }

  function projectileAnchor(model){
    const svg = $('#bf-svg');
    const layer = $('#proj-container');
    if (!model || !svg || !layer || !Number.isFinite(model.x) || !Number.isFinite(model.y)) {
      return { x: 0, y: 0, valid: false };
    }
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0, valid: false };
    const pt = svg.createSVGPoint();
    pt.x = model.x;
    pt.y = model.y;
    const screen = pt.matrixTransform(ctm);
    const rect = layer.getBoundingClientRect();
    // Account for CSS transform scale on #battlefield-inner
    const inner = $('#battlefield-inner');
    const scale = inner ? new DOMMatrixReadOnly(window.getComputedStyle(inner).transform).a || 1 : 1;
    return {
      x: (screen.x - rect.left) / scale,
      y: (screen.y - rect.top) / scale,
      valid: true
    };
  }

  function tokenVisual(model){
    return document.querySelector(`#layer-models .model-base[data-model-id="${model.id}"]`);
  }

  function randomTargetModel(target){
    return target.models[Math.floor(rng() * target.models.length)] || target.models[0];
  }

  function createHitMarker(model, extraClass=''){
    const token = tokenVisual(model);
    if (!token) return null;
    token.classList.remove('anim-hit-token');
    void token.getBoundingClientRect();
    token.classList.add('anim-hit-token');
    if (extraClass) token.classList.add(extraClass);
    setTimeout(() => {
      token.classList.remove('anim-hit-token');
      if (extraClass) token.classList.remove(extraClass);
    }, 820);
    return token;
  }

  function fireProjectile(color, startPos, endPos){
    const c = document.getElementById('proj-container');
    if (!c) return;
    const p = document.createElement('div');
    p.className='projectile';
    p.style.cssText=`--proj-color:${color};offset-path:path('M ${startPos.x} ${startPos.y} L ${endPos.x} ${endPos.y}');`;
    c.appendChild(p);
    setTimeout(() => p.remove(), 500);
  }

  async function playVolley(attacker, target, losResult){
    // Only fire from models that can see the target
    const firingModels = attacker.models.filter(m => {
      const info = losResult?.perModel?.get(m.id);
      return !info || info.canSee;  // if no LoS data, default to firing (fallback)
    });
    const pairs = firingModels.map(m => ({ from: m, to: randomTargetModel(target) }));
    pairs.forEach((pair, ix) => {
      const from = projectileAnchor(pair.from);
      const to = projectileAnchor(pair.to);
      if (!from.valid || !to.valid) return;
      setTimeout(() => {
        fireProjectile('#ff8c00', from, to);
      }, ix * 70);
    });
    await new Promise(r => setTimeout(r, Math.max(460, pairs.length * 70 + 420)));
  }

  function closeWeaponPopup(){
    const el = $('#roll-overlay');
    state.pinnedPopupTargetId = null;
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  }

  function openWeaponPopup(targetId, options){
    const overlay = $('#roll-overlay'); if (!overlay) return;
    state.pinnedPopupTargetId = targetId;
    overlay.innerHTML = `<div class="overlay-title">Select Weapon</div><div class="weapon-grid">${options.map(opt => {
      const ap = Number(opt.profile.ap || 0);
      const kws = keywordsFor(opt.profile).map(k => `<span class="kw-pill ${kwClass(k)}" data-tip="${kwTip(k).replace(/"/g, '&quot;')}">${k}</span>`).join('');
      return `<button class="weapon-choice" data-ix="${opt.i}"><span class="weapon-choice-name">${opt.profile.name}</span><div class="weapon-meta-row"><span class="weapon-meta">${opt.profile.rng}</span><span class="weapon-meta">A${opt.profile.a}</span><span class="weapon-meta">S${opt.profile.s}</span><span class="weapon-meta ${ap !== 0 ? 'ap-hot' : ''}">AP ${opt.profile.ap}</span><span class="weapon-meta dmg-hot">D ${opt.profile.d}</span></div>${kws ? `<div class="weapon-kws">${kws}</div>` : ''}</button>`;
    }).join('')}</div>`;
    overlay.classList.remove('hidden');
    if (B.initAllTooltips) B.initAllTooltips();
    overlay.querySelectorAll('[data-tip]').forEach(el => {
      if (el._shootTipInit) return;
      el._shootTipInit = true;
      el.addEventListener('mouseenter', () => B.showTip(el, el.dataset.tip));
      el.addEventListener('mouseleave', B.hideTip);
    });
    overlay.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => {
      state.selectedProfileIx = Number(btn.dataset.ix);
      closeWeaponPopup(); beginAttack(targetId);
    }));
    ensureOverlayPinLoop();
  }

  function renderDiceStage(title, count, threshold, auto, message='', ctaLabel='Click to roll'){
    const overlay = $('#roll-overlay');
    const chips = Array.from({length: Math.max(1, count)}, () => '<span class="die pre-roll">–</span>').join('');
    overlay.innerHTML = `<div class="overlay-title">${title}</div><div class="dice-row">${chips}</div><div class="dice-summary">${message || (threshold ? `Target ${threshold}+` : 'Resolve damage')}</div><button class="roll-cta">${auto ? 'Resolving…' : ctaLabel}</button>`;
    overlay.classList.remove('hidden');
    ensureOverlayPinLoop();
  }

  function revealDice(rolls, threshold, stageKind){
    const chips = $$('#roll-overlay .die');
    rolls.forEach((r, i) => {
      const chip = chips[i]; if (!chip) return;
      chip.textContent = '–';
      chip.classList.remove('pre-roll');
      chip.classList.add('rolling');
      setTimeout(() => {
        chip.classList.remove('rolling');
        chip.textContent = r;
        if (threshold == null) {
          chip.classList.add('success');
        } else if (r >= threshold) {
          if (stageKind === 'save') chip.classList.add('enemy-success');
          else { chip.classList.add('success'); setTimeout(() => chip.classList.add('flashing'), 20); }
        } else {
          if (stageKind === 'save') { chip.classList.add('enemy-fail'); setTimeout(() => chip.classList.add('flashing'), 20); }
          else chip.classList.add('fail');
        }
      }, 80 + i * 40);
    });
  }

  function rollDiceStage(title, rolls, threshold, auto = false, targetId = null, message='', stageKind='generic', ctaLabel='Click to roll', nextLabel='Continue', onTrigger = null){
    return new Promise(resolve => {
      const overlay = $('#roll-overlay'); if (!overlay) return resolve({ rolls, successes: rolls.length, threshold });
      state.pinnedRollTargetId = targetId;
      const successes = threshold ? rolls.filter(r => r >= threshold).length : rolls.length;
      renderDiceStage(title, rolls.length, threshold, auto, message, ctaLabel);
      const cta = overlay.querySelector('.roll-cta');
      const fire = async () => {
        if (typeof onTrigger === 'function') await onTrigger();
        revealDice(rolls, threshold, stageKind);
        setTimeout(() => {
          if (auto) {
            setTimeout(() => {
              // Don't hide the overlay between auto stages — next renderDiceStage
              // will replace content in-place, preventing flicker
              resolve({ rolls, successes, threshold });
            }, 260 + rolls.length * 40);
          } else {
            cta.textContent = nextLabel; cta.disabled = false;
            cta.onclick = () => resolve({ rolls, successes, threshold, advanceRequested: true });
          }
        }, 480 + rolls.length * 40);
      };
      if (auto) { cta.disabled = true; setTimeout(() => { fire(); }, 140); }
      else cta.addEventListener('click', () => { cta.disabled = true; fire(); }, { once: true });
    });
  }

  function showResultPanel(targetId, totalDamage, killCount){
    return new Promise(resolve => {
      const overlay = $('#roll-overlay');
      state.pinnedRollTargetId = targetId;
      overlay.innerHTML = `
        <div class="overlay-title">Attack Resolved</div>
        <div class="result-main">
          <div class="result-row wounds"><span class="result-icon">⚔</span><span class="result-num">${totalDamage}</span><span class="result-label">Wound${totalDamage===1?'':'s'} Applied</span></div>
          <div class="result-row kills ${killCount > 0 ? 'has-kills' : ''}"><span class="result-icon">☠</span><span class="result-num">${killCount}</span><span class="result-label">Model${killCount===1?'':'s'} Destroyed</span></div>
        </div>
        <button class="roll-cta">OK</button>`;
      overlay.classList.remove('hidden');
      ensureOverlayPinLoop();
      overlay.querySelector('.roll-cta').addEventListener('click', () => {
        overlay.classList.add('hidden'); state.pinnedRollTargetId = null; resolve();
      }, { once: true });
    });
  }

  async function animateUnitDestroyed(unitId){
    const hull = document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${unitId}"]`);
    const models = document.querySelectorAll(`#layer-models .model-base[data-unit-id="${unitId}"]`);
    hull?.classList.add('anim-die');
    models.forEach(m => m.classList.add('anim-die'));
    await new Promise(r => setTimeout(r, 720));
  }

  function paint(){
    $$('#layer-hulls .unit-hull').forEach(h=>{
      const uid = h.dataset.unitId;
      h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker','shoot-partial');
      if (uid === state.attackerId) h.classList.add('shoot-attacker');
      else if (isEnemy(uid) && state.attackerId && !state.shotUnits.has(state.attackerId)) {
        const valids = getValidProfilesForTarget(uid);
        if (valids.length) {
          h.classList.add('shoot-valid');
          if (valids.some(v => v.info.los === 'partial' || (v.info.losResult && v.info.losResult.state === 'partial'))) h.classList.add('shoot-partial');
        } else h.classList.add('shoot-invalid');
      }
      if (uid === state.targetId || uid === state.hoveredTargetId) h.classList.add('shoot-target');
    });
    updateSpentIndicators();
    updateWoundOverlays();
  }

  function allocateWoundsToModels(target, totalDamage, visibleTargetModelIds){
    let remainingDamage = totalDamage;
    const removedModelIds = [];
    const flashedModels = [];
    const perModelW = Number(UNITS[target.id]?.stats?.W || 1) || 1;
    target._carryWounds = target._carryWounds || 0;

    while (remainingDamage > 0 && target.models.length > 0) {
      // Find the best focus model: prefer back-of-array (normal 40K allocation order),
      // but skip hidden models and pick the next visible one instead.
      let focusIdx = target.models.length - 1;
      if (visibleTargetModelIds) {
        // Walk backwards to find a visible model to allocate wounds to
        focusIdx = -1;
        for (let i = target.models.length - 1; i >= 0; i--) {
          if (visibleTargetModelIds.has(target.models[i].id)) { focusIdx = i; break; }
        }
        if (focusIdx === -1) break; // No visible models remain — waste remaining damage
      }
      const focus = target.models[focusIdx];
      if (!focus) break;

      flashedModels.push(focus);
      const woundsNeeded = perModelW - target._carryWounds;
      const applied = Math.min(remainingDamage, woundsNeeded);
      target._carryWounds += applied;
      remainingDamage -= applied;
      if (target._carryWounds >= perModelW) {
        removedModelIds.push(focus.id);
        target.models.splice(focusIdx, 1);
        target._carryWounds = 0;
      }
    }

    return { removedModelIds, flashedModels, remainingDamage };
  }

  async function playWoundFlashes(models){
    models.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 120));
    await new Promise(r => setTimeout(r, Math.max(820, models.length * 120 + 360)));
  }

  async function beginAttack(targetId){
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    state.targetId = targetId;
    state.hoveredTargetId = null;
    drawHoverLines(targetId);
    const attacker = getUnit(state.attackerId), target = getUnit(targetId), profile = getProfiles(state.attackerId)[state.selectedProfileIx];
    if (!attacker || !target || !profile) return;
    const info = targetInfo(targetId, state.selectedProfileIx);
    if (!info.valid) return;

    const finishAttack = async (totalDamage, killCount) => {
      state.shotUnits.add(attacker.id);
      B.renderModels();
      paint();
      await showResultPanel(targetId, totalDamage, killCount);
      setStatus('');
      state.attackerId = null;
      state.targetId = null;
      state.hoveredTargetId = null;
      closeWeaponPopup(); clearLines(); clearEffects();
      oldSelect(null);
      paint();
    };

    const thresholds = deriveThresholds(profile, attacker, target);
    const losResult = losState(state.attackerId, targetId);
    const visibleModels = losResult.visibleAttackerCount;
    const totalAttacks = attackCount(profile, attacker, visibleModels);
    if (totalAttacks <= 0) return;

    const hitRolls = Array.from({length: totalAttacks}, d6);
    const hit = await rollDiceStage('Hit Roll', hitRolls, thresholds.hit, false, targetId, `BS ${thresholds.hit}+`, 'hit', 'Click to Roll', 'Roll Wounds', () => playVolley(attacker, target, losResult));
    if (!hit.successes) return finishAttack(0, 0);

    const woundRolls = Array.from({length: hit.successes}, d6);
    const wound = await rollDiceStage('Wound Roll', woundRolls, thresholds.wound, true, targetId, `Wound on ${thresholds.wound}+`, 'wound', 'Rolling Wounds…', 'Roll Saves');
    if (wound.successes) {
      const woundTargets = Array.from({ length: wound.successes }, () => randomTargetModel(target));
      woundTargets.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 110));
      await new Promise(r => setTimeout(r, Math.max(500, woundTargets.length * 110 + 120)));
    }

    const saveRolls = Array.from({length: wound.successes}, d6);
    const coverLabel = thresholds.coverBonus ? ' 🛡 COVER' : '';
    const save = await rollDiceStage('Save Roll', saveRolls, thresholds.save, true, targetId, `Save on ${thresholds.save}+${coverLabel}`, 'save');
    const failedSaves = save.rolls.filter(r => r < thresholds.save).length;

    let totalDamage = 0;
    const fixedDamage = damageValue(profile.d);
    if (failedSaves > 0) {
      if (fixedDamage === 1) totalDamage = failedSaves;
      else {
        const damageRolls = Array.from({length: failedSaves}, () => pickDamage(profile.d));
        const damageStage = await rollDiceStage('Damage', damageRolls, null, false, targetId, 'Damage per failed save', 'damage', 'Roll Damage', 'Show Result');
        totalDamage = damageStage.rolls.reduce((a,b)=>a+b,0);
      }
    }

    // Clear aiming lines before damage is applied (models may be removed)
    clearLines();

    const originalModels = target.models.slice();
    const allocation = allocateWoundsToModels(target, totalDamage, losResult.visibleTargetModelIds);
    const flashedModels = allocation.flashedModels.length ? allocation.flashedModels : originalModels.slice(-Math.min(originalModels.length, totalDamage || 0));
    if (flashedModels.length) await playWoundFlashes(flashedModels);

    const killCount = allocation.removedModelIds.length;
    if (target.models.length <= 0 && killCount) await animateUnitDestroyed(target.id);

    return finishAttack(totalDamage, killCount);
  }

  function onEnemyInteract(unitId){
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    const options = getValidProfilesForTarget(unitId); if (!options.length) return;
    state.targetId = unitId; state.hoveredTargetId = unitId; drawHoverLines(unitId); paint();
    if (options.length === 1) { state.selectedProfileIx = options[0].i; beginAttack(unitId); }
    else openWeaponPopup(unitId, options);
  }

  function bindShootOverrides(){
    const svg = $('#bf-svg'); if (!svg) return;
    svg.addEventListener('mousemove', (e) => {
      if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
      let node = e.target;
      while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
      if (!node) return;
      const uid = node.dataset.unitId;
      if (!isEnemy(uid)) return;
      const options = getValidProfilesForTarget(uid); if (!options.length) return;
      state.hoveredTargetId = uid; drawHoverLines(uid); paint();
    }, true);
    svg.addEventListener('mouseleave', () => {
      // Don't clear lines if an attack is in progress (targetId is set)
      if (state.targetId) return;
      state.hoveredTargetId = null; clearLines(); paint();
    }, true);
    const intercept = (e) => {
      if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
      let node = e.target;
      while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
      if (!node) return;
      const uid = node.dataset.unitId;
      if (!isEnemy(uid)) return;
      if (!getValidProfilesForTarget(uid).length) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.type === 'click') onEnemyInteract(uid);
    };
    svg.addEventListener('mousedown', intercept, true);
    svg.addEventListener('click', intercept, true);
  }

  function selectAttacker(uid){
    state.attackerId = uid;
    state.targetId = null;
    state.hoveredTargetId = null;
    state.selectedProfileIx = 0;
    closeWeaponPopup(); clearLines(); clearEffects(); paint(); setStatus('');
  }

  const oldSelect = B.selectUnit.bind(B);
  B.selectUnit = function(uid){
    oldSelect(uid);
    if (!uid) {
      // Deselect — clear all shooting state
      selectAttacker(null);
      requestAnimationFrame(() => paint());
      return;
    }
    const u = getUnit(uid);
    if (!u) return;
    if (u.faction === ACTIVE) {
      selectAttacker(uid);
      requestAnimationFrame(() => paint());
    }
  };
  window.selectUnit = B.selectUnit;

  // Escape key deselects
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { B.selectUnit(null); }
  });

  $('#btn-end-shoot')?.addEventListener('click', () => setStatus('END SHOOTING NOT WIRED IN MOCKUP'));
  $('#card-close')?.addEventListener('click', () => B.selectUnit(null));

  window.__shootDebug = {
    state,
    selectAttacker,
    beginAttack,
    targetInfo,
    getValidProfilesForTarget,
    clearEffects,
    paint,
    getUnitAnchor,
    modelScreenCenter,
    projectileAnchor,
    rollDiceStage,
    playVolley
  };

  bindShootOverrides();
  paint();
})();
