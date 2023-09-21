import { Color } from '@pixi/core';
import rgba from 'color-rgba';

export function colorToPixi(color: string) {
  const rgbaColor = rgba(color);
  if (!rgbaColor) {
    throw new Error(`Invalid color ${color}`);
  }
  const pixiColor = new Color([rgbaColor[0] / 255, rgbaColor[1] / 255, rgbaColor[2] / 255]).toHex();
  const alpha = rgbaColor[3];
  return [pixiColor, alpha] as [string, number];
}
