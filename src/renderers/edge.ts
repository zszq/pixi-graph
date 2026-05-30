import { Container, Circle, Sprite, Graphics, Texture } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import type { EdgeStyle } from '../style/style';
import type { TextureCache } from '../textures/TextureCache';

const DELIMITER = '::';
const WHITE = 0xffffff;

const EDGE_LINE = 'EDGE_LINE';
const EDGE_LINE_BORDER = 'EDGE_LINE_BORDER';

export function createEdge(edgeGfx: Container, isSelfLoop: boolean): void {
  if (isSelfLoop) {
    edgeGfx.hitArea = new Circle(0, 0);

    const edgeCircle = new Sprite();
    edgeCircle.label = EDGE_LINE;
    edgeCircle.anchor.set(0.5);
    edgeGfx.addChild(edgeCircle);

    const edgeCircleBorder = new Sprite();
    edgeCircleBorder.label = EDGE_LINE_BORDER;
    edgeCircleBorder.anchor.set(0.5);
    edgeGfx.addChild(edgeCircleBorder);
  } else {
    const edgeLine = new Sprite(Texture.WHITE);
    edgeLine.label = EDGE_LINE;
    edgeLine.anchor.set(0.5);
    edgeGfx.addChild(edgeLine);
  }
}

export function updateEdgeStyle(edgeGfx: Container, edgeStyle: EdgeStyle, textureCache: TextureCache, isSelfLoop: boolean): void {
  if (isSelfLoop) {
    const edgeOuterSize = edgeStyle.selefLoop.radius + edgeStyle.width;

    const edgeCircleTextureKey = [EDGE_LINE, edgeStyle.selefLoop.radius].join(DELIMITER);
    const edgeCircleTexture = textureCache.get(edgeCircleTextureKey, () => {
      const graphics = new Graphics();
      graphics.circle(edgeStyle.selefLoop.radius, edgeStyle.selefLoop.radius, edgeStyle.selefLoop.radius).fill(WHITE);
      return graphics;
    });

    const edgeCircleBorderTextureKey = [EDGE_LINE_BORDER, edgeStyle.selefLoop.radius, edgeStyle.width].join(DELIMITER);
    const edgeCircleBorderTexture = textureCache.get(edgeCircleBorderTextureKey, () => {
      const graphics = new Graphics();
      graphics.circle(edgeOuterSize, edgeOuterSize, edgeStyle.selefLoop.radius).stroke({ width: edgeStyle.width, color: WHITE });
      return graphics;
    });

    (edgeGfx.hitArea as Circle).radius = edgeOuterSize;

    const edgeCircle = edgeGfx.getChildByLabel(EDGE_LINE) as Sprite;
    edgeCircle.texture = edgeCircleTexture;
    edgeCircle.alpha = 0;

    const edgeCircleBorder = edgeGfx.getChildByLabel(EDGE_LINE_BORDER) as Sprite;
    edgeCircleBorder.texture = edgeCircleBorderTexture;
    [edgeCircleBorder.tint, edgeCircleBorder.alpha] = colorToPixi(edgeStyle.color);
  } else {
    const edgeLine = edgeGfx.getChildByLabel(EDGE_LINE) as Sprite;
    edgeLine.width = edgeStyle.width;
    [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);
  }
}

export function updateEdgeVisibility(edgeGfx: Container, zoomStep: number, isSelfLoop: boolean): void {
  const label = isSelfLoop ? EDGE_LINE_BORDER : EDGE_LINE;
  const edgeLine = edgeGfx.getChildByLabel(label) as Sprite;
  edgeLine.renderable = zoomStep >= 1;
}
