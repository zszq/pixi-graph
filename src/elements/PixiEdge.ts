import { Container, type PointData, type FederatedPointerEvent } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createEdge, updateEdgeStyle } from '../renderers/edge';
import { createEdgeArrow, updateEdgeArrowStyle, updateEdgeArrowVisibility } from '../renderers/edgeArrow';
import { createEdgeLabel, updateEdgeLabelStyle, updateEdgeLabelVisibility } from '../renderers/edgeLabel';
import type { EdgeStyle, NodeStyle } from '../style/style';
import type { TextureCache } from '../textures/TextureCache';

export interface PixiEdgeEvents {
  mousemove: (event: FederatedPointerEvent) => void;
  mouseover: (event: FederatedPointerEvent) => void;
  mouseout: (event: FederatedPointerEvent) => void;
  mousedown: (event: FederatedPointerEvent) => void;
  mouseup: (event: FederatedPointerEvent) => void;
  rightclick: (event: FederatedPointerEvent) => void;
  click: (event: FederatedPointerEvent) => void;
  dbclick: (event: FederatedPointerEvent) => void;
}

/**
 * 单条边的包装类：持有线段/圆环（edgeGfx）、标签（edgeLabelGfx）、箭头（edgeArrowGfx）
 * 三个容器，并像 PixiNode 一样把指针事件转成类型化事件。绘制委托给 renderers/edge*.ts，
 * 本类额外负责按两端节点坐标计算各部分的位置与旋转（见 updatePosition）。
 */
export class PixiEdge extends EventEmitter<PixiEdgeEvents> {
  readonly isSelfLoop: boolean; // 自环边：source === target
  isBilateral = false; // 是否为平行边（两点间多条边），需横向错开避免重叠
  readonly edgeGfx: Container;
  readonly edgeLabelGfx: Container;
  readonly edgeArrowGfx: Container;

  hovered = false;

  constructor(option: { selfLoop: boolean }) {
    super();
    this.isSelfLoop = option.selfLoop;
    this.edgeGfx = this.createEdgeContainer();
    this.edgeLabelGfx = this.createEdgeLabelContainer();
    this.edgeArrowGfx = this.createEdgeArrowContainer();
  }

  // 把 PIXI 指针事件转成本类的类型化事件；click 用 event.detail 区分单击/双击。
  private bindInteraction(gfx: Container): void {
    gfx.on('mousemove', event => this.emit('mousemove', event.originalEvent as FederatedPointerEvent));
    gfx.on('mouseover', event => this.emit('mouseover', event.originalEvent as FederatedPointerEvent));
    gfx.on('mouseout', event => this.emit('mouseout', event.originalEvent as FederatedPointerEvent));
    gfx.on('mousedown', event => this.emit('mousedown', event.originalEvent as FederatedPointerEvent));
    gfx.on('mouseup', event => this.emit('mouseup', event.originalEvent as FederatedPointerEvent));
    gfx.on('rightclick', event => this.emit('rightclick', event.originalEvent as FederatedPointerEvent));
    gfx.on('click', event => {
      if (event.detail === 2) {
        this.emit('dbclick', event.originalEvent as FederatedPointerEvent);
      } else if (event.detail === 1) {
        this.emit('click', event.originalEvent as FederatedPointerEvent);
      }
    });
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
    const lineLength =
      stLength - (Math.sqrt(3) / 2) * edgeStyle.arrow.size - targetNodeStyle.size - sourceNodeStyle.size - targetNodeStyle.border.width - sourceNodeStyle.border.width;
    // 线段中点到目标圆心的距离，用于把线段中心（锚点 0.5）摆到正确位置。
    const lineLengthHalf = lineLength / 2 + targetNodeStyle.size + (Math.sqrt(3) / 2) * edgeStyle.arrow.size + targetNodeStyle.border.width;

    const centerPosition = {
      x: targetNodePosition.x + Math.sin(rotation) * lineLengthHalf,
      y: targetNodePosition.y - Math.cos(rotation) * lineLengthHalf
    };
    if (this.isBilateral) {
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
    }

    // 箭头：贴在目标节点外缘（再加箭头自身高度的一部分），尖端指向目标节点圆心。
    const arrowRadius = targetNodeStyle.size + targetNodeStyle.border.width + (Math.sqrt(3) / 4) * edgeStyle.arrow.size;
    const arrowPosition = { x: targetNodePosition.x - Math.cos(radian) * arrowRadius, y: targetNodePosition.y - Math.sin(radian) * arrowRadius };
    if (this.isBilateral) {
      arrowPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      arrowPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    }
    this.edgeArrowGfx.position.copyFrom(arrowPosition);
    this.edgeArrowGfx.rotation = radian + Math.PI / 2;
  }

  updateStyle(edgeStyle: EdgeStyle, textureCache: TextureCache): void {
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
}
