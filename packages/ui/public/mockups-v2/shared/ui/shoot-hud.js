import { UNIT_DEFS } from '../data/shoot-v06-data.js';

export function mountShootHud({ root, store, world, actions }) {
  root.innerHTML = `
    <aside class="hud-shell">
      <div class="roster-panel">
        <div class="panel-title">Army Roster</div>
        <div class="roster-groups">
          <section><div class="group-label imp">Imperium</div><div id="roster-imp"></div></section>
          <section><div class="group-label ork">Orks</div><div id="roster-ork"></div></section>
        </div>
      </div>

      <main class="screen-shell">
        <a class="backlink" href="../../../index.html">← Mockups v2</a>
        <div class="top-bar">
          <div class="phase-pill"><div class="eyebrow">v0.6 migration · mockups-v2</div><h1>Shooting Phase</h1><p>Pixi world plane + DOM HUD plane</p></div>
          <div class="score-bar"><span>CP 5</span><span>Imperium 10</span><span>VS</span><span>Orks 4</span><span>RND 2 / 5</span></div>
        </div>
        <div class="world-shell"><div id="world-mount" class="world-mount"></div></div>
        <div class="action-bar"><div class="phase-track">CMD · MOVE · <strong>SHOOT</strong> · CHARGE · FIGHT</div><div id="status-line" class="status-line"></div><button id="clear-btn" class="ghost-btn">Clear</button></div>
        <div id="floating-anchor"></div>
      </main>

      <aside class="inspector-panel">
        <div id="unit-card"></div>
      </aside>
    </aside>
    <div id="weapon-popup" class="overlay-panel hidden"></div>
    <div id="roll-overlay" class="overlay-panel hidden"></div>
  `;

  const worldMount = root.querySelector('#world-mount');
  while (world.mount.firstChild) {
    worldMount.appendChild(world.mount.firstChild);
  }
  root.querySelector('#clear-btn').addEventListener('click', actions.clearSelection);

  const rosterImp = root.querySelector('#roster-imp');
  const rosterOrk = root.querySelector('#roster-ork');
  const unitCard = root.querySelector('#unit-card');
  const weaponPopup = root.querySelector('#weapon-popup');
  const rollOverlay = root.querySelector('#roll-overlay');
  const statusLine = root.querySelector('#status-line');

  function renderRoster(state) {
    const renderGroup = (faction) => state.units.filter((unit) => unit.faction === faction).map((unit) => {
      const def = UNIT_DEFS[unit.id];
      const selected = state.attackerId === unit.id ? 'selected' : '';
      const attacked = unit.shot ? 'attacked' : '';
      return `<button class="roster-row ${selected} ${attacked}" data-unit-id="${unit.id}"><span>${def.name}</span><span class="roster-pill">${unit.models.length}</span></button>`;
    }).join('');
    rosterImp.innerHTML = renderGroup('imp');
    rosterOrk.innerHTML = renderGroup('ork');
    root.querySelectorAll('.roster-row').forEach((button) => {
      button.addEventListener('click', () => actions.selectUnit(button.dataset.unitId));
      button.addEventListener('mouseenter', () => actions.hoverUnit(button.dataset.unitId));
      button.addEventListener('mouseleave', () => actions.hoverUnit(null));
    });
  }

  function renderCard(state) {
    const unit = state.units.find((entry) => entry.id === (state.attackerId || 'hellblasters'));
    const def = UNIT_DEFS[unit.id];
    unitCard.innerHTML = `
      <div class="panel-title">Unit Inspector</div>
      <div class="card-title">${def.name}</div>
      <div class="card-subtitle">${def.faction}</div>
      <div class="stat-grid">${Object.entries(def.stats).map(([key, value]) => `<div class="stat-cell"><span>${key}</span><strong>${value}</strong></div>`).join('')}</div>
      <div class="section-label">Ranged weapons</div>
      <div class="weapon-list">${def.weapons.filter((weapon) => weapon.type === 'RANGED').map((weapon) => `<div class="weapon-card"><strong>${weapon.name}</strong><span>${weapon.rng}" · A ${weapon.a} · S ${weapon.s} · AP ${weapon.ap} · D ${weapon.d}</span></div>`).join('')}</div>
      <div class="section-label">Abilities</div>
      <div class="ability-list">${def.abilities.map((ability) => `<span class="ability-pill">${ability}</span>`).join('')}</div>
    `;
  }

  function renderStatus(state) {
    if (!state.attackerId) {
      statusLine.textContent = 'Select a friendly unit to begin.';
      return;
    }
    if (state.targetId) {
      statusLine.textContent = `${UNIT_DEFS[state.attackerId].name} → ${UNIT_DEFS[state.targetId].name}`;
      return;
    }
    statusLine.textContent = `Selected: ${UNIT_DEFS[state.attackerId].name}`;
  }

  function positionOverlay(element, unitId, offsetY) {
    if (!unitId) return;
    const anchor = world.getUnitAnchor(unitId);
    if (!anchor.valid) return;
    element.style.left = `${anchor.x}px`;
    element.style.top = `${anchor.y + offsetY}px`;
  }

  function renderWeaponPopup(state) {
    if (!state.weaponChoices?.length || !state.popupTargetId) {
      weaponPopup.classList.add('hidden');
      return;
    }
    weaponPopup.classList.remove('hidden');
    weaponPopup.innerHTML = `<div class="overlay-title">Choose weapon</div>${state.weaponChoices.map((weapon, index) => `
      <button class="weapon-choice" data-weapon-ix="${index}">
        <strong>${weapon.name}</strong>
        <span>${weapon.rng}" · A ${weapon.a} · S ${weapon.s} · AP ${weapon.ap} · D ${weapon.d}</span>
      </button>`).join('')}`;
    weaponPopup.querySelectorAll('.weapon-choice').forEach((button) => {
      button.addEventListener('click', () => actions.pickWeapon(Number(button.dataset.weaponIx)));
    });
    positionOverlay(weaponPopup, state.popupTargetId, 28);
  }

  function renderRollOverlay(state) {
    if (!state.rollSummary || !state.targetId) {
      rollOverlay.classList.add('hidden');
      return;
    }
    rollOverlay.classList.remove('hidden');
    const summary = state.rollSummary;
    rollOverlay.innerHTML = `
      <div class="overlay-title">Attack Resolution</div>
      <div class="roll-grid">
        <div><span>Hits</span><strong>${summary.hits}</strong></div>
        <div><span>Wounds</span><strong>${summary.wounds}</strong></div>
        <div><span>Failed Saves</span><strong>${summary.failedSaves}</strong></div>
        <div><span>Damage</span><strong>${summary.damage}</strong></div>
      </div>
      <button class="cta-btn" id="close-roll">Dismiss</button>
    `;
    rollOverlay.querySelector('#close-roll').addEventListener('click', actions.dismissRoll);
    positionOverlay(rollOverlay, state.targetId, 56);
  }

  store.subscribe((state) => {
    renderRoster(state);
    renderCard(state);
    renderStatus(state);
    renderWeaponPopup(state);
    renderRollOverlay(state);
  });

  return { worldMount };
}
