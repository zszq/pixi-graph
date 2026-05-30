import rgba from 'color-rgba';

/**
 * Resolve any CSS color string (named, hex, rgb(a), hsl(a)) into a PIXI tint
 * number and an alpha value, ready to assign to `sprite.tint` / `sprite.alpha`.
 */
export function colorToPixi(color: string): [tint: number, alpha: number] {
  const rgbaColor = rgba(color);
  if (!rgbaColor || rgbaColor.length < 3) {
    throw new Error(`Invalid color ${color}`);
  }
  const [r = 0, g = 0, b = 0, alpha = 1] = rgbaColor;
  const tint = (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b);
  return [tint, alpha];
}
