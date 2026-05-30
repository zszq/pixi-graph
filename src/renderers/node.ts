import { Container, Circle, Sprite, Graphics, Texture } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import type { NodeStyle } from '../style/style';
import { textToPixi, TextType } from '../utils/text';
import type { TextureCache } from '../textures/TextureCache';

const DELIMITER = '::';
const WHITE = 0xffffff;

const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
const NODE_ICON = 'NODE_ICON';

export function createNode(nodeGfx: Container): void {
  nodeGfx.hitArea = new Circle(0, 0);

  const nodeCircle = new Sprite();
  nodeCircle.label = NODE_CIRCLE;
  nodeCircle.anchor.set(0.5);
  nodeGfx.addChild(nodeCircle);

  const nodeCircleBorder = new Sprite();
  nodeCircleBorder.label = NODE_CIRCLE_BORDER;
  nodeCircleBorder.anchor.set(0.5);
  nodeGfx.addChild(nodeCircleBorder);

  const nodeIcon = new Sprite();
  nodeIcon.label = NODE_ICON;
  nodeIcon.anchor.set(0.5);
  nodeGfx.addChild(nodeIcon);
}

export function updateNodeStyle(nodeGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache): void {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;

  const nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMITER);
  const nodeCircleTexture = textureCache.get(nodeCircleTextureKey, () => {
    const graphics = new Graphics();
    graphics.circle(0, 0, nodeStyle.size).fill(WHITE);
    return graphics;
  });

  const nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMITER);
  const nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, () => {
    const graphics = new Graphics();
    graphics.circle(0, 0, nodeStyle.size).stroke({ width: nodeStyle.border.width, color: WHITE });
    return graphics;
  });

  const { type, content, fontFamily, fontSize, fontWeight, color, stroke, strokeThickness, align } = nodeStyle.icon;
  const nodeIconTextureKey = [NODE_ICON, content, fontFamily, fontSize, fontWeight, color, stroke, strokeThickness].join(DELIMITER);

  if (type !== TextType.IMAGE) {
    const nodeIconTexture = textureCache.get(nodeIconTextureKey, () => textToPixi(type, content, { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness }));
    applyNodeIcon(nodeIconTexture);
  } else if (textureCache.has(nodeIconTextureKey)) {
    applyNodeIcon(textureCache.getOnly(nodeIconTextureKey)!);
  } else {
    const nodeIconTexture = Texture.from(content);
    textureCache.set(nodeIconTextureKey, nodeIconTexture);
    applyNodeIcon(nodeIconTexture);
  }

  function applyNodeIcon(nodeIconTexture: Texture): void {
    const nodeIcon = nodeGfx.getChildByLabel(NODE_ICON) as Sprite;
    nodeIcon.texture = nodeIconTexture;
    [nodeIcon.tint, nodeIcon.alpha] = colorToPixi(color);
    if (type === TextType.IMAGE) {
      nodeIcon.width = nodeStyle.size * 2;
      nodeIcon.height = nodeStyle.size * 2;
    }
  }

  (nodeGfx.hitArea as Circle).radius = nodeOuterSize;

  const nodeCircle = nodeGfx.getChildByLabel(NODE_CIRCLE) as Sprite;
  nodeCircle.texture = nodeCircleTexture;
  [nodeCircle.tint, nodeCircle.alpha] = colorToPixi(nodeStyle.color);

  const nodeCircleBorder = nodeGfx.getChildByLabel(NODE_CIRCLE_BORDER) as Sprite;
  nodeCircleBorder.texture = nodeCircleBorderTexture;
  [nodeCircleBorder.tint, nodeCircleBorder.alpha] = colorToPixi(nodeStyle.border.color);
}

export function updateNodeVisibility(nodeGfx: Container, zoomStep: number): void {
  const nodeCircleBorder = nodeGfx.getChildByLabel(NODE_CIRCLE_BORDER) as Sprite;
  nodeCircleBorder.renderable = zoomStep >= 1;

  const nodeIcon = nodeGfx.getChildByLabel(NODE_ICON) as Sprite;
  nodeIcon.renderable = zoomStep >= 2;
}
