(function(){
  'use strict';

  const B = window.BattleUI;
  const { simState, UNITS, PX_PER_INCH } = B;
  const ACTIVE = 'imp';

  const state = { attackerId: null, targetId: null, rolling:false };

  function getUnit(uid){ return simState.units.find(u => u.id === uid); }
  function isEnemy(uid){ const u=getUnit(uid); return u && u.faction !== ACTIVE; }
  function center(unit){ const p=unit.models.reduce((a,m)=>({x:a.x+m.x,y:a.y+m.y}),{x:0,y:0}); return {x:p.x/unit.models.length,y:p.y/unit.models.length}; }
  function rangedWeapons(uid){ return (UNITS[uid]?.weapons||[]).filter(w=>w.type==='RANGED'); }
  function rangedRangeIn(uid){
    const rs=rangedWeapons(uid).map(w=>parseInt(String(w.rng||'').replace(/[^0-9]/g,''))).filter(Boolean);
    return rs.length?Math.max(...rs):0;
  }
  function distIn(a,b){ const ca=center(getUnit(a)), cb=center(getUnit(b)); return Math.hypot(ca.x-cb.x, ca.y-cb.y)/PX_PER_INCH; }
  function setStatus(msg){ const el=document.getElementById('move-mode-label'); if(el) el.textContent=msg; }

  function targetInfo(enemyId){
    if(!state.attackerId) return {valid:false,reason:'Select attacker first'};
    const r=rangedRangeIn(state.attackerId), d=distIn(state.attackerId, enemyId);
    if(!r) return {valid:false,reason:'No ranged weapon'};
    if(d>r) return {valid:false,reason:`Out of range (${d.toFixed(1)}\" > ${r}\")`,d,r};
    return {valid:true,reason:`In range ${d.toFixed(1)}\" / ${r}\"`,d,r};
  }

  function paint(){
    document.querySelectorAll('#layer-hulls .unit-hull').forEach(h=>{
      const uid=h.dataset.unitId;
      h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker');
      if(uid===state.attackerId) h.classList.add('shoot-attacker');
      else if(isEnemy(uid)&&state.attackerId){ const i=targetInfo(uid); h.classList.add(i.valid?'shoot-valid':'shoot-invalid'); }
      if(uid===state.targetId) h.classList.add('shoot-target');
    });
  }

  function randD6(){ return 1 + Math.floor(Math.random()*6); }
  function rollMany(n, threshold){
    const rolls=[]; let success=0;
    for(let i=0;i<n;i++){ const r=randD6(); rolls.push(r); if(r>=threshold) success++; }
    return {rolls,success};
  }

  function getAttackProfile(){
    const ws=rangedWeapons(state.attackerId);
    const w=ws[0] || {a:1,s:4,ap:0,d:1,name:'Ranged Weapon'};
    const models=getUnit(state.attackerId).models.length;
    return { weapon:w, attacks: Math.max(1, (parseInt(w.a)||1)*models) };
  }

  function showDicePanel(lines){
    const totalEl=document.getElementById('advance-die-total');
    const labelEl=document.getElementById('advance-die-label');
    const numEl=document.getElementById('advance-die-num');
    const overlay=document.getElementById('advance-dice-overlay');
    if(!overlay) return;
    overlay.classList.add('visible');
    labelEl.textContent='SHOOTING RESOLUTION';
    numEl.textContent='⚅';
    totalEl.innerHTML=lines.map(l=>`<div>${l}</div>`).join('');
    setTimeout(()=>overlay.classList.remove('visible'),1600);
  }

  async function resolve(){
    if(state.rolling) return;
    if(!state.attackerId || !state.targetId) return setStatus('SELECT ATTACKER + VALID TARGET');
    state.rolling = true;
    const profile=getAttackProfile();
    const hit=rollMany(profile.attacks, 3);
    const wound=rollMany(hit.success, 4);
    const save=rollMany(wound.success, 5);
    const failed=Math.max(0, wound.success-save.success);
    showDicePanel([
      `${profile.weapon.name}`,
      `A: ${profile.attacks}`,
      `Hit 3+: ${hit.success}/${profile.attacks}`,
      `Wound 4+: ${wound.success}/${hit.success||1}`,
      `Save 5+: ${save.success}/${wound.success||1}`,
      `Failed Saves: ${failed}`
    ]);
    document.getElementById('btn-dice')?.classList.add('active');
    setStatus(`RESOLVED · ${failed} UNSAVED`);
    if (failed > 0) {
      document.querySelector(`#layer-hulls .unit-hull[data-unit-id="${state.targetId}"]`)?.classList.add('shoot-hit');
      setTimeout(()=>document.querySelectorAll('.shoot-hit').forEach(n=>n.classList.remove('shoot-hit')),300);
    }
    state.rolling = false;
  }

  function wire(){
    const old=B.selectUnit.bind(B);
    B.selectUnit=function(uid){
      old(uid);
      const u=getUnit(uid);
      if(u && u.faction===ACTIVE){ state.attackerId=uid; state.targetId=null; setStatus(`ATTACKER: ${UNITS[uid].name}`); }
      else if(u && u.faction!==ACTIVE){ const i=targetInfo(uid); if(i.valid){ state.targetId=uid; setStatus(`TARGET LOCKED: ${UNITS[uid].name}`);} else setStatus(`INVALID TARGET · ${i.reason.toUpperCase()}`); }
      paint();
    };
    window.selectUnit=B.selectUnit;
    document.getElementById('btn-shoot-select')?.addEventListener('click',()=>{ if(B.currentUnit) B.selectUnit(B.currentUnit); });
    document.getElementById('btn-confirm-shot')?.addEventListener('click',()=>{ if(state.targetId) setStatus('TARGET CONFIRMED · ROLL DICE'); });
    document.getElementById('btn-clear-shot')?.addEventListener('click',()=>{ state.targetId=null; paint(); setStatus('TARGET CLEARED');});
    document.getElementById('btn-dice')?.addEventListener('click', resolve);
  }

  wire(); paint(); setStatus('— PICK FRIENDLY ATTACKER —');
})();
