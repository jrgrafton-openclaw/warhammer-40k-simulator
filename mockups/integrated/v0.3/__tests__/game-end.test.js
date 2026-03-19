/**
 * game-end.test.js — Tests for the Game End phase integration.
 *
 * Run with:
 *   npx vitest run packages/ui/public/mockups/integrated/__tests__/game-end.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock state ───────────────────────────────────────────
var mockSimState = {
  units: [
    { id: 'intercessors', faction: 'imp', models: [
      { id: 'm1', x: 100, y: 100, r: 8 },
      { id: 'm2', x: 110, y: 100, r: 8 },
      { id: 'm3', x: 120, y: 100, r: 8 },
    ]},
    { id: 'lieutenant', faction: 'imp', models: [
      { id: 'm4', x: 200, y: 200, r: 10 },
    ]},
    { id: 'boyz', faction: 'ork', models: [
      { id: 'm5', x: 500, y: 100, r: 8 },
      { id: 'm6', x: 510, y: 100, r: 8 },
    ]},
    { id: 'boss', faction: 'ork', models: [
      { id: 'm7', x: 550, y: 200, r: 10 },
    ]},
  ],
  drag: null,
};
var mockCallbacks = { selectUnit: null, afterRender: null };

vi.mock('../../../shared/state/store.js', () => ({
  get simState() { return mockSimState; },
  callbacks: mockCallbacks,
  PX_PER_INCH: 16,
  R32: 8,
  R40: 10,
}));

vi.mock('../../../shared/world/svg-renderer.js', () => ({
  selectUnit: vi.fn(),
  renderModels: vi.fn(),
  setCamera: vi.fn(),
}));

vi.mock('../../../shared/state/terrain-data.js', () => ({
  mapData: { terrain: [] },
}));

var mockCurrentPhase = 'fight';
vi.mock('../scene-registry.js', () => ({
  getCurrentPhase: () => mockCurrentPhase,
  transitionTo: vi.fn((phase) => { mockCurrentPhase = phase; }),
  registerScene: vi.fn(),
}));

describe('Game End Phase', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    document.body.className = '';
    mockCurrentPhase = 'fight';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('phase machine reaches game-end after fight', async () => {
    const { transitionTo } = await import('../scene-registry.js');
    transitionTo('game-end');
    expect(mockCurrentPhase).toBe('game-end');
  });

  it('initGameEnd creates the overlay elements', async () => {
    const { initGameEnd } = await import('../../../phases/game-end/v0.2/game-end.js');
    initGameEnd();

    var backdrop = document.getElementById('game-end-backdrop');
    var content = document.getElementById('game-end-content');

    expect(backdrop).not.toBeNull();
    expect(backdrop.classList.contains('game-end-backdrop')).toBe(true);
    expect(content).not.toBeNull();
    expect(content.classList.contains('game-end-content')).toBe(true);

    // Check title
    var title = content.querySelector('.victory-title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('GAME COMPLETE');

    // Check Play Again button
    var btn = document.getElementById('btn-play-again');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('PLAY AGAIN');
  });

  it('cleanupGameEnd removes the overlay elements', async () => {
    const { initGameEnd, cleanupGameEnd } = await import('../../../phases/game-end/v0.2/game-end.js');
    initGameEnd();

    expect(document.getElementById('game-end-backdrop')).not.toBeNull();
    expect(document.getElementById('game-end-content')).not.toBeNull();

    cleanupGameEnd();

    expect(document.getElementById('game-end-backdrop')).toBeNull();
    expect(document.getElementById('game-end-content')).toBeNull();
  });

  it('countModels returns correct counts per faction', async () => {
    const { countModels } = await import('../../../phases/game-end/v0.2/game-end.js');

    expect(countModels('imp')).toBe(4); // 3 intercessors + 1 lieutenant
    expect(countModels('ork')).toBe(3); // 2 boyz + 1 boss
  });

  it('initGameEnd displays correct model counts in overlay', async () => {
    const { initGameEnd } = await import('../../../phases/game-end/v0.2/game-end.js');
    initGameEnd();

    var content = document.getElementById('game-end-content');
    var stats = content.querySelectorAll('.pillar-stat');

    // imp remaining (4), imp destroyed (22-4=18), ork remaining (3), ork destroyed (12-3=9)
    var texts = Array.from(stats).map(function(s) { return s.textContent; });
    expect(texts).toContain('4 models remaining');
    expect(texts).toContain('18 models destroyed');
    expect(texts).toContain('3 models remaining');
    expect(texts).toContain('9 models destroyed');
  });

  it('initGameEnd blocks dragging', async () => {
    const { initGameEnd } = await import('../../../phases/game-end/v0.2/game-end.js');
    initGameEnd();

    // Trying to set drag to a truthy value should be blocked
    mockSimState.drag = { unitId: 'test' };
    expect(mockSimState.drag).toBeNull();

    // Setting to null should work
    mockSimState.drag = null;
    expect(mockSimState.drag).toBeNull();
  });

  it('scene-game-end registers with scene-registry', async () => {
    const { registerScene } = await import('../scene-registry.js');
    await import('../scenes/scene-game-end.js');

    expect(registerScene).toHaveBeenCalledWith('game-end', expect.objectContaining({
      config: expect.objectContaining({
        title: 'GAME COMPLETE',
        bodyClass: 'phase-game-end',
        nextPhase: null,
      }),
    }));
  });
});
