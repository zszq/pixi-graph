import { Container, type PointData } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createEdge, updateEdgeStyle, updateEdgeCurvePosition, resetEdgeCurve, suppressEdgeCurve } from '../renderers/edge';
import { computeCurveGeometry, createCurveGeometry } from '../core/edgeCurve';
import { createEdgeArrow, updateEdgeArrowStyle, updateEdgeArrowVisibility } from '../renderers/edgeArrow';
import { createEdgeLabel, updateEdgeLabelStyle, updateEdgeLabelVisibility } from '../renderers/edgeLabel';
import type { EdgeStyle, NodeStyle } from '../style/style';
import type { TextureCache } from '../textures/TextureCache';
import { bindPointerEvents, type DisplayObjectPointerEvents } from './interaction';

export type PixiEdgeEvents = DisplayObjectPointerEvents;

/**
 * 单条边的包装类：持有线段/圆环（edgeGfx）、标签（edgeLabelGfx）、箭头（edgeArrowGfx）
 * 三个容器，并像 PixiNode 一样把指针事件转成类型化事件。绘制委托给 renderers/edge*.ts，
 * 本类额外负责按两端节点坐标计算各部分的位置与旋转（见 updatePosition）。
 */
export class PixiEdge extends EventEmitter<PixiEdgeEvents> {
  readonly isSelfLoop: boolean; // 自环边：source === target
  isBilateral = false; // 是否为平行边（两点间多条边），需横向错开避免重叠
  // 平行边扇形槽位（分配规则见 assignParallelSlots）：符号按边自身方向，弧弯向行进方向的法线正侧。
  // 全同向组取 i-(n-1)/2 对称扇形（奇数条中间 0 画直线）；组内存在双向时每个方向独占一侧、
  // 各自从 1 递增，不出现直线。曲线模式下弧顶偏移 = parallelSlot · curvature · 弦长；0 表示居中直线。
  parallelSlot = 0;
  // 批量边模式下抑制曲线 Graphics 绘制（由 GraphMutationController 在每次摆位前按批量开关设置）：
  // 普通边层此时不渲染，构建贝塞尔几何/命中多边形是纯浪费且大图下占 GB 级内存（见 suppressEdgeCurve）。
  suppressCurveGfx = false;
  edgeStyle: EdgeStyle | undefined;
  readonly edgeGfx: Container;
  readonly edgeLabelGfx: Container;
  readonly edgeArrowGfx: Container;

  hovered = false;

  // 曲线几何复用对象：updatePosition 在拖拽时逐帧调用，避免每次分配。
  private readonly curveGeometry = createCurveGeometry();

  constructor(option: { selfLoop: boolean }) {
    super();
    this.isSelfLoop = option.selfLoop;
    this.edgeGfx = this.createEdgeContainer();
    this.edgeLabelGfx = this.createEdgeLabelContainer();
    this.edgeArrowGfx = this.createEdgeArrowContainer();
  }

  private bindInteraction(gfx: Container): void {
    bindPointerEvents(gfx, this.emit.bind(this));
  }

  private createInteractiveContainer(): Container {
    const gfx = new Container();
    gfx.eventMode = 'static';
    gfx.cursor = 'pointer';
    gfx.cullable = true;
    this.bindInteraction(gfx);
    return gfx;
  }

  private createEdgeContainer(): Container {
    const edgeGfx = this.createInteractiveContainer();
    createEdge(edgeGfx, this.isSelfLoop);
    return edgeGfx;
  }

  private createEdgeLabelContainer(): Container {
    const edgeLabelGfx = this.createInteractiveContainer();
    createEdgeLabel(edgeLabelGfx);
    return edgeLabelGfx;
  }

  private createEdgeArrowContainer(): Container {
    const edgeArrowGfx = this.createInteractiveContainer();
    createEdgeArrow(edgeArrowGfx, this.isSelfLoop);
    return edgeArrowGfx;
  }

