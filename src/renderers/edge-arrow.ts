import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Graphics } from '@pixi/graphics';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { EdgeStyle } from '../utils/style';
import { TextureCache } from '../texture-cache';

const DELIMITER = '::';
const WHITE = 0xffffff;

const EDGE_ARROW = 'EDGE_ARROW';

export function createEdgeArrow(edgeArrowGfx: Container, isSelfLoop: boolean) {
  // nodeGfx -> edgeArrow
  if (isSelfLoop) {
    edgeArrowGfx.renderable = false;
    return;
  }

  const edgeArrow = new Sprite();
  edgeArrow.name = EDGE_ARROW;
  edgeArrow.anchor.set(0.5);
  edgeArrowGfx.addChild(edgeArrow);
}

export function updateEdgeArrowStyle(edgeArrowGfx: Container, edgeStyle: EdgeStyle, textureCache: TextureCache, isSelfLoop: boolean) {
  if (!edgeStyle.arrow.show || isSelfLoop || edgeStyle.arrow.size === 0) {
    return;
  }

  const edgeArrowTextureKey = [EDGE_ARROW, edgeStyle.arrow.size].join(DELIMITER);
  const edgeArrowTexture = textureCache.get(edgeArrowTextureKey, () => {
    const arrowSize = edgeStyle.arrow.size % 2 === 0 ? edgeStyle.arrow.size : edgeStyle.arrow.size + 1;
    const graphics = new Graphics();
    graphics.beginFill(WHITE);
    graphics.drawPolygon([
      -arrowSize / 2, arrowSize, 
      arrowSize / 2, arrowSize, 
      0, 0
    ]);
    return graphics;
  });
  
  // edgeGfx -> edgeArrow
  const edgeArrow = edgeArrowGfx.getChildByName!(EDGE_ARROW) as Sprite;
  edgeArrow.texture = edgeArrowTexture;
  [edgeArrow.tint, edgeArrow.alpha] = colorToPixi(edgeStyle.color);
}

export function updateEdgeArrowVisibility(edgeArrowGfx: Container, zoomStep: number, isSelfLoop: boolean) {
  // edgeGfx -> edgeArrow
  if (!isSelfLoop) {
    const edgeArrow = edgeArrowGfx.getChildByName!(EDGE_ARROW) as Sprite;
    edgeArrow.renderable = edgeArrow.renderable && zoomStep >= 1;
  }
}