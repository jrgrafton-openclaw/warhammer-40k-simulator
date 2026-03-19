/**
 * screen-forge.js — Battle Forge army selection screen (v0.7a parity).
 * Full faction browser, side panels, bottom dock, battlefield activation.
 */

import { showScreen } from '../screen-router.js';

var _initialized = false;

/* ── Faction/Army Data ── */
var FACTIONS = [
  {
    id: 'custodes', name: 'Adeptus Custodes', icon: '\u269C', color: 'imp',
    subtitle: 'Talons of the Emperor',
    armies: [
      {
        name: 'Shield Host', pts: 1985, maxPts: 2000, unitCount: 13, modelCount: 45,
        available: true,
        units: [
          { name: 'Blade Champion', info: '1 model', pts: 120, qty: 2 },
          { name: 'Custodian Guard', info: '5 models', pts: 190, qty: 4 },
          { name: 'Allarus Custodians', info: '3 models', pts: 165, qty: 1 },
          { name: 'Allarus Custodians', info: '2 models', pts: 110, qty: 1 },
          { name: 'Prosecutors', info: '5 models', pts: 85, qty: 2 },
          { name: 'Caladius Grav-tank', info: '1 model', pts: 215, qty: 2 },
          { name: 'Inquisitor Draxus', info: '1 model', pts: 95, qty: 1 }
        ]
      },
      { name: 'Auric Champions', pts: 2000, maxPts: 2000, available: false },
      { name: 'Talons of the Emperor', pts: 1750, maxPts: 2000, available: false }
    ]
  },
  {
    id: 'orks', name: 'Orks', icon: '\u2620', color: 'ork',
    subtitle: 'Da Biggest an\' da Meanest',
    armies: [
      {
        name: "Waaagh! Tribe", pts: 1960, maxPts: 2000, unitCount: 16, modelCount: 75,
        available: true,
        units: [
          { name: 'Warboss', info: '1 model', pts: 90, qty: 1 },
          { name: 'Boss Nob', info: '1 model', pts: 95, qty: 1 },
          { name: 'Boyz Mob', info: '10 models', pts: 150, qty: 2 },
          { name: 'Mekboy', info: '1 model', pts: 75, qty: 1 },
          { name: 'Nobz Mob', info: '5 models', pts: 115, qty: 2 },
          { name: 'Gretchin', info: '10 models', pts: 50, qty: 2 },
          { name: 'Deff Dread', info: '1 model', pts: 150, qty: 1 },
          { name: 'Battlewagon', info: '1 model', pts: 185, qty: 1 },
          { name: 'Lootas', info: '5 models', pts: 100, qty: 1 },
          { name: 'Stormboyz', info: '5 models', pts: 80, qty: 1 },
          { name: 'Weirdboy', info: '1 model', pts: 70, qty: 1 },
          { name: 'Meganobz', info: '3 models', pts: 200, qty: 1 },
          { name: 'Trukk', info: '1 model', pts: 65, qty: 1 }
        ]
      },
      { name: 'Speed Freeks', pts: 1980, maxPts: 2000, available: false },
      { name: 'Goff Stompa Mob', pts: 2000, maxPts: 2000, available: false }
    ]
  },
  { id: 'sm', name: 'Space Marines', icon: '\u2694', locked: true },
  { id: 'csm', name: 'Chaos Marines', icon: '\u26E7', locked: true },
  { id: 'aeldari', name: 'Aeldari', icon: '\u263D', locked: true },
  { id: 'tyranids', name: 'Tyranids', icon: '\uD83D\uDD77', locked: true },
  { id: 'necrons', name: 'Necrons', icon: '\u2625', locked: true },
  { id: 'tau', name: "T'au Empire", icon: '\u2B21', locked: true },
  { id: 'dg', name: 'Death Guard', icon: '\u2623', locked: true },
  { id: 'tsons', name: 'Thousand Sons', icon: '\u2726', locked: true },
  { id: 'upload', name: 'Upload Custom', icon: '\u2B06', locked: true, upload: true }
];

/* ── State ── */
var state = { left: null, right: null, browserTarget: null, selectedFaction: null };

/* ── Tooltip ── */
var tipEl = null;

