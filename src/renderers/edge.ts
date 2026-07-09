// 边主体渲染器。三种形态：
//  - 普通边：一条白色矩形 Sprite，靠 width/旋转/位置（在 PixiEdge.updatePosition 里设）拉成线段，tint 着色。
//  - 平行曲线边（curve.enabled 且两点间多条边）：Graphics 画二次贝塞尔，与矩形 Sprite 互斥切换显示。
//  - 自环边（source===target）：画成一个圆环（填充 Sprite 透明 + 描边 Sprite 着色），绕在节点上方。
import { Container, Circle, Polygon, Sprite, Graphics, Texture } from 'pixi.js';
import { colorToPixi } from '../utils/color';
import { sampleCurvePoints, type CurveGeometry } from '../core/edgeCurve';
import type { EdgeStyle } from '../style/style';
import type { TextureCache } from '../textures/TextureCache';

const DELIMITER = '::';
const WHITE = 0xffffff;

const EDGE_LINE = 'EDGE_LINE';
const EDGE_LINE_BORDER = 'EDGE_LINE_BORDER';
const EDGE_CURVE = 'EDGE_CURVE';

// 曲线命中多边形的采样段数与共享缓冲：hitArea 只需近似轮廓，16 段足够；单线程下所有边共用一个缓冲。
const CURVE_HIT_SAMPLES = 16;
const curveHitPoints = new Float64Array((CURVE_HIT_SAMPLES + 1) * 2);

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

    // 平行边曲线载体：常态隐藏（visible=false 不参与 bounds，避免干扰直线分支的 container.height 缩放）。
    const edgeCurve = new Graphics();
    edgeCurve.label = EDGE_CURVE;
    edgeCurve.visible = false;
    edgeGfx.addChild(edgeCurve);
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

    const edgeCircle = edgeGfx.children[0] as Sprite;
    edgeCircle.texture = edgeCircleTexture;
    edgeCircle.alpha = 0;

    const edgeCircleBorder = edgeGfx.children[1] as Sprite;
    edgeCircleBorder.texture = edgeCircleBorderTexture;
    [edgeCircleBorder.tint, edgeCircleBorder.alpha] = colorToPixi(edgeStyle.color);
  } else {
    // 普通边：白色矩形只需设线宽与着色，长度/角度由 PixiEdge.updatePosition 控制。
    const edgeLine = edgeGfx.children[0] as Sprite;
    edgeLine.width = edgeStyle.width;
    [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);

    // 曲线 Graphics 以白色描边绘制（见 updateEdgeCurvePosition），颜色统一走 tint——
    // 这样纯颜色变化（如 hover 高亮）无需重画几何。
    const edgeCurve = edgeGfx.children[1] as Graphics | undefined;
    if (edgeCurve) [edgeCurve.tint, edgeCurve.alpha] = colorToPixi(edgeStyle.color);
  }
}

/**
 * 把普通边切换成曲线形态并绘制（平行边扇形展开时由 PixiEdge.updatePosition 调用）。
 * 容器摆到弦中点、几何按"世界坐标 − 中点"落到局部坐标：直接用世界坐标当顶点会在大图远端
 * 因 float32 精度不足而抖动。同时撤销直线分支经 container.height 写入的缩放/旋转。
 * hitArea 用采样点沿法线两侧扩展出的多边形：Graphics 描边的 PIXI 命中判定不可靠，
 * 且细线需要比线宽更大的命中容差。
 */
