import { Text, BitmapText } from 'pixi.js';

// 文本/图标的呈现类型。why 区分 TEXT 与 BITMAP_TEXT：TEXT 用普通 Text，质量高、支持任意样式，
// 但每段唯一文本各生成一张纹理（成本高）；BITMAP_TEXT 复用字形图集，适合大量重复/动态文本。
// IMAGE 表示图标用图片（异步加载并裁成圆形）。
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