  /**
   * 按两端节点的世界坐标摆放线段、标签、箭头。线段两端要从节点圆外缘起算（扣掉两端
   * 半径+描边），目标端再为箭头留出空间；平行边整体沿法线方向偏移半个 gap 避免重叠。
   *
   * 这里所有角度/距离都按 world-space 计算，最后直接写回 display object 的 position/rotation/height。
   * 这样边的几何不会受 viewport 缩放干扰，缩放只影响可视尺寸和 culling/LOD。
   */
  updatePosition(sourceNodePosition: PointData, targetNodePosition: PointData, edgeStyle: EdgeStyle, sourceNodeStyle: NodeStyle, targetNodeStyle: NodeStyle): void {
    if (this.isSelfLoop) {
      // 自环画成贴在节点正上方的圆环：圆心取节点外缘再上移一个环半径，cross 是微调量。
      const radius = targetNodeStyle.size + targetNodeStyle.border.width;
      const selefLoopRadius = edgeStyle.selefLoop.radius;
      const selefLoopCross = edgeStyle.selefLoop.cross;
      const tangentcircles = { x: targetNodePosition.x, y: targetNodePosition.y - radius - selefLoopRadius };
      this.edgeGfx.position.copyFrom({ x: tangentcircles.x, y: tangentcircles.y + selefLoopCross });
      this.edgeLabelGfx.position.copyFrom({ x: tangentcircles.x, y: tangentcircles.y + selefLoopCross - this.edgeLabelGfx.height / 2 });
      return;
    }

    // radian：源→目标方向的角度；rotation：矩形线段需竖直为基准，故为法线方向角。
    const radian = Math.atan2(targetNodePosition.y - sourceNodePosition.y, targetNodePosition.x - sourceNodePosition.x);
    const rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    // 两节点圆心间距，减去两端半径+描边与箭头高度（正三角高 = √3/2·边长），得到可见线段长度。
    const stLength = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    const arrowHeight = edgeStyle.arrow.show ? (Math.sqrt(3) / 2) * edgeStyle.arrow.size : 0;

    // 曲线模式：curve.enabled 且两点间有多条边时，本组边按 parallelSlot 扇形散开成贝塞尔弧。
    // slot=0（奇数组中间那条）弧顶偏移为 0，仍走直线分支但不加 gap 侧移（扇形本身已保证分离）。
    const useFan = edgeStyle.curve.enabled && this.isBilateral;
    const apexOffset = useFan ? this.parallelSlot * edgeStyle.curve.curvature * stLength : 0;
    if (useFan && apexOffset !== 0) {
      const geometry = computeCurveGeometry(
        sourceNodePosition.x,
        sourceNodePosition.y,
        targetNodePosition.x,
        targetNodePosition.y,
        apexOffset,
        sourceNodeStyle.size + sourceNodeStyle.border.width,
        targetNodeStyle.size + targetNodeStyle.border.width + arrowHeight,
        edgeStyle.arrow.show ? (Math.sqrt(3) / 4) * edgeStyle.arrow.size : 0,
        this.curveGeometry
      );
      // 裁剪失败（两节点过近，弧被节点圆吞尽）退回直线分支：直线路径对退化长度已有成熟处理
      // （lineLength 夹到 0），避免在这里再维护一套"隐藏箭头/标签"的分支。
      if (geometry.valid) {
        if (this.suppressCurveGfx) {
          // 批量模式：线条由 BatchEdgeLayer 粒子绘制，这里只清掉普通层的曲线几何（省构建与内存），
          // 标签/箭头仍照常摆位（标签层在批量模式下继续渲染）。
          suppressEdgeCurve(this.edgeGfx);
          this.edgeGfx.position.set((sourceNodePosition.x + targetNodePosition.x) / 2, (sourceNodePosition.y + targetNodePosition.y) / 2);
        } else {
          updateEdgeCurvePosition(this.edgeGfx, geometry, (sourceNodePosition.x + targetNodePosition.x) / 2, (sourceNodePosition.y + targetNodePosition.y) / 2, edgeStyle);
        }

        // 标签停靠弧顶：各条弧的标签随弧散开，不再挤在弦线中点上。弧顶切线平行于弦，旋转逻辑与直线一致。
        this.edgeLabelGfx.position.set(geometry.labelX, geometry.labelY);
        if (edgeStyle.label.parallel) {
          const degrees = radian * (180 / Math.PI);
          this.edgeLabelGfx.rotation = degrees > -90 && degrees <= 90 ? radian : radian + Math.PI;
        } else {
          this.edgeLabelGfx.rotation = 0;
        }

        // 箭头沿曲线终点切线指向目标节点，避免"直箭头接弯线"的错位感。
        this.edgeArrowGfx.position.set(geometry.arrowX, geometry.arrowY);
        this.edgeArrowGfx.rotation = geometry.arrowRotation;
        return;
      }
    }

    // 直线分支：先从可能的曲线形态复位（幂等），再按既有矩形拉伸方式摆放。
    resetEdgeCurve(this.edgeGfx);
    const lineLength = Math.max(0, stLength - arrowHeight - targetNodeStyle.size - sourceNodeStyle.size - targetNodeStyle.border.width - sourceNodeStyle.border.width);
    // 线段中点到目标圆心的距离，用于把线段中心（锚点 0.5）摆到正确位置。
    const lineLengthHalf = lineLength / 2 + targetNodeStyle.size + arrowHeight + targetNodeStyle.border.width;

    const centerPosition = {
      x: targetNodePosition.x + Math.sin(rotation) * lineLengthHalf,
      y: targetNodePosition.y - Math.cos(rotation) * lineLengthHalf
    };
    if (this.isBilateral && !useFan) {
      // 平行边沿法线方向错开半个 gap，使来回两条边及其标签不重叠。
      centerPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      centerPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    }

    // 线段：摆到中点、按法线旋转、用 height 拉到目标长度（矩形 Sprite 竖直方向即长度）。
    this.edgeGfx.position.copyFrom(centerPosition);
    this.edgeGfx.rotation = rotation;
    this.edgeGfx.height = lineLength;

    // 标签：置于线段中点；parallel 时随边走向旋转，并翻转上下半区使文字始终正向可读。
    this.edgeLabelGfx.position.copyFrom(centerPosition);
    if (edgeStyle.label.parallel) {
      const degrees = radian * (180 / Math.PI);
      this.edgeLabelGfx.rotation = degrees > -90 && degrees <= 90 ? radian : radian + Math.PI;
    } else {
      this.edgeLabelGfx.rotation = 0;
    }

    // 箭头：贴在目标节点外缘（再加箭头自身高度的一部分），尖端指向目标节点圆心。
    const arrowRadius = targetNodeStyle.size + targetNodeStyle.border.width + (Math.sqrt(3) / 4) * edgeStyle.arrow.size;
    const arrowPosition = { x: targetNodePosition.x - Math.cos(radian) * arrowRadius, y: targetNodePosition.y - Math.sin(radian) * arrowRadius };
    if (this.isBilateral && !useFan) {
      arrowPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      arrowPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    }
    this.edgeArrowGfx.position.copyFrom(arrowPosition);
    this.edgeArrowGfx.rotation = radian + Math.PI / 2;
  }

