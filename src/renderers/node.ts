import { Container } from '@pixi/display';
import { Circle } from '@pixi/math';
import { Sprite } from '@pixi/sprite';
import { Graphics } from '@pixi/graphics';
import { Texture } from '@pixi/core';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { NodeStyle } from '../utils/style';
import { textToPixi, TextType } from '../utils/text';
import { TextureCache } from '../texture-cache';

const DELIMETER = '::';
const WHITE = 0xffffff;

const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
const NODE_ICON = 'NODE_ICON';

export function createNode(nodeGfx: Container, nodeStyle: NodeStyle) {
  // nodeGfx
  nodeGfx.hitArea = new Circle(0, 0);
  
  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = new Sprite();
  nodeCircleBorder.name = NODE_CIRCLE_BORDER;
  nodeCircleBorder.anchor.set(0.5);
  nodeGfx.addChild(nodeCircleBorder);

  // nodeGfx -> nodeCircle
  const nodeCircle = new Sprite();
  nodeCircle.name = NODE_CIRCLE;
  nodeCircle.anchor.set(0.5);
  nodeGfx.addChild(nodeCircle);

  // nodeGfx -> nodeIcon
  const nodeIcon = new Sprite();
  nodeIcon.name = NODE_ICON;
  nodeIcon.anchor.set(0.5);
  
  let mask = new Graphics();
  mask.beginFill(0xFF3333, 0.01);
  mask.drawCircle(0, 0, nodeStyle.size);
  mask.endFill();
  // nodeIcon.mask = mask;

  // nodeGfx.addChild(mask);
  nodeGfx.addChild(nodeIcon);
}

export function updateNodeStyle(nodeGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache) {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
  
  const nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMETER);
  const nodeCircleTexture = textureCache.get(nodeCircleTextureKey, () => {
    const graphics = new Graphics();
    graphics.beginFill(WHITE);
    if (nodeStyle.shape === 'circle') {
      graphics.drawCircle(0, 0, nodeStyle.size);
    }
    if (nodeStyle.shape === 'rect') {
      graphics.drawRect(0, 0, nodeStyle.size, nodeStyle.size);
    }
    return graphics;
  });

  const nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMETER);
  const nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, () => {
    const graphics = new Graphics();
    // graphics.lineStyle(nodeStyle.border.width, WHITE);
    graphics.beginFill(WHITE);
    if (nodeStyle.shape === 'circle') {
      graphics.drawCircle(0, 0, nodeOuterSize);
    }
    if (nodeStyle.shape === 'rect') {
      graphics.drawRect(0, 0, nodeOuterSize, nodeOuterSize);
    }
    return graphics;
  });

  const nodeIconTextureKey = [NODE_ICON, nodeStyle.icon.fontFamily, nodeStyle.icon.fontSize, nodeStyle.icon.content].join(DELIMETER);
  if (nodeStyle.icon.type !== TextType.IMAGE) {
    const nodeIconTexture = textureCache.get(nodeIconTextureKey, () => {
      const text = textToPixi(nodeStyle.icon.type, nodeStyle.icon.content, {
        fontFamily: nodeStyle.icon.fontFamily,
        fontSize: nodeStyle.icon.fontSize,
        fontWeight: nodeStyle.icon.fontWeight
      });
      return text;
    });
    updataNodeIcon(nodeIconTexture);
  } else {
    if (textureCache.has(nodeIconTextureKey)) {
      const nodeIconTexture = textureCache.getOnly(nodeIconTextureKey);
      updataNodeIcon(nodeIconTexture);
    } else {
      const nodeIconTexture = Texture.from(nodeStyle.icon.content);
      textureCache.set(nodeIconTextureKey, nodeIconTexture);
      updataNodeIcon(nodeIconTexture);
    }
  }

  // nodeGfx -> nodeIcon
  function updataNodeIcon(nodeIconTexture: any) {
    const nodeIcon = nodeGfx.getChildByName!(NODE_ICON) as Sprite;
    nodeIcon.texture = nodeIconTexture;
    [nodeIcon.tint, nodeIcon.alpha] = colorToPixi(nodeStyle.icon.color);

    if (nodeStyle.icon.type === TextType.IMAGE) {
      if (nodeStyle.shape === 'circle') {
        nodeIcon.width = nodeStyle.size * 2;
        nodeIcon.height = nodeStyle.size * 2;
      }
      if (nodeStyle.shape === 'rect') {
        nodeIcon.width = nodeStyle.size;
        nodeIcon.height = nodeStyle.size;
      }
    }
    
    nodeGfx.addChild(nodeIcon);
  }
  
  // nodeGfx
  (nodeGfx.hitArea as Circle).radius = nodeOuterSize;

  // nodeGfx -> nodeCircle
  const nodeCircle = nodeGfx.getChildByName!(NODE_CIRCLE) as Sprite;
  nodeCircle.texture = nodeCircleTexture;
  [nodeCircle.tint, nodeCircle.alpha] = colorToPixi(nodeStyle.color);

  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName!(NODE_CIRCLE_BORDER) as Sprite;
  nodeCircleBorder.texture = nodeCircleBorderTexture;
  [nodeCircleBorder.tint, nodeCircleBorder.alpha] = colorToPixi(nodeStyle.border.color);
}

export function updateNodeVisibility(nodeGfx: Container, zoomStep: number) {
  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName!(NODE_CIRCLE_BORDER) as Sprite;
  nodeCircleBorder.visible = nodeCircleBorder.visible && zoomStep >= 1;

  // nodeGfx -> nodeIcon
  const nodeIcon = nodeGfx.getChildByName!(NODE_ICON) as Sprite;
  nodeIcon.visible = nodeIcon.visible && zoomStep >= 2;
}