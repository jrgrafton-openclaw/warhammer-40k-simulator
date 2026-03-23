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
      models:[{id:'mb1',x:338,y:258,r:R32}], broken:false },
    { id:'gretchin', rosterIndex:9, faction:'ork',
      models:[{id:'gr1',x:400,y:220,r:R32},{id:'gr2',x:418,y:215,r:R32},{id:'gr3',x:436,y:220,r:R32}], broken:false }
  ];

  // ── Initialise shared modules ────────────────────────────
  renderTerrain();
  initAllTooltips();
  initBoard({ initialScale: 0.5 });
  initBattleControls();
  initModelInteraction();
  // Start with no unit selected — card hidden
  const unitCard = document.getElementById('unit-card');
  if (unitCard) unitCard.classList.remove('visible');

  // ── Build terrain collision AABBs ────────────────────────
  const svgEl = document.getElementById('bf-svg');
  window._terrainAABBs = buildTerrainAABBs(mapData, svgEl);

  // ── Build tall ruin footprint blockers for LoS ──────────
  // Uses paths[0] (full floor footprint) for each ruins piece.
  // Scatter terrain does NOT block LoS.
  (function buildLosBlockers() {
    const NS = 'http://www.w3.org/2000/svg';
    const blockers = [];

    function parsePathPoints(d) {
      const pts = [];
      const re = /[ML]\s*([-\d.]+)[\s,]+([-\d.]+)/gi;
      let m;
      while ((m = re.exec(d)) !== null) pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
      return pts;
    }

    mapData.terrain.forEach(function(piece) {
      if (piece.type !== 'ruins' || !piece.paths || !piece.paths[0]) return;

      const floorPath = piece.paths[0];
      const pts = parsePathPoints(floorPath.d);
      if (pts.length < 3) return;

      // Remove closing duplicate point if present
      const last = pts[pts.length - 1];
      if (Math.abs(pts[0].x - last.x) < 0.1 && Math.abs(pts[0].y - last.y) < 0.1) {
        pts.pop();
      }

      // Compute transform matrix using SVG element
      const ox = piece.origin[0], oy = piece.origin[1];
      const tfStr = 'translate(' + ox + ',' + oy + ') ' + piece.transform + ' translate(' + (-ox) + ',' + (-oy) + ')';
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', tfStr);
      svgEl.appendChild(g);
      const consolidated = g.transform.baseVal.consolidate();
      svgEl.removeChild(g);
      if (!consolidated) return;

      const mat = consolidated.matrix;
      const det = mat.a * mat.d - mat.b * mat.c;
      if (Math.abs(det) < 0.001) return;

      // Inverse matrix (SVG → local)
      const inv = {
        a:  mat.d / det, b: -mat.b / det,
        c: -mat.c / det, d:  mat.a / det,
        e: (mat.c * mat.f - mat.d * mat.e) / det,
        f: (mat.b * mat.e - mat.a * mat.f) / det
      };

      blockers.push({
        kind: 'tall-ruin',
        terrainId: piece.id,
        polygon: pts,  // local-space polygon points
        // Inverse matrix (SVG → local)
        iA: inv.a, iB: inv.b, iC: inv.c, iD: inv.d, iE: inv.e, iF: inv.f,
        // Forward matrix (local → SVG)
        fA: mat.a, fB: mat.b, fC: mat.c, fD: mat.d, fE: mat.e, fF: mat.f
      });
    });

    window._losBlockers = blockers;
  })();

  // ── Visible error handler ────────────────────────────────
  window.onerror = function(msg, src, line) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#cc2222;color:#fff;padding:8px 12px;font:700 11px/1.5 monospace;z-index:9999;border-radius:3px;';
    el.textContent = '⚠ JS ERROR: ' + msg + ' (line ' + line + ')';
    document.body.appendChild(el);
  };
})();
