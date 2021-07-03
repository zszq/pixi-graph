import { Container } from '@pixi/display';
import { InteractionEvent } from '@pixi/interaction';
import { IPointData } from '@pixi/math';
import { TypedEmitter } from 'tiny-typed-emitter';
import { createEdge, updateEdgeStyle, updateEdgeVisibility } from './renderers/edge';
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
}

export class PixiEdge extends TypedEmitter<PixiEdgeEvents> {
  isSelfLoop: boolean;
  isBilateral: boolean;
  edgeGfx: Container;
  edgeLabelGfx: Container;
  edgeArrowGfx: Container;
  edgePlaceholderGfx: Container;
  edgeLabelPlaceholderGfx: Container;
  edgeArrowPlaceholderGfx: Container;

  hovered: boolean = false;

  constructor(option: {selfLoop: boolean, bilateral: boolean}) {
    super();

    this.isSelfLoop = option.selfLoop;
    this.isBilateral = option.bilateral;
    this.edgeGfx = this.createEdge();
    this.edgeLabelGfx = this.createEdgeLabel();
    this.edgeArrowGfx = this.createEdgeArrow();
    this.edgePlaceholderGfx = new Container();
    this.edgeLabelPlaceholderGfx = new Container();
    this.edgeArrowPlaceholderGfx = new Container();
  }

  createEdge() {
    const edgeGfx = new Container();
    edgeGfx.interactive = true;
    edgeGfx.buttonMode = true;
    edgeGfx.on('mousemove', (event: InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mouseover', (event: InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mousedown', (event: InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    createEdge(edgeGfx, this.isSelfLoop);
    return edgeGfx;
  }
  
  createEdgeLabel() {
    const edgeLabelGfx = new Container();
    edgeLabelGfx.interactive = true;
    edgeLabelGfx.buttonMode = true;
    edgeLabelGfx.on('mousemove', (event: InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
    edgeLabelGfx.on('mouseover', (event: InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    edgeLabelGfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    edgeLabelGfx.on('mousedown', (event: InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    edgeLabelGfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    createEdgeLabel(edgeLabelGfx);
    return edgeLabelGfx;
  }

  createEdgeArrow() {
    const edgeArrowGfx = new Container();
    edgeArrowGfx.interactive = true;
    edgeArrowGfx.buttonMode = true;
    edgeArrowGfx.on('mousemove', (event: InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
    edgeArrowGfx.on('mouseover', (event: InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    edgeArrowGfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    edgeArrowGfx.on('mousedown', (event: InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    edgeArrowGfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
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
      const rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
      const st_length = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
      // const line_length = st_length - sourceNodeStyle.size - sourceNodeStyle.border.width - targetNodeStyle.size - targetNodeStyle.border.width;
      const line_length = st_length-Math.sqrt(3)/2 * edgeStyle.arrow.size - targetNodeStyle.size - sourceNodeStyle.size - targetNodeStyle.border.width - sourceNodeStyle.border.width;
      const center_target = line_length/2 + targetNodeStyle.size + Math.sqrt(3)/2 * edgeStyle.arrow.size + targetNodeStyle.border.width
      // 一条起点为P1（x1，y1）和终点为P2（x2，y2）的线。这条线是从圆心开始的。圆半径为r。圆线相交点
      // phi = atan2(y2-y1, x2-x1)
      // x = x1 + r * cos(phi)
      // y = y1 + r * sin(phi)
      // https://blog.csdn.net/m0_37885651/article/details/91041342
      const position = { x: targetNodePosition.x + Math.sin(rotation) * center_target, y: targetNodePosition.y - Math.cos(rotation) * center_target};
      if(this.isBilateral) {
        position.x = position.x - Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
        position.y = position.y - Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      }

      // edge
      this.edgeGfx.position.copyFrom(position);
      this.edgeGfx.rotation = rotation;
      this.edgeGfx.height = line_length;
  
      // edge -> label
      this.edgeLabelGfx.position.copyFrom(position);
      
      // edge -> arrow
      const radius = targetNodeStyle.size + targetNodeStyle.border.width + (Math.sqrt(3) / 4 * edgeStyle.arrow.size);
      const phi = Math.atan2(targetNodePosition.y - sourceNodePosition.y, targetNodePosition.x - sourceNodePosition.x);
      const arrowPosition = { x: targetNodePosition.x - Math.cos(phi) * radius, y: targetNodePosition.y - Math.sin(phi) * radius };
      if(this.isBilateral) {
        arrowPosition.x = arrowPosition.x - Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
        arrowPosition.y = arrowPosition.y - Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      }
      this.edgeArrowGfx.position.copyFrom(arrowPosition);
      this.edgeArrowGfx.rotation = phi + Math.PI / 2;
    }
  }

  updateStyle(edgeStyle: EdgeStyle, textureCache: TextureCache) {
    updateEdgeStyle(this.edgeGfx, edgeStyle, textureCache, this.isSelfLoop);
    updateEdgeArrowStyle(this.edgeArrowGfx, edgeStyle, textureCache, this.isSelfLoop);
    updateEdgeLabelStyle(this.edgeLabelGfx, edgeStyle, textureCache);
  }

  updateVisibility(zoomStep: number) {
    updateEdgeVisibility(this.edgeGfx, zoomStep, this.isSelfLoop);
    updateEdgeLabelVisibility(this.edgeLabelGfx, zoomStep);
    updateEdgeArrowVisibility(this.edgeArrowGfx, zoomStep, this.isSelfLoop);
  }
}