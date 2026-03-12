/* WH40K Mockups — Shared wound indicators (split-ring) */
(function(B){
  var NS = 'http://www.w3.org/2000/svg';

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function clearIndicator(groupEl) {
    if (!groupEl) return;
    var existing = groupEl.querySelector('.wound-indicator');
    if (existing) existing.remove();
  }

  function getModelRadius(model) {
    if (!model) return 12;
    if (typeof model.r === 'number') return model.r;
    var w = Number(model.w || 24);
    var h = Number(model.h || 24);
    return Math.max(8, Math.min(w, h) / 2);
  }

  function renderSplitRing(opts) {
    var groupEl = opts && opts.groupEl;
    var model = opts && opts.model;
    var woundsPerModel = Number(opts && opts.woundsPerModel || 1);
    var woundsTaken = Number(opts && opts.woundsTaken || 0);
    var showCenterLabel = !!(opts && opts.showCenterLabel);
    var factionColor = (opts && opts.factionColor) || '#00d4ff';

    clearIndicator(groupEl);
    if (!groupEl || !model || woundsPerModel <= 1 || woundsTaken <= 0) return;

    var taken = clamp(woundsTaken, 0, woundsPerModel - 1);
    var remaining = woundsPerModel - taken;
    var ratioLost = taken / woundsPerModel;

    var cx = Number(model.x || 0);
    var cy = Number(model.y || 0);
    var radius = getModelRadius(model) + 3;
    var c = 2 * Math.PI * radius;

    var root = document.createElementNS(NS, 'g');
    root.setAttribute('class', 'wound-indicator wound-indicator--ring');

    var track = document.createElementNS(NS, 'circle');
    track.setAttribute('cx', String(cx));
    track.setAttribute('cy', String(cy));
    track.setAttribute('r', String(radius));
    track.setAttribute('class', 'wound-ring-track');
    root.appendChild(track);

    var remainingArc = document.createElementNS(NS, 'circle');
    remainingArc.setAttribute('cx', String(cx));
    remainingArc.setAttribute('cy', String(cy));
    remainingArc.setAttribute('r', String(radius));
    remainingArc.setAttribute('class', 'wound-ring-remaining');
    remainingArc.setAttribute('stroke', factionColor);
    remainingArc.setAttribute('stroke-dasharray', String(c * (1 - ratioLost)) + ' ' + String(c));
    remainingArc.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
    root.appendChild(remainingArc);

    var lostArc = document.createElementNS(NS, 'circle');
    lostArc.setAttribute('cx', String(cx));
    lostArc.setAttribute('cy', String(cy));
    lostArc.setAttribute('r', String(radius));
    lostArc.setAttribute('class', 'wound-ring-lost');
    lostArc.setAttribute('stroke-dasharray', String(c * ratioLost) + ' ' + String(c));
    lostArc.setAttribute('stroke-dashoffset', String(-c * (1 - ratioLost)));
    lostArc.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
    root.appendChild(lostArc);

    if (showCenterLabel) {
      var badge = document.createElementNS(NS, 'g');
      badge.setAttribute('class', 'wound-center-badge');
      var bg = document.createElementNS(NS, 'circle');
      bg.setAttribute('cx', String(cx));
      bg.setAttribute('cy', String(cy));
      bg.setAttribute('r', '6.8');
      bg.setAttribute('class', 'wound-center-bg');
      badge.appendChild(bg);

      var txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', String(cx));
      txt.setAttribute('y', String(cy));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('dominant-baseline', 'central');
      txt.setAttribute('class', 'wound-center-text');
      txt.textContent = String(remaining) + 'W';
      badge.appendChild(txt);

      root.appendChild(badge);
    }

    groupEl.appendChild(root);
  }

  function updateCardTrack(cardEl, woundsTaken, woundsPerModel) {
    if (!cardEl) return;
    var per = Number(woundsPerModel || 1);
    if (per <= 1) { cardEl.style.display = 'none'; return; }

    var taken = clamp(Number(woundsTaken || 0), 0, per - 1);
    var remaining = per - taken;

    cardEl.style.display = 'flex';
    cardEl.classList.add('visible');
    cardEl.innerHTML = '<span class="wound-label">Wounds Remaining</span><span class="wound-val">' + remaining + '<span class="wound-sep">/</span>' + per + '</span>';
  }

  B.WoundIndicators = {
    clearIndicator: clearIndicator,
    renderSplitRing: renderSplitRing,
    updateCardTrack: updateCardTrack,
  };
})(window.BattleUI = window.BattleUI || {});
