/* units.js — Unit data, keyword rules, card builder, tooltips (ES module) */

import { activeRangeTypes } from './store.js';

export const KW_RULES = {
  'MELEE':           {cls:'melee',     tip:'Fight phase only. Cannot shoot.'},
  'PISTOL':          {cls:'pistol',    tip:'Can fire within Engagement Range. May fire instead of other weapons.'},
  'ASSAULT':         {cls:'assault',   tip:'Can fire after Advancing with no penalty to hit.'},
  'ASSAULT 2':       {cls:'assault',   tip:'ASSAULT — fire after Advancing. 2 shots per model.'},
  'ASSAULT 3':       {cls:'assault',   tip:'ASSAULT — fire after Advancing. 3 shots per model.'},
  'HEAVY':           {cls:'heavy',     tip:'-1 to hit rolls if the bearer moved this turn.'},
  'HAZARDOUS':       {cls:'hazardous', tip:'After firing: each model rolls D6. On 1, the unit suffers 1 mortal wound.'},
  'RAPID FIRE 1':    {cls:'rapid',     tip:'+1 Attack if the target is within half of the weapon\'s range.'},
  'BLAST':           {cls:'blast',     tip:'+1 Attack per 5 models in the target unit (round down).'},
  'MELTA 2':         {cls:'melta',     tip:'+2 to the Damage characteristic if the target is within half range.'},
  'ADEPTUS ASTARTES':{cls:'other',     tip:'Keyword applying to all Space Marine units in this army.'},
  'INFANTRY':        {cls:'other',     tip:'Unit type keyword. Affected by terrain and transport rules for INFANTRY.'},
  'VEHICLE':         {cls:'other',     tip:'Unit type keyword. Affected by vehicle-specific rules and abilities.'},
};

