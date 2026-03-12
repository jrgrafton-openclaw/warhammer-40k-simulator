/* WH40K Battle UI — Board, Pan/Zoom & Selection module v1 */
(function(B){

  // ── Scale constants ────────────────────────────────────
  B.PX_PER_INCH = 12;
  B.mmR = function(mm) { return Math.round(mm / 25.4 * B.PX_PER_INCH / 2); };
  B.R32 = B.mmR(32); // 8px — standard infantry
  B.R40 = B.mmR(40); // 9px — characters

  // ── State ──────────────────────────────────────────────
  B.activeRangeTypes = new Set();
  B.currentUnit = null;

  // ── Range Helpers ─────────────────────────────────────
  B.getRangeInches = function(unit) {
    return {
      move:    unit.M,
      advance: unit.M + 3.5,
      charge:  unit.M + 7,
    };
  };

  B.clearRangeCircles = function() {
    ['move','advance','charge'].forEach(function(type) {
      var c = document.getElementById('range-' + type);
      var l = document.getElementById('range-' + type + '-label');
      if (c) c.style.display = 'none';
      if (l) l.style.display = 'none';
    });
  };

  B.updateRangeCirclesFromUnit = function(uid) {
    if (!uid) return;
    var unit = B.simState && B.simState.units && B.simState.units.find(function(u){ return u.id===uid; });
    if (!unit || unit.models.length === 0) return;
    var u = B.UNITS && B.UNITS[uid]; if (!u) return;

    // Compute centroid in SVG user coords
    var cx = unit.models.reduce(function(s,m){ return s+m.x; }, 0) / unit.models.length;
    var cy = unit.models.reduce(function(s,m){ return s+m.y; }, 0) / unit.models.length;

    // Map SVG coords → screen pixels using getScreenCTM
    var svg = document.getElementById('bf-svg');
    if (!svg) return;
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var screenX = ctm.e + cx * ctm.a;
    var screenY = ctm.f + cy * ctm.d;

    var bf = document.getElementById('battlefield');
    var bfRect = bf.getBoundingClientRect();
    var tcx = screenX - bfRect.left;
    var tcy = screenY - bfRect.top;

    var inner = document.getElementById('battlefield-inner');
    var matrix = new DOMMatrixReadOnly(window.getComputedStyle(inner).transform);
    var sc = matrix.a || 1;
    var ppi = (bfRect.width / 60) * sc;

    var radii = B.getRangeInches(u);
    ['move','advance','charge'].forEach(function(type) {
      var circle = document.getElementById('range-' + type);
      var label  = document.getElementById('range-' + type + '-label');
      var R_px   = radii[type] * ppi;
      var diam   = R_px * 2;
      if (circle) {
        circle.style.left   = (tcx - R_px) + 'px';
        circle.style.top    = (tcy - R_px) + 'px';
        circle.style.width  = diam + 'px';
        circle.style.height = diam + 'px';
      }
      if (label) { label.style.left = tcx + 'px'; label.style.top = (tcy - R_px - 18) + 'px'; }
      var isActive = B.activeRangeTypes.has(type);
      if (circle) { circle.style.display = isActive ? 'block' : 'none'; circle.style.opacity = isActive ? '1' : '0'; }
      if (label) { label.style.display = isActive ? 'block' : 'none'; label.style.opacity = isActive ? '1' : '0'; }
    });
  };

  // ── Pan & Zoom ────────────────────────────────────────
  B.scale = 0.5;
  B.tx = 0;
  B.ty = 0;

  B.applyTx = function() {
    var inner = document.getElementById('battlefield-inner');
    if (inner) inner.style.transform = 'translate(' + B.tx + 'px,' + B.ty + 'px) scale(' + B.scale + ')';
  };

  B.initBoard = function(opts) {
    opts = opts || {};
    var initialScale = opts.initialScale !== undefined ? opts.initialScale : 0.5;
    B.scale = initialScale;
    B.tx = 0;
    B.ty = 0;

    var inner = document.getElementById('battlefield-inner');
    var bf    = document.getElementById('battlefield');
    if (!inner || !bf) return;

    B.applyTx();

    var isDragging = false, startX, startY;
    var zoomEaseTimer = null;
    var zoomSettleTimer = null;
    var RC_IDS = ['range-move','range-advance','range-charge','range-move-label','range-advance-label','range-charge-label'];

    function hideRangeCircles() {
      RC_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.opacity = '0';
      });
    }
    function showRangeCirclesNow() {
      if (!B.currentUnit || B.activeRangeTypes.size === 0) return;
      B.updateRangeCirclesFromUnit(B.currentUnit);
    }

    bf.addEventListener('wheel', function(e) {
      e.preventDefault();
      if (B.activeRangeTypes.size > 0) hideRangeCircles();
      inner.classList.add('zoom-easing');
      clearTimeout(zoomEaseTimer);
      zoomEaseTimer = setTimeout(function(){ inner.classList.remove('zoom-easing'); }, 220);
      B.scale = Math.min(3, Math.max(.35, B.scale * (e.deltaY>0 ? .9 : 1.1)));
      B.applyTx();
      clearTimeout(zoomSettleTimer);
      zoomSettleTimer = setTimeout(showRangeCirclesNow, 220);
    }, {passive:false});

    bf.addEventListener('mousedown', function(e) {
      if (e.target.closest('.token,.obj-hex-wrap,#unit-card,#vp-bar,#phase-header,#action-bar,#bf-svg')) return;
      isDragging = true;
      startX = e.clientX - B.tx;
      startY = e.clientY - B.ty;
      inner.classList.add('dragging');
      inner.classList.remove('zoom-easing');
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      B.tx = e.clientX - startX;
      B.ty = e.clientY - startY;
      B.applyTx();
      if (B.currentUnit && B.activeRangeTypes.size > 0) B.updateRangeCirclesFromUnit(B.currentUnit);
    });

    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      inner.classList.remove('dragging');
      if (B.currentUnit && B.activeRangeTypes.size > 0) B.updateRangeCirclesFromUnit(B.currentUnit);
    });

    var resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        B.scale=initialScale; B.tx=0; B.ty=0; B.applyTx();
        if (B.currentUnit && B.activeRangeTypes.size > 0) {
          setTimeout(function(){ B.updateRangeCirclesFromUnit(B.currentUnit); }, 50);
        }
      });
    }
  };

  // ── selectUnit ────────────────────────────────────────
  B.selectUnit = function(uid) {
    B.currentUnit = uid;
    window.activeUnitId = uid;
    document.querySelectorAll('.rail-unit').forEach(function(r) {
      r.classList.toggle('active', r.dataset.unit===uid);
    });
    if (uid) {
      if (B.buildCard) B.buildCard(uid);
      // render models if the layer exists
      if (B.renderModels) {
        B.renderModels();
      }
      if (B.activeRangeTypes.size > 0) {
        setTimeout(function(){ B.updateRangeCirclesFromUnit(uid); }, 0);
      }
    } else {
      B.clearRangeCircles();
      if (B.renderModels) B.renderModels();
    }
  };

  // ── initBattleControls ────────────────────────────────
  B.initBattleControls = function() {

    // Rail unit clicks
    document.querySelectorAll('.rail-unit').forEach(function(r) {
      r.addEventListener('click', function() { B.selectUnit(r.dataset.unit); });
    });

    // Card close
    var cardClose = document.getElementById('card-close');
    if (cardClose) {
      cardClose.addEventListener('click', function() {
        var card = document.getElementById('unit-card');
        if (card) card.classList.remove('visible');
        document.querySelectorAll('.rail-unit').forEach(function(e){ e.classList.remove('active'); });
        B.activeRangeTypes.clear();
        B.clearRangeCircles();
        ['move','advance','charge'].forEach(function(t) {
          var btn = document.getElementById('rt-'+t);
          if (btn) btn.classList.remove('active');
        });
        B.currentUnit = null;
        window.activeUnitId = null;
        if (B.renderModels) B.renderModels();
      });
    }

    // Range toggles
    ['move','advance','charge'].forEach(function(type) {
      var btn = document.getElementById('rt-' + type);
      if (!btn) return;
      btn.addEventListener('click', function() {
        if (B.activeRangeTypes.has(type)) {
          B.activeRangeTypes.delete(type);
          btn.classList.remove('active');
        } else {
          B.activeRangeTypes.add(type);
          btn.classList.add('active');
        }
        if (B.currentUnit) B.updateRangeCirclesFromUnit(B.currentUnit);
      });
    });

    // Roster collapse
    var rosterBtn = document.getElementById('roster-btn');
    if (rosterBtn) {
      rosterBtn.addEventListener('click', function() {
        var app = document.getElementById('app');
        if (app) app.classList.toggle('collapsed');
      });
    }

    // Action buttons
    var btnMove    = document.getElementById('btn-move');
    var btnAdvance = document.getElementById('btn-advance');
    if (btnMove) {
      btnMove.addEventListener('click', function() {
        btnMove.classList.add('active');
        if (btnAdvance) btnAdvance.classList.remove('active');
      });
    }
    if (btnAdvance) {
      btnAdvance.addEventListener('click', function() {
        btnAdvance.classList.add('active');
        if (btnMove) btnMove.classList.remove('active');
      });
    }

    // Stratagem modal
    var modalBg   = document.getElementById('modal-bg');
    var btnStrat  = document.getElementById('btn-strat');
    var modalClose = document.getElementById('modal-close');
    if (btnStrat && modalBg)   btnStrat.addEventListener('click', function(){ modalBg.classList.add('open'); });
    if (modalClose && modalBg) modalClose.addEventListener('click', function(){ modalBg.classList.remove('open'); });
    if (modalBg) modalBg.addEventListener('click', function(e){ if(e.target===modalBg) modalBg.classList.remove('open'); });

    // Keyboard shortcuts
    var SHORTCUTS = { 'm':'btn-move', 'a':'btn-advance', 's':'btn-strat', 'e':'btn-end', 'r':'reset-btn' };
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var btnId = SHORTCUTS[e.key.toLowerCase()];
      if (btnId) { var b = document.getElementById(btnId); if(b) b.click(); }
    });

    // Expose selectUnit globally
    window.selectUnit = B.selectUnit;

    // Terrain tip helper
    function buildTerrainTip(key) {
      var t = B.TERRAIN_RULES && B.TERRAIN_RULES[key];
      if (!t) return '';
      var rules = t.rules.map(function(r){ return '<li>' + r + '</li>'; }).join('');
      return '<div class="tip-title">' + (t.title||key) + '</div><ul>' + rules + '</ul>';
    }
    document.querySelectorAll('[data-tip-key]').forEach(function(el) {
      el.addEventListener('mouseenter', function(){ if(B.showTip) B.showTip(el, buildTerrainTip(el.dataset.tipKey)); });
      el.addEventListener('mouseleave', function(){ if(B.hideTip) B.hideTip(); });
    });

    // Faction toggles (global helpers referenced by inline HTML)
    window.toggleFaction = function(hdr) {
      var body = hdr.nextElementSibling;
      var chev = hdr.querySelector('.faction-chevron');
      if (!chev) return;
      var closed = body.classList.toggle('closed');
      chev.style.transform = closed ? 'rotate(-90deg)' : '';
    };
    window.toggleAA = function(hdr) {
      var body = hdr.nextElementSibling;
      var chev = hdr.querySelector('.aa-chev');
      var open = body.classList.toggle('open');
      if (chev) chev.style.transform = open ? 'rotate(90deg)' : '';
    };
  };

})(window.BattleUI = window.BattleUI || {});
