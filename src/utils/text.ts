import { Text, BitmapText } from 'pixi.js';

// 文本/图标的呈现类型。区分 TEXT 与 BITMAP_TEXT：TEXT 用普通 Text，质量高、支持任意样式，
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
 * 根据 {@link TextStyle} 构建 PIXI 文本视图（普通文本或位图文本）。
 * 返回对象会被各渲染器渲染一次并缓存为纹理。
 */
export function textToPixi(type: TextType, content: string, style: TextStyle, resolution = 2): Text | BitmapText {
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
    // 与烘焙分辨率一致：字形先按此分辨率栅格化，再被 generateTexture 二次渲染；
    // 若低于烘焙分辨率，字形会被放大采样而发虚。
    text.resolution = resolution;
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
