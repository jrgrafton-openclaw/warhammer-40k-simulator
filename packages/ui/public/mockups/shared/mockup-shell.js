(function(){
  'use strict';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function attrs(obj) {
    return Object.entries(obj)
      .filter(function(entry){ return entry[1] !== undefined && entry[1] !== null && entry[1] !== false; })
      .map(function(entry){
        var key = entry[0];
        var value = entry[1];
        if (value === true) return key;
        return key + '="' + esc(value) + '"';
      })
      .join(' ');
  }

  function html(strings) {
    return strings.filter(Boolean).join('');
  }

  function unitRow(unit) {
    var classes = ['rail-unit'];
    if (unit.active) classes.push('active');
    var pill = unit.statePill ? '<span class="roster-state-pill">' + esc(unit.statePill) + '</span>' : '';
    var iconAttrs = attrs({ class: 'ri ' + esc(unit.sideClass), style: unit.iconStyle || undefined });
    return html([
      '<div ' + attrs({ class: classes.join(' '), 'data-unit': unit.id }) + '>',
        '<div ' + iconAttrs + '>' + unit.iconSvg + '</div>',
        '<span class="rn">' + esc(unit.name) + '</span>',
        '<span class="rc">' + esc(unit.count) + '</span>',
        pill,
      '</div>'
    ]);
  }

  function abilityRow(ability, factionClass) {
    var rowClasses = ['aa-row'];
    if (ability.phaseActive) rowClasses.push('phase-active');
    var nameStyle = ability.nameStyle || (factionClass === 'ork' ? 'color:var(--ork);' : '');
    return html([
      '<div ' + attrs({ class: rowClasses.join(' '), 'data-tip': ability.tip || '' }) + '>',
        '<span class="aa-name"' + (nameStyle ? ' style="' + esc(nameStyle) + '"' : '') + '>' + esc(ability.name) + '</span>',
        '<span class="aa-timing">' + esc(ability.timing) + '</span>',
      '</div>'
    ]);
  }

  function factionSection(section) {
    var headerStyle = section.headerStyle ? ' style="' + esc(section.headerStyle) + '"' : '';
    var body = (section.units || []).map(unitRow).join('');
    if (section.abilities && section.abilities.length) {
      body += html([
        '<div class="aa-section">',
          '<div class="aa-header" onclick="toggleAA(this)"' + headerStyle + '>',
            '<span class="aa-label">ARMY ABILITIES</span>',
            '<span class="aa-chev">▸</span>',
          '</div>',
          '<div class="aa-body">',
            section.abilities.map(function(ability){ return abilityRow(ability, section.factionClass); }).join(''),
          '</div>',
        '</div>'
      ]);
    }

    return html([
      '<div class="faction-section">',
        '<div class="faction-header" onclick="toggleFaction(this)">',
          '<div class="faction-band ' + esc(section.factionClass) + '"></div>',
          '<span class="faction-label ' + esc(section.factionClass) + '">' + esc(section.label) + '</span>',
          '<span class="faction-chevron">▾</span>',
        '</div>',
        '<div class="faction-body">' + body + '</div>',
      '</div>'
    ]);
  }

  function roster(config) {
    return html([
      '<aside id="roster">',
        '<div class="roster-header">',
          '<span class="roster-title">ARMY ROSTER</span>',
          '<button class="roster-collapse-btn" id="roster-btn">◄</button>',
        '</div>',
        '<div class="roster-scroll">',
          (config.sections || []).map(factionSection).join(''),
        '</div>',
      '</aside>'
    ]);
  }

  function vpBar(vp) {
    return html([
      '<div id="vp-bar">',
        '<div class="vp-cp">CP <span id="cp-val">' + esc(vp.cp) + '</span></div>',
        '<div class="vp-faction"><span class="vp-name-imp">' + esc(vp.leftName) + '</span><span class="vp-score imp">' + esc(vp.leftScore) + '</span></div>',
        '<span class="vp-vs">VS</span>',
        '<div class="vp-faction"><span class="vp-score ork">' + esc(vp.rightScore) + '</span><span class="vp-name-ork">' + esc(vp.rightName) + '</span></div>',
        '<span class="vp-round">' + esc(vp.roundLabel) + '</span>',
        '<button id="reset-btn" title="Reset view [R]">↺ RESET</button>',
      '</div>'
    ]);
  }

  function phaseHeader(phase) {
    return html([
      '<div id="phase-header">',
        '<div class="phase-pill">',
          '<div class="phase-title">' + esc(phase.title) + '</div>',
          '<div class="phase-subtitle">' + esc(phase.subtitle) + '</div>',
        '</div>',
      '</div>'
    ]);
  }

  function objectiveHex(obj) {
    return '<div class="obj-hex-wrap ' + esc(obj.stateClass) + '" style="left:' + esc(obj.left) + ';top:' + esc(obj.top) + ';"><svg class="obj-svg" viewBox="0 0 84 97" width="84" height="97"><polygon class="obj-bg" points="42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5"/><polygon class="obj-ring" points="42,3 81,25.5 81,71.5 42,94 3,71.5 3,25.5"/><text x="42" y="44" class="obj-n">' + esc(obj.number) + '</text><text x="42" y="62" class="obj-l">OBJ</text></svg></div>';
  }

  function battlefieldScaffold(config) {
    return html([
      '<a class="backlink" href="' + esc(config.backlink.href) + '" title="' + esc(config.backlink.title) + '">' + esc(config.backlink.label) + '</a>',
      vpBar(config.vpBar),
      phaseHeader(config.phaseHeader),
      '<div class="' + esc(config.badge.className) + '">' + esc(config.badge.label) + '</div>',
      '<div id="battlefield-inner">',
        config.terrainSvg,
        (config.objectives || []).map(function(obj){ return '<div class="obj-area-ring" style="left:' + esc(obj.left) + ';top:' + esc(obj.top) + ';"></div>'; }).join(''),
        (config.objectives || []).map(objectiveHex).join(''),
        config.playLayerSvg,
      '</div>',
      config.afterBattlefieldInner || ''
    ]);
  }

  function unitCard(card) {
    var titleInner = card.stateBadge
      ? '<div class="card-title-row"><div class="card-name" id="card-name">' + esc(card.name) + '</div><div class="unit-state-badge" id="unit-state-badge">' + esc(card.stateBadge) + '</div></div>'
      : '<div class="card-name" id="card-name">' + esc(card.name) + '</div>';

    return html([
      '<div id="unit-card" class="visible">',
        '<div class="card-hdr">',
          '<div style="min-width:0;flex:1;">',
            titleInner,
            '<div class="card-faction" id="card-faction">' + esc(card.faction) + '</div>',
          '</div>',
          '<button class="card-close" id="card-close">×</button>',
        '</div>',
        '<div class="card-stats" id="card-stats"></div>',
        '<div class="card-ranges" id="card-ranges">',
          (card.rangeButtons || []).map(function(btn){
            return '<button class="range-toggle ' + esc(btn.className) + '" id="' + esc(btn.id) + '" data-range-type="' + esc(btn.rangeType) + '">' + btn.labelHtml + '</button>';
          }).join(''),
        '</div>',
        '<div id="card-wargear"></div>',
        '<div class="card-weapons" id="card-weapons"></div>',
        '<div class="card-abilities" id="card-abilities"></div>',
      '</div>'
    ]);
  }

  function phaseTrack(items) {
    return items.map(function(item, ix){
      var classes = ['ph-item'];
      if (item.state) classes.push(item.state);
      return html([
        '<div class="' + classes.join(' ') + '"><span class="ph-dot"></span>' + esc(item.label) + '</div>',
        ix < items.length - 1 ? '<span class="ph-sep">·</span>' : ''
      ]);
    }).join('');
  }

  function actionBar(actionBar) {
    return '<div id="action-bar">' + actionBar.contentHtml + '</div>';
  }

  function stratagemModal(stratagems) {
    return html([
      '<div id="modal-bg">',
        '<div id="strat-modal">',
          '<div class="modal-hdr">',
            '<span class="modal-title">SELECT STRATAGEM</span>',
            '<button class="modal-x" id="modal-close">×</button>',
          '</div>',
          '<div class="strat-list">',
            (stratagems || []).map(function(item){
              return html([
                '<div class="strat-item">',
                  '<div class="strat-top">',
                    '<span class="strat-name">' + esc(item.name) + '</span>',
                    '<span class="strat-cp">' + esc(item.cp) + '</span>',
                    '<span class="strat-timing">' + esc(item.timing) + '</span>',
                  '</div>',
                  '<p class="strat-desc">' + esc(item.description) + '</p>',
                '</div>'
              ]);
            }).join(''),
          '</div>',
        '</div>',
      '</div>'
    ]);
  }

  function mount(config) {
    var root = document.getElementById(config.rootId || 'mockup-root');
    if (!root) throw new Error('MockupShell root not found');

    root.innerHTML = html([
      '<div id="app">',
        roster(config.roster),
        '<main id="battlefield">',
          battlefieldScaffold(config.battlefield),
          config.phaseSpecificTopHtml || '',
          unitCard(config.unitCard),
          actionBar(config.actionBar),
        '</main>',
      '</div>',
      stratagemModal(config.stratagems),
      '<div id="global-tooltip"></div>',
      config.phaseSpecificBottomHtml || ''
    ]);
  }

  window.MockupShell = {
    mount: mount,
    esc: esc,
    phaseTrack: phaseTrack
  };
})();
