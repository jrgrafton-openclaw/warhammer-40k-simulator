(function() {
  var PAD = 10;
  var _orig = BattleUI.showTip;
  BattleUI.showTip = function(el, content) {
    _orig(el, content);
    var tip = document.getElementById('global-tooltip');
    if (!tip) return;
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var r  = el.getBoundingClientRect();
    var left = r.left + r.width / 2 - tw / 2;
    var top  = r.top - 8 - th;
    left = Math.max(PAD, Math.min(left, window.innerWidth - tw - PAD));
    if (top < PAD) top = r.bottom + 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.transform = 'none';
  };
})();
