import { Text, TextStyleAlign, TextStyleFontWeight } from '@pixi/text';
import { BitmapText } from '@pixi/text-bitmap';

export enum TextType {
  TEXT = 'TEXT',
  BITMAP_TEXT = 'BITMAP_TEXT',
  IMAGE = 'IMAGE'
  // TODO: SDF_TEXT
  // see https://github.com/PixelsCommander/pixi-sdf-text/issues/12
}

// TODO: use TextStyle from @pixi/text directly?
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: TextStyleFontWeight;
  align: TextStyleAlign;
  color: string;
  stroke: string;
  strokeThickness: number;
}

export function textToPixi(type: TextType, content: string, style: TextStyle) {
  let text;
  if (type === TextType.TEXT) {
    // TODO: convert to bitmap font with BitmapFont.from?
    text = new Text(content, {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      align: style.align,
      fill: style.color,
      stroke: style.stroke,
      strokeThickness: style.strokeThickness,
      // wordWrap: true,
      // wordWrapWidth: 200
    });
  } else if (type === TextType.BITMAP_TEXT) {
    text = new BitmapText(content, {
      fontName: style.fontFamily,
      fontSize: style.fontSize
    });
  } else {
    throw new Error('Invalid state');
  }
  text.roundPixels = true;
  return text;
}