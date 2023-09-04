import { Container } from '@pixi/display';
import { InteractionEvent } from '@pixi/interaction';
import { IPointData } from '@pixi/math';
import { TypedEmitter } from 'tiny-typed-emitter';
import { createEdge, updateEdgeStyle } from './renderers/edge';
import { createEdgeArrow, updateEdgeArrowStyle, updateEdgeArrowVisibility } from './renderers/edge-arrow';
import { createEdgeLabel, updateEdgeLabelStyle, updateEdgeLabelVisibility } from './renderers/edge-label';
import { EdgeStyle, NodeStyle } from './utils/style';
import { TextureCache } from './texture-cache';

interface PixiEdgeEvents {
  mousemove: (event: MouseEvent) => void;
  mouseover: (event: MouseEvent) => void;
  mouseout: (event: MouseEvent) => void;
  mousedown: (event: MouseEvent) => void;
  mouseup: (event: MouseEvent) => void;
  click: (event: MouseEvent) => void;
  rightclick: (event: MouseEvent) => void;
}

export class PixiEdge extends TypedEmitter<PixiEdgeEvents> {
  isSelfLoop: boolean;
  isBilateral: boolean;
  edgeGfx: Container;
  edgeLabelGfx: Container;
  edgeArrowGfx: Container;
  edgePlaceholderGfx: Container;
  // edgeLabelPlaceholderGfx: Container;
  // edgeArrowPlaceholderGfx: Container;

  hovered: boolean = false;

  constructor(option: { selfLoop: boolean }) {
    super();

    this.isSelfLoop = option.selfLoop;
    this.isBilateral = false;
    this.edgeGfx = this.createEdge();
    this.edgeLabelGfx = this.createEdgeLabel();
    this.edgeArrowGfx = this.createEdgeArrow();
    this.edgePlaceholderGfx = new Container();
    // this.edgeLabelPlaceholderGfx = new Container();
    // this.edgeArrowPlaceholderGfx = new Container();
  }

