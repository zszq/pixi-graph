import { describe, it, expect } from 'vitest';
import { resolveStyleDefinition, resolveStyleDefinitions } from './style';

describe('resolveStyleDefinition', () => {
  it('returns primitive values unchanged', () => {
    expect(resolveStyleDefinition(5, {})).toBe(5);
    expect(resolveStyleDefinition('#fff', {})).toBe('#fff');
  });

  it('invokes a top-level function with the attributes', () => {
    const resolved = resolveStyleDefinition((attrs: { size: number }) => attrs.size * 2, { size: 10 });
    expect(resolved).toBe(20);
  });

  it('resolves functions at any nesting level', () => {
    const resolved = resolveStyleDefinition({ color: (attrs: { group: number }) => (attrs.group === 1 ? 'red' : 'blue'), size: 12 }, { group: 1 });
    expect(resolved).toEqual({ color: 'red', size: 12 });
  });
});

describe('resolveStyleDefinitions', () => {
  it('deep-merges a chain, later definitions winning', () => {
    const merged = resolveStyleDefinitions([{ color: 'black', border: { width: 2, color: 'white' } }, { color: 'blue' }, undefined], {});
    expect(merged).toEqual({ color: 'blue', border: { width: 2, color: 'white' } });
  });

  it('applies a hovered override on top of the base style', () => {
    const merged = resolveStyleDefinitions([{ color: 'black' }, { color: (attrs: { hot: boolean }) => (attrs.hot ? 'orange' : 'gray') }], { hot: true });
    expect(merged).toEqual({ color: 'orange' });
  });

  it('replaces arrays instead of concatenating them', () => {
    const merged = resolveStyleDefinitions(
      [
        { dash: [1, 2], border: { color: 'black', stops: [0, 1] } },
        { dash: [3], border: { stops: [2] } }
      ],
      {}
    );
    expect(merged).toEqual({ dash: [3], border: { color: 'black', stops: [2] } });
  });
});
