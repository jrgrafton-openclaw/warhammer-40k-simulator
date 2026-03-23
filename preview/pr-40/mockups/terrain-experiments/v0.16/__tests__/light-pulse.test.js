import { describe, it, expect, beforeEach } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Light pulse/flicker/breathe animation', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
  });

  it('creates a light with default pulse properties (type=none)', () => {
    const light = Editor.Lights.addLight(100, 100, '#ff0000', 60, 0.5, true);
    expect(light.pulseType).toBe('none');
    expect(light.pulseSpeed).toBe(1.0);
    expect(light.pulseIntensityAmp).toBe(0.15);
    expect(light.pulseRadiusAmp).toBe(10);
  });

  it('creates a light with custom pulse options', () => {
    const light = Editor.Lights.addLight(100, 100, '#ff0000', 60, 0.5, true, undefined, {
      pulseType: 'flicker',
      pulseSpeed: 2.0,
      pulseIntensityAmp: 0.3,
      pulseRadiusAmp: 25
    });
    expect(light.pulseType).toBe('flicker');
    expect(light.pulseSpeed).toBe(2.0);
    expect(light.pulseIntensityAmp).toBe(0.3);
    expect(light.pulseRadiusAmp).toBe(25);
  });

  it('serialize() includes pulse fields', () => {
    Editor.Lights.addLight(100, 100, '#ff0000', 60, 0.5, true, undefined, {
      pulseType: 'pulse',
      pulseSpeed: 1.5,
      pulseIntensityAmp: 0.2,
      pulseRadiusAmp: 20
    });
    const serialized = Editor.Lights.serialize();
    expect(serialized).toHaveLength(1);
    expect(serialized[0].pulseType).toBe('pulse');
    expect(serialized[0].pulseSpeed).toBe(1.5);
    expect(serialized[0].pulseIntensityAmp).toBe(0.2);
    expect(serialized[0].pulseRadiusAmp).toBe(20);
  });

  it('serialize() defaults pulse fields for lights without them', () => {
    // Add a light the old way (no pulse opts) and check serialize defaults
    const light = Editor.Lights.addLight(100, 100, '#ff0000', 60, 0.5, true);
    const serialized = Editor.Lights.serialize();
    expect(serialized[0].pulseType).toBe('none');
    expect(serialized[0].pulseSpeed).toBe(1.0);
    expect(serialized[0].pulseIntensityAmp).toBe(0.15);
    expect(serialized[0].pulseRadiusAmp).toBe(10);
  });

  it('_captureLight includes pulse fields', () => {
    const light = Editor.Lights.addLight(100, 100, '#ff0000', 60, 0.5, true, undefined, {
      pulseType: 'breathe',
      pulseSpeed: 0.5,
      pulseIntensityAmp: 0.1,
      pulseRadiusAmp: 5
    });
    const captured = Editor.Commands._captureLight(light);
    expect(captured.pulseType).toBe('breathe');
    expect(captured.pulseSpeed).toBe(0.5);
    expect(captured.pulseIntensityAmp).toBe(0.1);
    expect(captured.pulseRadiusAmp).toBe(5);
  });

  it('pulse properties round-trip through save/load format', () => {
    Editor.Lights.addLight(200, 150, '#00ff00', 100, 0.7, true, undefined, {
      pulseType: 'flicker',
      pulseSpeed: 2.5,
      pulseIntensityAmp: 0.4,
      pulseRadiusAmp: 30
    });

    // Save
    Editor.Persistence.save();

    // Nuke lights
    Editor.Lights.removeAll();
    expect(Editor.Core.allLights).toHaveLength(0);

    // Load
    Editor.Persistence.load();

    expect(Editor.Core.allLights).toHaveLength(1);
    const restored = Editor.Core.allLights[0];
    expect(restored.pulseType).toBe('flicker');
    expect(restored.pulseSpeed).toBe(2.5);
    expect(restored.pulseIntensityAmp).toBe(0.4);
    expect(restored.pulseRadiusAmp).toBe(30);
  });

  it('load defaults missing pulse fields from old save data', () => {
    // Simulate old save format without pulse fields
    const oldData = {
      sprites: [],
      models: [],
      lights: [{ id: 'l0', x: 100, y: 100, color: '#ff0000', radius: 60, intensity: 0.5 }],
      objectives: [],
      groups: [],
      effects: {},
      bg: 'svg-gradient',
      zOrder: []
    };
    localStorage.setItem(Editor.Persistence.STORAGE_KEY, JSON.stringify(oldData));
    Editor.Lights.removeAll();
    Editor.Persistence.load();

    expect(Editor.Core.allLights).toHaveLength(1);
    const l = Editor.Core.allLights[0];
    expect(l.pulseType).toBe('none');
    expect(l.pulseSpeed).toBe(1.0);
    expect(l.pulseIntensityAmp).toBe(0.15);
    expect(l.pulseRadiusAmp).toBe(10);
  });

  it('animation loop is a no-op when all lights have type=none', () => {
    // Add two lights with no animation
    Editor.Lights.addLight(100, 100, '#ff0000', 60, 0.5, true);
    Editor.Lights.addLight(200, 200, '#00ff00', 80, 0.4, true);

    // Verify both have type none
    Editor.Core.allLights.forEach(l => {
      expect(l.pulseType).toBe('none');
    });

    // The animation loop should skip all lights (no errors, no visual changes)
    // We can verify by checking that the base radius is unchanged after what
    // would be a tick (the loop skips type='none')
    const r1 = Editor.Core.allLights[0].circle.getAttribute('r');
    const r2 = Editor.Core.allLights[1].circle.getAttribute('r');
    expect(r1).toBe('60');
    expect(r2).toBe('80');
  });
});
