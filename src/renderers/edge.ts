import { Container } from '@pixi/display';
import { Circle } from '@pixi/core';
import { Sprite } from '@pixi/sprite';
import { Graphics } from '@pixi/graphics';
import { Texture } from '@pixi/core';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { EdgeStyle } from '../utils/style';
import { TextureCache } from '../texture-cache';

const DELIMITER = '::';
const WHITE = 0xffffff;

const EDGE_LINE = 'EDGE_LINE';
const EDGE_LINE_BORDER = 'EDGE_LINE_BORDER';

export function createEdge(edgeGfx: Container, isSelfLoop: boolean) {
  if (isSelfLoop) {
    // edgeGfx
    edgeGfx.hitArea = new Circle(0, 0);

    // edgeGfx -> edgeCircle
    const edgeCircle = new Sprite();
    edgeCircle.name = EDGE_LINE;
    edgeCircle.anchor.set(0.5);
    edgeGfx.addChild(edgeCircle);

    // edgeGfx -> edgeCircleBorder
    const edgeCircleBorder = new Sprite();
    edgeCircleBorder.name = EDGE_LINE_BORDER;
    edgeCircleBorder.anchor.set(0.5);
    edgeGfx.addChild(edgeCircleBorder);
  } else {
    // edgeGfx -> edgeLine
    const edgeLine = new Sprite(Texture.WHITE);
    edgeLine.name = EDGE_LINE;
    edgeLine.anchor.set(0.5);
    edgeGfx.addChild(edgeLine);
  }
}

export function updateEdgeStyle(edgeGfx: Container, edgeStyle: EdgeStyle, textureCache: TextureCache, isSelfLoop: boolean) {
  if (isSelfLoop) {
    const edgeOuterSize = edgeStyle.selefLoop.radius + edgeStyle.width;

    const edgeCircleTextureKey = [EDGE_LINE, edgeStyle.selefLoop.radius].join(DELIMITER);
    const edgeCircleTexture = textureCache.get(edgeCircleTextureKey, () => {
      const graphics = new Graphics();
      graphics.beginFill(WHITE);
      graphics.drawCircle(edgeStyle.selefLoop.radius, edgeStyle.selefLoop.radius, edgeStyle.selefLoop.radius);
      return graphics;
    });

    const edgeCircleBorderTextureKey = [EDGE_LINE_BORDER, edgeStyle.selefLoop.radius, edgeStyle.width].join(DELIMITER);
    const edgeCircleBorderTexture = textureCache.get(edgeCircleBorderTextureKey, () => {
      const graphics = new Graphics();
      graphics.lineStyle(edgeStyle.width, WHITE);
      graphics.drawCircle(edgeOuterSize, edgeOuterSize, edgeStyle.selefLoop.radius);
      return graphics;
    });

    // edgeGfx
    (edgeGfx.hitArea as Circle).radius = edgeOuterSize;

    // edgeGfx -> edgeLine
    const edgeCircle = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
    edgeCircle.texture = edgeCircleTexture;
    edgeCircle.alpha = 0;

    // edgeGfx -> edgeCircleBorder
    const edgeCircleBorder = edgeGfx.getChildByName!(EDGE_LINE_BORDER) as Sprite;
    edgeCircleBorder.texture = edgeCircleBorderTexture;
    [edgeCircleBorder.tint, edgeCircleBorder.alpha] = colorToPixi(edgeStyle.color);
  } else {
    // edgeGfx -> edgeLine
    const edgeLine = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
    edgeLine.width = edgeStyle.width;
    [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);
  }
}

export function updateEdgeVisibility(edgeGfx: Container, zoomStep: number, isSelfLoop: boolean) {
  if (isSelfLoop) {
    // edgeGfx -> edgeCircleBorder
    const edgeCircleBorder = edgeGfx.getChildByName!(EDGE_LINE_BORDER) as Sprite;
    edgeCircleBorder.renderable = edgeCircleBorder.renderable && zoomStep >= 1;
  } else {
    // edgeGfx -> edgeLine
    const edgeLine = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
    edgeLine.renderable = edgeLine.renderable && zoomStep >= 1;
  }
}