function initTooltip() {
  tipEl = document.getElementById('forge-tooltip');
  if (!tipEl) return;
  document.addEventListener('mouseover', function(e) {
    var row = e.target.closest('#screen-forge [data-tip]');
    if (row && tipEl) {
      tipEl.textContent = row.dataset.tip;
      tipEl.style.visibility = 'visible';
      tipEl.style.opacity = '1';
    }
  });
  document.addEventListener('mousemove', function(e) {
    if (tipEl && tipEl.style.visibility === 'visible') {
      tipEl.style.left = (e.clientX + 14) + 'px';
      tipEl.style.top = (e.clientY - 10) + 'px';
    }
  });
  document.addEventListener('mouseout', function(e) {
    var row = e.target.closest('#screen-forge [data-tip]');
    if (row && tipEl) {
      tipEl.style.visibility = 'hidden';
      tipEl.style.opacity = '0';
    }
  });
}

/* ── Toggle Army Abilities ── */
function toggleAA(hdr) {
  var body = hdr.nextElementSibling;
  var chev = hdr.querySelector('.aa-chev');
  var open = body.classList.toggle('open');
  if (chev) chev.style.transform = open ? 'rotate(90deg)' : '';
}

export function initBattleForge() {
  if (_initialized) return;
  _initialized = true;

  initTooltip();
  loadTerrain();

  /* ── Build faction grid ── */
  var gridEl = document.getElementById('factionGrid');
  if (gridEl) {
    gridEl.innerHTML = '';
    FACTIONS.forEach(function(f, i) {
      var card = document.createElement('div');
      card.className = 'fg-card' + (f.locked ? ' fg-locked' : '') + (f.upload ? ' fg-upload' : '');
      card.style.animationDelay = (0.05 * i) + 's';
      var html = '<div class="fg-icon">' + f.icon + '</div>' +
        '<div class="fg-name">' + f.name + '</div>';
      if (f.locked) {
        html += '<div class="fg-lock">Coming Soon</div>';
      } else {
        html += '<div class="fg-pts">' + f.armies[0].pts + ' pts available</div>';
      }
      card.innerHTML = html;
      if (!f.locked) {
        card.onclick = function() { showArmyPhase(f); };
      }
      gridEl.appendChild(card);
    });
  }

  /* ── Wire faction cards ── */
  var cardLeft = document.getElementById('cardLeft');
  var cardRight = document.getElementById('cardRight');
  if (cardLeft) cardLeft.onclick = function() { openBrowser('left'); };
  if (cardRight) cardRight.onclick = function() { openBrowser('right'); };

  /* ── Wire overlay close ── */
  var overlayBackdrop = document.getElementById('overlayBackdrop');
  var overlayClose = document.getElementById('overlayClose');
  if (overlayBackdrop) overlayBackdrop.onclick = closeBrowser;
  if (overlayClose) overlayClose.onclick = closeBrowser;

  /* ── Wire phase 2 back ── */
  var phase2Back = document.getElementById('phase2Back');
  if (phase2Back) phase2Back.onclick = backToFactions;

  /* ── Wire change links ── */
  var pLeftChange = document.getElementById('pLeftChange');
  var pRightChange = document.getElementById('pRightChange');
  if (pLeftChange) pLeftChange.onclick = function() { openBrowser('left'); };
  if (pRightChange) pRightChange.onclick = function() { openBrowser('right'); };

  /* ── Wire AA toggles ── */
  var aaLeft = document.getElementById('pLeftAAHdr');
  var aaRight = document.getElementById('pRightAAHdr');
  if (aaLeft) aaLeft.onclick = function() { toggleAA(aaLeft); };
  if (aaRight) aaRight.onclick = function() { toggleAA(aaRight); };

  /* ── Wire BEGIN BATTLE ── */
  var beginBtn = document.getElementById('beginBtn');
  if (beginBtn) {
    beginBtn.onclick = function(e) {
      e.preventDefault();
      if (beginBtn.classList.contains('disabled')) return;
      showScreen('game');
    };
  }

  /* ── Wire Back button ── */
  var backBtn = document.getElementById('forge-back-btn');
  if (backBtn) {
    backBtn.onclick = function() { showScreen('start'); };
  }

  /* ── Wire deployment selection ── */
  var deployCards = document.querySelectorAll('#screen-forge .deploy-card:not(.deploy-locked)');
  deployCards.forEach(function(card) {
    card.onclick = function() {
      document.querySelectorAll('#screen-forge .deploy-card').forEach(function(c) {
        c.classList.remove('deploy-active');
      });
      card.classList.add('deploy-active');
    };
  });

  /* ── Keyboard ── */
  document.addEventListener('keydown', function(e) {
    var overlay = document.getElementById('factionOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    if (e.key === 'Escape') {
      if (state.selectedFaction) {
        backToFactions();
      } else {
        closeBrowser();
      }
    }
  });
}

