(function(){
  'use strict';
  const B = window.BattleUI;
  const { simState, UNITS, PX_PER_INCH } = B;
  const ACTIVE = 'imp';

  const state = {
    attackerId: null,
    targetId: null,
    profileIx: 0,
    seeded: true,
    seed: 4042,
    log: [],
    history: []
  };

  function rng() {
    if (!state.seeded) return Math.random();
    state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
    return state.seed / 0x100000000;
  }
  function d6() { return 1 + Math.floor(rng() * 6); }

  function getUnit(uid){ return simState.units.find(u=>u.id===uid); }
  function isEnemy(uid){ const u=getUnit(uid); return u && u.faction!==ACTIVE; }
  function center(unit){ const p=unit.models.reduce((a,m)=>({x:a.x+m.x,y:a.y+m.y}),{x:0,y:0}); return {x:p.x/unit.models.length,y:p.y/unit.models.length}; }
  function distIn(a,b){ const ca=center(getUnit(a)), cb=center(getUnit(b)); return Math.hypot(ca.x-cb.x, ca.y-cb.y)/PX_PER_INCH; }
  function setStatus(msg){ const el=document.getElementById('move-mode-label'); if(el) el.textContent=msg; }

  function getProfiles(uid){
    const u = UNITS[uid];
    if (!u) return [];
    let w = [].concat(u.weapons || []);
    const wg = B.wgState?.[uid] || {};
    (u.wargear || []).forEach((opt, i) => { if (wg[i] && opt.adds) w.push(opt.adds); });
    return w.filter(x => x.type === 'RANGED');
  }

  function parseRange(weapon){
    return parseInt(String(weapon?.rng || '').replace(/[^0-9]/g,'')) || 0;
  }

  function getActiveProfile(){
    const list = getProfiles(state.attackerId);
    if (!list.length) return null;
    if (state.profileIx >= list.length) state.profileIx = 0;
    return list[state.profileIx];
  }

  function getBallisticSkill(uid){
    const table = {
      'assault-intercessors': 3,
      'intercessor-squad-a': 3,
      'hellblasters': 3,
      'primaris-lieutenant': 3,
      'redemptor-dreadnought': 3,
      'boyz-mob': 5,
      'boss-nob': 5,
      'mekboy': 5
    };
    return table[uid] || 4;
  }

  function parseSave(sv){
    const n = parseInt(String(sv || '').replace(/[^0-9]/g, ''));
    return n || 7;
  }

  function woundTarget(str, toughness){
    if (str >= toughness * 2) return 2;
    if (str > toughness) return 3;
    if (str === toughness) return 4;
    if (str * 2 <= toughness) return 6;
    return 5;
  }

  function deriveThresholds(profile, attacker, target){
    const bs = getBallisticSkill(attacker.id);
    const hit = Math.min(6, Math.max(2, bs));
    const wT = woundTarget(Number(profile.s || 0), Number(UNITS[target.id]?.stats?.T || 4));
    const rawSave = parseSave(UNITS[target.id]?.stats?.Sv);
    const modSave = Math.min(7, Math.max(2, rawSave - Number(profile.ap || 0)));
    return { hit, wound: wT, save: modSave, bs, targetT: Number(UNITS[target.id]?.stats?.T || 4), rawSave };
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
    if(clear===0) return 'blocked';
    if(blocked===0) return 'clear';
    return 'partial';
  }

  function targetInfo(enemyId){
    if(!state.attackerId) return {valid:false,reason:'Select attacker first', los:'blocked'};
    const p = getActiveProfile();
    if(!p) return {valid:false,reason:'No ranged weapon',los:'blocked'};
    const r=parseRange(p); const d=distIn(state.attackerId, enemyId); const los=losState(state.attackerId, enemyId);
    if(d>r) return {valid:false,reason:`Out of range (${d.toFixed(1)}" > ${r}")`,d,r,los};
    if(los==='blocked') return {valid:false,reason:'No line of sight (fully occluded)',d,r,los};
    if(los==='partial') return {valid:true,reason:`Partial LoS ${d.toFixed(1)}" / ${r}"`,d,r,los};
    return {valid:true,reason:`Clear LoS ${d.toFixed(1)}" / ${r}"`,d,r,los};
  }

  function paint(){
    document.querySelectorAll('#layer-hulls .unit-hull').forEach(h=>{
      const uid=h.dataset.unitId;
      h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker','shoot-partial');
      if(uid===state.attackerId) h.classList.add('shoot-attacker');
      else if(isEnemy(uid)&&state.attackerId){
        const i=targetInfo(uid);
        if(i.valid) h.classList.add('shoot-valid'); else h.classList.add('shoot-invalid');
        if(i.los==='partial') h.classList.add('shoot-partial');
      }
      if(uid===state.targetId) h.classList.add('shoot-target');
    });
  }

  function log(msg, kind='info'){
    state.log.push({ t: new Date().toLocaleTimeString(), msg, kind });
    const root = document.getElementById('combat-log');
    if (!root) return;
    root.innerHTML = state.log.slice(-80).map(e => `<div class="log-row ${e.kind}"><span class="log-time">${e.t}</span><span>${e.msg}</span></div>`).join('');
    root.scrollTop = root.scrollHeight;
  }

  function renderTools(){
    const el = document.getElementById('shoot-tools');
    if (!el) return;
    const profiles = getProfiles(state.attackerId);
    const opts = profiles.map((p, i) => `<option value="${i}" ${i===state.profileIx?'selected':''}>${p.name} · ${p.rng} · A${p.a} S${p.s} AP${p.ap} D${p.d}</option>`).join('');
    const p = getActiveProfile();
    let thr = '';
    if (state.attackerId && state.targetId && p) {
      const at = getUnit(state.attackerId), tg = getUnit(state.targetId);
      const d = deriveThresholds(p, at, tg);
      thr = `Hit ${d.hit}+ · Wound ${d.wound}+ (S${p.s} vs T${d.targetT}) · Save ${d.save}+ (Sv ${d.rawSave}+ ${p.ap ? `vs AP ${p.ap}` : ''})`;
    }
    el.innerHTML = `
      <div class="tools-header">SHOOT TOOLS</div>
      <label class="tools-label">WEAPON PROFILE</label>
      <select id="weapon-profile" ${profiles.length ? '' : 'disabled'}>${opts || '<option>No ranged profiles</option>'}</select>
      <label class="toggle"><input type="checkbox" id="seeded-toggle" ${state.seeded?'checked':''}/> Deterministic seeded rolls</label>
      <button id="btn-undo-shot" ${state.history.length ? '' : 'disabled'}>↶ UNDO LAST ACTION</button>
      <div id="thresholds">${thr || 'Select attacker + target to derive hit/wound/save thresholds.'}</div>
    `;
    document.getElementById('weapon-profile')?.addEventListener('change', (e)=>{ state.profileIx = Number(e.target.value)||0; paint(); renderTools(); });
    document.getElementById('seeded-toggle')?.addEventListener('change', (e)=>{ state.seeded = !!e.target.checked; log(`Seeded mode ${state.seeded?'ON':'OFF'}`, 'meta'); });
    document.getElementById('btn-undo-shot')?.addEventListener('click', undoLast);
  }

  function attackCount(profile, attacker){
    const n = Number(profile.a || 1) || 1;
    return n * Math.max(1, attacker.models.length);
  }

  function pickDamage(d){
    if (typeof d === 'number') return d;
    const s = String(d || '1').trim().toUpperCase();
    if (s === 'D3') return 1 + Math.floor(rng() * 3);
    const n = Number(s);
    return n || 1;
  }

  function removeModels(target, wounds){
    const pre = target.models.map(m=>({...m}));
    const wPer = Number(UNITS[target.id]?.stats?.W || 1) || 1;
    const killCount = Math.min(target.models.length, Math.floor(wounds / wPer));
    const removed = target.models.splice(target.models.length - killCount, killCount);
    if (removed.length) {
      B.renderModels();
      const hull = document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${target.id}"]`);
      if (hull) hull.classList.add('shoot-hit');
      setTimeout(()=>hull && hull.classList.remove('shoot-hit'), 280);
    }
    return { pre, removed, killCount };
  }

  function resolve(){
    if(!state.attackerId||!state.targetId) return setStatus('SELECT ATTACKER + VALID TARGET');
    const info=targetInfo(state.targetId);
    if(!info.valid) return setStatus(`CANNOT FIRE · ${info.reason.toUpperCase()}`);

    const attacker=getUnit(state.attackerId), target=getUnit(state.targetId), profile=getActiveProfile();
    if (!profile) return setStatus('NO RANGED PROFILE SELECTED');

    const th = deriveThresholds(profile, attacker, target);
    const totalAttacks = attackCount(profile, attacker);
    const hitRolls = Array.from({length:totalAttacks}, d6);
    const hits = hitRolls.filter(r=>r>=th.hit).length;
    const woundRolls = Array.from({length:hits}, d6);
    const wounds = woundRolls.filter(r=>r>=th.wound).length;
    const saveRolls = Array.from({length:wounds}, d6);
    const failedSaves = saveRolls.filter(r=>r<th.save).length;

    let damage = 0;
    for (let i=0; i<failedSaves; i++) damage += pickDamage(profile.d);

    const snap = { targetId: target.id, models: target.models.map(m=>({...m})), hp: target._carryWounds || 0 };
    target._carryWounds = (target._carryWounds || 0) + damage;
    const removals = removeModels(target, target._carryWounds);
    const wPer = Number(UNITS[target.id]?.stats?.W || 1) || 1;
    target._carryWounds = target._carryWounds % wPer;
    state.history.push(snap);

    log(`${UNITS[attacker.id].name} used ${profile.name} → ${UNITS[target.id].name}`, 'title');
    log(`Thresholds: Hit ${th.hit}+ | Wound ${th.wound}+ | Save ${th.save}+`, 'meta');
    log(`Rolls: A${totalAttacks} H${hits} W${wounds} FailedSaves ${failedSaves} Damage ${damage}`, 'roll');
    if (removals.killCount) log(`Removed ${removals.killCount} model(s) from target (${target.models.length} remaining).`, 'result');

    setStatus(`SHOT RESOLVED · ${info.reason}`);
    renderTools();
  }

  function undoLast(){
    const last = state.history.pop();
    if (!last) return;
    const target = getUnit(last.targetId);
    if (!target) return;
    target.models = last.models.map(m=>({...m}));
    target._carryWounds = last.hp || 0;
    B.renderModels();
    log('Undo: restored target state before previous shot.', 'meta');
    renderTools();
    setStatus('LAST ACTION UNDONE');
  }

  const old=B.selectUnit.bind(B);
  B.selectUnit=function(uid){
    old(uid);
    const u=getUnit(uid);
    if(u&&u.faction===ACTIVE){ state.attackerId=uid; state.targetId=null; state.profileIx=0; setStatus(`ATTACKER: ${UNITS[uid].name}`); log(`Attacker selected: ${UNITS[uid].name}`, 'meta'); }
    else if(u&&u.faction!==ACTIVE){ const i=targetInfo(uid); if(i.valid) state.targetId=uid; setStatus((i.valid?'TARGET: ':'INVALID: ')+i.reason); if(i.valid) log(`Target selected: ${UNITS[uid].name} (${i.reason})`, 'meta'); }
    paint();
    renderTools();
  };
  window.selectUnit=B.selectUnit;

  document.getElementById('btn-shoot-select')?.addEventListener('click',()=>{ if(B.currentUnit) B.selectUnit(B.currentUnit); });
  document.getElementById('btn-confirm-shot')?.addEventListener('click',()=>{ if(state.targetId) setStatus('TARGET CONFIRMED · ROLL DICE'); else setStatus('NO VALID TARGET');});
  document.getElementById('btn-clear-shot')?.addEventListener('click',()=>{ state.targetId=null; paint(); setStatus('TARGET CLEARED'); renderTools();});
  document.getElementById('btn-dice')?.addEventListener('click',resolve);

  setStatus('— PICK FRIENDLY ATTACKER —');
  log('v0.4 initialized: profile picker, derived thresholds, deterministic mode, combat timeline, undo.', 'meta');
  paint();
  renderTools();
})();