import { Container, Sprite, Graphics } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import type { EdgeStyle } from '../style/style';
import type { TextureCache } from '../textures/TextureCache';

const DELIMITER = '::';
const WHITE = 0xffffff;

const EDGE_ARROW = 'EDGE_ARROW';

export function createEdgeArrow(edgeArrowGfx: Container, isSelfLoop: boolean): void {
  if (isSelfLoop) {
    edgeArrowGfx.renderable = false;
    return;
  }

  const edgeArrow = new Sprite();
  edgeArrow.label = EDGE_ARROW;
  edgeArrow.anchor.set(0.5);
  edgeArrowGfx.addChild(edgeArrow);
}

export function updateEdgeArrowStyle(edgeArrowGfx: Container, edgeStyle: EdgeStyle, textureCache: TextureCache, isSelfLoop: boolean): void {
  if (!edgeStyle.arrow.show || isSelfLoop || edgeStyle.arrow.size === 0) {
    return;
  }

  const edgeArrowTextureKey = [EDGE_ARROW, edgeStyle.arrow.size].join(DELIMITER);
  const edgeArrowTexture = textureCache.get(edgeArrowTextureKey, () => {
    const arrowSize = edgeStyle.arrow.size % 2 === 0 ? edgeStyle.arrow.size : edgeStyle.arrow.size + 1;
    const graphics = new Graphics();
    graphics.poly([-arrowSize / 2, arrowSize, arrowSize / 2, arrowSize, 0, 0]).fill(WHITE);
    return graphics;
  });

  const edgeArrow = edgeArrowGfx.getChildByLabel(EDGE_ARROW) as Sprite;
  edgeArrow.texture = edgeArrowTexture;
  [edgeArrow.tint, edgeArrow.alpha] = colorToPixi(edgeStyle.color);
}

export function updateEdgeArrowVisibility(edgeArrowGfx: Container, zoomStep: number, isSelfLoop: boolean): void {
  if (isSelfLoop) return;
  const edgeArrow = edgeArrowGfx.getChildByLabel(EDGE_ARROW) as Sprite;
  edgeArrow.renderable = zoomStep >= 1;
}