/* ── Terrain loading ── */
function loadTerrain() {
  import('../../../shared/state/terrain-data.js').then(function(mod) {
    var mapData = mod.mapData;
    var NS = 'http://www.w3.org/2000/svg';
    var layer = document.getElementById('forge-terrain-layer');
    if (!layer || !mapData) return;
    mapData.terrain.forEach(function(piece) {
      var ox = piece.origin[0], oy = piece.origin[1];
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('opacity', '0.92');
      g.setAttribute('transform', 'translate('+ox+','+oy+') '+piece.transform+' translate('+(-ox)+','+(-oy)+')');
      piece.paths.forEach(function(p) {
        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', p.d);
        path.setAttribute('fill', p.fill);
        path.setAttribute('stroke', 'rgba(0,0,0,0.35)');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        g.appendChild(path);
      });
      layer.appendChild(g);
    });
  }).catch(function() { /* terrain data not available, continue without */ });
}

/* ── Browser open/close ── */
function openBrowser(side) {
  state.browserTarget = side;
  state.selectedFaction = null;
  var title = document.getElementById('overlayTitle');
  if (title) title.textContent = side === 'left' ? 'SELECT YOUR FORCES' : 'SELECT ENEMY FORCES';
  showFactionPhase();
  var overlay = document.getElementById('factionOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeBrowser() {
  var overlay = document.getElementById('factionOverlay');
  if (overlay) overlay.classList.remove('open');
  state.browserTarget = null;
  state.selectedFaction = null;
}

/* ── Phase 1 → Phase 2 transitions ── */
function showFactionPhase() {
  var p1 = document.getElementById('forge-phase1');
  var p2 = document.getElementById('forge-phase2');
  if (p1) p1.classList.add('phase-active');
  if (p2) p2.classList.remove('phase-active');
}

function showArmyPhase(faction) {
  state.selectedFaction = faction;
  var icon = document.getElementById('p2Icon');
  var name = document.getElementById('p2Name');
  var sub = document.getElementById('p2Sub');
  if (icon) icon.textContent = faction.icon;
  if (name) name.textContent = faction.name;
  if (sub) sub.textContent = faction.subtitle || '';

  var listEl = document.getElementById('armyList');
  if (listEl) {
    listEl.innerHTML = '';
    faction.armies.forEach(function(army) {
      var card = document.createElement('div');
      card.className = 'army-card' + (army.available ? '' : ' army-locked');
      if (army.available) {
        card.innerHTML =
          '<div class="army-card-left">' +
            '<div class="army-card-name">' + army.name + '</div>' +
            '<div class="army-card-info">' + army.unitCount + ' units \u00B7 ' + army.modelCount + ' models</div>' +
          '</div>' +
          '<div class="army-card-pts">' + army.pts + 'pts</div>';
        card.onclick = function() { selectArmy(faction, army); };
      } else {
        card.innerHTML =
          '<div class="army-card-left">' +
            '<div class="army-card-name">' + army.name + '</div>' +
            '<div class="army-card-badge">Coming Soon</div>' +
          '</div>' +
          '<div class="army-card-pts">' + army.pts + 'pts</div>';
      }
      listEl.appendChild(card);
    });

    // Upload card
    var uploadCard = document.createElement('div');
    uploadCard.className = 'army-card army-upload army-locked';
    uploadCard.innerHTML =
      '<div class="army-card-left">' +
        '<div class="army-upload-icon">\uD83D\uDCCB</div>' +
        '<div class="army-card-name">Upload Custom (.ros)</div>' +
        '<div class="army-card-badge">Coming Soon</div>' +
      '</div>';
    listEl.appendChild(uploadCard);
  }

  var p1 = document.getElementById('forge-phase1');
  var p2 = document.getElementById('forge-phase2');
  if (p1) p1.classList.remove('phase-active');
  if (p2) p2.classList.add('phase-active');
}

function backToFactions() {
  state.selectedFaction = null;
  showFactionPhase();
}

/* ── Select army → fill card + slide panel in ── */
function selectArmy(faction, army) {
  var side = state.browserTarget;
  if (!side) return;
  state[side] = { faction: faction, army: army };
  closeBrowser();
  renderFactionCard(side);
  renderSidePanel(side);
  updateBattlefield();
  updateBeginBtn();
}

/* ── Render filled faction card ── */
function renderFactionCard(side) {
  var sel = state[side];
  if (!sel) return;
  var f = sel.faction;
  var a = sel.army;
  var card = document.getElementById(side === 'left' ? 'cardLeft' : 'cardRight');
  if (!card) return;
  var colorClass = f.color === 'imp' ? 'card-imp' : 'card-ork';
  var tagClass = f.color === 'imp' ? 'card-tag-imp' : 'card-tag-ork';

  card.className = 'faction-card card-filled ' + colorClass;
  card.innerHTML =
    '<div class="card-corner tl"></div>' +
    '<div class="card-corner tr"></div>' +
    '<div class="card-corner bl"></div>' +
    '<div class="card-corner br"></div>' +
    '<div class="card-tag ' + tagClass + '">' +
      (side === 'left' ? 'YOUR FORCES' : 'ENEMY FORCES') + '</div>' +
    '<div class="card-filled-icon">' + f.icon + '</div>' +
    '<div class="card-filled-name">' + f.name + '</div>' +
    '<div class="card-filled-sub">' + a.name + '</div>' +
    '<div class="card-filled-pts">' + a.pts + ' / ' + a.maxPts + ' pts</div>' +
    '<div class="card-filled-change">Change \u25BE</div>';

  card.onclick = function() { openBrowser(side); };
  setTimeout(function() { card.classList.add('card-docking'); }, 50);
}

/* ── Render side panel ── */
function renderSidePanel(side) {
  var sel = state[side];
  if (!sel) return;
  var f = sel.faction;
  var a = sel.army;
  var panel = document.getElementById(side === 'left' ? 'panelLeft' : 'panelRight');
  if (!panel) return;

  var prefix = side === 'left' ? 'pLeft' : 'pRight';
  var iconEl = document.getElementById(prefix + 'Icon');
  var factionEl = document.getElementById(prefix + 'Faction');
  var armyEl = document.getElementById(prefix + 'Army');
  var statsEl = document.getElementById(prefix + 'Stats');
  if (iconEl) iconEl.textContent = f.icon;
  if (factionEl) factionEl.textContent = f.name;
  if (armyEl) armyEl.textContent = a.name;
  if (statsEl) statsEl.innerHTML =
    '<span class="panel-stats-pts">' + a.pts + '/' + a.maxPts + ' pts</span> \u00B7 ' +
    a.unitCount + ' units \u00B7 ' + a.modelCount + ' models';

  panel.classList.add('panel-filled');
}

/* ── Battlefield activation ── */
function updateBattlefield() {
  var bf = document.getElementById('forge-battlefield');
  if (!bf) return;
  var hasLeft = !!state.left;
  var hasRight = !!state.right;
  var hasBoth = hasLeft && hasRight;

  bf.classList.toggle('bf-active', hasLeft || hasRight);
  bf.classList.toggle('bf-full', hasBoth);

  var objs = document.querySelectorAll('#screen-forge .obj-hex-wrap');
  objs.forEach(function(o) { o.classList.toggle('obj-visible', hasLeft || hasRight); });

  var vs = document.getElementById('vsDivider');
  if (vs) {
    vs.classList.toggle('vs-active', hasBoth);
    if (hasBoth) {
      var vsText = vs.querySelector('.vs-text');
      if (vsText) vsText.textContent = 'VS';
    }
  }
}

/* ── Begin button ── */
function updateBeginBtn() {
  var btn = document.getElementById('beginBtn');
  if (!btn) return;
  var ready = state.left && state.right;
  btn.classList.toggle('disabled', !ready);

  if (ready && !btn.dataset.activated) {
    btn.dataset.activated = '1';
    btn.classList.add('btn-surge');
    btn.addEventListener('animationend', function() {
      btn.classList.remove('btn-surge');
    }, { once: true });
  }
}

export function cleanupBattleForge() {
  // No dynamic cleanup needed — state persists for return visits
}
