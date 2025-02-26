import { Container } from '@pixi/display';
import { Circle } from '@pixi/core';
import { Sprite } from '@pixi/sprite';
// import { Graphics } from '@pixi/graphics';
import { SmoothGraphics as Graphics } from '@pixi/graphics-smooth';
import { Texture } from '@pixi/core';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { NodeStyle } from '../utils/style';
import { textToPixi, TextType } from '../utils/text';
import { TextureCache } from '../texture-cache';

const DELIMITER = '::';
const WHITE = 0xffffff;

const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
const NODE_ICON = 'NODE_ICON';

export function createNode(nodeGfx: Container) {
  // nodeGfx
  nodeGfx.hitArea = new Circle(0, 0);

  // nodeGfx -> nodeCircle
  const nodeCircle = new Sprite();
  nodeCircle.name = NODE_CIRCLE;
  nodeCircle.anchor.set(0.5);
  nodeGfx.addChild(nodeCircle);

  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = new Sprite();
  nodeCircleBorder.name = NODE_CIRCLE_BORDER;
  nodeCircleBorder.anchor.set(0.5);
  nodeGfx.addChild(nodeCircleBorder);

  // nodeGfx -> nodeIcon
  const nodeIcon = new Sprite();
  nodeIcon.name = NODE_ICON;
  nodeIcon.anchor.set(0.5);
  nodeGfx.addChild(nodeIcon);
}

export function updateNodeStyle(nodeGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache) {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;

  const nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMITER);
  const nodeCircleTexture = textureCache.get(nodeCircleTextureKey, () => {
    const graphics = new Graphics();
    // graphics.beginFill(WHITE);
    graphics.beginFill(WHITE, 1.0, true);
    graphics.drawCircle(0, 0, nodeStyle.size);
    graphics.endFill();
    
    return graphics;
  });

  const nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMITER);
  const nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, () => {
    const graphics = new Graphics();
    graphics.lineStyle(nodeStyle.border.width, WHITE);
    graphics.drawCircle(0, 0, nodeStyle.size);

    return graphics;
  });

  const { type, content, fontFamily, fontSize, fontWeight, color, stroke, strokeThickness, align } = nodeStyle.icon;

  const nodeIconTextureKey = [NODE_ICON, content, fontFamily, fontSize, fontWeight, color, stroke, strokeThickness].join(DELIMITER);
  if (type !== TextType.IMAGE) {
    // text
    const nodeIconTexture = textureCache.get(nodeIconTextureKey, () => {
      const text = textToPixi(type, content, { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness });
      return text;
    });
    updataNodeIcon(nodeIconTexture);
  } else {
    // image
    if (textureCache.has(nodeIconTextureKey)) {
      const nodeIconTexture = textureCache.getOnly(nodeIconTextureKey);
      updataNodeIcon(nodeIconTexture);
    } else {
      const nodeIconTexture = Texture.from(content);
      textureCache.set(nodeIconTextureKey, nodeIconTexture);
      updataNodeIcon(nodeIconTexture);
    }
  }

  // nodeGfx -> nodeIcon
  function updataNodeIcon(nodeIconTexture: any) {
    const nodeIcon = nodeGfx.getChildByName(NODE_ICON) as Sprite;
    nodeIcon.texture = nodeIconTexture;
    [nodeIcon.tint, nodeIcon.alpha] = colorToPixi(color);

    if (type === TextType.IMAGE) {
      nodeIcon.width = nodeStyle.size * 2;
      nodeIcon.height = nodeStyle.size * 2;
    }

    nodeGfx.addChild(nodeIcon);
  }

  // nodeGfx
  (nodeGfx.hitArea as Circle).radius = nodeOuterSize;

  // nodeGfx -> nodeCircle
  // 如果nodeicon是图片直接遮盖nodeCircle，不再设置纹理，否则会出现底色锯齿边框
  // if (type !== TextType.IMAGE) {
  const nodeCircle = nodeGfx.getChildByName(NODE_CIRCLE) as Sprite;
  nodeCircle.texture = nodeCircleTexture;
  [nodeCircle.tint, nodeCircle.alpha] = colorToPixi(nodeStyle.color);
  // }

  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER) as Sprite;
  nodeCircleBorder.texture = nodeCircleBorderTexture;
  [nodeCircleBorder.tint, nodeCircleBorder.alpha] = colorToPixi(nodeStyle.border.color);
}

export function updateNodeVisibility(nodeGfx: Container, zoomStep: number) {
  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER) as Sprite;
  nodeCircleBorder.renderable = nodeCircleBorder.renderable && zoomStep >= 1;

  // nodeGfx -> nodeIcon
  const nodeIcon = nodeGfx.getChildByName(NODE_ICON) as Sprite;
  nodeIcon.renderable = nodeIcon.renderable && zoomStep >= 2;
}
