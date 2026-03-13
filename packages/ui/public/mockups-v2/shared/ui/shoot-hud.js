import { UNIT_DEFS } from '../data/shoot-v06-data.js';

function iconSvg(icon = 'infantry') {
  if (icon === 'character') return '<svg viewBox="0 0 24 24" fill="none"><polygon points="12,3 14.5,9 21,9.5 16,14 17.5,21 12,17.5 6.5,21 8,14 3,9.5 9.5,9" stroke="currentColor" stroke-width="1.5"/></svg>';
  if (icon === 'elite') return '<svg viewBox="0 0 24 24" fill="none"><polygon points="12,4 20,12 12,20 4,12" stroke="currentColor" stroke-width="2"/></svg>';
  if (icon === 'vehicle') return '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" rx="1" stroke="currentColor" stroke-width="2"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5"/></svg>';
}

function objectiveMarkup() {
  const objectives = [
    ['neutral', '50%', '13.64%', '01'],
    ['controlled', '16.67%', '50%', '02'],
    ['neutral', '50%', '50%', '03'],
    ['enemy', '83.33%', '50%', '04'],
    ['neutral', '50%', '86.36%', '05'],
  ];
  return objectives.map(([state, left, top, label]) => `
    <div class="obj-area-ring" style="left:${left};top:${top};"></div>
    <div class="obj-hex-wrap ${state}" style="left:${left};top:${top};"><svg class="obj-svg" viewBox="0 0 84 97" width="84" height="97"><polygon class="obj-bg" points="42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5"/><polygon class="obj-ring" points="42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5"/><text x="42" y="44" class="obj-n">${label}</text><text x="42" y="62" class="obj-l">OBJ</text></svg></div>
  `).join('');
}

function unitCardMarkup(unitId) {
  const def = UNIT_DEFS[unitId];
  const ranged = def.weapons.filter((weapon) => weapon.type === 'RANGED');
  const melee = def.weapons.filter((weapon) => weapon.type === 'MELEE');
  return `
    <div class="card-hdr">
      <div style="min-width:0;flex:1;">
        <div class="card-title-row">
          <div class="card-name" id="card-name">${def.name.toUpperCase()}</div>
          <div class="unit-state-badge ${def.side === 'imp' ? 'visible' : ''}" id="unit-state-badge">${unitId === 'hellblasters' ? 'READY' : 'ATTACKED'}</div>
        </div>
        <div class="card-faction" id="card-faction">★ ${def.faction}</div>
      </div>
      <button class="card-close" id="card-close">×</button>
    </div>
    <div class="card-stats" id="card-stats">${Object.entries(def.stats).map(([key, value]) => `<div class="stat-cell"><div class="stat-key">${key}</div><div class="stat-val">${value}</div></div>`).join('')}</div>
    <div class="card-ranges" id="card-ranges">
      <button class="range-toggle move" id="rt-move">MOVE<br>${def.stats.M}</button>
      <button class="range-toggle advance" id="rt-advance">AVG ADV<br>10&quot;</button>
      <button class="range-toggle charge" id="rt-charge">AVG CHRG<br>13&quot;</button>
    </div>
    ${melee.length ? `<div class="card-section"><div class="sec-label">MELEE WEAPONS</div>${melee.map((weapon) => `<div class="wt-row"><div class="wt-name-row"><span class="wt-name">${weapon.name}</span><span class="wt-val">—</span><span class="wt-val">${weapon.a}</span><span class="wt-val">${weapon.s}</span><span class="wt-val ap-neg">${weapon.ap}</span><span class="wt-val dmg">${weapon.d}</span></div><div class="wt-kws">${(weapon.kw||[]).map(k => `<span class="kw-pill">${k}</span>`).join('')}</div></div>`).join('')}</div>` : ''}
    <div class="card-section"><div class="sec-label">RANGED WEAPONS</div>${ranged.map((weapon) => `<div class="wt-row"><div class="wt-name-row"><span class="wt-name">${weapon.name}</span><span class="wt-val">${weapon.rng}&quot;</span><span class="wt-val">${weapon.a}</span><span class="wt-val">${weapon.s}</span><span class="wt-val ${weapon.ap < 0 ? 'ap-neg' : 'ap0'}">${weapon.ap}</span><span class="wt-val dmg">${weapon.d}</span></div><div class="wt-kws">${(weapon.kw||[]).map(k => `<span class="kw-pill">${k}</span>`).join('')}</div></div>`).join('')}</div>
    <div class="card-section"><div class="sec-label">ABILITIES</div>${def.abilities.map((ab) => `<div class="ability-row"><div class="ability-pill">${typeof ab === 'string' ? ab.toUpperCase() : ab.name}</div>${typeof ab === 'object' && ab.desc ? `<div class="ability-desc">${ab.desc}</div>` : ''}</div>`).join('')}</div>
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
        <div class="phase-row">
          <div class="ph-item done"><span class="ph-dot"></span>CMD</div>
          <span class="ph-sep">·</span>
          <div class="ph-item"><span class="ph-dot"></span>MOVE</div>
          <span class="ph-sep">·</span>
          <div class="ph-item active"><span class="ph-dot"></span>SHOOT</div>
          <span class="ph-sep">·</span>
          <div class="ph-item"><span class="ph-dot"></span>CHARGE</div>
          <span class="ph-sep">·</span>
          <div class="ph-item"><span class="ph-dot"></span>FIGHT</div>
        </div>
        <div class="ab-sep"></div>
        <span id="move-mode-label"></span>
        <div class="phase-end-cluster">
          <button class="btn-strat" id="btn-strat">USE STRATAGEM</button>
          <div class="phase-end-divider" aria-hidden="true"></div>
          <button class="btn-cta" id="btn-end-shoot">END SHOOTING →</button>
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
    // Only re-render if roster-relevant state changed (avoids DOM thrashing / event loops)
    const key = state.units.map(u => `${u.id}:${u.shot}:${u.models.length}`).join(',') + '|' + (state.attackerId || '');
    if (key === lastRosterKey) {
      // Just update active class without destroying DOM
      root.querySelectorAll('.rail-unit').forEach((row) => {
        row.classList.toggle('active', row.dataset.unitId === state.attackerId);
      });
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
    const unitId = state.attackerId || 'assault-intercessors';
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
    weaponPopup.innerHTML = `<div class="overlay-title">Choose weapon</div>${state.weaponChoices.map((weapon, index) => `<button class="weapon-choice" data-weapon-ix="${index}"><div class="weapon-choice-name">${weapon.name}</div><div class="weapon-meta-row"><span class="weapon-meta">RNG ${weapon.rng}&quot;</span><span class="weapon-meta">A ${weapon.a}</span><span class="weapon-meta">S ${weapon.s}</span><span class="weapon-meta ap-hot">AP ${weapon.ap}</span><span class="weapon-meta dmg-hot">D ${weapon.d}</span></div></button>`).join('')}`;
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
    status.textContent = state.targetId ? `${UNIT_DEFS[state.attackerId].name} → ${UNIT_DEFS[state.targetId].name}` : '';
    renderWeaponPopup(state);
    renderRollOverlay(state);
  });

  return { worldMount: root.querySelector('#world-mount') };
}
