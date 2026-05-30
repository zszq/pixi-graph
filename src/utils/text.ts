import { Text, BitmapText } from 'pixi.js';

export enum TextType {
  TEXT = 'TEXT',
  BITMAP_TEXT = 'BITMAP_TEXT',
  IMAGE = 'IMAGE'
}

export type FontWeight = 'normal' | 'bold' | 'bolder' | 'lighter' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  align: TextAlign;
  color: string;
  stroke: string;
  strokeThickness: number;
}

/**
 * Build a PIXI text view (regular or bitmap) from a {@link TextStyle}. The
 * returned object is rendered once into a cached texture by the renderers.
 */
export function textToPixi(type: TextType, content: string, style: TextStyle): Text | BitmapText {
  if (type === TextType.TEXT) {
    const text = new Text({
      text: content,
      style: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        align: style.align,
        fill: style.color,
        stroke: style.strokeThickness > 0 ? { color: style.stroke, width: style.strokeThickness } : undefined
      }
    });
    text.resolution = 2;
    text.roundPixels = true;
    return text;
  }

  if (type === TextType.BITMAP_TEXT) {
    const text = new BitmapText({
      text: content,
      style: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize
      }
    });
    text.roundPixels = true;
    return text;
  }

  throw new Error(`Invalid text type ${type}`);
}
