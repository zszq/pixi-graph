// 节点标签渲染器：背景 Sprite + 文本 Sprite 两层，整体置于节点圆下方。
// 与节点图形分属不同显示层（nodeLabelLayer），故拆成独立的 Container 与一组纯函数。
import { Container, Sprite, Texture } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import type { NodeStyle } from '../style/style';
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

// 刷新标签文本纹理与背景框。背景按文本尺寸加 padding 撑开；整体下移到节点圆外缘之下。
export function updateNodeLabelStyle(nodeLabelGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache): void {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
  const { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness, content, type, padding, backgroundColor } = nodeStyle.label;

  const nodeLabelTextTextureKey = [NODE_LABEL_TEXT, fontFamily, fontSize, fontWeight, color, stroke, strokeThickness, content].join(DELIMITER);
  const nodeLabelTextTexture = textureCache.getText(nodeLabelTextTextureKey, type, content, { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness });

  const labelOffsetY = nodeOuterSize + (nodeLabelTextTexture.height + padding * 2) / 2;

  const nodeLabelBackground = nodeLabelGfx.children[0] as Sprite;
  nodeLabelBackground.y = labelOffsetY;
  nodeLabelBackground.width = nodeLabelTextTexture.width + padding * 2;
  nodeLabelBackground.height = nodeLabelTextTexture.height + padding * 2;
  [nodeLabelBackground.tint, nodeLabelBackground.alpha] = colorToPixi(backgroundColor);

  const nodeLabelText = nodeLabelGfx.children[1] as Sprite;
  nodeLabelText.texture = nodeLabelTextTexture;
  nodeLabelText.y = labelOffsetY;
}

// LOD：文本在 zoomStep>=2 出现，背景框更晚（zoomStep>=3）才出现，避免远观时一片色块。
export function updateNodeLabelVisibility(nodeLabelGfx: Container, zoomStep: number): void {
  const nodeLabelBackground = nodeLabelGfx.children[0] as Sprite;
  nodeLabelBackground.renderable = zoomStep >= 3;

  const nodeLabelText = nodeLabelGfx.children[1] as Sprite;
  nodeLabelText.renderable = zoomStep >= 2;
}