export function updateEdgeCurvePosition(edgeGfx: Container, geometry: CurveGeometry, centerX: number, centerY: number, edgeStyle: EdgeStyle): void {
  const edgeLine = edgeGfx.children[0] as Sprite;
  const edgeCurve = edgeGfx.children[1] as Graphics;
  edgeLine.visible = false;
  edgeCurve.visible = true;
  edgeGfx.scale.set(1);
  edgeGfx.rotation = 0;
  edgeGfx.position.set(centerX, centerY);

  edgeCurve.clear();
  if (!geometry.valid) {
    // 两节点过近，曲线被裁剪吞尽：不画也不可命中（与直线 lineLength=0 的表现一致）。
    edgeGfx.hitArea = null;
    return;
  }
  edgeCurve
    .moveTo(geometry.q0x - centerX, geometry.q0y - centerY)
    .quadraticCurveTo(geometry.q1x - centerX, geometry.q1y - centerY, geometry.q2x - centerX, geometry.q2y - centerY)
    .stroke({ width: edgeStyle.width, color: WHITE });

  edgeGfx.hitArea = buildCurveHitPolygon(edgeGfx.hitArea, geometry, centerX, centerY, edgeStyle.width / 2 + 2);
}

/**
 * 批量边模式下抑制曲线绘制（PixiEdge.suppressCurveGfx 为 true 时由 updatePosition 调用）：
 * 批量模式下普通边层不渲染，逐条构建贝塞尔描边几何与命中多边形是纯浪费——大图（10 万边）
 * 会在 Culler 取 bounds 时把全部几何实例化，实测多耗 9 秒、多占约 300MB。清空几何让 bounds
 * 归零即可。恢复普通渲染时由 GraphMutationController.refreshAllEdgePositions 全量重画。
 */
export function suppressEdgeCurve(edgeGfx: Container): void {
  const edgeLine = edgeGfx.children[0] as Sprite;
  const edgeCurve = edgeGfx.children[1] as Graphics;
  edgeLine.visible = false;
  if (edgeCurve.visible) {
    edgeCurve.clear();
    edgeCurve.visible = false;
  }
  edgeGfx.hitArea = null;
}

/** 从曲线形态复位回直线形态（updatePosition 的直线分支每次先调用，保证形态切换幂等）。 */
export function resetEdgeCurve(edgeGfx: Container): void {
  const edgeCurve = edgeGfx.children[1] as Graphics | undefined;
  if (!edgeCurve || !edgeCurve.visible) return;
  // clear 让曲线几何彻底退出 bounds 计算，直线分支的 container.height 缩放才不会被污染。
  edgeCurve.clear();
  edgeCurve.visible = false;
  (edgeGfx.children[0] as Sprite).visible = true;
  edgeGfx.hitArea = null;
}

// 采样曲线 → 沿每点法线向两侧外扩 halfHit，围成闭合命中多边形。复用传入的 Polygon 实例
// （原地重写 points 数组），避免拖拽时逐帧分配。
function buildCurveHitPolygon(existing: unknown, geometry: CurveGeometry, centerX: number, centerY: number, halfHit: number): Polygon {
  sampleCurvePoints(geometry, CURVE_HIT_SAMPLES, curveHitPoints);
  const polygon = existing instanceof Polygon ? existing : new Polygon();
  const points = polygon.points;
  points.length = 0;

  const normalAt = (i: number): [number, number] => {
    // 端点用相邻段方向，中间点用前后点差分，避免折线法线在节点处跳变。
    const prev = Math.max(0, i - 1);
    const next = Math.min(CURVE_HIT_SAMPLES, i + 1);
    const dx = curveHitPoints[next * 2] - curveHitPoints[prev * 2];
    const dy = curveHitPoints[next * 2 + 1] - curveHitPoints[prev * 2 + 1];
    const length = Math.hypot(dx, dy) || 1;
    return [-dy / length, dx / length];
  };

  for (let i = 0; i <= CURVE_HIT_SAMPLES; i += 1) {
    const [nx, ny] = normalAt(i);
    points.push(curveHitPoints[i * 2] - centerX + nx * halfHit, curveHitPoints[i * 2 + 1] - centerY + ny * halfHit);
  }
  for (let i = CURVE_HIT_SAMPLES; i >= 0; i -= 1) {
    const [nx, ny] = normalAt(i);
    points.push(curveHitPoints[i * 2] - centerX - nx * halfHit, curveHitPoints[i * 2 + 1] - centerY - ny * halfHit);
  }
  return polygon;
}
