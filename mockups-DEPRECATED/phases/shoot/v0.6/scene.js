/**
 * scene.js — Army data + initialisation wiring for the shooting phase prototype.
 * This is the only file that changes between scenarios. Everything else is reusable.
 */
(function() {
  'use strict';

  const { R32, R40, simState, renderTerrain, buildCard, initAllTooltips,
          initBoard, initBattleControls, initModelInteraction, renderModels,
          buildTerrainAABBs, mapData } = BattleUI;

  // ── Army positions ─────────────────────────────────────
  simState.units = [
    { id:'assault-intercessors', rosterIndex:0, faction:'imp',
      models:[{id:'ai1',x:165,y:233,r:R32},{id:'ai2',x:182,y:228,r:R32},{id:'ai3',x:199,y:233,r:R32},
              {id:'ai4',x:173,y:249,r:R32},{id:'ai5',x:190,y:249,r:R32}], broken:false },
    { id:'primaris-lieutenant', rosterIndex:1, faction:'imp',
      models:[{id:'pl1',x:125,y:312,r:R40}], broken:false },
    { id:'intercessor-squad-a', rosterIndex:2, faction:'imp',
      models:[{id:'isa1',x:222,y:200,r:R32},{id:'isa2',x:239,y:195,r:R32},{id:'isa3',x:256,y:200,r:R32},
              {id:'isa4',x:230,y:216,r:R32},{id:'isa5',x:248,y:216,r:R32}], broken:false },
    { id:'hellblasters', rosterIndex:3, faction:'imp',
      models:[{id:'hb1',x:80,y:200,r:R32},{id:'hb2',x:97,y:195,r:R32},{id:'hb3',x:114,y:200,r:R32},
              {id:'hb4',x:88,y:216,r:R32},{id:'hb5',x:105,y:216,r:R32}], broken:false },
    { id:'redemptor-dreadnought', rosterIndex:4, faction:'imp',
      models:[{id:'rd1',x:150,y:278,r:22,shape:'rect',w:43,h:25}], broken:false },
    // v0.6 LoS + wound-state fixture layout:
    // - mekboy: mid-board, often partially screened by terrain
    // - boss nob: clear single-model target
    // - nobz mob: multi-model / multi-wound target for persistent W-state + model removal QA
    { id:'boss-nob', rosterIndex:6, faction:'ork',
      models:[{id:'bn1',x:560,y:118,r:R40}], broken:false },
    { id:'nobz-mob', rosterIndex:7, faction:'ork',
      models:[{id:'nm1',x:430,y:128,r:R40},{id:'nm2',x:462,y:136,r:R40},{id:'nm3',x:446,y:166,r:R40}], broken:false },
    { id:'mekboy', rosterIndex:8, faction:'ork',
      models:[{id:'mb1',x:338,y:258,r:R32}], broken:false }
  ];

  // ── Initialise shared modules ────────────────────────────
  renderTerrain();
  buildCard('assault-intercessors');
  initAllTooltips();
  initBoard({ initialScale: 0.5 });
  initBattleControls();
  initModelInteraction();

  // ── Build terrain collision AABBs ────────────────────────
  const svgEl = document.getElementById('bf-svg');
  window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

  // ── Visible error handler ────────────────────────────────
  window.onerror = function(msg, src, line) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
    el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
    document.body.appendChild(el);
  };
})();