export const UNITS = {
  'assault-intercessors': {
    name:'ASSAULT INTERCESSORS', faction:'✠ SPACE MARINES · ADEPTUS ASTARTES',
    stats:{M:'6"',T:4,Sv:'3+',W:2,Ld:7,OC:2}, M:6, faction_side:'imp',
    wargear:[],
    weapons:[
      {type:'MELEE',name:'Astartes Chainsword',rng:'—',a:4,s:4,ap:-1,d:1,kw:['MELEE']},
      {type:'RANGED',name:'Heavy Bolt Pistol',rng:'18"',a:2,s:4,ap:0,d:1,kw:['PISTOL']}
    ],
    abilities:[
      {name:'SHOCK ASSAULT',desc:'On a turn this unit makes a charge move, until end of turn its models get +1 Attack.'},
      {name:'AND THEY SHALL KNOW NO FEAR',desc:'Each time a model in this unit takes a wound, roll D6. On 6, that wound is ignored.'}
    ]
  },
  'primaris-lieutenant': {
    name:'PRIMARIS LIEUTENANT', faction:'★ SPACE MARINES · CHARACTER',
    stats:{M:'6"',T:4,Sv:'3+',W:5,Ld:6,OC:1}, M:6, faction_side:'imp',
    wargear:[],
    weapons:[
      {type:'RANGED',name:'Master-crafted Auto Pistol',rng:'18"',a:2,s:4,ap:0,d:1,kw:['PISTOL']},
      {type:'MELEE',name:'Paired Combat Blades',rng:'—',a:6,s:4,ap:-1,d:1,kw:['MELEE']}
    ],
    abilities:[
      {name:'TACTICAL PRECISION',desc:'Friendly [ADEPTUS ASTARTES] units within 6" can re-roll wound rolls of 1.'}
    ]
  },
  'intercessor-squad-a': {
    name:'INTERCESSOR SQUAD A', faction:'✠ SPACE MARINES · INFANTRY',
    stats:{M:'6"',T:4,Sv:'3+',W:2,Ld:7,OC:2}, M:6, faction_side:'imp',
    wargear:[{id:'sgt-plasma',label:"Sergeant's bolt pistol → plasma pistol",
      adds:{type:'RANGED',name:'Plasma Pistol',rng:'12"',a:1,s:7,ap:-2,d:1,kw:['PISTOL','HAZARDOUS']}}],
    weapons:[
      {type:'RANGED',name:'Bolt Rifle',rng:'30"',a:2,s:4,ap:-1,d:1,kw:['RAPID FIRE 1']},
      {type:'RANGED',name:'Bolt Pistol',rng:'12"',a:1,s:4,ap:0,d:1,kw:['PISTOL']}
    ],
    abilities:[
      {name:'AND THEY SHALL KNOW NO FEAR',desc:'Each time a model in this unit takes a wound, roll D6. On 6, that wound is ignored.'}
    ]
  },
  'hellblasters': {
    name:'HELLBLASTERS', faction:'✠ SPACE MARINES · INFANTRY',
    stats:{M:'6"',T:4,Sv:'3+',W:2,Ld:7,OC:2}, M:6, faction_side:'imp',
    wargear:[{id:'sgt-plasma',label:"Sergeant's bolt pistol → plasma pistol",
      adds:{type:'RANGED',name:'Plasma Pistol',rng:'12"',a:1,s:7,ap:-2,d:1,kw:['PISTOL','HAZARDOUS']}}],
    weapons:[
      {type:'RANGED',name:'Plasma Incinerator (std)',rng:'30"',a:2,s:7,ap:-3,d:2,kw:['RAPID FIRE 1']},
      {type:'RANGED',name:'Plasma Incinerator (sup)',rng:'30"',a:2,s:8,ap:-3,d:3,kw:['RAPID FIRE 1','HAZARDOUS']}
    ],
    abilities:[
      {name:'AND THEY SHALL KNOW NO FEAR',desc:'Each time a model in this unit takes a wound, roll D6. On 6, that wound is ignored.'},
      {name:'FOR THE CHAPTER!',desc:'Each time a model in this unit is destroyed, roll D6: on 3+, do not remove it yet. It can shoot after the attacking unit finishes, then it is removed. [HAZARDOUS] tests for these attacks are automatically passed.'}
    ]
  },
  'redemptor-dreadnought': {
    name:'REDEMPTOR DREADNOUGHT', faction:'⬡ SPACE MARINES · VEHICLE',
    stats:{M:'8"',T:10,Sv:'2+',W:12,Ld:6,OC:3}, M:8, faction_side:'imp',
    wargear:[],
    weapons:[
      {type:'MELEE',name:'Redemptor Fist',rng:'—',a:5,s:12,ap:-3,d:3,kw:['MELEE']},
      {type:'RANGED',name:'Macro Plasma Incinerator',rng:'36"',a:3,s:8,ap:-4,d:2,kw:['HEAVY','BLAST']}
    ],
    abilities:[
      {name:'DUTY ETERNAL',desc:'Each time this model suffers a wound, roll D6: on 5+, that wound is ignored.'},
      {name:'GUARDIAN OF THE CHAPTER',desc:'While this model is within 3" of a friendly INFANTRY unit, it has a 4+ invulnerable save.'}
    ]
  },
  'boss-nob': {
    name:'BOSS NOB', faction:'☠ ORKS · CHARACTER',
    stats:{M:'5"',T:5,Sv:'4+',W:5,Ld:7,OC:1}, M:5, faction_side:'ork',
    wargear:[],
    weapons:[
      {type:'MELEE',name:'Power Klaw',rng:'—',a:4,s:8,ap:-3,d:2,kw:['MELEE']},
      {type:'RANGED',name:'Slugga',rng:'12"',a:2,s:4,ap:0,d:1,kw:['PISTOL']}
    ],
    abilities:[{name:"'ERE WE GO",desc:"This unit can make a charge move after Advancing. Add 1 to charge rolls."}]
  },
  'boyz-mob': {
    name:'BOYZ MOB', faction:'☠ ORKS · INFANTRY',
    stats:{M:'5"',T:4,Sv:'5+',W:1,Ld:'7+',OC:2}, M:5, faction_side:'ork',
    wargear:[{id:'big-shoota',label:'1 Boy can replace Shoota with Big Shoota',
      adds:{type:'RANGED',name:'Big Shoota',rng:'24"',a:3,s:5,ap:0,d:1,kw:['ASSAULT 3']}}],
    weapons:[
      {type:'MELEE',name:'Choppa',rng:'—',a:2,s:4,ap:-1,d:1,kw:['MELEE']},
      {type:'RANGED',name:'Shoota',rng:'12"',a:2,s:4,ap:0,d:1,kw:['ASSAULT 2']}
    ],
    abilities:[{name:"'ERE WE GO",desc:"This unit can make a charge move after Advancing. Add 1 to charge rolls."}]
  },
  'mekboy': {
    name:'MEKBOY', faction:'⚙ ORKS · CHARACTER',
    stats:{M:'5"',T:4,Sv:'5+',W:4,Ld:7,OC:1}, M:5, faction_side:'ork',
    wargear:[],
    weapons:[
      {type:'RANGED',name:'Kustom Mega-blasta',rng:'24"',a:3,s:8,ap:-3,d:'D3',kw:['MELTA 2']},
      {type:'MELEE',name:'Choppa',rng:'—',a:3,s:4,ap:-1,d:1,kw:['MELEE']}
    ],
    abilities:[{name:"MEK'S TOOLS",desc:'At the start of your Command phase, if this model is within 3" of a friendly VEHICLE, that vehicle regains up to D3 lost wounds.'}]
  },
  'nobz-mob': {
    name:'NOBZ MOB', faction:'☠ ORKS · ELITES',
    stats:{M:'5"',T:5,Sv:'4+',W:3,Ld:'7+',OC:2}, M:5, faction_side:'ork',
    wargear:[],
    weapons:[
      {type:'MELEE',name:'Big Choppa',rng:'—',a:3,s:7,ap:-1,d:2,kw:['MELEE']},
      {type:'RANGED',name:'Slugga',rng:'12"',a:2,s:4,ap:0,d:1,kw:['PISTOL']}
    ],
    abilities:[{name:"'ERE WE GO",desc:"This unit can make a charge move after Advancing. Add 1 to charge rolls."}]
  },
  'gretchin': {
    name:'GRETCHIN', faction:'☠ ORKS · BATTLELINE',
    stats:{M:'5"',T:2,Sv:'7+',W:1,Ld:8,OC:2}, M:5, faction_side:'ork',
    wargear:[],
    weapons:[
      {type:'RANGED',name:'Grot Blasta',rng:'12"',a:1,s:3,ap:0,d:1,kw:['PISTOL']}
    ],
    abilities:[{name:'Cowardly',desc:'This unit automatically fails Battle-shock tests.'}]
  }
};

