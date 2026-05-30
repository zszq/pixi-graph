import { describe, it, expect } from 'vitest';
import { colorToPixi } from './color';

describe('colorToPixi', () => {
  it('converts hex colors to a tint number with full alpha', () => {
    const [tint, alpha] = colorToPixi('#ff0000');
    expect(tint).toBe(0xff0000);
    expect(alpha).toBe(1);
  });

  it('parses rgba strings including their alpha channel', () => {
    const [tint, alpha] = colorToPixi('rgba(0, 0, 0, 0)');
    expect(tint).toBe(0x000000);
    expect(alpha).toBe(0);
  });

  it('resolves named colors', () => {
    const [tint] = colorToPixi('white');
    expect(tint).toBe(0xffffff);
  });

  it('throws on invalid colors', () => {
    expect(() => colorToPixi('definitely-not-a-color')).toThrow();
  });
});
