/**
 * Phase 5 — Event Bus Tests
 *
 * Verifies Editor.Bus event emitter and event-driven cross-module communication.
 *
 * Run: npx vitest run packages/ui/public/mockups/terrain-experiments/v0.16/__tests__/bus.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadEditor } from './test-helpers.js';

describe('Editor.Bus — event emitter', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
    Editor.Bus.clear();
  });

  it('on + emit fires handler', () => {
    const handler = vi.fn();
    Editor.Bus.on('test', handler);
    Editor.Bus.emit('test', { x: 1 });
    expect(handler).toHaveBeenCalledWith({ x: 1 });
  });

  it('multiple handlers all fire', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    Editor.Bus.on('test', h1);
    Editor.Bus.on('test', h2);
    Editor.Bus.emit('test', 42);
    expect(h1).toHaveBeenCalledWith(42);
    expect(h2).toHaveBeenCalledWith(42);
  });

  it('off removes handler', () => {
    const handler = vi.fn();
    Editor.Bus.on('test', handler);
    Editor.Bus.off('test', handler);
    Editor.Bus.emit('test');
    expect(handler).not.toHaveBeenCalled();
  });

  it('once fires only once', () => {
    const handler = vi.fn();
    Editor.Bus.once('test', handler);
    Editor.Bus.emit('test', 'a');
    Editor.Bus.emit('test', 'b');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('a');
  });

  it('clear removes all listeners', () => {
    const handler = vi.fn();
    Editor.Bus.on('test', handler);
    Editor.Bus.clear();
    Editor.Bus.emit('test');
    expect(handler).not.toHaveBeenCalled();
  });

  it('emit with no listeners is a no-op', () => {
    expect(() => Editor.Bus.emit('nonexistent', 42)).not.toThrow();
  });

  it('on returns Bus for chaining', () => {
    const result = Editor.Bus.on('test', () => {});
    expect(result).toBe(Editor.Bus);
  });

  it('handler can remove itself during emit', () => {
    let count = 0;
    const self = () => {
      count++;
      Editor.Bus.off('test', self);
    };
    Editor.Bus.on('test', self);
    Editor.Bus.emit('test');
    Editor.Bus.emit('test');
    expect(count).toBe(1);
  });
});

describe('Event-driven communication via dispatch', () => {
  let Editor;

  beforeEach(() => {
    Editor = loadEditor();
    Editor.Bus.clear();
  });

  it('dispatch ADD_SPRITE emits sprite:added', () => {
    const handler = vi.fn();
    // addSprite() internally dispatches ADD_SPRITE, so we subscribe after creation
    Editor.Bus.on('sprite:added', handler);

    Editor.State.dispatch({ type: 'ADD_SPRITE', id: 's99' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('ADD_SPRITE');
  });

  it('dispatch DELETE_SPRITE emits sprite:removed', () => {
    const handler = vi.fn();
    Editor.Bus.on('sprite:removed', handler);

    Editor.State.dispatch({ type: 'DELETE_SPRITE', id: 's0' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatch MOVE_SPRITE emits sprite:moved', () => {
    const handler = vi.fn();
    Editor.Bus.on('sprite:moved', handler);

    Editor.State.dispatch({ type: 'MOVE_SPRITE' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatch SET_PROPERTY emits sprite:property-changed', () => {
    const handler = vi.fn();
    Editor.Bus.on('sprite:property-changed', handler);

    Editor.State.dispatch({ type: 'SET_PROPERTY' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatch REORDER emits zorder:changed', () => {
    const handler = vi.fn();
    Editor.Bus.on('zorder:changed', handler);

    Editor.State.dispatch({ type: 'REORDER' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatch GROUP emits group:created', () => {
    const handler = vi.fn();
    Editor.Bus.on('group:created', handler);

    Editor.State.dispatch({ type: 'GROUP' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatch IMPORT emits state:loaded', () => {
    const handler = vi.fn();
    Editor.Bus.on('state:loaded', handler);

    Editor.State.dispatch({ type: 'IMPORT' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatch SET_EFFECT emits effect:changed', () => {
    const handler = vi.fn();
    Editor.Bus.on('effect:changed', handler);

    Editor.State.dispatch({ type: 'SET_EFFECT' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('all dispatches emit state:dispatched', () => {
    const handler = vi.fn();
    Editor.Bus.on('state:dispatched', handler);

    Editor.State.dispatch({ type: 'ADD_SPRITE' });
    Editor.State.dispatch({ type: 'REORDER' });
    Editor.State.dispatch({ type: 'SET_EFFECT' });

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('zorder:changed listener can trigger Layers.rebuild', () => {
    const rebuildSpy = vi.fn();
    const origRebuild = Editor.Layers.rebuild;
    Editor.Layers.rebuild = rebuildSpy;

    Editor.Bus.on('zorder:changed', () => Editor.Layers.rebuild());
    Editor.State.dispatch({ type: 'REORDER' });

    expect(rebuildSpy).toHaveBeenCalledTimes(1);
    Editor.Layers.rebuild = origRebuild;
  });

  it('state:loaded listener can trigger rebuild', () => {
    const rebuildSpy = vi.fn();
    const origRebuild = Editor.Layers.rebuild;
    Editor.Layers.rebuild = rebuildSpy;

    Editor.Bus.on('state:loaded', () => Editor.Layers.rebuild());
    Editor.State.dispatch({ type: 'IMPORT' });

    expect(rebuildSpy).toHaveBeenCalledTimes(1);
    Editor.Layers.rebuild = origRebuild;
  });
});
