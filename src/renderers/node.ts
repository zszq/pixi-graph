// 节点渲染器：无状态纯函数，作用在传入的 nodeGfx Container 上。
// 节点由三个叠放的 Sprite 组成（圆形填充 / 圆形描边 / 图标），各自的位图先经
// TextureCache 渲染成纹理再复用。createNode 一次性建好结构，updateNodeStyle 按样式
// 刷新纹理与着色，updateNodeVisibility 按缩放档位（zoomStep）切换各层是否绘制。
import { Container, Circle, Sprite, Graphics, Texture } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import type { NodeStyle } from '../style/style';
import { TextType } from '../utils/text';
import type { TextureCache } from '../textures/TextureCache';

// 纹理缓存 key 的分隔符；用 label 标记子 Sprite，便于后续按名取回。
const DELIMITER = '::';
const WHITE = 0xffffff;

const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
const NODE_ICON = 'NODE_ICON';

// 建好节点容器的三层子 Sprite（此时纹理为空，样式由 updateNodeStyle 填充）。
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

// 按样式刷新三层 Sprite 的纹理与着色。cache key 必须含每个影响外观的样式属性，
// 否则会复用到过期纹理（圆/描边随 size、宽度变；图标随文字/字体/颜色或图片 URL 变）。
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
    const nodeIconTexture = textureCache.getText(nodeIconTextureKey, type, content, { fontFamily, fontSize, fontWeight, align, color, stroke, strokeThickness });
    applyNodeIcon(nodeIconTexture);
  } else {
    // 裁剪半径收缩到边框描边内沿（描边以 size 为中线、向内延伸 width/2）：
    // 图标 Sprite 叠在边框 Sprite 之上，若按 size 裁剪会盖住边框内侧一半。
    const nodeImageRadius = Math.max(nodeStyle.size - nodeStyle.border.width / 2, 0);
    // 图片图标的缓存 key 需含尺寸：圆形裁剪半径随节点 size 与边框宽度变化。
    const nodeImageTextureKey = [NODE_ICON, 'IMAGE', content, nodeImageRadius].join(DELIMITER);
    if (textureCache.has(nodeImageTextureKey)) {
      applyNodeIcon(textureCache.getOnly(nodeImageTextureKey)!);
    } else {
      // 图片图标由 TextureCache 统一异步烘焙成圆形纹理，避免每个节点都临时挂遮罩。
      textureCache.loadCircularImage(nodeImageTextureKey, content, nodeImageRadius).then(baked => {
        if (!(nodeGfx.children[2] instanceof Sprite)) return;
        applyNodeIcon(baked);
      });
    }
  }

  function applyNodeIcon(nodeIconTexture: Texture): void {
    // 图片为异步加载，回调到达时节点可能已被移除/销毁，需防御性判空。
    const nodeIcon = nodeGfx.children[2] as Sprite | undefined;
    if (!nodeIcon) return;
    nodeIcon.texture = nodeIconTexture;
    [nodeIcon.tint, nodeIcon.alpha] = colorToPixi(color);
    // 图片纹理已烘焙好 cover 缩放与圆形裁剪，文字纹理本就按需生成，统一无需额外缩放/遮罩。
    nodeIcon.scale.set(1);
  }

  (nodeGfx.hitArea as Circle).radius = nodeOuterSize;

  const nodeCircle = nodeGfx.children[0] as Sprite;
  nodeCircle.texture = nodeCircleTexture;
  [nodeCircle.tint, nodeCircle.alpha] = colorToPixi(nodeStyle.color);

  const nodeCircleBorder = nodeGfx.children[1] as Sprite;
  nodeCircleBorder.texture = nodeCircleBorderTexture;
  [nodeCircleBorder.tint, nodeCircleBorder.alpha] = colorToPixi(nodeStyle.border.color);
}

// LOD：缩放档位越高显示越多细节。圆形主体始终绘制（剔除由 Culler 负责），
// 描边在 zoomStep>=1 出现、图标在 zoomStep>=2 才出现，远观时省去细碎绘制。
export function updateNodeVisibility(nodeGfx: Container, zoomStep: number): void {
  const nodeCircleBorder = nodeGfx.children[1] as Sprite;
  nodeCircleBorder.renderable = zoomStep >= 1;

  const nodeIcon = nodeGfx.children[2] as Sprite;
  nodeIcon.renderable = zoomStep >= 2;
}
