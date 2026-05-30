import { Container, type PointData, type FederatedPointerEvent } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createNode, updateNodeStyle, updateNodeVisibility } from '../renderers/node';
import { createNodeLabel, updateNodeLabelStyle, updateNodeLabelVisibility } from '../renderers/nodeLabel';
import type { NodeStyle } from '../style/style';
import type { TextureCache } from '../textures/TextureCache';

export interface PixiNodeEvents {
  mousemove: (event: FederatedPointerEvent) => void;
  mouseover: (event: FederatedPointerEvent) => void;
  mouseout: (event: FederatedPointerEvent) => void;
  mousedown: (event: FederatedPointerEvent) => void;
  mouseup: (event: FederatedPointerEvent) => void;
  rightclick: (event: FederatedPointerEvent) => void;
  click: (event: FederatedPointerEvent) => void;
  dbclick: (event: FederatedPointerEvent) => void;
}

export class PixiNode extends EventEmitter<PixiNodeEvents> {
  nodeStyle: NodeStyle;
  readonly nodeGfx: Container;
  readonly nodeLabelGfx: Container;

  hovered = false;

  constructor(option: { nodeStyle: NodeStyle }) {
    super();
    this.nodeStyle = option.nodeStyle;
    this.nodeGfx = this.createNodeContainer();
    this.nodeLabelGfx = this.createNodeLabelContainer();
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

  private createNodeContainer(): Container {
    const nodeGfx = new Container();
    nodeGfx.eventMode = 'static';
    nodeGfx.cursor = 'pointer';
    nodeGfx.cullable = true;
    this.bindInteraction(nodeGfx);
    createNode(nodeGfx);
    return nodeGfx;
  }

  private createNodeLabelContainer(): Container {
    const nodeLabelGfx = new Container();
    nodeLabelGfx.cullable = true;
    createNodeLabel(nodeLabelGfx);
    return nodeLabelGfx;
  }

  updatePosition(position: PointData): void {
    this.nodeGfx.position.copyFrom(position);
    this.nodeLabelGfx.position.copyFrom(position);
  }

  updateStyle(nodeStyle: NodeStyle, textureCache: TextureCache): void {
    updateNodeStyle(this.nodeGfx, nodeStyle, textureCache);
    updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
  }

  updateAlpha(nodeStyle: NodeStyle): void {
    this.nodeGfx.alpha = nodeStyle.alpha;
    this.nodeLabelGfx.alpha = nodeStyle.alpha;
  }

  updateVisibility(zoomStep: number): void {
    updateNodeVisibility(this.nodeGfx, zoomStep);
    updateNodeLabelVisibility(this.nodeLabelGfx, zoomStep);
  }

  setVisible(visible: boolean): void {
    this.nodeGfx.visible = visible;
    this.nodeLabelGfx.visible = visible;
  }

  isVisible(): boolean {
    return this.nodeGfx.visible;
  }
}
