import { OBJECTIVES, UNIT_DEFS } from '../data/shoot-v06-data.js';

function iconSvg(icon = 'infantry') {
  if (icon === 'character') return '<svg viewBox="0 0 24 24" fill="none"><polygon points="12,3 14.5,9 21,9.5 16,14 17.5,21 12,17.5 6.5,21 8,14 3,9.5 9.5,9" stroke="currentColor" stroke-width="1.5"/></svg>';
  if (icon === 'elite') return '<svg viewBox="0 0 24 24" fill="none"><polygon points="12,4 20,12 12,20 4,12" stroke="currentColor" stroke-width="2"/></svg>';
  if (icon === 'vehicle') return '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" rx="1" stroke="currentColor" stroke-width="2"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5"/></svg>';
}

function apClass(ap) {
  if (ap === 0) return 'ap-0';
  if (ap === -1) return 'ap-1';
  if (ap === -2) return 'ap-2';
  if (ap === -3) return 'ap-3';
  return 'ap-4plus';
}

function objectiveMarkup() {
  return OBJECTIVES.map((objective, index) => `
    <div class="obj-marker ${objective.state}" style="left:${((objective.x / 720) * 100).toFixed(2)}%;top:${((objective.y / 528) * 100).toFixed(2)}%;">
      <div class="obj-label">${String(index + 1).padStart(2, '0')}<br><span class="obj-label-sub">OBJ</span></div>
    </div>
  `).join('');
}

