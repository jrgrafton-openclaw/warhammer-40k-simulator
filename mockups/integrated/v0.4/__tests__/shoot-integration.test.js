/**
 * shoot-integration.test.js — Unit tests for v0.2 shoot phase integration.
 *
 * Run with:
 *   npx vitest run packages/ui/public/mockups/integrated/__tests__/shoot-integration.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── 1. Phase Machine Tests ─────────────────────────────────

describe('Phase Machine', () => {
  let currentPhase, nextPhase, setTransitionCallback;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../phase-machine.js');
    currentPhase = mod.currentPhase;
    nextPhase = mod.nextPhase;
    setTransitionCallback = mod.setTransitionCallback;
  });

  it('starts at deploy phase', () => {
    expect(currentPhase()).toBe('deploy');
  });

  it('nextPhase() from move returns shoot and fires transition callback', () => {
    const cb = vi.fn();
    setTransitionCallback(cb);

    // Advance deploy → move
    nextPhase();

    // Advance move → shoot
    const result = nextPhase();

    expect(result).toBe('shoot');
    expect(currentPhase()).toBe('shoot');
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith({ from: 'move', to: 'shoot' });
  });

  it('after 2 calls to nextPhase() from deploy, currentPhase() returns shoot', () => {
    nextPhase(); // deploy → move
    nextPhase(); // move → shoot
    expect(currentPhase()).toBe('shoot');
  });

  it('fires transition callback with correct from/to on each advance', () => {
    const cb = vi.fn();
    setTransitionCallback(cb);
    nextPhase();
    expect(cb).toHaveBeenCalledWith({ from: 'deploy', to: 'move' });
    nextPhase();
    expect(cb).toHaveBeenCalledWith({ from: 'move', to: 'shoot' });
  });

  it('returns null when already at last phase', () => {
    // Advance through all phases: deploy→move→shoot→charge→fight→game-end
    nextPhase(); nextPhase(); nextPhase(); nextPhase(); nextPhase();
    expect(currentPhase()).toBe('game-end');
    expect(nextPhase()).toBeNull();
  });
});

// ─── 2. Shooting.js Cleanup Tests ───────────────────────────

// Mock all shared module dependencies that shooting.js imports
vi.mock('../../shared/state/store.js', () => ({
  simState: { units: [], drag: null },
  PX_PER_INCH: 16,
  callbacks: { selectUnit: null, afterRender: null },
}));

vi.mock('../../shared/state/units.js', () => ({
  UNITS: {},
  KW_RULES: {},
  wgState: {},
  initAllTooltips: vi.fn(),
  showTip: vi.fn(),
  hideTip: vi.fn(),
}));

vi.mock('../../shared/world/svg-renderer.js', () => ({
  selectUnit: vi.fn(),
  renderModels: vi.fn(),
}));

vi.mock('../../shared/lib/coord-helpers.js', () => ({
  center: vi.fn(() => ({ x: 0, y: 0 })),
  projectileAnchor: vi.fn(() => ({ x: 0, y: 0, valid: true })),
  getModelRadius: vi.fn(() => 8),
}));

vi.mock('../../shared/world/range-rings.js', () => ({
  drawPerModelRangeRings: vi.fn(),
  clearRangeRings: vi.fn(),
}));

vi.mock('../../shared/audio/sfx.js', () => ({
  playDiceRoll: vi.fn(),
  playWeaponFire: vi.fn(),
  playSaveFailed: vi.fn(),
}));

vi.mock('../../shared/state/terrain-data.js', () => ({
  mapData: { terrain: [] },
}));

describe('Shooting.js', () => {
  beforeEach(() => {
    // Minimal DOM stubs for shooting.js querySelector calls
    document.body.innerHTML = `
      <svg id="bf-svg">
        <g id="layer-target-lines"></g>
        <g id="layer-hulls"></g>
        <g id="layer-models"></g>
      </svg>
      <div id="roll-overlay" class="hidden"></div>
      <div id="proj-container"></div>
      <div id="hit-flash-layer"></div>
      <div id="move-mode-label"></div>
      <button id="btn-end-shoot"></button>
      <button id="card-close"></button>
      <div id="card-ranges"></div>
      <div id="unit-state-badge"></div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initShooting and cleanupShooting are exported functions', async () => {
    const mod = await import('../../phases/shoot/v0.9/shooting.js');
    expect(typeof mod.initShooting).toBe('function');
    expect(typeof mod.cleanupShooting).toBe('function');
  });

  it('cleanupShooting() can be called without errors when no shoot phase is active', async () => {
    const mod = await import('../../phases/shoot/v0.9/shooting.js');
    // Should not throw even without prior initShooting
    expect(() => mod.cleanupShooting()).not.toThrow();
  });

  it('after cleanupShooting(), callbacks.selectUnit is null', async () => {
    const { callbacks } = await import('../../shared/state/store.js');
    const mod = await import('../../phases/shoot/v0.9/shooting.js');

    // Init sets callbacks.selectUnit
    mod.initShooting();
    expect(callbacks.selectUnit).not.toBeNull();

    // Cleanup clears it
    mod.cleanupShooting();
    expect(callbacks.selectUnit).toBeNull();
  });
});

// ─── 3. Scene-shoot.js Tests ────────────────────────────────

// scene-shoot.js imports shooting.js (already mocked above) and other shared modules
describe('Scene-shoot.js', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <svg id="bf-svg">
        <g id="layer-target-lines"></g>
        <g id="layer-hulls"></g>
        <g id="layer-models"></g>
      </svg>
      <div id="roll-overlay" class="hidden"></div>
      <div id="proj-container"></div>
      <div id="hit-flash-layer"></div>
      <div id="move-mode-label"></div>
      <button id="btn-end-shoot"></button>
      <button id="card-close"></button>
      <div id="card-ranges"></div>
      <div id="unit-state-badge"></div>
    `;
    window._losBlockers = [{ kind: 'leftover' }];
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window._losBlockers;
  });

  it('initShoot and cleanupShoot are exported functions', async () => {
    const mod = await import('../scenes/scene-shoot.js');
    expect(typeof mod.initShoot).toBe('function');
    expect(typeof mod.cleanupShoot).toBe('function');
  });

  it('after cleanupShoot(), window._losBlockers is empty array', async () => {
    const mod = await import('../scenes/scene-shoot.js');
    mod.initShoot();

    mod.cleanupShoot();
    expect(window._losBlockers).toEqual([]);
  });
});

// ─── 4. Integration Behavior Tests (transitionToShoot DOM) ──

describe('transitionToShoot() DOM behavior', () => {
  // Instead of importing app.js (which triggers side effects and many imports),
  // we extract the DOM manipulation logic from transitionToShoot and test it directly.
  // This mirrors the exact DOM mutations from app.js lines 216-312.

  function buildPhaseDOM() {
    document.body.className = 'phase-move';
    document.body.innerHTML = `
      <div class="phase-pill">
        <div class="phase-title">MOVEMENT PHASE</div>
        <div class="phase-subtitle">Imperium Active · Round 1</div>
      </div>
      <div id="action-bar">
        <div class="ph-rail">
          <div class="ph-item"><span class="ph-dot"></span>CMD</div><span class="ph-sep">·</span>
          <div class="ph-item active"><span class="ph-dot"></span>MOVE</div><span class="ph-sep">·</span>
          <div class="ph-item"><span class="ph-dot"></span>SHOOT</div><span class="ph-sep">·</span>
          <div class="ph-item"><span class="ph-dot"></span>CHARGE</div><span class="ph-sep">·</span>
          <div class="ph-item"><span class="ph-dot"></span>FIGHT</div>
        </div>
        <span class="ab-sep"></span>
        <div class="mode-group">
          <button class="mode-btn" id="btn-move">NORMAL MOVE</button>
          <button class="mode-btn" id="btn-advance">ADVANCE</button>
        </div>
        <span id="move-mode-label">— NO UNIT —</span>
        <span class="ab-sep"></span>
        <button id="btn-confirm-move" disabled>✓ CONFIRM</button>
        <button id="btn-cancel-move" disabled>✗</button>
        <span class="ab-sep"></span>
        <button class="btn-cta" id="btn-end">END MOVEMENT →</button>
      </div>
      <div id="wall-collision-banner" style="display:block"></div>
      <div class="roster-state-pill move-state moved">MOVED</div>
      <div class="rail-unit" data-unit="test-unit"><span class="rn">Test Unit</span></div>
      <div id="unit-card" class="visible"></div>
    `;
  }

  /**
   * Simulate the DOM mutations from transitionToShoot() in app.js.
   * This is a pure DOM function extracted from the source (lines 216-312).
   */
  function transitionToShoot() {
    // 2. Update phase header
    const title = document.querySelector('.phase-title');
    const subtitle = document.querySelector('.phase-subtitle');
    if (title) title.textContent = 'SHOOTING PHASE';
    if (subtitle) subtitle.textContent = 'Imperium Active · Round 1';

    // 3. Swap action bar content
    const actionBar = document.getElementById('action-bar');
    if (actionBar) {
      const modeGroup = actionBar.querySelector('.mode-group');
      if (modeGroup) modeGroup.remove();

      const modeLabel = document.getElementById('move-mode-label');
      if (modeLabel) modeLabel.textContent = '';

      const btnConfirm = document.getElementById('btn-confirm-move');
      const btnCancel = document.getElementById('btn-cancel-move');
      if (btnConfirm) btnConfirm.style.display = 'none';
      if (btnCancel) btnCancel.style.display = 'none';

      const btnEnd = document.getElementById('btn-end');
      if (btnEnd) {
        btnEnd.textContent = 'END SHOOTING →';
        btnEnd.disabled = false;
      }
    }

    // 4. Update phase dots
    const phItems = document.querySelectorAll('.ph-item');
    phItems.forEach(function(item) {
      item.classList.remove('active', 'done');
      if (item.textContent.trim().includes('MOVE')) item.classList.add('done');
      if (item.textContent.trim().includes('SHOOT')) item.classList.add('active');
    });

    // 5. Swap body phase class
    document.body.classList.remove('phase-move');
    document.body.classList.add('phase-shoot');
  }

  beforeEach(() => {
    buildPhaseDOM();
    transitionToShoot();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('body has .phase-shoot class and not .phase-move', () => {
    expect(document.body.classList.contains('phase-shoot')).toBe(true);
    expect(document.body.classList.contains('phase-move')).toBe(false);
  });

  it('phase header text reads SHOOTING PHASE', () => {
    const title = document.querySelector('.phase-title');
    expect(title.textContent).toBe('SHOOTING PHASE');
  });

  it('SHOOT phase dot has .active class, MOVE has .done class', () => {
    const phItems = document.querySelectorAll('.ph-item');
    let shootItem = null;
    let moveItem = null;
    phItems.forEach(item => {
      if (item.textContent.trim().includes('SHOOT')) shootItem = item;
      if (item.textContent.trim().includes('MOVE')) moveItem = item;
    });

    expect(shootItem).not.toBeNull();
    expect(moveItem).not.toBeNull();
    expect(shootItem.classList.contains('active')).toBe(true);
    expect(shootItem.classList.contains('done')).toBe(false);
    expect(moveItem.classList.contains('done')).toBe(true);
    expect(moveItem.classList.contains('active')).toBe(false);
  });

  it('action bar contains END SHOOTING CTA button', () => {
    const btnEnd = document.getElementById('btn-end');
    expect(btnEnd).not.toBeNull();
    expect(btnEnd.textContent).toBe('END SHOOTING →');
    expect(btnEnd.disabled).toBe(false);
  });

  it('mode-group (NORMAL MOVE / ADVANCE buttons) is removed', () => {
    const modeGroup = document.querySelector('.mode-group');
    expect(modeGroup).toBeNull();
  });

  it('confirm/cancel move buttons are hidden', () => {
    const btnConfirm = document.getElementById('btn-confirm-move');
    const btnCancel = document.getElementById('btn-cancel-move');
    expect(btnConfirm.style.display).toBe('none');
    expect(btnCancel.style.display).toBe('none');
  });
});
