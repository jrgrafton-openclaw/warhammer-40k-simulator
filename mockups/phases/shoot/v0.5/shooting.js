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
    seed: 5005
  };

  const history = [];
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

  function clearLines(){ const g = $('#layer-target-lines'); if (g) g.innerHTML = ''; }

  function closestTargetEdgePoint(attackerModel, targetUnit){
    let best = null;
    targetUnit.models.forEach(m => {
      const dx = attackerModel.x - m.x;
      const dy = attackerModel.y - m.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = m.x + (dx / len) * (m.r || 12);
      const py = m.y + (dy / len) * (m.r || 12);
      const dist = Math.hypot(attackerModel.x - px, attackerModel.y - py);
      if (!best || dist < best.dist) best = { x: px, y: py, dist };
    });
    return best || center(targetUnit);
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

  function closeWeaponPopup(){ const el = $('#weapon-popup'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; } }

  function openWeaponPopup(targetId, options){
    const popup = $('#weapon-popup'); if (!popup) return;
    const target = getUnit(targetId); const c = center(target);
    popup.style.left = `${c.x - 90}px`; popup.style.top = `${c.y + 26}px`;
    popup.innerHTML = `<div class="overlay-title">SELECT WEAPON</div>` + options.map(opt => `<button class="weapon-choice" data-ix="${opt.i}"><span>${opt.profile.name}</span><span class="weapon-meta">${opt.profile.rng} · A${opt.profile.a} · S${opt.profile.s}</span></button>`).join('');
    popup.classList.remove('hidden');
    popup.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => { state.selectedProfileIx = Number(btn.dataset.ix); closeWeaponPopup(); beginAttack(targetId); }));
  }

  function rollDiceStage(title, rolls, threshold, auto = false){
    return new Promise(resolve => {
      const overlay = $('#roll-overlay'); if (!overlay) return resolve({ rolls, successes: rolls.length, threshold });
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

  async function beginAttack(targetId){
    if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
    state.targetId = targetId;
    const attacker = getUnit(state.attackerId), target = getUnit(targetId), profile = getProfiles(state.attackerId)[state.selectedProfileIx];
    if (!attacker || !target || !profile) return;
    const info = targetInfo(targetId, state.selectedProfileIx);
    if (!info.valid) return;

    const thresholds = deriveThresholds(profile, attacker, target);
    const totalAttacks = attackCount(profile, attacker);
    const snapshot = { attackerId: state.attackerId, targetId: target.id, targetModels: target.models.map(m=>({...m})), targetCarry: target._carryWounds || 0 };

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
    history.push(snapshot);
    state.shotUnits.add(attacker.id);
    B.renderModels(); paint();

    const hull = document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${target.id}"]`);
    if (hull) { hull.classList.add('shoot-hit'); setTimeout(()=>hull.classList.remove('shoot-hit'), 320); }

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
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
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
    if (u.faction === ACTIVE) selectAttacker(uid);
  };
  window.selectUnit = B.selectUnit;

  $('#btn-end-shoot')?.addEventListener('click', () => setStatus('END SHOOTING NOT WIRED IN MOCKUP'));
  $('#card-close')?.addEventListener('click', () => $('#unit-card')?.classList.remove('visible'));

  bindShootOverrides();
  paint();
})();