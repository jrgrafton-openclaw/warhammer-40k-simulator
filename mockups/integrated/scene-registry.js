/**
 * scene-registry.js — Declarative scene registration + generic phase transition.
 *
 * Each scene registers with a config object describing its UI needs.
 * transitionTo() handles ALL DOM updates from the config — no more
 * per-phase transition functions in app.js.
 *
 * Usage:
 *   registerScene('shoot', {
 *     init: initShoot,
 *     cleanup: cleanupShoot,
 *     config: {
 *       title: 'SHOOTING PHASE',
 *       subtitle: 'Imperium Active · Round 1',
 *       bodyClass: 'phase-shoot',
 *       cta: { text: 'END SHOOTING →', disabled: false },
 *       modeButtons: [],
 *       confirmCancel: false,
 *       dotActive: 'SHOOT',
 *       dotsDone: ['MOVE']
 *     }
 *   });
 */

import { bus } from './game-bus.js';
import { selectUnit as baseSelectUnit } from '../shared/world/svg-renderer.js';
import { callbacks } from '../shared/state/store.js';

var scenes = {};
var _currentPhase = null;

export function registerScene(phase, descriptor) {
  scenes[phase] = descriptor;
}

export function getScene(phase) {
  return scenes[phase] || null;
}

export function getCurrentPhase() {
  return _currentPhase;
}

/**
 * Generic phase transition. Replaces all per-phase transition functions.
 * 1. Cleanup old scene
 * 2. Update DOM from config
 * 3. Init new scene
 */
