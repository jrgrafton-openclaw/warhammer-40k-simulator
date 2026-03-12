(function(){
  'use strict';
  const B = window.BattleUI;
  const { simState, UNITS, PX_PER_INCH } = B;
  const ACTIVE = 'imp';
  const VARIANT = (document.body.dataset.variant || 'v0.7a').toLowerCase();
  const CONFIG = {
    'v0.7a': {
      label: 'BOTTOM COMBAT RAIL',
      tagline: 'Docked rail riding the action bar',
      prompt: 'Select a firing unit, then click a valid enemy to open the docked rail.',
      panelClass: 'variant-panel rail-mode'
    },
    'v0.7b': {
      label: 'TARGET-SIDE STACK',
      tagline: 'Offset stack living beside the defender',
      prompt: 'Select a firing unit, then click a valid enemy to pin the stack beside it.',
      panelClass: 'variant-panel stack-mode'
    },
    'v0.7c': {
      label: 'WORLD-SPACE GLYPHS',
      tagline: 'Inline glyphs with tiny floating controls',
      prompt: 'Select a firing unit, then click a valid enemy to spawn battlefield glyphs.',
      panelClass: 'variant-panel glyph-mode'
    }
  }[VARIANT] || {
    label: 'SHOOT PROTOTYPE',
    tagline: 'Prototype',
    prompt: 'Select a firing unit, then click an enemy.',
    panelClass: 'variant-panel rail-mode'
  };

  const state = {
    attackerId: null,
    targetId: null,
    hoveredTargetId: null,
    shotUnits: new Set(),
    selectedProfileIx: 0,
    pendingTargetId: null,
    flow: null,
    overlayRaf: null,
    seed: 0x7f4a7c15
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const stageOrder = ['weapon','target','hit','wound','save','result'];

  function rng(){ state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x100000000; }
  function d6(){ return 1 + Math.floor(rng() * 6); }
  function getUnit(uid){ return simState.units.find(u => u.id === uid); }
  function isEnemy(uid){ const u = getUnit(uid); return !!u && u.faction !== ACTIVE; }
  function center(unit){
    if (!unit || !Array.isArray(unit.models) || !unit.models.length) return { x:0, y:0, valid:false };
    const p = unit.models.reduce((a,m)=>({x:a.x+m.x,y:a.y+m.y}), {x:0,y:0});
    return { x:p.x/unit.models.length, y:p.y/unit.models.length, valid:true };
  }
  function distIn(a, b){ const ca = center(getUnit(a)), cb = center(getUnit(b)); return Math.hypot(ca.x-cb.x, ca.y-cb.y) / PX_PER_INCH; }
  function setStatus(msg){ const el = $('#move-mode-label'); if (el) el.textContent = msg || ''; }
  function parseRange(weapon){ return parseInt(String(weapon?.rng || '').replace(/[^0-9]/g, '')) || 0; }
  function getBallisticSkill(uid){ return ({'assault-intercessors':3,'intercessor-squad-a':3,'hellblasters':3,'primaris-lieutenant':3,'redemptor-dreadnought':3,'boyz-mob':5,'boss-nob':5,'mekboy':5,'nobz-mob':5}[uid] || 4); }
  function parseSave(sv){ const n = parseInt(String(sv || '').replace(/[^0-9]/g, '')); return n || 7; }
  function woundTarget(str, toughness){ if (str >= toughness * 2) return 2; if (str > toughness) return 3; if (str === toughness) return 4; if (str * 2 <= toughness) return 6; return 5; }
  function pickDamage(d){ const s = String(d || '1').trim().toUpperCase(); if (s === 'D3') return 1 + Math.floor(rng()*3); return Number(s) || 1; }
  function attackCount(profile, attacker){ return (Number(profile?.a || 1) || 1) * Math.max(1, attacker?.models?.length || 1); }

  function getProfiles(uid){
    const u = UNITS[uid];
    if (!u) return [];
    let w = [].concat(u.weapons || []);
    const wg = B.wgState?.[uid] || {};
    (u.wargear || []).forEach((opt, i) => { if (wg[i] && opt.adds) w.push(opt.adds); });
    return w.filter(x => x.type === 'RANGED');
  }

  function deriveThresholds(profile, attacker, target){
    const bs = Math.min(6, Math.max(2, getBallisticSkill(attacker.id)));
    const toughness = Number(UNITS[target.id]?.stats?.T || 4);
    const baseSave = parseSave(UNITS[target.id]?.stats?.Sv);
    const save = Math.min(7, Math.max(2, baseSave - Number(profile.ap || 0)));
    return { hit: bs, wound: woundTarget(Number(profile.s || 0), toughness), save };
  }

  function losState(attackerId, targetId){
    const a = getUnit(attackerId), t = getUnit(targetId); if (!a || !t) return 'blocked';
    const ca = center(a);
    const aabbs = (window._terrainAABBs || []).filter(x => x.kind === 'ruin-wall' || x.kind === 'wall' || x.kind === 'ruin');
    if (!aabbs.length) return 'clear';
    let clear = 0, blocked = 0;
    t.models.forEach(m => {
      const hit = aabbs.some(r => !(Math.max(ca.x,m.x) < r.minX || Math.min(ca.x,m.x) > r.maxX || Math.max(ca.y,m.y) < r.minY || Math.min(ca.y,m.y) > r.maxY));
      if (hit) blocked++; else clear++;
    });
    if (clear === 0) return 'blocked';
    if (blocked === 0) return 'clear';
    return 'partial';
  }

  function targetInfo(enemyId, profileIx = state.selectedProfileIx){
    if (!state.attackerId) return { valid:false, reason:'Select attacker first' };
    const profile = getProfiles(state.attackerId)[profileIx];
    if (!profile) return { valid:false, reason:'No ranged weapon' };
    const range = parseRange(profile);
    const distance = distIn(state.attackerId, enemyId);
    const los = losState(state.attackerId, enemyId);
    if (distance > range) return { valid:false, reason:`Out of range ${distance.toFixed(1)}" / ${range}"`, distance, range, los };
    if (los === 'blocked') return { valid:false, reason:'No line of sight', distance, range, los };
    return { valid:true, reason:`${los === 'partial' ? 'Partial' : 'Clear'} LoS · ${distance.toFixed(1)}" / ${range}"`, distance, range, los };
  }

  function getValidProfilesForTarget(targetId){
    return getProfiles(state.attackerId).map((profile, i) => ({ profile, i, info: targetInfo(targetId, i) })).filter(x => x.info.valid);
  }

  function toBattlefieldCoords(svgX, svgY){
    const svg = $('#bf-svg'), field = $('#battlefield');
    if (!svg || !field) return { x:0, y:0, valid:false };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x:0, y:0, valid:false };
    const pt = svg.createSVGPoint(); pt.x = svgX; pt.y = svgY;
    const screen = pt.matrixTransform(ctm);
    const rect = field.getBoundingClientRect();
    return { x: screen.x - rect.left, y: screen.y - rect.top, valid:true };
  }

  function getTargetAnchor(targetId){
    const unit = getUnit(targetId); if (!unit) return { x:0, y:0, valid:false };
    const c = center(unit); if (!c.valid) return { x:0, y:0, valid:false };
    return toBattlefieldCoords(c.x, c.y);
  }

  function getAttackerAnchor(attackerId){
    const unit = getUnit(attackerId); if (!unit) return { x:0, y:0, valid:false };
    const c = center(unit); if (!c.valid) return { x:0, y:0, valid:false };
    return toBattlefieldCoords(c.x, c.y);
  }

  function describeProfile(profile){
    if (!profile) return '';
    const ap = Number(profile.ap || 0);
    return `${profile.name} · ${profile.rng} · A${profile.a} · S${profile.s} · AP${ap >= 0 ? '+'+ap : ap}`.replace('AP+0','AP0');
  }

  function computeFlow(targetId, profileIx){
    const attacker = getUnit(state.attackerId), target = getUnit(targetId);
    const profileOptions = getValidProfilesForTarget(targetId);
    const chosenIx = profileOptions.some(opt => opt.i === profileIx) ? profileIx : (profileOptions[0]?.i ?? profileIx);
    const profile = getProfiles(state.attackerId)[chosenIx];
    if (!attacker || !target || !profile) return null;
    const thresholds = deriveThresholds(profile, attacker, target);
    const attacks = attackCount(profile, attacker);
    const hitRolls = Array.from({length: attacks}, d6);
    const hits = hitRolls.filter(r => r >= thresholds.hit).length;
    const woundRolls = Array.from({length: Math.max(1, hits)}, d6);
    const wounds = woundRolls.filter(r => r >= thresholds.wound).length;
    const saveRolls = Array.from({length: Math.max(1, wounds)}, d6);
    const failed = saveRolls.filter(r => r < thresholds.save).length;
    const damageRolls = Array.from({length: Math.max(1, failed)}, () => pickDamage(profile.d));
    const totalDamage = failed ? damageRolls.reduce((a,b)=>a+b, 0) : 0;
    const kills = Math.min(target.models.length, totalDamage);
    return {
      variant: VARIANT,
      attackerId: attacker.id,
      targetId: target.id,
      attackerName: UNITS[attacker.id]?.name || attacker.id,
      targetName: UNITS[target.id]?.name || target.id,
      profileIx: chosenIx,
      profile,
      profileOptions,
      thresholds,
      attacks,
      hitRolls,
      hits,
      woundRolls,
      wounds,
      saveRolls,
      failed,
      damageRolls,
      totalDamage,
      kills,
      step: 0,
      info: targetInfo(targetId, chosenIx)
    };
  }


  function getUnitStats(uid){
    return UNITS[uid]?.stats || {};
  }

  function targetStatSummary(targetId){
    const stats = getUnitStats(targetId);
    const info = targetInfo(targetId, state.selectedProfileIx);
    const pairs = [['M', stats.M || '?'], ['T', stats.T || '?'], ['Sv', stats.Sv || '?'], ['W', stats.W || '?'], ['Ld', stats.Ld || '?'], ['OC', stats.OC || '?']];
    return `
      <div class="target-summary">
        <div class="target-summary-top">
          <div>
            <div class="target-summary-name">${UNITS[targetId]?.name || targetId}</div>
            <div class="target-summary-faction">${UNITS[targetId]?.faction || 'Enemy target'}</div>
          </div>
          <div class="profile-pill-row"><span class="profile-pill">${info.reason}</span></div>
        </div>
        <div class="target-stat-grid">
          ${pairs.map(([k,v]) => `<div class="target-stat"><label>${k}</label><strong>${v}</strong></div>`).join('')}
        </div>
      </div>`;
  }

  function renderWeaponSelection(flow){
    const options = flow.profileOptions || [];
    return `
      <div class="stage-copy compact">
        <div class="stage-kicker">Weapon selection</div>
        <div class="stage-head">Choose a weapon</div>
        <div class="helper-copy">Pick the firing profile before resolving attacks.${options.length <= 1 ? ' Only one valid profile is available.' : ''}</div>
        ${targetStatSummary(flow.targetId)}
        <div class="weapon-grid">
          ${options.map(opt => `<button class="weapon-card ${opt.i === flow.profileIx ? 'selected' : ''}" data-weapon-pick="${opt.i}"><span class="weapon-card-title">${opt.profile.name}</span><span class="weapon-card-meta"><span>Rng ${opt.profile.rng}</span><span>A ${opt.profile.a}</span><span>S ${opt.profile.s}</span><span>AP ${opt.profile.ap}</span><span>D ${opt.profile.d}</span></span><span class="helper-copy">${opt.info.reason}</span></button>`).join('')}
        </div>
      </div>`;
  }

  function renderStageList(flow){
    return stageOrder.map((stage, ix) => `<div class="stage-pill ${flow.step === ix ? 'active' : ''} ${flow.step > ix ? 'done' : ''}">${stage}</div>`).join('');
  }

  function stageBody(flow){
    const t = flow.thresholds;
    const rows = {
      weapon: renderWeaponSelection(flow),
      target: `<div class="stage-copy compact"><div class="stage-kicker">Target lock</div><div class="stage-head">${flow.targetName}</div><div class="stage-sub">${flow.info.reason}</div>${targetStatSummary(flow.targetId)}<div class="stat-strip"><span>${describeProfile(flow.profile)}</span><span>${flow.attackerName}</span></div></div>`,
      hit: `<div class="stage-copy"><div class="stage-kicker">Hit roll</div><div class="stage-head">${flow.hits} / ${flow.attacks} hit</div><div class="dice-strip">${flow.hitRolls.map(r => `<span class="die-chip ${r >= t.hit ? 'good' : 'bad'}">${r}</span>`).join('')}</div><div class="stage-sub">BS ${t.hit}+ from ${flow.attackerName}</div></div>`,
      wound: `<div class="stage-copy"><div class="stage-kicker">Wound roll</div><div class="stage-head">${flow.wounds} wound${flow.wounds === 1 ? '' : 's'} stick</div><div class="dice-strip">${flow.woundRolls.slice(0, Math.max(1, flow.hits)).map(r => `<span class="die-chip ${r >= t.wound ? 'good' : 'bad'}">${r}</span>`).join('')}</div><div class="stage-sub">Strength ${flow.profile.s} vs Toughness ${UNITS[flow.targetId]?.stats?.T || '?' } → ${t.wound}+</div></div>`,
      save: `<div class="stage-copy"><div class="stage-kicker">Saving throws</div><div class="stage-head">${flow.failed} fail</div><div class="dice-strip enemy">${flow.saveRolls.slice(0, Math.max(1, flow.wounds)).map(r => `<span class="die-chip ${r < t.save ? 'bad' : 'enemy-good'}">${r}</span>`).join('')}</div><div class="stage-sub">${flow.targetName} saves on ${t.save}+ after AP</div></div>`,
      result: `<div class="stage-copy"><div class="stage-kicker">Result</div><div class="stage-head">${flow.totalDamage} damage · ${flow.kills} removed</div><div class="result-grid"><div><strong>${flow.failed}</strong><span>failed saves</span></div><div><strong>${flow.totalDamage}</strong><span>damage</span></div><div><strong>${flow.kills}</strong><span>models</span></div></div><div class="stage-sub">Prototype only: lightweight result preview, not full rules parity.</div></div>`
    };
    return rows[stageOrder[flow.step]] || rows.target;
  }

  function renderResolution(flow){
    const panel = $('#shoot-resolution');
    const glyphs = $('#shoot-glyphs');
    const controls = $('#shoot-floating-controls');
    if (!panel || !glyphs || !controls) return;
    if (!flow) {
      panel.className = CONFIG.panelClass + ' hidden';
      glyphs.className = 'shoot-glyphs hidden';
      controls.className = 'shoot-floating-controls hidden';
      panel.innerHTML = '';
      glyphs.innerHTML = '';
      controls.innerHTML = '';
      return;
    }

    panel.className = CONFIG.panelClass + (VARIANT === 'v0.7a' || VARIANT === 'v0.7b' ? '' : ' hidden');
    panel.innerHTML = `
      <div class="variant-eyebrow">${CONFIG.label}</div>
      <div class="variant-header">
        <div>
          <div class="variant-title">${flow.attackerName} → ${flow.targetName}</div>
          <div class="variant-subtitle">${CONFIG.tagline}</div>
        </div>
        <button class="icon-btn" data-action="cancel" aria-label="Close">×</button>
      </div>
      <div class="stage-row">${renderStageList(flow)}</div>
      ${stageBody(flow)}
      <div class="control-row">
        <button class="ghost-btn" data-action="back" ${flow.step === 0 || (flow.step === 1 && (flow.profileOptions?.length || 0) <= 1) ? 'disabled' : ''}>Back</button>
        <button class="solid-btn" data-action="next">${flow.step === stageOrder.length - 1 ? 'Apply preview' : (flow.step === 0 ? 'Confirm weapon' : 'Advance')}</button>
      </div>`;

    glyphs.className = 'shoot-glyphs' + (VARIANT === 'v0.7c' ? '' : ' hidden');
    controls.className = 'shoot-floating-controls' + (VARIANT === 'v0.7c' ? '' : ' hidden');
    if (VARIANT === 'v0.7c') {
      glyphs.innerHTML = renderGlyphs(flow);
      controls.innerHTML = `
        <div class="floating-head">${flow.attackerName}</div>
        <div class="floating-sub">${describeProfile(flow.profile)}</div>
        <div class="floating-actions">
          <button class="ghost-btn" data-action="back" ${flow.step === 0 ? 'disabled' : ''}>◀</button>
          <button class="solid-btn" data-action="next">${flow.step === stageOrder.length - 1 ? 'Commit' : 'Step'}</button>
          <button class="ghost-btn" data-action="cancel">✕</button>
        </div>`;
    }

    panel.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handlePanelAction));
    panel.querySelectorAll('[data-weapon-pick]').forEach(btn => btn.addEventListener('click', handleWeaponPick));
    controls.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handlePanelAction));
    positionVariantUI();
    ensureOverlayPinLoop();
  }

  function renderGlyphs(flow){
    const target = getTargetAnchor(flow.targetId);
    const attacker = getAttackerAnchor(flow.attackerId);
    const stages = [
      { label:'TARGET', value:flow.targetName.split(' ')[0], active:flow.step === 1, done:flow.step > 1, x: target.x - 26, y: target.y - 88 },
      { label:'HIT', value:`${flow.hits}`, active:flow.step === 2, done:flow.step > 2, x: (attacker.x + target.x)/2 - 82, y: (attacker.y + target.y)/2 - 56 },
      { label:'WND', value:`${flow.wounds}`, active:flow.step === 3, done:flow.step > 3, x: (attacker.x + target.x)/2 - 18, y: (attacker.y + target.y)/2 - 96 },
      { label:'SAVE', value:`${flow.failed}F`, active:flow.step === 4, done:flow.step > 4, x: target.x + 34, y: target.y - 34 },
      { label:'DMG', value:`${flow.totalDamage}`, active:flow.step === 5, done:false, x: target.x + 12, y: target.y + 36 }
    ];
    return `
      <div class="glyph-connector" style="left:${Math.min(attacker.x, target.x)}px; top:${Math.min(attacker.y, target.y)}px; width:${Math.abs(target.x-attacker.x)}px; height:${Math.abs(target.y-attacker.y)}px;"></div>
      ${stages.map(s => `<div class="combat-glyph ${s.active ? 'active' : ''} ${s.done ? 'done' : ''}" style="left:${s.x}px; top:${s.y}px;"><span>${s.label}</span><strong>${s.value}</strong></div>`).join('')}`;
  }

  function handleWeaponPick(e){
    if (!state.flow) return;
    const profileIx = Number(e.currentTarget.dataset.weaponPick);
    state.selectedProfileIx = profileIx;
    state.flow = computeFlow(state.flow.targetId, profileIx);
    renderResolution(state.flow);
    paint();
  }

  function handlePanelAction(e){
    const action = e.currentTarget.dataset.action;
    if (!state.flow) return;
    if (action === 'cancel') {
      state.targetId = null;
      state.pendingTargetId = null;
      state.hoveredTargetId = null;
      state.flow = null;
      clearLines();
      renderResolution(null);
      paint();
      setStatus(CONFIG.prompt);
      return;
    }
    if (action === 'back') {
      state.flow.step = Math.max((state.flow.profileOptions?.length || 0) > 1 ? 0 : 1, state.flow.step - 1);
      renderResolution(state.flow);
      paint();
      return;
    }
    if (action === 'next') {
      if (state.flow.step < stageOrder.length - 1) {
        state.flow.step += 1;
        if (state.flow.step === 0 && (state.flow.profileOptions?.length || 0) <= 1) state.flow.step = 1;
        renderResolution(state.flow);
        paint();
      } else {
        applyPreviewResult(state.flow);
      }
    }
  }

  function applyPreviewResult(flow){
    const target = getUnit(flow.targetId);
    if (target && flow.kills > 0) target.models.splice(Math.max(0, target.models.length - flow.kills), flow.kills);
    state.shotUnits.add(flow.attackerId);
    B.renderModels();
    state.attackerId = null;
    state.targetId = null;
    state.hoveredTargetId = null;
    state.flow = null;
    renderResolution(null);
    clearLines();
    paint();
    setStatus(`${flow.targetName}: preview resolved · ${flow.totalDamage} damage / ${flow.kills} removed`);
    const oldSelect = B.selectUnit.bind(B);
    oldSelect(null);
  }

  function clearLines(){ const g = $('#layer-target-lines'); if (g) g.innerHTML = ''; }

  function closestTargetEdgePoint(attackerModel, targetUnit){
    let best = null;
    targetUnit.models.forEach(m => {
      const radius = m.r || Math.max(m.w || 20, m.h || 20) / 2;
      const dx = attackerModel.x - m.x, dy = attackerModel.y - m.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = m.x + (dx / len) * radius, py = m.y + (dy / len) * radius;
      const dist = Math.hypot(attackerModel.x - px, attackerModel.y - py);
      if (!best || dist < best.dist) best = { x:px, y:py, dist };
    });
    return best || center(targetUnit);
  }

  function drawHoverLines(targetId){
    const g = $('#layer-target-lines'); if (!g) return; g.innerHTML = '';
    if (!state.attackerId || !targetId) return;
    const attacker = getUnit(state.attackerId), target = getUnit(targetId); if (!attacker || !target) return;
    const NS = 'http://www.w3.org/2000/svg';
    attacker.models.forEach(m => {
      const edge = closestTargetEdgePoint(m, target);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', m.x); line.setAttribute('y1', m.y); line.setAttribute('x2', edge.x); line.setAttribute('y2', edge.y);
      line.setAttribute('class', 'target-line');
      g.appendChild(line);
    });
  }

  function paint(){
    $$('#layer-hulls .unit-hull').forEach(h => {
      const uid = h.dataset.unitId;
      h.classList.remove('shoot-valid','shoot-invalid','shoot-target','shoot-attacker','shoot-partial','prototype-target');
      if (uid === state.attackerId) h.classList.add('shoot-attacker');
      else if (isEnemy(uid) && state.attackerId && !state.shotUnits.has(state.attackerId)) {
        const valids = getValidProfilesForTarget(uid);
        if (valids.length) {
          h.classList.add('shoot-valid');
          if (valids.some(v => v.info.los === 'partial')) h.classList.add('shoot-partial');
        } else h.classList.add('shoot-invalid');
      }
      if (uid === state.targetId || uid === state.hoveredTargetId) h.classList.add('shoot-target','prototype-target');
    });
    $$('.rail-unit').forEach(row => row.classList.toggle('attacked', state.shotUnits.has(row.dataset.unit)));
    const badge = $('#unit-state-badge');
    if (badge) {
      const spent = !!state.attackerId && state.shotUnits.has(state.attackerId);
      badge.textContent = spent ? 'ATTACKED' : 'READY';
      badge.classList.toggle('visible', true);
    }
  }

  function startFlow(targetId){
    const options = getValidProfilesForTarget(targetId);
    if (!options.length) return;
    state.selectedProfileIx = options[0].i;
    state.targetId = targetId;
    state.hoveredTargetId = targetId;
    state.flow = computeFlow(targetId, state.selectedProfileIx);
    if (state.flow && (state.flow.profileOptions?.length || 0) <= 1) state.flow.step = 1;
    drawHoverLines(targetId);
    renderResolution(state.flow);
    paint();
    setStatus(`${CONFIG.label} · ${state.flow.attackerName} targeting ${state.flow.targetName}`);
  }

  function selectAttacker(uid){
    state.attackerId = uid;
    state.targetId = null;
    state.hoveredTargetId = null;
    state.flow = null;
    clearLines();
    renderResolution(null);
    paint();
    setStatus(CONFIG.prompt);
  }

  function positionVariantUI(){
    const panel = $('#shoot-resolution');
    if (!panel || panel.classList.contains('hidden') || !state.flow) return;
    const target = getTargetAnchor(state.flow.targetId);
    if (VARIANT === 'v0.7b' && target.valid) {
      panel.style.left = `${Math.min(window.innerWidth - 356, target.x + 82)}px`;
      panel.style.top = `${Math.max(112, target.y - 130)}px`;
    } else if (VARIANT === 'v0.7a') {
      panel.style.left = '50%';
      panel.style.top = 'auto';
    }
  }

  function ensureOverlayPinLoop(){
    if (state.overlayRaf) return;
    const tick = () => {
      if (state.flow) positionVariantUI();
      if (state.flow) state.overlayRaf = requestAnimationFrame(tick);
      else state.overlayRaf = null;
    };
    state.overlayRaf = requestAnimationFrame(tick);
  }

  const oldSelect = B.selectUnit.bind(B);
  B.selectUnit = function(uid){
    oldSelect(uid);
    const unit = getUnit(uid);
    if (!unit) return;
    if (unit.faction === ACTIVE && !state.shotUnits.has(uid)) selectAttacker(uid);
  };
  window.selectUnit = B.selectUnit;

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
      state.hoveredTargetId = uid;
      drawHoverLines(uid);
      paint();
    }, true);
    svg.addEventListener('mouseleave', () => { if (!state.flow) { state.hoveredTargetId = null; clearLines(); paint(); } }, true);
    const intercept = (e) => {
      if (!state.attackerId || state.shotUnits.has(state.attackerId)) return;
      let node = e.target;
      while (node && !(node.classList?.contains('model-base') || node.classList?.contains('unit-hull'))) node = node.parentElement;
      if (!node) return;
      const uid = node.dataset.unitId;
      if (!isEnemy(uid)) return;
      if (!getValidProfilesForTarget(uid).length) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.type === 'click') startFlow(uid);
    };
    svg.addEventListener('mousedown', intercept, true);
    svg.addEventListener('click', intercept, true);
  }

  function mountShell(){
    const battlefield = $('#battlefield');
    if (!battlefield || $('#shoot-resolution')) return;
    const panel = document.createElement('div');
    panel.id = 'shoot-resolution';
    panel.className = CONFIG.panelClass + ' hidden';
    battlefield.appendChild(panel);

    const glyphs = document.createElement('div');
    glyphs.id = 'shoot-glyphs';
    glyphs.className = 'shoot-glyphs hidden';
    battlefield.appendChild(glyphs);

    const controls = document.createElement('div');
    controls.id = 'shoot-floating-controls';
    controls.className = 'shoot-floating-controls hidden';
    battlefield.appendChild(controls);

    const badge = document.querySelector('.vshoot-badge');
    if (badge) badge.textContent = `${VARIANT} · ${CONFIG.label}`;
    const subtitle = document.querySelector('.phase-subtitle');
    if (subtitle) subtitle.textContent = CONFIG.tagline;
  }

  $('#btn-end-shoot')?.addEventListener('click', () => setStatus('Prototype only · end phase not wired'));
  $('#card-close')?.addEventListener('click', () => $('#unit-card')?.classList.remove('visible'));

  mountShell();
  bindShootOverrides();
  setStatus(CONFIG.prompt);
  paint();
})();
