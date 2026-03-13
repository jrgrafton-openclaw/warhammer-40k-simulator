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
  function getBallisticSkill(uid){ return ({'assault-intercessors':3,'intercessor-squad-a':3,'hellblasters':3,'primaris-lieutenant':3,'redemptor-dreadnought':3,'boyz-mob':5,'boss-nob':5,'mekboy':5,'nobz-mob':5}[uid] || 4); }
  function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g, '')); return n || 7; }
  function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
  function damageValue(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return null; return Number(s) || 1; }
  function pickDamage(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng() * 3); return Number(s) || 1; }
  function attackCount(profile, attacker){ return (Number(profile.a || 1) || 1) * Math.max(1, attacker.models.length); }
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

  function segIntersectsRect(x1,y1,x2,y2,r){
    const minX=r.minX, maxX=r.maxX, minY=r.minY, maxY=r.maxY;
    if (Math.max(x1,x2)<minX || Math.min(x1,x2)>maxX || Math.max(y1,y2)<minY || Math.min(y1,y2)>maxY) return false;
    function ccw(ax,ay,bx,by,cx,cy){ return (cy-ay)*(bx-ax) > (by-ay)*(cx-ax); }
    function segInt(a,b,c,d,e,f,g,h){ return ccw(a,b,e,f,g,h)!==ccw(c,d,e,f,g,h) && ccw(a,b,c,d,e,f)!==ccw(a,b,c,d,g,h); }
    const inside1 = x1>=minX&&x1<=maxX&&y1>=minY&&y1<=maxY;
    const inside2 = x2>=minX&&x2<=maxX&&y2>=minY&&y2<=maxY;
    if (inside1||inside2) return true;
    return segInt(x1,y1,x2,y2,minX,minY,maxX,minY) || segInt(x1,y1,x2,y2,maxX,minY,maxX,maxY) || segInt(x1,y1,x2,y2,maxX,maxY,minX,maxY) || segInt(x1,y1,x2,y2,minX,maxY,minX,minY);
  }

  function losState(attackerId, targetId){
    const a=getUnit(attackerId), t=getUnit(targetId); if(!a||!t) return 'blocked';
    const ca=center(a);
    const aabbs=(window._terrainAABBs||[]).filter(x=>x.kind==='ruin-wall' || x.kind==='wall' || x.kind==='ruin');
    if (!aabbs.length) return 'clear';
    let clear=0, blocked=0;
    t.models.forEach(m=>{ const hit=aabbs.some(box=>segIntersectsRect(ca.x,ca.y,m.x,m.y,box)); if(hit) blocked++; else clear++; });
    if(clear===0) return 'blocked'; if(blocked===0) return 'clear'; return 'partial';
  }

  function targetInfo(enemyId, profileIx = state.selectedProfileIx){
    if(!state.attackerId) return {valid:false, reason:'Select attacker first', los:'blocked'};
    const profiles = getProfiles(state.attackerId);
    const p = profiles[profileIx];
    if(!p) return {valid:false, reason:'No ranged weapon', los:'blocked'};
    const r=parseRange(p); const d=distIn(state.attackerId, enemyId); const los=losState(state.attackerId, enemyId);
    if(d>r) return {valid:false, reason:`Out of range (${d.toFixed(1)}" > ${r}")`, d, r, los};
    if(los==='blocked') return {valid:false, reason:'No line of sight', d, r, los};
    return {valid:true, reason:`${los==='partial'?'Partial':'Clear'} LoS ${d.toFixed(1)}" / ${r}"`, d, r, los};
  }

  function getValidProfilesForTarget(targetId){
    return getProfiles(state.attackerId).map((p, i)=>({profile:p, i, info:targetInfo(targetId, i)})).filter(x=>x.info.valid);
  }

  function deriveThresholds(profile, attacker, target){
    const bs = getBallisticSkill(attacker.id);
    const hit = Math.min(6, Math.max(2, bs));
    const t = Number(UNITS[target.id]?.stats?.T || 4);
    const rawSave = parseSave(UNITS[target.id]?.stats?.Sv);
    const save = Math.min(7, Math.max(2, rawSave - Number(profile.ap || 0)));
    return { hit, wound: woundTarget(Number(profile.s || 0), t), save };
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
      const popup = $('#weapon-popup'), roll = $('#roll-overlay');
      if (popup && !popup.classList.contains('hidden') && state.pinnedPopupTargetId) {
        const a = getTargetAnchor(state.pinnedPopupTargetId, 'popup');
        if (a.valid) { popup.style.left = `${a.x}px`; popup.style.top = `${a.y}px`; }
      }
      if (roll && !roll.classList.contains('hidden') && state.pinnedRollTargetId) {
        roll.style.left = '50%';
        roll.style.top = 'auto';
        roll.style.bottom = '68px';
      }
      if ((popup && !popup.classList.contains('hidden')) || (roll && !roll.classList.contains('hidden')))
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
    attacker.models.forEach(m=>{
      const edge = closestTargetEdgePoint(m, target);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', m.x); line.setAttribute('y1', m.y);
      line.setAttribute('x2', edge.x); line.setAttribute('y2', edge.y);
      line.setAttribute('class', 'target-line');
      g.appendChild(line);
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
    return {
      x: screen.x - rect.left,
      y: screen.y - rect.top,
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

  async function playVolley(attacker, target){
    const pairs = attacker.models.map(m => ({ from: m, to: randomTargetModel(target) }));
    pairs.forEach((pair, ix) => {
      const from = projectileAnchor(pair.from);
      const to = projectileAnchor(pair.to);
      if (!from.valid || !to.valid) return;
      setTimeout(() => {
        fireProjectile('var(--imp)', from, to);
      }, ix * 70);
    });
    await new Promise(r => setTimeout(r, Math.max(460, pairs.length * 70 + 420)));
  }

  function closeWeaponPopup(){
    const el = $('#weapon-popup');
    state.pinnedPopupTargetId = null;
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  }

  function openWeaponPopup(targetId, options){
    const popup = $('#weapon-popup'); if (!popup) return;
    state.pinnedPopupTargetId = targetId;
    popup.innerHTML = `<div class="overlay-title">Select Weapon</div>` + options.map(opt => {
      const ap = Number(opt.profile.ap || 0);
      const kws = keywordsFor(opt.profile).map(k => `<span class="kw-pill ${kwClass(k)}" data-tip="${kwTip(k).replace(/"/g, '&quot;')}">${k}</span>`).join('');
      return `<button class="weapon-choice" data-ix="${opt.i}"><span class="weapon-choice-name">${opt.profile.name}</span><div class="weapon-meta-row"><span class="weapon-meta">${opt.profile.rng}</span><span class="weapon-meta">A${opt.profile.a}</span><span class="weapon-meta">S${opt.profile.s}</span><span class="weapon-meta ${ap !== 0 ? 'ap-hot' : ''}">AP ${opt.profile.ap}</span><span class="weapon-meta dmg-hot">D ${opt.profile.d}</span></div>${kws ? `<div class="weapon-kws">${kws}</div>` : ''}</button>`;
    }).join('');
    popup.classList.remove('hidden');
    if (B.initAllTooltips) B.initAllTooltips();
    popup.querySelectorAll('[data-tip]').forEach(el => {
      if (el._shootTipInit) return;
      el._shootTipInit = true;
      el.addEventListener('mouseenter', () => B.showTip(el, el.dataset.tip));
      el.addEventListener('mouseleave', B.hideTip);
    });
    popup.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => {
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
              overlay.classList.add('hidden'); state.pinnedRollTargetId = null;
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
          if (valids.some(v => v.info.los === 'partial')) h.classList.add('shoot-partial');
        } else h.classList.add('shoot-invalid');
      }
      if (uid === state.targetId || uid === state.hoveredTargetId) h.classList.add('shoot-target');
    });
    updateSpentIndicators();
    updateWoundOverlays();
  }

  function allocateWoundsToModels(target, totalDamage){
    let remainingDamage = totalDamage;
    const removedModelIds = [];
    const flashedModels = [];
    const perModelW = Number(UNITS[target.id]?.stats?.W || 1) || 1;
    target._carryWounds = target._carryWounds || 0;

    while (remainingDamage > 0 && target.models.length > 0) {
      const focus = target.models[target.models.length - 1];
      if (!focus) break;
      flashedModels.push(focus);
      const woundsNeeded = perModelW - target._carryWounds;
      const applied = Math.min(remainingDamage, woundsNeeded);
      target._carryWounds += applied;
      remainingDamage -= applied;
      if (target._carryWounds >= perModelW) {
        removedModelIds.push(focus.id);
        target.models.pop();
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
    clearLines();
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
    const totalAttacks = attackCount(profile, attacker);

    const hitRolls = Array.from({length: totalAttacks}, d6);
    const hit = await rollDiceStage('Hit Roll', hitRolls, thresholds.hit, false, targetId, `BS ${thresholds.hit}+`, 'hit', 'Click to Roll', 'Roll Wounds', () => playVolley(attacker, target));
    if (!hit.successes) return finishAttack(0, 0);

    const woundRolls = Array.from({length: hit.successes}, d6);
    const wound = await rollDiceStage('Wound Roll', woundRolls, thresholds.wound, true, targetId, `Wound on ${thresholds.wound}+`, 'wound', 'Rolling Wounds…', 'Roll Saves');
    if (wound.successes) {
      const woundTargets = Array.from({ length: wound.successes }, () => randomTargetModel(target));
      woundTargets.forEach((model, ix) => setTimeout(() => createHitMarker(model), ix * 110));
      await new Promise(r => setTimeout(r, Math.max(500, woundTargets.length * 110 + 120)));
    }

    const saveRolls = Array.from({length: wound.successes}, d6);
    const save = await rollDiceStage('Save Roll', saveRolls, thresholds.save, true, targetId, `Save on ${thresholds.save}+`, 'save');
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

    const originalModels = target.models.slice();
    const allocation = allocateWoundsToModels(target, totalDamage);
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
    svg.addEventListener('mouseleave', () => { state.hoveredTargetId = null; clearLines(); paint(); }, true);
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
    const u = getUnit(uid);
    if (!u) return;
    if (u.faction === ACTIVE) {
      selectAttacker(uid);
      requestAnimationFrame(() => paint());
    }
  };
  window.selectUnit = B.selectUnit;

  $('#btn-end-shoot')?.addEventListener('click', () => setStatus('END SHOOTING NOT WIRED IN MOCKUP'));
  $('#card-close')?.addEventListener('click', () => $('#unit-card')?.classList.remove('visible'));

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