function weaponTableMarkup(title, weapons) {
  if (!weapons.length) return '';
  return `
    <div class="section-header">${title}</div>
    <table class="weapon-table">
      <thead>
        <tr><th>Weapon</th><th>Rng</th><th>A</th><th>S</th><th>AP</th><th>D</th><th>Keywords</th></tr>
      </thead>
      <tbody>
        ${weapons.map((weapon) => `
          <tr>
            <td>${weapon.name}</td>
            <td>${weapon.type === 'MELEE' ? '—' : `${weapon.rng}"`}</td>
            <td>${weapon.a}</td>
            <td>${weapon.s}</td>
            <td class="${apClass(weapon.ap)}">${weapon.ap}</td>
            <td class="td-damage">${weapon.d}</td>
            <td>${(weapon.kw || []).map((kw) => `<span class="kw-tag">${kw}</span>`).join('')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function abilityRows(def) {
  return (def.abilities || []).map((ability) => {
    const name = typeof ability === 'string' ? ability : ability.name;
    const timing = typeof ability === 'string' ? 'PASSIVE' : (ability.timing || 'PASSIVE');
    const active = timing === 'PASSIVE' || timing === 'SHOOTING PHASE';
    const tagClass = timing === 'PASSIVE' ? 'passive' : active ? 'active-now' : 'phase';
    return `
      <div class="right-ability-row${active ? ' phase-active' : ''}">
        <span>${name}</span>
        <span class="ability-tag ${tagClass}">${timing}</span>
      </div>
      ${typeof ability === 'object' && ability.desc ? `<div class="ability-desc-block">${ability.desc}</div>` : ''}
    `;
  }).join('');
}

function unitCardMarkup(unitId) {
  const def = UNIT_DEFS[unitId];
  const stats = def.stats;
  return `
    <div class="right-header"><span class="right-header-title">Selected Unit</span><button class="card-close" id="card-close">×</button></div>
    <div id="unit-name-display" class="unit-name-display">${def.name.toUpperCase()}</div>
    <div id="faction-tag" class="faction-tag">
      <span class="faction-diamond" style="color:${def.factionColor};">◆</span>
      <span id="faction-tag-text">${def.factionSubtitle || def.faction}</span>
    </div>
    <div class="section-header">Characteristics</div>
    <table class="stat-table">
      <thead>
        <tr><th>M</th><th>T</th><th>Sv</th><th>W</th><th>Ld</th><th>OC</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>${stats.M}</td><td>${stats.T}</td><td>${stats.Sv}</td><td>${stats.W}</td><td>${stats.Ld}</td><td>${stats.OC}</td>
        </tr>
      </tbody>
    </table>
    ${weaponTableMarkup('Ranged Weapons', def.weapons.filter((weapon) => weapon.type === 'RANGED'))}
    ${weaponTableMarkup('Melee Weapons', def.weapons.filter((weapon) => weapon.type === 'MELEE'))}
    <div class="section-header">Unit Abilities</div>
    <div id="abilities-list">${abilityRows(def)}</div>
    <div id="aquila">⚜</div>
  `;
}

export function mountShootHud({ root, store, actions }) {
  root.innerHTML = `
    <aside id="roster">
      <div class="roster-header">
        <span class="roster-title">ARMY ROSTER</span>
        <button class="roster-collapse-btn" id="roster-btn">◄</button>
      </div>
      <div class="roster-scroll">
        <div class="faction-section">
          <div class="faction-header"><div class="faction-band imp"></div><span class="faction-label imp">IMPERIUM</span><span class="faction-chevron">▾</span></div>
          <div class="faction-body" id="roster-imp"></div>
        </div>
        <div class="faction-section">
          <div class="faction-header"><div class="faction-band ork"></div><span class="faction-label ork">ORKS</span><span class="faction-chevron">▾</span></div>
          <div class="faction-body" id="roster-ork"></div>
        </div>
      </div>
    </aside>
    <main id="battlefield">
      <a class="backlink" href="../../../index.html">← Mockups</a>
      <div id="vp-bar">
        <div class="vp-cp">CP <span id="cp-val">5</span></div>
        <div class="vp-faction"><span class="vp-name-imp">IMPERIUM</span><span class="vp-score imp">10</span></div>
        <span class="vp-vs">VS</span>
        <div class="vp-faction"><span class="vp-score ork">4</span><span class="vp-name-ork">ORKS</span></div>
        <span class="vp-round">RND 2 / 5</span>
        <button id="reset-btn" title="Reset view">↺ RESET</button>
      </div>
      <div id="phase-header">
        <div class="phase-pill"><div class="phase-title">SHOOTING PHASE</div><div class="phase-subtitle">IMPERIUM ACTIVE · ROUND 2</div></div>
      </div>
      <div class="vshoot-badge">v0.6 · SHOOTING</div>
      <div id="battlefield-inner">
        <div id="world-mount"></div>
        ${objectiveMarkup()}
      </div>
      <div id="weapon-popup" class="overlay-panel hidden"></div>
      <div id="roll-overlay" class="overlay-panel hidden"></div>
      <div id="range-move" class="range-circle rc-move"></div>
      <div id="range-advance" class="range-circle rc-advance"></div>
      <div id="range-charge" class="range-circle rc-charge"></div>
      <div id="range-move-label" class="range-label rl-move">MOVE</div>
      <div id="range-advance-label" class="range-label rl-advance">ADV</div>
      <div id="range-charge-label" class="range-label rl-charge">CHARGE</div>
      <div id="unit-card" class="visible"></div>
      <div id="action-bar">
        <div id="zone-phase">
          <div class="phase-step done"><div class="phase-num-done">①</div><span class="phase-name-done">Command</span></div>
          <span class="phase-sep">➜</span>
          <div class="phase-step done"><div class="phase-num-done">②</div><span class="phase-name-done">Movement</span></div>
          <span class="phase-sep">➜</span>
          <div class="phase-step active"><div class="phase-num-active">③</div><span class="phase-name-active">Shooting</span></div>
          <span class="phase-sep">➜</span>
          <div class="phase-step upcoming"><div class="phase-num-upcoming">④</div><span class="phase-name-upcoming">Charge</span></div>
          <span class="phase-sep">➜</span>
          <div class="phase-step upcoming"><div class="phase-num-upcoming">⑤</div><span class="phase-name-upcoming">Fight</span></div>
        </div>
        <div class="zone-sep"></div>
        <div id="zone-actions">
          <button class="action-btn active" id="btn-normal-move">SELECT TARGET</button>
          <button class="action-btn" id="btn-advance">FIRE WEAPON</button>
        </div>
        <div class="zone-sep"></div>
        <div id="zone-global">
          <button class="stratagem-btn" id="btn-strat">USE STRATAGEM ⚙</button>
          <button class="end-phase-btn" id="btn-end-shoot">END SHOOTING PHASE →</button>
        </div>
      </div>
    </main>
  `;

  const rosterImp = root.querySelector('#roster-imp');
  const rosterOrk = root.querySelector('#roster-ork');
  const unitCard = root.querySelector('#unit-card');
  const weaponPopup = root.querySelector('#weapon-popup');
  const rollOverlay = root.querySelector('#roll-overlay');
  const status = root.querySelector('#move-mode-label');

  root.querySelector('#roster-btn').addEventListener('click', () => root.classList.toggle('collapsed'));
  root.querySelector('#reset-btn').addEventListener('click', actions.resetView);

  let lastRosterKey = '';
  function renderRoster(state) {
    const key = state.units.map(u => `${u.id}:${u.shot}:${u.models.length}`).join(',') + '|' + (state.attackerId || '');
    if (key === lastRosterKey) {
      root.querySelectorAll('.rail-unit').forEach((row) => row.classList.toggle('active', row.dataset.unitId === state.attackerId));
      return;
    }
    lastRosterKey = key;
    const renderGroup = (faction) => state.units.filter((unit) => unit.faction === faction).map((unit) => {
      const def = UNIT_DEFS[unit.id];
      const active = state.attackerId === unit.id ? 'active' : '';
      const attacked = unit.shot ? 'attacked' : '';
      const sideClass = faction === 'imp' ? 'pl' : 'en';
      return `<div class="rail-unit ${active} ${attacked}" data-unit-id="${unit.id}"><div class="ri ${sideClass}">${iconSvg(def.icon)}</div><span class="rn">${def.name}</span><span class="rc">${unit.models.length}</span></div>`;
    }).join('');
    rosterImp.innerHTML = renderGroup('imp');
    rosterOrk.innerHTML = renderGroup('ork');
    root.querySelectorAll('.rail-unit').forEach((row) => {
      row.addEventListener('click', () => actions.selectUnit(row.dataset.unitId));
      row.addEventListener('mouseenter', () => actions.hoverUnit(row.dataset.unitId));
      row.addEventListener('mouseleave', () => actions.hoverUnit(null));
    });
  }

  let lastCardUnitId = '';
  function renderCard(state) {
    const unitId = state.attackerId || 'hellblasters';
    if (unitId === lastCardUnitId) return;
    lastCardUnitId = unitId;
    unitCard.innerHTML = unitCardMarkup(unitId);
    unitCard.querySelector('#card-close')?.addEventListener('click', actions.clearSelection);
  }

  function positionOverlay(element, anchor, offsetY) {
    if (!anchor?.valid) return;
    element.style.left = `${anchor.x}px`;
    element.style.top = `${anchor.y + offsetY}px`;
  }

  function renderWeaponPopup(state) {
    if (!state.weaponChoices?.length || !state.popupAnchor) {
      weaponPopup.classList.add('hidden');
      return;
    }
    weaponPopup.classList.remove('hidden');
    weaponPopup.innerHTML = `<div class="overlay-title">Choose weapon</div>${state.weaponChoices.map((weapon, index) => `<button class="weapon-choice" data-weapon-ix="${index}"><div class="weapon-choice-name">${weapon.name}</div><div class="weapon-meta-row"><span class="weapon-meta">RNG ${weapon.rng}\"</span><span class="weapon-meta">A ${weapon.a}</span><span class="weapon-meta">S ${weapon.s}</span><span class="weapon-meta ap-hot">AP ${weapon.ap}</span><span class="weapon-meta dmg-hot">D ${weapon.d}</span></div></button>`).join('')}`;
    weaponPopup.querySelectorAll('.weapon-choice').forEach((button) => button.addEventListener('click', () => actions.pickWeapon(Number(button.dataset.weaponIx))));
    positionOverlay(weaponPopup, state.popupAnchor, 28);
  }

  function renderRollOverlay(state) {
    if (!state.rollSummary || !state.rollAnchor) {
      rollOverlay.classList.add('hidden');
      return;
    }
    rollOverlay.classList.remove('hidden');
    rollOverlay.innerHTML = `<div class="overlay-title">Attack Resolution</div><div class="result-main"><div class="result-row"><div class="result-num">${state.rollSummary.hits}</div><div class="result-label">Hits</div></div><div class="result-row wounds"><div class="result-num">${state.rollSummary.wounds}</div><div class="result-label">Wounds</div></div><div class="result-row has-kills"><div class="result-num">${state.rollSummary.damage}</div><div class="result-label">Damage</div></div></div><button class="roll-cta" id="close-roll">DISMISS</button>`;
    rollOverlay.querySelector('#close-roll')?.addEventListener('click', actions.dismissRoll);
    positionOverlay(rollOverlay, state.rollAnchor, 56);
  }

  store.subscribe((state) => {
    renderRoster(state);
    renderCard(state);
    if (status) status.textContent = state.targetId ? `${UNIT_DEFS[state.attackerId].name} → ${UNIT_DEFS[state.targetId].name}` : '';
    renderWeaponPopup(state);
    renderRollOverlay(state);
  });

  return { worldMount: root.querySelector('#world-mount') };
}
