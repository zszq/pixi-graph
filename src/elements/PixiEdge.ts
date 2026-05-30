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

export class PixiEdge extends EventEmitter<PixiEdgeEvents> {
  readonly isSelfLoop: boolean;
  isBilateral = false;
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

  updatePosition(sourceNodePosition: PointData, targetNodePosition: PointData, edgeStyle: EdgeStyle, sourceNodeStyle: NodeStyle, targetNodeStyle: NodeStyle): void {
    if (this.isSelfLoop) {
      const radius = targetNodeStyle.size + targetNodeStyle.border.width;
      const selefLoopRadius = edgeStyle.selefLoop.radius;
      const selefLoopCross = edgeStyle.selefLoop.cross;
      const tangentcircles = { x: targetNodePosition.x, y: targetNodePosition.y - radius - selefLoopRadius };
      this.edgeGfx.position.copyFrom({ x: tangentcircles.x, y: tangentcircles.y + selefLoopCross });
      this.edgeLabelGfx.position.copyFrom({ x: tangentcircles.x, y: tangentcircles.y + selefLoopCross - this.edgeLabelGfx.height / 2 });
      return;
    }

    // 两点之间的弧度
    const radian = Math.atan2(targetNodePosition.y - sourceNodePosition.y, targetNodePosition.x - sourceNodePosition.x);
    const rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    const stLength = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    const lineLength =
      stLength - (Math.sqrt(3) / 2) * edgeStyle.arrow.size - targetNodeStyle.size - sourceNodeStyle.size - targetNodeStyle.border.width - sourceNodeStyle.border.width;
    const lineLengthHalf = lineLength / 2 + targetNodeStyle.size + (Math.sqrt(3) / 2) * edgeStyle.arrow.size + targetNodeStyle.border.width;

    const centerPosition = {
      x: targetNodePosition.x + Math.sin(rotation) * lineLengthHalf,
      y: targetNodePosition.y - Math.cos(rotation) * lineLengthHalf
    };
    if (this.isBilateral) {
      centerPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
      centerPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    }

    // edge line
    this.edgeGfx.position.copyFrom(centerPosition);
    this.edgeGfx.rotation = rotation;
    this.edgeGfx.height = lineLength;

    // edge label
    this.edgeLabelGfx.position.copyFrom(centerPosition);
    if (edgeStyle.label.parallel) {
      const degrees = radian * (180 / Math.PI);
      this.edgeLabelGfx.rotation = degrees > -90 && degrees <= 90 ? radian : radian + Math.PI;
    }

    // edge arrow
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