export function transitionTo(toPhase, opts) {
  opts = opts || {};
  var fromPhase = _currentPhase;
  var fromScene = fromPhase ? scenes[fromPhase] : null;
  var toScene = scenes[toPhase];

  if (!toScene) {
    console.warn('[scene-registry] No scene registered for phase:', toPhase);
    return;
  }

  // ── 1. Cleanup old scene ──
  if (fromScene && fromScene.cleanup) {
    bus.emit('phase:exit', { phase: fromPhase });
    fromScene.cleanup();
  }

  // ── 2. Deselect any unit ──
  baseSelectUnit(null);
  var unitCard = document.getElementById('unit-card');
  if (unitCard) unitCard.classList.remove('visible');

  // ── 3. Clear callbacks (each scene re-registers its own) ──
  callbacks.selectUnit = null;
  callbacks.afterRender = null;

  // ── 4. Update DOM from config ──
  var config = toScene.config || {};

  // Phase header
  var title = document.querySelector('.phase-title');
  var subtitle = document.querySelector('.phase-subtitle');
  if (title && config.title) title.textContent = config.title;
  if (subtitle && config.subtitle) subtitle.textContent = config.subtitle;

  // Body class — remove old, add new
  var bodyClasses = ['phase-deploy', 'phase-move', 'phase-shoot', 'phase-charge', 'phase-fight', 'phase-game-end', 'deployment-complete'];
  bodyClasses.forEach(function(cls) { document.body.classList.remove(cls); });
  if (config.bodyClass) document.body.classList.add(config.bodyClass);

  // Phase dots
  var phItems = document.querySelectorAll('.ph-item');
  phItems.forEach(function(item) {
    item.classList.remove('active', 'done');
    var text = item.textContent.trim();
    if (config.dotActive && text.includes(config.dotActive)) item.classList.add('active');
    if (config.dotsDone) {
      config.dotsDone.forEach(function(d) {
        if (text.includes(d)) item.classList.add('done');
      });
    }
  });

  // Action bar — mode buttons
  var actionBar = document.getElementById('action-bar');
  if (actionBar) {
    // Remove existing mode group
    var modeGroup = actionBar.querySelector('.mode-group');
    if (modeGroup) modeGroup.remove();

    // Remove existing mode label text
    var modeLabel = document.getElementById('move-mode-label');
    if (modeLabel) modeLabel.textContent = '';

    // Remove deploy status label
    var deployLabel = document.getElementById('deploy-status-label');
    if (deployLabel) deployLabel.style.display = 'none';

    // Handle mode buttons (move/advance, confirm/cancel, etc.)
    if (config.modeButtons && config.modeButtons.length > 0) {
      var seps = actionBar.querySelectorAll('.ab-sep');
      if (seps[0]) {
        var newGroup = document.createElement('div');
        newGroup.className = 'mode-group';
        newGroup.innerHTML = config.modeButtons.map(function(b) {
          return '<button class="mode-btn" id="' + b.id + '"' +
                 (b.shortcut ? ' data-shortcut="' + b.shortcut + '"' : '') +
                 (b.disabled ? ' disabled' : '') +
                 '>' + b.text + '</button>';
        }).join('');
        seps[0].after(newGroup);

        if (!modeLabel) {
          modeLabel = document.createElement('span');
          modeLabel.id = 'move-mode-label';
          actionBar.insertBefore(modeLabel, newGroup.nextSibling);
        }
        modeLabel.textContent = config.modeLabel || '— NO UNIT —';
      }
    } else if (modeLabel) {
      modeLabel.textContent = config.modeLabel || '';
    }

    // Confirm/Cancel buttons — find by any known ID
    var confirmIds = ['btn-confirm-move', 'btn-confirm-unit', 'btn-confirm-charge', 'btn-confirm-fight'];
    var cancelIds = ['btn-cancel-move', 'btn-cancel-unit', 'btn-cancel-charge', 'btn-cancel-fight'];
    var btnConfirm = null, btnCancel = null;
    confirmIds.forEach(function(id) { if (!btnConfirm) btnConfirm = document.getElementById(id); });
    cancelIds.forEach(function(id) { if (!btnCancel) btnCancel = document.getElementById(id); });

    if (config.confirmCancel) {
      // Set IDs to what the current phase expects
      var phaseConfirmId = config.confirmId || ('btn-confirm-' + toPhase);
      var phaseCancelId = config.cancelId || ('btn-cancel-' + toPhase);
      if (btnConfirm) { btnConfirm.id = phaseConfirmId; btnConfirm.style.display = ''; btnConfirm.disabled = true; btnConfirm.textContent = '✓ CONFIRM'; }
      if (btnCancel) { btnCancel.id = phaseCancelId; btnCancel.style.display = ''; btnCancel.disabled = true; }
    } else {
      if (btnConfirm) btnConfirm.style.display = 'none';
      if (btnCancel) btnCancel.style.display = 'none';
    }

    // CTA button — find by any known ID and rename for the current phase
    var ctaIds = ['btn-end', 'btn-end-shoot', 'btn-end-charge', 'btn-end-fight'];
    var btnEnd = null;
    ctaIds.forEach(function(id) { if (!btnEnd) btnEnd = document.getElementById(id); });
    if (btnEnd && config.cta) {
      btnEnd.id = config.cta.id || 'btn-end';
      btnEnd.textContent = config.cta.text || 'END PHASE →';
      btnEnd.disabled = !!config.cta.disabled;
      btnEnd.style.background = '';
      btnEnd.style.borderColor = '';
      btnEnd.style.color = '';
    }
  }

  // Roster pills — clear previous phase's state pills
  document.querySelectorAll('.roster-state-pill').forEach(function(pill) {
    pill.classList.remove('deploy-state', 'deployed', 'in-reserves', 'move-state', 'moved', 'advanced');
    pill.textContent = '';
  });

  // Animate phase header pill
  var pill = document.querySelector('.phase-pill');
  if (pill) {
    pill.classList.add('phase-transition');
    setTimeout(function() { pill.classList.remove('phase-transition'); }, 600);
  }

  // Camera: center board (skip for deploy which has custom camera)
  if (toPhase !== 'deploy' && !opts.skipCamera) {
    var inner = document.getElementById('battlefield-inner');
    if (inner) {
      inner.style.transition = 'transform 0.6s ease';
      // Import dynamically to avoid circular dependency
      import('../shared/world/svg-renderer.js').then(function(mod) {
        mod.setCamera(0, 0, 0.5);
        setTimeout(function() { inner.style.transition = ''; }, 700);
      });
    }
  }

  // ── 5. Re-wire roster clicks ──
  document.querySelectorAll('.rail-unit').forEach(function(r) {
    // Clone to remove old listeners
    var clone = r.cloneNode(true);
    r.parentNode.replaceChild(clone, r);
    clone.addEventListener('click', function() {
      var fn = callbacks.selectUnit || baseSelectUnit;
      fn(clone.dataset.unit);
    });
  });

  // ── 6. Init new scene ──
  _currentPhase = toPhase;
  if (toScene.init) toScene.init();

  // ── 7. Wire CTA to next phase ──
  // Re-find the CTA button by its (possibly renamed) ID
  var ctaId = (config.cta && config.cta.id) || 'btn-end';
  var btnEndWire = document.getElementById(ctaId);
  if (btnEndWire && config.nextPhase) {
    btnEndWire.addEventListener('click', function onEndPhase() {
      btnEndWire.removeEventListener('click', onEndPhase);
      transitionTo(config.nextPhase);
    }, { once: true });
  }

  // ── 8. Emit phase:enter ──
  bus.emit('phase:enter', { phase: toPhase, from: fromPhase });

  // ── 9. Cleanup validation (debug mode) ──
  if (fromPhase && document.body.classList.contains('debug-validate-cleanup')) {
    _validateCleanup(fromPhase);
  }
}

function _validateCleanup(fromPhase) {
  var issues = [];
  var targetLines = document.getElementById('layer-target-lines');
  if (targetLines && targetLines.innerHTML.trim()) issues.push('layer-target-lines not empty');
  var rangeRings = document.getElementById('layer-range-rings');
  if (rangeRings && rangeRings.innerHTML.trim()) issues.push('layer-range-rings not empty');
  var moveGhosts = document.getElementById('layer-move-ghosts');
  if (moveGhosts && moveGhosts.innerHTML.trim()) issues.push('layer-move-ghosts not empty');
  var moveRulers = document.getElementById('layer-move-rulers');
  if (moveRulers && moveRulers.innerHTML.trim()) issues.push('layer-move-rulers not empty');
  var wallCollisions = document.querySelectorAll('#layer-models .model-base.wall-collision');
  if (wallCollisions.length) issues.push(wallCollisions.length + ' wall-collision classes still on models');

  if (issues.length) {
    console.warn('[cleanup-validation] Phase "' + fromPhase + '" left dirty state:', issues);
    var banner = document.getElementById('wall-collision-banner');
    if (banner) {
      banner.style.display = 'block';
      banner.style.background = 'rgba(200,0,200,0.9)';
      banner.textContent = '⚠ CLEANUP LEAK (' + fromPhase + '): ' + issues.join(', ');
      setTimeout(function() { banner.style.display = 'none'; banner.style.background = ''; }, 5000);
    }
  }
}
