/**
 * debug-panel.test.js — Tests for the debug panel (auto-deploy, phase-skip).
 *
 * Run with:
 *   npx vitest run packages/ui/public/mockups/integrated/__tests__/debug-panel.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared mock state (reset per test) ───────────────────
var mockUnits;
function resetMockUnits() {
  mockUnits = [
    { id: 'unit-a', faction: 'imp', deployed: false, models: [
      { id: 'm1', x: -400, y: 64, r: 8 },
      { id: 'm2', x: -383, y: 64, r: 8 },
    ]},
    { id: 'unit-b', faction: 'imp', deployed: false, models: [
      { id: 'm3', x: -400, y: 160, r: 10 },
    ]},
    { id: 'unit-c', faction: 'ork', deployed: true, models: [
      { id: 'm4', x: 560, y: 100, r: 10 },
    ]},
  ];
  mockSimState.units = mockUnits;
}

var mockSimState = { units: [], drag: null };
var mockCallbacks = { selectUnit: null, afterRender: null };

vi.mock('../../shared/state/store.js', () => ({
  get simState() { return mockSimState; },
  callbacks: mockCallbacks,
  PX_PER_INCH: 16,
  currentUnit: null,
  activeRangeTypes: new Set(),
  setCurrentUnit: vi.fn(),
}));

vi.mock('../../shared/world/svg-renderer.js', () => ({
  selectUnit: vi.fn(),
  renderModels: vi.fn(),
  setCamera: vi.fn(),
}));

function buildDebugDOM() {
  document.body.innerHTML = `
    <div id="debug-menu">
      <button id="debug-toggle">⚙ Debug</button>
      <div id="debug-panel" style="display:none;">
        <div class="debug-section">
          <button class="debug-btn" id="dbg-auto-deploy">⚡ Auto Deploy All</button>
        </div>
        <div class="debug-section">
          <div class="debug-phase-btns">
            <button class="debug-btn phase-skip" id="dbg-skip-move" data-phase="move">→ Move</button>
            <button class="debug-btn phase-skip" id="dbg-skip-shoot" data-phase="shoot">→ Shoot</button>
          </div>
        </div>
        <div class="debug-section">
          <div class="debug-state" id="dbg-state-display">Phase: deploy</div>
        </div>
      </div>
    </div>
    <div class="rail-unit" data-unit="unit-a">
      <span class="rn">Unit A</span>
      <span class="roster-state-pill deploy-state">UNDEPLOYED</span>
    </div>
    <div class="rail-unit" data-unit="unit-b">
      <span class="rn">Unit B</span>
      <span class="roster-state-pill deploy-state">UNDEPLOYED</span>
    </div>
    <span id="deploy-status-label">IMPERIUM DEPLOYING · 0/2</span>
    <div class="phase-subtitle" id="deploy-subtitle">Imperium Deploying · 0/2 units</div>
    <button id="btn-end" disabled>CONFIRM DEPLOYMENT →</button>
  `;
  window.__deployedUnitIds = new Set();
}

describe('Debug Panel', () => {
  beforeEach(async () => {
    vi.resetModules();
    resetMockUnits();
    buildDebugDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.__deployedUnitIds;
  });

  it('toggle button shows/hides the panel', async () => {
    const { initDebug } = await import('../debug.js');
    initDebug();

    var toggle = document.getElementById('debug-toggle');
    var panel = document.getElementById('debug-panel');

    expect(panel.style.display).toBe('none');
    toggle.click();
    expect(panel.style.display).toBe('block');
    expect(toggle.classList.contains('active')).toBe(true);
    toggle.click();
    expect(panel.style.display).toBe('none');
    expect(toggle.classList.contains('active')).toBe(false);
  });

  it('auto-deploy places all imp units in valid deployment zone positions', async () => {
    const { initDebug } = await import('../debug.js');
    initDebug();

    document.getElementById('dbg-auto-deploy').click();

    var impUnits = mockSimState.units.filter(function(u) { return u.faction === 'imp'; });
    impUnits.forEach(function(u) {
      expect(u.deployed).toBe(true);
      u.models.forEach(function(m) {
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.x).toBeLessThanOrEqual(240);
        expect(m.y).toBeGreaterThanOrEqual(0);
        expect(m.y).toBeLessThanOrEqual(528);
      });
    });

    // Ork unit untouched
    expect(mockSimState.units[2].models[0].x).toBe(560);
  });

  it('auto-deploy updates DOM: pills, status label, button', async () => {
    const { initDebug } = await import('../debug.js');
    initDebug();

    document.getElementById('dbg-auto-deploy').click();

    // Roster pills
    var pill = document.querySelector('[data-unit="unit-a"] .roster-state-pill');
    expect(pill.textContent).toBe('✓ DEPLOYED');
    expect(pill.classList.contains('deployed')).toBe(true);

    // CONFIRM DEPLOYMENT button enabled
    var btn = document.getElementById('btn-end');
    expect(btn.disabled).toBe(false);

    // Status label updated
    var label = document.getElementById('deploy-status-label');
    expect(label.textContent).toContain('2/2');

    // window.__deployedUnitIds populated
    expect(window.__deployedUnitIds.has('unit-a')).toBe(true);
    expect(window.__deployedUnitIds.has('unit-b')).toBe(true);
  });

  it('phase skip auto-deploys units when skipping from deploy', async () => {
    const { initDebug } = await import('../debug.js');
    initDebug();

    document.getElementById('dbg-skip-move').click();

    var impUnits = mockSimState.units.filter(function(u) { return u.faction === 'imp'; });
    impUnits.forEach(function(u) {
      expect(u.deployed).toBe(true);
    });
  });

  it('state display shows current phase', async () => {
    const { initDebug } = await import('../debug.js');
    initDebug();

    document.getElementById('debug-toggle').click();
    var display = document.getElementById('dbg-state-display');
    expect(display.textContent).toContain('Phase: deploy');
  });
});
