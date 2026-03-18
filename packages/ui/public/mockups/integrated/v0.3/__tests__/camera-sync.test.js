/**
 * camera-sync.test.js — Regression tests for camera state synchronization.
 *
 * Bug: app.js set initial camera via DOM (inner.style.transform) without
 * updating svg-renderer's internal tx/ty. Any subsequent applyTx() call
 * (wheel zoom, pan) would snap to center (tx=0, ty=0).
 *
 * Run with:
 *   npx vitest run packages/ui/public/mockups/integrated/__tests__/camera-sync.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM elements that svg-renderer needs
function buildMinimalDOM() {
  document.body.innerHTML = `
    <main id="battlefield">
      <div id="battlefield-inner" style="transform: translate(0px, 0px) scale(0.5)"></div>
      <svg id="bf-svg" viewBox="0 0 720 528">
        <g id="layer-hulls"></g>
        <g id="layer-models"></g>
      </svg>
      <button id="reset-btn"></button>
    </main>
  `;
}

describe('Camera state synchronization', () => {
  beforeEach(() => {
    vi.resetModules();
    buildMinimalDOM();
  });

  it('setCamera() updates internal state AND DOM transform', async () => {
    const { setCamera, getCamera, applyTx } = await import('../../shared/world/svg-renderer.js');

    // Set camera to deployment offset
    setCamera(350, 0, 0.5);

    // Internal state should match
    const cam = getCamera();
    expect(cam.tx).toBe(350);
    expect(cam.ty).toBe(0);
    expect(cam.scale).toBe(0.5);

    // DOM should reflect the camera (normalize whitespace for JSDOM)
    const inner = document.getElementById('battlefield-inner');
    expect(inner.style.transform.replace(/\s+/g, '')).toBe('translate(350px,0px)scale(0.5)');
  });

  it('applyTx() after setCamera() preserves the offset (no snap to center)', async () => {
    const { setCamera, getCamera, applyTx } = await import('../../shared/world/svg-renderer.js');

    // Simulate: app.js sets initial deployment camera
    setCamera(350, 0, 0.5);

    // Simulate: user zooms via wheel → applyTx() is called
    applyTx();

    // Should NOT snap to center — tx should still be 350
    const cam = getCamera();
    expect(cam.tx).toBe(350);
    expect(cam.ty).toBe(0);

    const inner = document.getElementById('battlefield-inner');
    expect(inner.style.transform).toContain('350px');
  });

  it('setCamera(0, 0, 0.5) moves to center (phase transition)', async () => {
    const { setCamera, getCamera } = await import('../../shared/world/svg-renderer.js');

    // Start at deployment offset
    setCamera(350, 0, 0.5);
    expect(getCamera().tx).toBe(350);

    // Phase transition centers the board
    setCamera(0, 0, 0.5);
    expect(getCamera().tx).toBe(0);
    expect(getCamera().ty).toBe(0);

    const inner = document.getElementById('battlefield-inner');
    expect(inner.style.transform.replace(/\s+/g, '')).toBe('translate(0px,0px)scale(0.5)');
  });

  it('partial setCamera() only updates provided values', async () => {
    const { setCamera, getCamera } = await import('../../shared/world/svg-renderer.js');

    setCamera(100, 50, 0.8);
    setCamera(200, undefined, undefined);

    const cam = getCamera();
    expect(cam.tx).toBe(200);
    expect(cam.ty).toBe(50);    // unchanged
    expect(cam.scale).toBe(0.8); // unchanged
  });
});
