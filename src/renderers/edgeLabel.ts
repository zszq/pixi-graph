// 边标签渲染器：背景 Sprite + 文本 Sprite，置于边中点。
// 是否随边方向旋转、平行边的偏移由 PixiEdge.updatePosition 处理，这里只管纹理与背景框。
import { Container, Sprite, Texture } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import type { EdgeStyle } from '../style/style';
import { textToPixi } from '../utils/text';
import type { TextureCache } from '../textures/TextureCache';

const DELIMITER = '::';

const EDGE_LABEL_BACKGROUND = 'EDGE_LABEL_BACKGROUND';
const EDGE_LABEL_TEXT = 'EDGE_LABEL_TEXT';

export function createEdgeLabel(edgeLabelGfx: Container): void {
  const edgeLabelBackground = new Sprite(Texture.WHITE);
  edgeLabelBackground.label = EDGE_LABEL_BACKGROUND;
  edgeLabelBackground.anchor.set(0.5);
  edgeLabelGfx.addChild(edgeLabelBackground);

  const edgeLabelText = new Sprite();
  edgeLabelText.label = EDGE_LABEL_TEXT;
  edgeLabelText.anchor.set(0.5);
  edgeLabelGfx.addChild(edgeLabelText);
}

export function updateEdgeLabelStyle(edgeLabelGfx: Container, edgeStyle: EdgeStyle, textureCache: TextureCache): void {
  const { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness, content, type, padding, backgroundColor } = edgeStyle.label;

  const edgeLabelTextTextureKey = [EDGE_LABEL_TEXT, fontFamily, fontSize, fontWeight, color, stroke, strokeThickness, content].join(DELIMITER);
  const edgeLabelTextTexture = textureCache.get(edgeLabelTextTextureKey, () =>
    textToPixi(type, content, { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness })
  );

  const edgeLabelBackground = edgeLabelGfx.children[0] as Sprite;
  edgeLabelBackground.width = edgeLabelTextTexture.width + padding * 2;
  edgeLabelBackground.height = edgeLabelTextTexture.height + padding * 2;
  [edgeLabelBackground.tint, edgeLabelBackground.alpha] = colorToPixi(backgroundColor);

  const edgeLabelText = edgeLabelGfx.children[1] as Sprite;
  edgeLabelText.texture = edgeLabelTextTexture;
}

// LOD：与节点标签一致——文本 zoomStep>=2 出现，背景框 zoomStep>=3 才出现。
export function updateEdgeLabelVisibility(edgeLabelGfx: Container, zoomStep: number): void {
  const edgeLabelBackground = edgeLabelGfx.children[0] as Sprite;
  edgeLabelBackground.renderable = zoomStep >= 3;

  const edgeLabelText = edgeLabelGfx.children[1] as Sprite;
  edgeLabelText.renderable = zoomStep >= 2;
}