  private addCommonEventListener(gfx: Container) {
    gfx.on('mousemove', (event: InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
    gfx.on('mouseover', (event: InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    gfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    gfx.on('mousedown', (event: InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    gfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    gfx.on('click', (event: InteractionEvent) => this.emit('click', event.data.originalEvent as MouseEvent));
    gfx.on('rightclick', (event: InteractionEvent) => this.emit('rightclick', event.data.originalEvent as MouseEvent));
  }

  createEdge() {
    const edgeGfx = new Container();
    edgeGfx.interactive = true;
    edgeGfx.buttonMode = true;
    this.addCommonEventListener(edgeGfx);
    createEdge(edgeGfx, this.isSelfLoop);
    return edgeGfx;
  }

  createEdgeLabel() {
    const edgeLabelGfx = new Container();
    edgeLabelGfx.interactive = true;
    edgeLabelGfx.buttonMode = true;
    this.addCommonEventListener(edgeLabelGfx);
    createEdgeLabel(edgeLabelGfx);
    return edgeLabelGfx;
  }

  createEdgeArrow() {
    const edgeArrowGfx = new Container();
    edgeArrowGfx.interactive = true;
    edgeArrowGfx.buttonMode = true;
    this.addCommonEventListener(edgeArrowGfx);
    createEdgeArrow(edgeArrowGfx, this.isSelfLoop);
    return edgeArrowGfx;
  }

  updatePosition(sourceNodePosition: IPointData, targetNodePosition: IPointData, edgeStyle: EdgeStyle, sourceNodeStyle: NodeStyle, targetNodeStyle: NodeStyle) {
    if (this.isSelfLoop) {
      const radius = targetNodeStyle.size + targetNodeStyle.border.width;
      const selefLoopRadius = edgeStyle.selefLoop.radius;
      const selefLoopCross = edgeStyle.selefLoop.cross;
      const tangentcircles = { x: targetNodePosition.x, y: targetNodePosition.y - radius - selefLoopRadius };
      // edge
      this.edgeGfx.position.copyFrom({ x: tangentcircles.x, y: tangentcircles.y + selefLoopCross });
      // edge -> label
      this.edgeLabelGfx.position.copyFrom({ x: tangentcircles.x, y: tangentcircles.y + selefLoopCross - this.edgeLabelGfx.height / 2 });
    } else {
      const radian = Math.atan2(targetNodePosition.y - sourceNodePosition.y, targetNodePosition.x - sourceNodePosition.x); // 两点的弧度
      // 下面代码需要梳理
      // -----------------------start------------------------
      const rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
      const st_length = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
      // const line_length = st_length - sourceNodeStyle.size - sourceNodeStyle.border.width - targetNodeStyle.size - targetNodeStyle.border.width;
      const line_length = st_length - Math.sqrt(3) / 2 * edgeStyle.arrow.size - targetNodeStyle.size - sourceNodeStyle.size - targetNodeStyle.border.width - sourceNodeStyle.border.width;
      const line_length_half = line_length / 2 + targetNodeStyle.size + Math.sqrt(3) / 2 * edgeStyle.arrow.size + targetNodeStyle.border.width;
      // 一条起点为P1（x1，y1）和终点为P2（x2，y2）的线。这条线是从圆心开始的。圆半径为r。圆线相交点
      // radian = atan2(y2-y1, x2-x1)
      // x = x1 + r * cos(radian)
      // y = y1 + r * sin(radian)
      // https://blog.csdn.net/m0_37885651/article/details/91041342
      const centerPosition = { x: targetNodePosition.x + Math.sin(rotation) * line_length_half, y: targetNodePosition.y - Math.cos(rotation) * line_length_half };
      if (this.isBilateral) {
        centerPosition.x = centerPosition.x - Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
        centerPosition.y = centerPosition.y - Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      }

      // edge
      this.edgeGfx.position.copyFrom(centerPosition);
      this.edgeGfx.rotation = rotation;
      this.edgeGfx.height = line_length;
      // -----------------------end------------------------

      // edge -> label
      this.edgeLabelGfx.position.copyFrom(centerPosition);
      if (edgeStyle.label.parallel) {
        // 是否和线同向，文字排列自动变化
        let degrees = radian * (180 / Math.PI);
        this.edgeLabelGfx.rotation = degrees > -90 && degrees <= 90 ? radian : radian + Math.PI;
      }

      // edge -> arrow
      const radius = targetNodeStyle.size + targetNodeStyle.border.width + (Math.sqrt(3) / 4 * edgeStyle.arrow.size);
      const arrowPosition = { x: targetNodePosition.x - Math.cos(radian) * radius, y: targetNodePosition.y - Math.sin(radian) * radius };
      if (this.isBilateral) {
        arrowPosition.x = arrowPosition.x - Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
        arrowPosition.y = arrowPosition.y - Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      }
      this.edgeArrowGfx.position.copyFrom(arrowPosition);
      this.edgeArrowGfx.rotation = radian + Math.PI / 2;
    }
  }

  updateStyle(edgeStyle: EdgeStyle, textureCache: TextureCache) {
    updateEdgeStyle(this.edgeGfx, edgeStyle, textureCache, this.isSelfLoop);
    updateEdgeArrowStyle(this.edgeArrowGfx, edgeStyle, textureCache, this.isSelfLoop);
    updateEdgeLabelStyle(this.edgeLabelGfx, edgeStyle, textureCache);
  }

  updateAlpha(edgeStyle: EdgeStyle) {
    this.edgeGfx.alpha = edgeStyle.alpha;
    this.edgeArrowGfx.alpha = edgeStyle.alpha;
    this.edgeLabelGfx.alpha = edgeStyle.alpha;
  }

  updateVisibility(zoomStep: number) {
    // updateEdgeVisibility(this.edgeGfx, zoomStep, this.isSelfLoop);
    this.edgeGfx.renderable = this.edgeGfx.renderable && zoomStep >= 1; // 修复 缩小至线隐藏 在拖拽点 在放大后 线不显示问题
    // 可以更细粒度控制图元的显示隐藏
    updateEdgeLabelVisibility(this.edgeLabelGfx, zoomStep);
    updateEdgeArrowVisibility(this.edgeArrowGfx, zoomStep, this.isSelfLoop);
  }

  edgeVisibility(visible: boolean) {
    this.edgeGfx.visible = visible;
    this.edgeLabelGfx.visible = visible;
    this.edgeArrowGfx.visible = visible;
  }

  edgeRenderable(renderable: boolean) {
    this.edgeGfx.renderable = renderable;
    this.edgeLabelGfx.renderable = renderable;
    this.edgeArrowGfx.renderable = renderable;
  }

  checkEdgeVisibility() {
    return this.edgeGfx.visible; // 注意文字和箭头容器的可见性
  }
}