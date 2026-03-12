(function(){
  'use strict';
  const B = window.BattleUI;
  const { simState, UNITS, PX_PER_INCH } = B;
  const ACTIVE = 'imp';

  const state = {
    attackerId: null,
    targetId: null,
    hoveredTargetId: null,
    hoveredTargetModelId: null,
    selectedProfileIx: 0,
    history: [],
    shotUnits: new Set(),
    seed: 5005,
    pending: null
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function rng(){ state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
  function d6(){ return 1 + Math.floor(rng() * 6); }
  function getUnit(uid){ return simState.units.find(u=>u.id===uid); }
  function isEnemy(uid){ const u=getUnit(uid); return u && u.faction !== ACTIVE; }
  function center(unit){ const p=unit.models.reduce((a,m)=>({x:a.x+m.x,y:a.y+m.y}),{x:0,y:0}); return {x:p.x/unit.models.length,y:p.y/unit.models.length}; }
  function setStatus(msg){ const el = $('#move-mode-label'); if (el) el.textContent = msg; }

  function getProfiles(uid){
    const u = UNITS[uid];
    if (!u) return [];
    let w = [].concat(u.weapons || []);
    const wg = B.wgState?.[uid] || {};
    (u.wargear || []).forEach((opt, i)=>{ if (wg[i] && opt.adds) w.push(opt.adds); });
    return w.filter(x => x.type === 'RANGED');
  }

  function distIn(a,b){ const ca=center(getUnit(a)), cb=center(getUnit(b)); return Math.hypot(ca.x-cb.x, ca.y-cb.y)/PX_PER_INCH; }
  function parseRange(weapon){ return parseInt(String(weapon?.rng || '').replace(/[^0-9]/g,'')) || 0; }
  function getBallisticSkill(uid){ return ({'assault-intercessors':3,'intercessor-squad-a':3,'hellblasters':3,'primaris-lieutenant':3,'redemptor-dreadnought':3,'boyz-mob':5,'boss-nob':5,'mekboy':5}[uid] || 4); }
  function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g,'')); return n || 7; }
  function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
  function pickDamage(d){ if (typeof d === 'number') return d; const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng()*3); return Number(s) || 1; }
  function attackCount(profile, attacker){ return (Number(profile.a || 1) || 1) * Math.max(1, attacker.models.length); }

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
    return { hit, wound: woundTarget(Number(profile.s || 0), t), save, rawSave, toughness: t };
  }

  function log(msg, kind='info'){
    const root = $('#combat-log'); if (!root) return;
    const row = document.createElement('div'); row.className = `log-row ${kind}`;
    row.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span><span>${msg}</span>`;
    root.appendChild(row); root.scrollTop = root.scrollHeight;
  }

  function clearTargeting(){ state.targetId = null; state.hoveredTargetId = null; state.hoveredTargetModelId = null; closeWeaponPopup(); clearLines(); paint(); renderSummary(); }
  function clearLines(){ const g = $('#layer-target-lines'); if (g) g.innerHTML = ''; }

  function paint(){
    $$('#layer-hulls .unit-hull').forEach(h=>{
      const uid = h.dataset.unitId;
      h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker','shoot-partial','shoot-spent');
      if (uid === state.attackerId) h.classList.add('shoot-attacker');
      else if (isEnemy(uid) && state.attackerId && !state.shotUnits.has(state.attackerId)) {
        const valids = getValidProfilesForTarget(uid);
        if (valids.length) {
          h.classList.add('shoot-valid');
          if (valids.some(v=>v.info.los==='partial')) h.classList.add('shoot-partial');
        } else h.classList.add('shoot-invalid');
      }
      if (uid === state.targetId || uid === state.hoveredTargetId) h.classList.add('shoot-target');
      if (uid === state.attackerId && state.shotUnits.has(uid)) h.classList.add('shoot-spent');
    });
  }

  function renderSummary(){
    const el = $('#shoot-summary'); if (!el) return;
    const attacker = state.attackerId ? UNITS[state.attackerId] : null;
    const profiles = state.attackerId ? getProfiles(state.attackerId) : [];
    const hasShot = state.attackerId ? state.shotUnits.has(state.attackerId) : false;
    let html = '<div class="sec-label">SHOOTING FLOW</div>';
    if (!attacker) html += '<div class="summary-copy">Select a friendly unit. Valid enemy targets will highlight automatically.</div>';
    else if (hasShot) html += '<div class="summary-copy spent">This unit has already fired this turn in the prototype.</div>';
    else {
      html += `<div class="summary-copy"><strong>${attacker.name}</strong> ready. ${profiles.length > 1 ? 'Click a valid target, then choose a weapon in the popup.' : 'Click a valid target to start rolling.'}</div>`;
      if (state.targetId) {
        const p = getProfiles(state.attackerId)[state.selectedProfileIx] || profiles[0];
        const d = deriveThresholds(p, getUnit(state.attackerId), getUnit(state.targetId));
        html += `<div class="summary-thresholds">${p.name} · Hit ${d.hit}+ · Wound ${d.wound}+ · Save ${d.save}+`;
        html += `</div>`;
      }
    }
    el.innerHTML = html;
  }

  function drawHoverLines(targetId, modelId){
    const g = $('#layer-target-lines'); if (!g) return; g.innerHTML='';
    if (!state.attackerId || !targetId) return;
    const attacker = getUnit(state.attackerId), target = getUnit(targetId); if (!attacker || !target) return;
    const targetModel = target.models.find(m => m.id === modelId) || target.models[0]; if (!targetModel) return;
    const NS = 'http://www.w3.org/2000/svg';
    attacker.models.forEach(m=>{
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', m.x); line.setAttribute('y1', m.y);
      line.setAttribute('x2', targetModel.x); line.setAttribute('y2', targetModel.y);
      line.setAttribute('class', 'target-line');
      g.appendChild(line);
    });
    const pulse = document.createElementNS(NS, 'circle');
    pulse.setAttribute('cx', targetModel.x); pulse.setAttribute('cy', targetModel.y); pulse.setAttribute('r', targetModel.r + 4); pulse.setAttribute('class', 'target-pulse');
    g.appendChild(pulse);
  }

  function closeWeaponPopup(){ const el = $('#weapon-popup'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; } }

  function openWeaponPopup(targetId, targetModelId, options){
    const popup = $('#weapon-popup'); if (!popup) return;
    const target = getUnit(targetId); const m = target?.models.find(x=>x.id===targetModelId) || target?.models[0]; if (!m) return;
    popup.style.left = `${m.x - 90}px`; popup.style.top = `${m.y + 32}px`;
    popup.innerHTML = `<div class="overlay-title">SELECT WEAPON</div>` + options.map(opt => `<button class="weapon-choice" data-ix="${opt.i}"><span>${opt.profile.name}</span><span class="weapon-meta">${opt.profile.rng} · A${opt.profile.a} · S${opt.profile.s}</span></button>`).join('');
    popup.classList.remove('hidden');
    popup.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => { state.selectedProfileIx = Number(btn.dataset.ix); closeWeaponPopup(); beginAttack(targetId); }));
  }

  function rollDiceStage(title, rolls, threshold, auto = false){
    return new Promise(resolve => {
      const overlay = $('#roll-overlay'); if (!overlay) return resolve(rolls);
      const successes = threshold ? rolls.filter(r => r >= threshold).length : rolls.length;
      overlay.innerHTML = `<div class="overlay-title">${title}</div><div class="roll-cluster">${rolls.map(r => `<span class="die-chip">${r}</span>`).join('')}</div><div class="roll-summary">${threshold ? `${successes} / ${rolls.length} at ${threshold}+` : `${rolls.length} roll${rolls.length===1?'':'s'}`}</div><button class="roll-cta">${auto ? 'Resolving…' : 'CLICK TO ROLL'}</button>`;
      overlay.classList.remove('hidden');
      const cta = overlay.querySelector('.roll-cta');
      const fire = () => {
        overlay.classList.add('rolling');
        setTimeout(() => {
          overlay.classList.remove('rolling');
          overlay.classList.add('hidden');
          resolve({ rolls, successes, threshold });
        }, 520);
      };
      if (auto) { cta.disabled = true; setTimeout(fire, 350); }
      else cta.addEventListener('click', fire, { once: true });
    });
  }

  async function beginAttack(targetId){
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return setStatus('THIS UNIT HAS ALREADY SHOT');
    state.targetId = targetId;
    const attacker = getUnit(state.attackerId), target = getUnit(targetId), profile = getProfiles(state.attackerId)[state.selectedProfileIx];
    if (!attacker || !target || !profile) return;
    const info = targetInfo(targetId, state.selectedProfileIx);
    if (!info.valid) return setStatus(`INVALID TARGET · ${info.reason.toUpperCase()}`);

    paint(); renderSummary();
    const thresholds = deriveThresholds(profile, attacker, target);
    const totalAttacks = attackCount(profile, attacker);
    const snapshot = { attackerId: state.attackerId, targetId: target.id, targetModels: target.models.map(m=>({...m})), targetCarry: target._carryWounds || 0 };

    log(`${UNITS[attacker.id].name} targets ${UNITS[target.id].name} with ${profile.name}`, 'title');
    log(`Hit ${thresholds.hit}+ · Wound ${thresholds.wound}+ · Save ${thresholds.save}+`, 'meta');

    const hitRolls = Array.from({length: totalAttacks}, d6);
    const hit = await rollDiceStage('HIT ROLL', hitRolls, thresholds.hit, false);
    const woundRolls = Array.from({length: hit.successes}, d6);
    const wound = await rollDiceStage('WOUND ROLL', woundRolls, thresholds.wound, false);
    const saveRolls = Array.from({length: wound.successes}, d6);
    const save = await rollDiceStage('SAVE ROLL', saveRolls, thresholds.save, true);
    const failedSaves = save.rolls.filter(r => r < thresholds.save).length;
    const damageRolls = Array.from({length: failedSaves}, () => pickDamage(profile.d));
    const damageStage = failedSaves ? await rollDiceStage('DAMAGE', damageRolls, null, false) : { rolls: [] };
    const totalDamage = damageStage.rolls.reduce((a,b)=>a+b,0);

    target._carryWounds = (target._carryWounds || 0) + totalDamage;
    const wPer = Number(UNITS[target.id]?.stats?.W || 1) || 1;
    const killCount = Math.min(target.models.length, Math.floor(target._carryWounds / wPer));
    if (killCount) target.models.splice(target.models.length - killCount, killCount);
    target._carryWounds = target._carryWounds % wPer;
    state.history.push(snapshot);
    state.shotUnits.add(attacker.id);
    B.renderModels(); paint(); renderSummary();

    const hull = document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${target.id}"]`);
    if (hull) { hull.classList.add('shoot-hit'); setTimeout(()=>hull.classList.remove('shoot-hit'), 320); }

    log(`Attacks ${totalAttacks} · Hits ${hit.successes} · Wounds ${wound.successes} · Failed saves ${failedSaves} · Damage ${totalDamage}`, 'roll');
    if (killCount) log(`Removed ${killCount} model(s). ${target.models.length} remain.`, 'result');
    else log('No models destroyed this volley.', 'result');
    setStatus(`${UNITS[attacker.id].name} HAS FIRED`);
    closeWeaponPopup(); clearLines();
  }

  function undoLast(){
    const last = state.history.pop(); if (!last) return;
    const target = getUnit(last.targetId); if (!target) return;
    target.models = last.targetModels.map(m=>({...m}));
    target._carryWounds = last.targetCarry || 0;
    state.shotUnits.delete(last.attackerId);
    if (state.attackerId === last.attackerId) setStatus('LAST SHOT UNDONE');
    B.renderModels(); paint(); renderSummary(); log('Undo restored previous target state.', 'meta');
  }

  function selectAttacker(uid){
    if (state.shotUnits.has(uid)) { state.attackerId = uid; paint(); renderSummary(); setStatus('THIS UNIT HAS ALREADY SHOT'); return; }
    state.attackerId = uid; state.targetId = null; state.hoveredTargetId = null; state.selectedProfileIx = 0; paint(); renderSummary(); setStatus('VALID TARGETS HIGHLIGHTED — HOVER OR CLICK');
  }

  function onTargetHover(unitId, modelId){
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    const options = getValidProfilesForTarget(unitId); if (!options.length) return;
    state.hoveredTargetId = unitId; state.hoveredTargetModelId = modelId; drawHoverLines(unitId, modelId); paint();
  }

  function onTargetClick(unitId, modelId){
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    const options = getValidProfilesForTarget(unitId); if (!options.length) return setStatus('INVALID TARGET');
    state.targetId = unitId; state.hoveredTargetId = unitId; state.hoveredTargetModelId = modelId; drawHoverLines(unitId, modelId); paint(); renderSummary();
    if (options.length === 1) { state.selectedProfileIx = options[0].i; beginAttack(unitId); }
    else { openWeaponPopup(unitId, modelId, options); setStatus('SELECT A WEAPON'); }
  }

  function bindBoardInteractions(){
    const svg = $('#bf-svg'); if (!svg) return;
    svg.addEventListener('mousemove', (e) => {
      let base = e.target;
      while (base && !base.classList?.contains('model-base')) base = base.parentElement;
      if (!base || !isEnemy(base.dataset.unitId)) return;
      onTargetHover(base.dataset.unitId, base.dataset.modelId);
    });
    svg.addEventListener('mouseleave', () => { state.hoveredTargetId = null; state.hoveredTargetModelId = null; clearLines(); paint(); });
    svg.addEventListener('click', (e) => {
      let base = e.target;
      while (base && !base.classList?.contains('model-base')) base = base.parentElement;
      if (base && isEnemy(base.dataset.unitId) && state.attackerId) { e.stopPropagation(); onTargetClick(base.dataset.unitId, base.dataset.modelId); }
    }, true);
  }

  const oldSelect = B.selectUnit.bind(B);
  B.selectUnit = function(uid){
    oldSelect(uid);
    const u = getUnit(uid);
    if (!u) { state.attackerId = null; clearTargeting(); renderSummary(); return; }
    if (u.faction === ACTIVE) selectAttacker(uid);
  };
  window.selectUnit = B.selectUnit;

  $('#btn-clear-shot')?.addEventListener('click', () => { clearTargeting(); closeWeaponPopup(); setStatus('TARGETING CLEARED'); });
  $('#btn-undo-shot')?.addEventListener('click', undoLast);
  $('#card-close')?.addEventListener('click', () => $('#unit-card')?.classList.remove('visible'));

  log('v0.5 loaded: auto target highlight, hover sight-lines, click-to-roll stages, simplified action bar.', 'meta');
  bindBoardInteractions();
  renderSummary();
  paint();
})();