// ── Wargear toggle state
export const wgState = {};

// ── Helpers ────────────────────────────────────────────
export function apCls(ap) {
  var n = typeof ap==='string' ? parseInt(ap) : ap;
  if (isNaN(n)||n===0) return 'ap0';
  if (n < 0) return 'ap-neg';
  return 'ap0';
}

export function kwPill(kw) {
  var d = KW_RULES[kw] || {cls:'other', tip:'Keyword ability.'};
  return '<span class="kw-pill ' + d.cls + '" data-tip="' + d.tip + '">' + kw + '</span>';
}

export function formatDesc(text) {
  return text.replace(/\[([A-Z ]+)\]/g, function(match, kw) {
    var rule = KW_RULES[kw] || {cls:'other', tip:'Special keyword.'};
    return '<span class="kw-inline kw-' + rule.cls + '" data-tip="' + rule.tip + '">' + match + '</span>';
  });
}

// ── Global Tooltip (with viewport clamping) ───────────
var PAD = 10;

export function showTip(el, content) {
  var globalTip = document.getElementById('global-tooltip');
  if (!globalTip) return;
  if (typeof content === 'string') {
    globalTip.innerHTML = content;
  } else {
    globalTip.textContent = content;
  }
  var r = el.getBoundingClientRect();
  globalTip.style.left = (r.left + r.width/2) + 'px';
  globalTip.style.top = (r.top - 8) + 'px';
  globalTip.style.transform = 'translate(-50%, -100%)';
  globalTip.style.visibility = 'visible';
  globalTip.style.opacity = '1';

  // Clamp to viewport (integrated from inline script)
  var tw = globalTip.offsetWidth;
  var th = globalTip.offsetHeight;
  var left = r.left + r.width / 2 - tw / 2;
  var top  = r.top - 8 - th;
  left = Math.max(PAD, Math.min(left, window.innerWidth - tw - PAD));
  if (top < PAD) top = r.bottom + 8;
  globalTip.style.left = left + 'px';
  globalTip.style.top = top + 'px';
  globalTip.style.transform = 'none';
}

export function hideTip() {
  var globalTip = document.getElementById('global-tooltip');
  if (!globalTip) return;
  globalTip.style.visibility = 'hidden';
  globalTip.style.opacity = '0';
}

export function initAllTooltips() {
  document.querySelectorAll('[data-tip]').forEach(function(el) {
    if (el._tipInit) return;
    el._tipInit = true;
    el.addEventListener('mouseenter', function() { showTip(el, el.dataset.tip); });
    el.addEventListener('mouseleave', hideTip);
  });
}

