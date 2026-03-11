(function(){
  'use strict';

  const B = window.BattleUI;
  const { simState, UNITS, PX_PER_INCH } = B;
  const ACTIVE = 'imp';

  const state = { attackerId: null, targetId: null };

  function getUnit(uid){ return simState.units.find(u => u.id === uid); }
  function isEnemy(uid){ const u=getUnit(uid); return u && u.faction !== ACTIVE; }
  function center(unit){
    if (!unit || !unit.models.length) return {x:0,y:0};
    const p = unit.models.reduce((a,m)=>({x:a.x+m.x,y:a.y+m.y}),{x:0,y:0});
    return {x:p.x/unit.models.length,y:p.y/unit.models.length};
  }
  function rangedRangeIn(uid){
    const data = UNITS[uid]; if (!data) return 0;
    const rs = (data.weapons||[]).filter(w=>w.type==='RANGED').map(w=>parseInt(String(w.rng||'').replace(/[^0-9]/g,''))).filter(Boolean);
    return rs.length ? Math.max(...rs) : 0;
  }
  function distIn(a,b){
    const ca = center(getUnit(a)), cb = center(getUnit(b));
    return Math.hypot(ca.x-cb.x, ca.y-cb.y)/PX_PER_INCH;
  }
  function setStatus(msg){
    const el = document.getElementById('move-mode-label');
    if (el) el.textContent = msg;
  }

  function computeTargetInfo(enemyId){
    if (!state.attackerId) return {valid:false,reason:'Select attacker first'};
    const r = rangedRangeIn(state.attackerId);
    const d = distIn(state.attackerId, enemyId);
    if (!r) return {valid:false,reason:'No ranged weapon'};
    if (d > r) return {valid:false,reason:`Out of range (${d.toFixed(1)}\" > ${r}\")`, d, r};
    return {valid:true,reason:`In range ${d.toFixed(1)}\" / ${r}\"`, d, r};
  }

  function paintTargets(){
    document.querySelectorAll('#layer-hulls .unit-hull').forEach(h => {
      const uid = h.dataset.unitId;
      h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker');
      if (!uid) return;
      if (uid === state.attackerId) h.classList.add('shoot-attacker');
      else if (isEnemy(uid) && state.attackerId) {
        const info = computeTargetInfo(uid);
        h.classList.add(info.valid ? 'shoot-valid' : 'shoot-invalid');
      }
      if (uid === state.targetId) h.classList.add('shoot-target');
    });
  }

  function selectAttacker(uid){
    const unit = getUnit(uid);
    if (!unit || unit.faction !== ACTIVE) {
      setStatus('— PICK FRIENDLY ATTACKER —');
      return;
    }
    state.attackerId = uid;
    state.targetId = null;
    setStatus(`ATTACKER: ${UNITS[uid].name}`);
    B.selectUnit(uid);
    paintTargets();
  }

  function clickTarget(uid){
    if (!isEnemy(uid) || !state.attackerId) return;
    const info = computeTargetInfo(uid);
    if (!info.valid) {
      setStatus(`INVALID TARGET · ${info.reason.toUpperCase()}`);
      return;
    }
    state.targetId = uid;
    setStatus(`TARGET LOCKED: ${UNITS[uid].name} · ${info.reason}`);
    paintTargets();
  }

  function wireClicks(){
    const oldSelect = B.selectUnit.bind(B);
    B.selectUnit = function(uid){
      oldSelect(uid);
      const u = getUnit(uid);
      if (u && u.faction===ACTIVE) {
        state.attackerId = uid;
        state.targetId = null;
        setStatus(`ATTACKER: ${UNITS[uid].name}`);
      } else if (u && u.faction!==ACTIVE) {
        clickTarget(uid);
      }
      paintTargets();
    };
    window.selectUnit = B.selectUnit;

    document.getElementById('btn-shoot-select')?.addEventListener('click', () => {
      if (B.currentUnit) selectAttacker(B.currentUnit);
      else setStatus('— PICK FRIENDLY ATTACKER —');
    });
    document.getElementById('btn-confirm-shot')?.addEventListener('click', () => {
      if (!state.attackerId || !state.targetId) return setStatus('SELECT ATTACKER + VALID TARGET');
      setStatus('SHOT CONFIRMED · READY TO RESOLVE');
    });
    document.getElementById('btn-clear-shot')?.addEventListener('click', () => {
      state.targetId = null; paintTargets(); setStatus('TARGET CLEARED');
    });
    document.getElementById('btn-dice')?.addEventListener('click', () => {
      setStatus('v0.1: Dice pipeline arrives in v0.2');
    });
  }

  wireClicks();
  paintTargets();
  setStatus('— PICK FRIENDLY ATTACKER —');
})();
