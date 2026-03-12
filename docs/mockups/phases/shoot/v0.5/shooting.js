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
    seed: 5005,
    pinnedPopupTargetId: null,
    pinnedRollTargetId: null,
    overlayRaf: null
  };

  /* expose spent set to battle-models-v23.js via the same convention as movement.js */
  window.__spentUnitIds = state.shotUnits;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function rng(){ state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
  function d6(){ return 1 + Math.floor(rng() * 6); }
  function getUnit(uid){ return simState.units.find(u=>u.id===uid); }
  function isEnemy(uid){ const u=getUnit(uid); return u && u.faction !== ACTIVE; }
  function center(unit){ const p=unit.models.reduce((a,m)=>({x:a.x+m.x,y:a.y+m.y}),{x:0,y:0}); return {x:p.x/unit.models.length,y:p.y/unit.models.length}; }
  function setStatus(msg){ const el = $('#move-mode-label'); if (el) el.textContent = msg || ''; }
  function distIn(a,b){ const ca=center(getUnit(a)), cb=center(getUnit(b)); return Math.hypot(ca.x-cb.x, ca.y-cb.y)/PX_PER_INCH; }
  function parseRange(weapon){ return parseInt(String(weapon?.rng || '').replace(/[^0-9]/g,'')) || 0; }
  function getBallisticSkill(uid){ return ({'assault-intercessors':3,'intercessor-squad-a':3,'hellblasters':3,'primaris-lieutenant':3,'redemptor-dreadnought':3,'boyz-mob':5,'boss-nob':5,'mekboy':5}[uid] || 4); }
  function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g,'')); return n || 7; }
  function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
  function damageValue(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return null; return Number(s) || 1; }
  function pickDamage(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng()*3); return Number(s) || 1; }
  function attackCount(profile, attacker){ return (Number(profile.a || 1) || 1) * Math.max(1, attacker.models.length); }

  function getProfiles(uid){
    const u = UNITS[uid];
    if (!u) return [];
    let w = [].concat(u.weapons || []);
    const wg = B.wgState?.[uid] || {};
    (u.wargear || []).forEach((opt, i)=>{ if (wg[i] && opt.adds) w.push(opt.adds); });
    return w.filter(x => x.type === 'RANGED');
  }

  function keywordsFor(profile){
    return [].concat(profile?.keywords || profile?.kw || []).filter(Boolean).map(String);
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

  function updateWoundOverlays(){
    $$('#layer-models .model-base').forEach(g => {
      const uid = g.dataset.unitId;
      const unit = getUnit(uid);
      if (!unit) return;
      const existingPip = g.querySelector('.wound-pip');
      if (existingPip) existingPip.remove();
      const carry = unit._carryWounds || 0;
      if (carry > 0) {
        const wPer = Number(UNITS[uid]?.stats?.W || 1);
        if (wPer > 1) {
          const NS = 'http://www.w3.org/2000/svg';
          const m = unit.models.find(m2 => m2.id === g.dataset.modelId);
          if (!m) return;
          const pip = document.createElementNS(NS, 'g');
          pip.setAttribute('class', 'wound-pip');
          const cx = m.x + (m.r || 12) * 0.52;
          const cy = m.y - (m.r || 12) * 0.52;
          const bg = document.createElementNS(NS, 'circle');
          bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', '7');
          bg.setAttribute('fill', '#1a0808'); bg.setAttribute('stroke', '#cc2020'); bg.setAttribute('stroke-width', '1.2');
          pip.appendChild(bg);
          const txt = document.createElementNS(NS, 'text');
          txt.setAttribute('x', cx); txt.setAttribute('y', cy);
          txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
          txt.setAttribute('font-size', '7'); txt.setAttribute('font-family', 'Anton');
          txt.setAttribute('fill', '#ff6060'); txt.setAttribute('pointer-events', 'none');
          txt.textContent = `${carry}/${wPer}`;
          pip.appendChild(txt);
          g.appendChild(pip);
        }
      }
    });
    updateCardWounds();
  }

  function updateCardWounds(){
    const uid = state.attackerId || window.activeUnitId;
    if (!uid) return;
    const unit = getUnit(uid);
    if (!unit) return;
    const wPer = Number(UNITS[uid]?.stats?.W || 1);
    const maxW = wPer * unit.models.length;
    const carry = unit._carryWounds || 0;
    const taken = carry;
    const wEl = $('#card-wound-track');
    if (!wEl) return;
    if (wPer === 1) { wEl.style.display = 'none'; return; }
    wEl.style.display = 'block';
    wEl.innerHTML = `<span class="wound-label">WOUNDS</span><span class="wound-val">${taken}<span class="wound-sep">/</span>${wPer}</span>`;
  }

  function clearLines(){ const g = $('#layer-target-lines'); if (g) g.innerHTML = ''; }

  function closestTargetEdgePoint(attackerModel, targetUnit){
    let best = null;
    targetUnit.models.forEach(m => {
      const radius = m.r || Math.max(m.w || 20, m.h || 20) / 2;
      const dx = attackerModel.x - m.x; const dy = attackerModel.y - m.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = m.x + (dx / len) * radius; const py = m.y + (dy / len) * radius;
      const dist = Math.hypot(attackerModel.x - px, attackerModel.y - py);
      if (!best || dist < best.dist) best = { x: px, y: py, dist };
    });
    return best || center(targetUnit);
  }

  function toBattlefieldCoords(svgX, svgY){
    const svg = $('#bf-svg'), field = $('#battlefield');
    if (!svg || !field) return { x: svgX, y: svgY };
    const pt = svg.createSVGPoint();
    pt.x = svgX; pt.y = svgY;
    const screen = pt.matrixTransform(svg.getScreenCTM());
    const rect = field.getBoundingClientRect();
    return { x: screen.x - rect.left, y: screen.y - rect.top };
  }

  function getTargetAnchor(targetId, mode='popup'){
    const unit = getUnit(targetId); if (!unit) return { x: 0, y: 0 };
    const c = center(unit);
    const pos = toBattlefieldCoords(c.x, c.y);
    return { x: pos.x, y: pos.y + (mode === 'roll' ? 46 : 28) };
  }

  function ensureOverlayPinLoop(){
    if (state.overlayRaf) return;
    const tick = () => {
      const popup = $('#weapon-popup'), roll = $('#roll-overlay');
      if (popup && !popup.classList.contains('hidden') && state.pinnedPopupTargetId) {
        const a = getTargetAnchor(state.pinnedPopupTargetId, 'popup');
        popup.style.left = `${a.x}px`; popup.style.top = `${a.y}px`;
      }
      if (roll && !roll.classList.contains('hidden') && state.pinnedRollTargetId) {
        const a = getTargetAnchor(state.pinnedRollTargetId, 'roll');
        roll.style.left = `${a.x}px`; roll.style.top = `${a.y}px`;
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

  function closeWeaponPopup(){
    const el = $('#weapon-popup');
    state.pinnedPopupTargetId = null;
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  }

  function openWeaponPopup(targetId, options){
    const popup = $('#weapon-popup'); if (!popup) return;
    state.pinnedPopupTargetId = targetId;
    popup.innerHTML = `<div class="overlay-title">SELECT WEAPON</div>` + options.map(opt => {
      const ap = Number(opt.profile.ap || 0);
      const kws = keywordsFor(opt.profile).map(k => `<span class="kw-pill ${kwClass(k)}">${k}</span>`).join('');
      return `<button class="weapon-choice" data-ix="${opt.i}"><span>${opt.profile.name}</span><div class="weapon-meta-row"><span class="weapon-meta">${opt.profile.rng}</span><span class="weapon-meta">A${opt.profile.a}</span><span class="weapon-meta">S${opt.profile.s}</span><span class="weapon-meta ${ap !== 0 ? 'ap-hot' : ''}">AP ${opt.profile.ap}</span><span class="weapon-meta dmg-hot">D ${opt.profile.d}</span></div>${kws ? `<div class="weapon-kws">${kws}</div>` : ''}</button>`;
    }).join('');
    popup.classList.remove('hidden');
    popup.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => {
      state.selectedProfileIx = Number(btn.dataset.ix);
      closeWeaponPopup(); beginAttack(targetId);
    }));
    ensureOverlayPinLoop();
  }

  function renderDiceStage(title, count, threshold, auto, message=''){
    const overlay = $('#roll-overlay');
    // dice start as blank .die chips (not .revealed yet) — exact v4 pattern
    const chips = Array.from({length: Math.max(1, count)}, () => '<span class="die"></span>').join('');
    overlay.innerHTML = `<div class="overlay-title">${title}</div><div class="dice-row" style="padding:10px 14px 4px;justify-content:center;">${chips}</div><div class="dice-summary" style="padding:0 16px 4px;">${message || (threshold ? `Target ${threshold}+` : 'Resolve damage')}</div><button class="roll-cta">${auto ? 'Resolving…' : 'Click to roll'}</button>`;
    overlay.classList.remove('hidden');
    ensureOverlayPinLoop();
  }

  function revealDice(rolls, threshold){
    const chips = $$('#roll-overlay .die');
    rolls.forEach((r, i) => {
      const chip = chips[i]; if (!chip) return;
      chip.textContent = r;
      chip.classList.add('rolling');
      setTimeout(() => {
        chip.classList.remove('rolling');
        if (threshold == null) { chip.classList.add('neutral'); }
        else if (r >= threshold) { chip.classList.add('success'); setTimeout(() => chip.classList.add('flashing'), 20); }
        else { chip.classList.add('enemy-fail'); setTimeout(() => chip.classList.add('flashing'), 20); }
      }, 80 + i * 40);
    });
  }

  function rollDiceStage(title, rolls, threshold, auto = false, targetId = null, message=''){
    return new Promise(resolve => {
      const overlay = $('#roll-overlay'); if (!overlay) return resolve({ rolls, successes: rolls.length, threshold });
      state.pinnedRollTargetId = targetId;
      const successes = threshold ? rolls.filter(r => r >= threshold).length : rolls.length;
      renderDiceStage(title, rolls.length, threshold, auto, message);
      const cta = overlay.querySelector('.roll-cta');
      const fire = () => {
        revealDice(rolls, threshold);
        setTimeout(() => {
          if (auto) {
            setTimeout(() => {
              overlay.classList.add('hidden'); state.pinnedRollTargetId = null;
              resolve({ rolls, successes, threshold });
            }, 260 + rolls.length * 40);
          } else {
            cta.textContent = 'Continue'; cta.disabled = false;
            cta.onclick = () => { overlay.classList.add('hidden'); state.pinnedRollTargetId = null; resolve({ rolls, successes, threshold }); };
          }
        }, 480 + rolls.length * 40);
      };
      if (auto) { cta.disabled = true; setTimeout(fire, 140); }
      else cta.addEventListener('click', () => { cta.disabled = true; fire(); }, { once: true });
    });
  }

  function showResultPanel(targetId, totalDamage, killCount, targetName){
    return new Promise(resolve => {
      const overlay = $('#roll-overlay');
      state.pinnedRollTargetId = targetId;
      const woundLine = totalDamage === 1 ? '1 wound incurred' : `${totalDamage} wounds incurred`;
      const killLine  = killCount === 0 ? 'No models destroyed' : killCount === 1 ? '1 model destroyed' : `${killCount} models destroyed`;
      overlay.innerHTML = `
        <div class="overlay-title">RESULT</div>
        <div class="result-main">
          <div class="result-row wounds"><span class="result-icon">⚔</span><span class="result-num">${totalDamage}</span><span class="result-label">WOUND${totalDamage===1?'':'S'}</span></div>
          <div class="result-row kills ${killCount > 0 ? 'has-kills' : ''}"><span class="result-icon">☠</span><span class="result-num">${killCount}</span><span class="result-label">MODEL${killCount===1?'':'S'} DESTROYED</span></div>
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
    hull?.classList.add('anim-die'); // exact class from shared phase-states.css
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
          if (valids.some(v=>v.info.los==='partial')) h.classList.add('shoot-partial');
        } else h.classList.add('shoot-invalid');
      }
      if (uid === state.targetId || uid === state.hoveredTargetId) h.classList.add('shoot-target');
    });
    updateSpentIndicators();
  }

  async function beginAttack(targetId){
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    state.targetId = targetId;
    const attacker = getUnit(state.attackerId), target = getUnit(targetId), profile = getProfiles(state.attackerId)[state.selectedProfileIx];
    if (!attacker || !target || !profile) return;
    const info = targetInfo(targetId, state.selectedProfileIx);
    if (!info.valid) return;

    const thresholds = deriveThresholds(profile, attacker, target);
    const totalAttacks = attackCount(profile, attacker);

    const hitRolls = Array.from({length: totalAttacks}, d6);
    const hit = await rollDiceStage('HIT ROLL', hitRolls, thresholds.hit, false, targetId, `BS ${thresholds.hit}+`);
    if (!hit.successes) {
      state.shotUnits.add(attacker.id); B.renderModels(); paint();
      await showResultPanel(targetId, 0, 0, UNITS[target.id]?.name);
      closeWeaponPopup(); clearLines(); state.hoveredTargetId = null;
      return;
    }
    const woundRolls = Array.from({length: hit.successes}, d6);
    const wound = await rollDiceStage('WOUND ROLL', woundRolls, thresholds.wound, false, targetId, `Wound on ${thresholds.wound}+`);
    const saveRolls = Array.from({length: wound.successes}, d6);
    const save = await rollDiceStage('SAVE ROLL', saveRolls, thresholds.save, true, targetId, `Save on ${thresholds.save}+`);
    const failedSaves = save.rolls.filter(r => r < thresholds.save).length;

    let totalDamage = 0;
    const fixedDamage = damageValue(profile.d);
    if (failedSaves > 0) {
      if (fixedDamage === 1) totalDamage = failedSaves;
      else {
        const damageRolls = Array.from({length: failedSaves}, () => pickDamage(profile.d));
        const damageStage = await rollDiceStage('DAMAGE', damageRolls, null, false, targetId, 'Damage per failed save');
        totalDamage = damageStage.rolls.reduce((a,b)=>a+b,0);
      }
    }

    target._carryWounds = (target._carryWounds || 0) + totalDamage;
    const wPer = Number(UNITS[target.id]?.stats?.W || 1) || 1;
    const killCount = Math.min(target.models.length, Math.floor(target._carryWounds / wPer));
    const remainingAfter = target.models.length - killCount;

    if (remainingAfter <= 0 && target.models.length) await animateUnitDestroyed(target.id);
    if (killCount) target.models.splice(target.models.length - killCount, killCount);
    target._carryWounds = target._carryWounds % wPer;

    state.shotUnits.add(attacker.id);
    B.renderModels(); paint(); updateWoundOverlays();

    await showResultPanel(targetId, totalDamage, killCount, UNITS[target.id]?.name);
    setStatus('');
    closeWeaponPopup(); clearLines(); state.hoveredTargetId = null;
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
    closeWeaponPopup(); clearLines(); paint(); setStatus('');
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

  /* inject wound track into card header on card build */
  const origBuild = B.buildCard.bind(B);
  B.buildCard = function(uid){
    origBuild(uid);
    const hdr = document.getElementById('unit-card');
    if (!hdr) return;
    let wt = document.getElementById('card-wound-track');
    if (!wt) {
      wt = document.createElement('div');
      wt.id = 'card-wound-track';
      wt.style.cssText = 'display:none;padding:6px 14px;background:rgba(204,32,32,.06);border-bottom:1px solid rgba(204,32,32,.15);display:flex;align-items:center;gap:8px;';
      const statsRow = document.getElementById('card-stats');
      if (statsRow) statsRow.after(wt);
    }
    updateCardWounds();
  };

  $('#btn-end-shoot')?.addEventListener('click', () => setStatus('END SHOOTING NOT WIRED IN MOCKUP'));
  $('#card-close')?.addEventListener('click', () => $('#unit-card')?.classList.remove('visible'));

  bindShootOverrides();
  paint();
})();