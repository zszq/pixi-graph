import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Texture } from '@pixi/core';
import { BitmapText } from '@pixi/text-bitmap';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { EdgeStyle } from '../utils/style';
import { textToPixi } from '../utils/text';
import { TextureCache } from '../texture-cache';

const DELIMITER = '::';

const EDGE_LABEL_BACKGROUND = 'EDGE_LABEL_BACKGROUND';
const EDGE_LABEL_TEXT = 'EDGE_LABEL_TEXT';

export function createEdgeLabel(edgeLabelGfx: Container) {
  // edgeLabelGfx -> edgeLabelBackground
  const edgeLabelBackground = new Sprite(Texture.WHITE);
  edgeLabelBackground.name = EDGE_LABEL_BACKGROUND;
  edgeLabelBackground.anchor.set(0.5);
  edgeLabelGfx.addChild(edgeLabelBackground);

  // edgeLabelGfx -> edgeLabelText
  const edgeLabelText = new Sprite();
  edgeLabelText.name = EDGE_LABEL_TEXT;
  edgeLabelText.anchor.set(0.5);
  edgeLabelGfx.addChild(edgeLabelText);
}

export function updateEdgeLabelStyle(edgeLabelGfx: Container, edgeStyle: EdgeStyle, textureCache: TextureCache) {
  const edgeLabelTextTextureKey = [
    EDGE_LABEL_TEXT,
    edgeStyle.label.fontFamily,
    edgeStyle.label.fontSize,
    edgeStyle.label.fontWeight,
    edgeStyle.label.color,
    edgeStyle.label.stroke,
    edgeStyle.label.strokeThickness,
    edgeStyle.label.content
  ].join(DELIMITER);
  const edgeLabelTextTexture = textureCache.get(edgeLabelTextTextureKey, () => {
    const text = textToPixi(edgeStyle.label.type, edgeStyle.label.content, {
      fontFamily: edgeStyle.label.fontFamily,
      fontSize: edgeStyle.label.fontSize,
      fontWeight: edgeStyle.label.fontWeight,
      align: edgeStyle.label.align,
      color: edgeStyle.label.color,
      stroke: edgeStyle.label.stroke,
      strokeThickness: edgeStyle.label.strokeThickness
    });
    return text;
  });

  // edgeLabelGfx -> edgeLabelBackground
  const edgeLabelBackground = edgeLabelGfx.getChildByName!(EDGE_LABEL_BACKGROUND) as Sprite;
  // edgeLabelBackground.y = (edgeLabelTextTexture.height + edgeStyle.width + edgeStyle.label.padding * 2) / 2;
  edgeLabelBackground.width = edgeLabelTextTexture.width + edgeStyle.label.padding * 2;
  edgeLabelBackground.height = edgeLabelTextTexture.height + edgeStyle.label.padding * 2;
  [edgeLabelBackground.tint, edgeLabelBackground.alpha] = colorToPixi(edgeStyle.label.backgroundColor);

  // edgeLabelGfx -> edgeLabelText
  const edgeLabelText = edgeLabelGfx.getChildByName!(EDGE_LABEL_TEXT) as Sprite;
  edgeLabelText.texture = edgeLabelTextTexture;
  // edgeLabelText.y = (edgeLabelTextTexture.height + edgeStyle.width + edgeStyle.label.padding * 2) / 2;
}

export function updateEdgeLabelVisibility(edgeLabelGfx: Container, zoomStep: number) {
  // edgeLabelGfx -> edgeLabelBackground
  const edgeLabelBackground = edgeLabelGfx.getChildByName!(EDGE_LABEL_BACKGROUND) as Sprite;
  edgeLabelBackground.renderable = edgeLabelBackground.renderable && zoomStep >= 3;

  // edgeLabelGfx -> edgeLabelText
  const edgeLabelText = edgeLabelGfx.getChildByName!(EDGE_LABEL_TEXT) as BitmapText;
  edgeLabelText.renderable = edgeLabelText.renderable && zoomStep >= 2;
}