  updateStyle(edgeStyle: EdgeStyle, textureCache: TextureCache): void {
    this.edgeStyle = edgeStyle;
    updateEdgeStyle(this.edgeGfx, edgeStyle, textureCache, this.isSelfLoop);
    updateEdgeArrowStyle(this.edgeArrowGfx, edgeStyle, textureCache, this.isSelfLoop);
    updateEdgeLabelStyle(this.edgeLabelGfx, edgeStyle, textureCache);
  }

  updateAlpha(edgeStyle: EdgeStyle): void {
    this.edgeGfx.alpha = edgeStyle.alpha;
    this.edgeArrowGfx.alpha = edgeStyle.alpha;
    this.edgeLabelGfx.alpha = edgeStyle.alpha;
  }

  updateVisibility(zoomStep: number): void {
    this.edgeGfx.renderable = zoomStep >= 1;
    updateEdgeLabelVisibility(this.edgeLabelGfx, zoomStep);
    updateEdgeArrowVisibility(this.edgeArrowGfx, zoomStep, this.isSelfLoop);
  }

  setVisible(visible: boolean): void {
    this.edgeGfx.visible = visible;
    this.edgeLabelGfx.visible = visible;
    this.edgeArrowGfx.visible = visible;
  }

  setRenderable(renderable: boolean): void {
    this.edgeGfx.renderable = renderable;
    this.edgeLabelGfx.renderable = renderable;
    this.edgeArrowGfx.renderable = renderable;
  }

  isVisible(): boolean {
    return this.edgeGfx.visible;
  }

  destroy(): void {
    this.removeAllListeners();
    this.edgeGfx.destroy({ children: true });
    this.edgeLabelGfx.destroy({ children: true });
    this.edgeArrowGfx.destroy({ children: true });
  }
}