// ── Build Unit Card ────────────────────────────────────
// getRangeInches is imported lazily via the callback to avoid circular deps
let _getRangeInches = null;
export function setGetRangeInches(fn) { _getRangeInches = fn; }

export function buildCard(uid) {
  var u = UNITS[uid]; if (!u) return;
  document.getElementById('card-name').textContent = u.name;
  document.getElementById('card-faction').textContent = u.faction;

  // Stats
  var statKeys = ['M','T','Sv','W','Ld','OC'];
  document.getElementById('card-stats').innerHTML = statKeys.map(function(k) {
    return '<div class="stat-cell"><div class="stat-key">' + k + '</div><div class="stat-val">' + (u.stats[k]!==undefined ? u.stats[k] : '—') + '</div></div>';
  }).join('');

  // Range toggle labels
  if (_getRangeInches) {
    var radii = _getRangeInches(u);
    document.getElementById('rt-move').innerHTML    = 'MOVE<br>' + u.M + '"';
    document.getElementById('rt-advance').innerHTML = 'AVG ADV<br>' + Math.round(radii.advance) + '"';
    document.getElementById('rt-charge').innerHTML  = 'AVG CHRG<br>' + Math.round(radii.charge) + '"';
    var dsBtn = document.getElementById('rt-ds');
    if (dsBtn) dsBtn.innerHTML = 'DS<br>' + Math.round(radii.ds) + '"';
    // Sync active state on toggles
    ['move','advance','charge','ds'].forEach(function(t) {
      var btn = document.getElementById('rt-' + t);
      if (btn) btn.classList.toggle('active', activeRangeTypes.has(t));
    });
  }

  // Wargear
  var wgEl = document.getElementById('card-wargear');
  if (u.wargear && u.wargear.length) {
    if (!wgState[uid]) wgState[uid] = {};
    var h = '<div class="card-section"><div class="sec-label">WARGEAR OPTIONS</div>';
    u.wargear.forEach(function(wg, i) {
      var on = !!wgState[uid][i];
      h += '<div class="wg-row' + (on?' active':'') + '" data-uid="' + uid + '" data-i="' + i + '"><div class="wg-circle"></div><span>' + wg.label + '</span></div>';
    });
    h += '</div>';
    wgEl.innerHTML = h;
    wgEl.querySelectorAll('.wg-row').forEach(function(r) {
      r.addEventListener('click', function() {
        if (!wgState[uid]) wgState[uid]={};
        wgState[uid][+r.dataset.i] = !wgState[uid][+r.dataset.i];
        buildCard(uid);
      });
    });
  } else { wgEl.innerHTML=''; }

  // Weapons
  var weapons = [].concat(u.weapons);
  if (u.wargear && wgState[uid]) {
    u.wargear.forEach(function(wg,i){ if(wgState[uid][i]&&wg.adds) weapons.push(wg.adds); });
  }
  var types = [];
  weapons.forEach(function(w){ if(types.indexOf(w.type)<0) types.push(w.type); });
  var wHtml = '';
  types.forEach(function(type) {
    wHtml += '<div class="wt-hdr"><div class="wt-type">' + type + ' WEAPONS</div><div class="wt-col">RNG</div><div class="wt-col">A</div><div class="wt-col">S</div><div class="wt-col">AP</div><div class="wt-col">D</div></div>';
    weapons.filter(function(w){return w.type===type;}).forEach(function(w) {
      wHtml += '<div class="wt-row"><div class="wt-name-row"><span class="wt-name">' + w.name + '</span><span class="wt-val">' + w.rng + '</span><span class="wt-val">' + w.a + '</span><span class="wt-val">' + w.s + '</span><span class="wt-val ' + apCls(w.ap) + '">' + w.ap + '</span><span class="wt-val dmg">' + w.d + '</span></div><div class="wt-kws">' + (w.kw||[]).map(kwPill).join('') + '</div></div>';
    });
  });
  document.getElementById('card-weapons').innerHTML = wHtml;

  // Abilities
  var aHtml = '<div class="sec-label">ABILITIES</div>';
  (u.abilities||[]).forEach(function(a) {
    aHtml += '<div class="ability-row"><div class="ability-pill">' + a.name + '</div><div class="ability-desc">' + formatDesc(a.desc) + '</div></div>';
  });
  document.getElementById('card-abilities').innerHTML = aHtml;

  document.getElementById('unit-card').classList.add('visible');
  initAllTooltips();
}
