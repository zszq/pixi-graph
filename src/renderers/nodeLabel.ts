import { Container, Sprite, Texture } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import type { NodeStyle } from '../style/style';
import { textToPixi } from '../utils/text';
import type { TextureCache } from '../textures/TextureCache';

const DELIMITER = '::';

const NODE_LABEL_BACKGROUND = 'NODE_LABEL_BACKGROUND';
const NODE_LABEL_TEXT = 'NODE_LABEL_TEXT';

export function createNodeLabel(nodeLabelGfx: Container): void {
  const nodeLabelBackground = new Sprite(Texture.WHITE);
  nodeLabelBackground.label = NODE_LABEL_BACKGROUND;
  nodeLabelBackground.anchor.set(0.5);
  nodeLabelGfx.addChild(nodeLabelBackground);

  const nodeLabelText = new Sprite();
  nodeLabelText.label = NODE_LABEL_TEXT;
  nodeLabelText.anchor.set(0.5);
  nodeLabelGfx.addChild(nodeLabelText);
}

export function updateNodeLabelStyle(nodeLabelGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache): void {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
  const { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness, content, type, padding, backgroundColor } = nodeStyle.label;

  const nodeLabelTextTextureKey = [NODE_LABEL_TEXT, fontFamily, fontSize, fontWeight, color, stroke, strokeThickness, content].join(DELIMITER);
  const nodeLabelTextTexture = textureCache.get(nodeLabelTextTextureKey, () =>
    textToPixi(type, content, { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness })
  );

  const labelOffsetY = nodeOuterSize + (nodeLabelTextTexture.height + padding * 2) / 2;

  const nodeLabelBackground = nodeLabelGfx.getChildByLabel(NODE_LABEL_BACKGROUND) as Sprite;
  nodeLabelBackground.y = labelOffsetY;
  nodeLabelBackground.width = nodeLabelTextTexture.width + padding * 2;
  nodeLabelBackground.height = nodeLabelTextTexture.height + padding * 2;
  [nodeLabelBackground.tint, nodeLabelBackground.alpha] = colorToPixi(backgroundColor);

  const nodeLabelText = nodeLabelGfx.getChildByLabel(NODE_LABEL_TEXT) as Sprite;
  nodeLabelText.texture = nodeLabelTextTexture;
  nodeLabelText.y = labelOffsetY;
}

export function updateNodeLabelVisibility(nodeLabelGfx: Container, zoomStep: number): void {
  const nodeLabelBackground = nodeLabelGfx.getChildByLabel(NODE_LABEL_BACKGROUND) as Sprite;
  nodeLabelBackground.renderable = zoomStep >= 3;

  const nodeLabelText = nodeLabelGfx.getChildByLabel(NODE_LABEL_TEXT) as Sprite;
  nodeLabelText.renderable = zoomStep >= 2;
}
