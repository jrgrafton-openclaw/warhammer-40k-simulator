(function(){
  'use strict';
  const B = window.BattleUI;
  const { simState, UNITS, PX_PER_INCH } = B;
  const ACTIVE = 'imp';
  const state = { attackerId:null, targetId:null };

  function getUnit(uid){ return simState.units.find(u=>u.id===uid); }
  function isEnemy(uid){ const u=getUnit(uid); return u && u.faction!==ACTIVE; }
  function center(unit){ const p=unit.models.reduce((a,m)=>({x:a.x+m.x,y:a.y+m.y}),{x:0,y:0}); return {x:p.x/unit.models.length,y:p.y/unit.models.length}; }
  function rangedRangeIn(uid){
    const ws=(UNITS[uid]?.weapons||[]).filter(w=>w.type==='RANGED');
    const rs=ws.map(w=>parseInt(String(w.rng||'').replace(/[^0-9]/g,''))).filter(Boolean);
    return rs.length?Math.max(...rs):0;
  }
  function distIn(a,b){ const ca=center(getUnit(a)), cb=center(getUnit(b)); return Math.hypot(ca.x-cb.x, ca.y-cb.y)/PX_PER_INCH; }
  function setStatus(msg){ const el=document.getElementById('move-mode-label'); if(el) el.textContent=msg; }

  function segIntersectsRect(x1,y1,x2,y2,r){
    const minX=r.minX, maxX=r.maxX, minY=r.minY, maxY=r.maxY;
    // quick reject with bbox
    if (Math.max(x1,x2)<minX || Math.min(x1,x2)>maxX || Math.max(y1,y2)<minY || Math.min(y1,y2)>maxY) return false;
    function ccw(ax,ay,bx,by,cx,cy){ return (cy-ay)*(bx-ax) > (by-ay)*(cx-ax); }
    function segInt(a,b,c,d,e,f,g,h){ return ccw(a,b,e,f,g,h)!==ccw(c,d,e,f,g,h) && ccw(a,b,c,d,e,f)!==ccw(a,b,c,d,g,h); }
    // segment intersects any rect edge OR endpoints inside
    const inside1 = x1>=minX&&x1<=maxX&&y1>=minY&&y1<=maxY;
    const inside2 = x2>=minX&&x2<=maxX&&y2>=minY&&y2<=maxY;
    if (inside1||inside2) return true;
    return segInt(x1,y1,x2,y2,minX,minY,maxX,minY) ||
           segInt(x1,y1,x2,y2,maxX,minY,maxX,maxY) ||
           segInt(x1,y1,x2,y2,maxX,maxY,minX,maxY) ||
           segInt(x1,y1,x2,y2,minX,maxY,minX,minY);
  }

  function losState(attackerId, targetId){
    const a=getUnit(attackerId), t=getUnit(targetId); if(!a||!t) return 'blocked';
    const ca=center(a);
    const aabbs=(window._terrainAABBs||[]).filter(x=>x.kind==='ruin-wall' || x.kind==='wall' || x.kind==='ruin');
    if (!aabbs.length) return 'clear';
    let clear=0, blocked=0;
    t.models.forEach(m=>{
      const hit=aabbs.some(box=>segIntersectsRect(ca.x,ca.y,m.x,m.y,box));
      if(hit) blocked++; else clear++;
    });
    if(clear===0) return 'blocked';
    if(blocked===0) return 'clear';
    return 'partial';
  }

  function targetInfo(enemyId){
    if(!state.attackerId) return {valid:false,reason:'Select attacker first', los:'blocked'};
    const r=rangedRangeIn(state.attackerId); const d=distIn(state.attackerId, enemyId); const los=losState(state.attackerId, enemyId);
    if(!r) return {valid:false,reason:'No ranged weapon',los};
    if(d>r) return {valid:false,reason:`Out of range (${d.toFixed(1)}\" > ${r}\")`,d,r,los};
    if(los==='blocked') return {valid:false,reason:'No line of sight (fully occluded)',d,r,los};
    if(los==='partial') return {valid:true,reason:`Partial LoS ${d.toFixed(1)}\" / ${r}\"`,d,r,los};
    return {valid:true,reason:`Clear LoS ${d.toFixed(1)}\" / ${r}\"`,d,r,los};
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

  function resolve(){
    if(!state.attackerId||!state.targetId) return setStatus('SELECT ATTACKER + VALID TARGET');
    const info=targetInfo(state.targetId);
    if(!info.valid) return setStatus(`CANNOT FIRE · ${info.reason.toUpperCase()}`);
    const overlay=document.getElementById('advance-dice-overlay');
    const total=document.getElementById('advance-die-total');
    const lbl=document.getElementById('advance-die-label');
    if(overlay){
      lbl.textContent='HIT → WOUND → SAVE';
      total.innerHTML=`<div>${info.reason}</div><div>v0.3 LoS applied</div>`;
      overlay.classList.add('visible');
      setTimeout(()=>overlay.classList.remove('visible'),1200);
    }
    setStatus(`SHOT RESOLVED · ${info.reason}`);
  }

  const old=B.selectUnit.bind(B);
  B.selectUnit=function(uid){
    old(uid);
    const u=getUnit(uid);
    if(u&&u.faction===ACTIVE){ state.attackerId=uid; state.targetId=null; setStatus(`ATTACKER: ${UNITS[uid].name}`); }
    else if(u&&u.faction!==ACTIVE){ const i=targetInfo(uid); if(i.valid) state.targetId=uid; setStatus((i.valid?'TARGET: ':'INVALID: ')+i.reason); }
    paint();
  };
  window.selectUnit=B.selectUnit;

  document.getElementById('btn-shoot-select')?.addEventListener('click',()=>{ if(B.currentUnit) B.selectUnit(B.currentUnit); });
  document.getElementById('btn-confirm-shot')?.addEventListener('click',()=>{ if(state.targetId) setStatus('TARGET CONFIRMED · ROLL DICE'); else setStatus('NO VALID TARGET'); });
  document.getElementById('btn-clear-shot')?.addEventListener('click',()=>{ state.targetId=null; paint(); setStatus('TARGET CLEARED');});
  document.getElementById('btn-dice')?.addEventListener('click',resolve);

  setStatus('— PICK FRIENDLY ATTACKER —');
  paint();
})();
