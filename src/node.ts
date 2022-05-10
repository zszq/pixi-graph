import { Container } from '@pixi/display';
import { InteractionEvent } from '@pixi/interaction';
import { IPointData } from '@pixi/math';
import { TypedEmitter } from 'tiny-typed-emitter';
import { createNode, updateNodeStyle, updateNodeVisibility } from './renderers/node';
import { createNodeLabel, updateNodeLabelStyle, updateNodeLabelVisibility } from './renderers/node-label';
import { createNodeAttach, updateNodeAttachVisibility, updateNodeAttachGroup } from './renderers/node-attach';
import { NodeStyle } from './utils/style';
import { TextureCache } from './texture-cache';

interface PixiNodeEvents {
  mousemove: (event: MouseEvent) => void;
  mouseover: (event: MouseEvent) => void;
  mouseout: (event: MouseEvent) => void;
  mousedown: (event: MouseEvent) => void;
  mouseup: (event: MouseEvent) => void;
  rightclick: (event: MouseEvent) => void;
}

export class PixiNode extends TypedEmitter<PixiNodeEvents> {
  nodeStyle: NodeStyle;
  nodeGfx: Container;
  nodeLabelGfx: Container;
  nodeAttachGfx: Container;
  // nodePlaceholderGfx: Container;
  // nodeLabelPlaceholderGfx: Container;

  hovered: boolean = false;

  constructor(option: {nodeStyle: NodeStyle}) {
    super();

    this.nodeStyle = option.nodeStyle;
    this.nodeGfx = this.createNode();
    this.nodeLabelGfx = this.createNodeLabel();
    this.nodeAttachGfx = this.createNodeAttach();
    // this.nodePlaceholderGfx = new Container();
    // this.nodeLabelPlaceholderGfx = new Container();
  }

  private createNode() {
    const nodeGfx = new Container();
    nodeGfx.interactive = true;
    nodeGfx.buttonMode = true;
    nodeGfx.on('mousemove', (event: InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
    nodeGfx.on('mouseover', (event: InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    nodeGfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    nodeGfx.on('mousedown', (event: InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    nodeGfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    nodeGfx.on('rightclick', (event: InteractionEvent) => this.emit('rightclick', event.data.originalEvent as MouseEvent));
    createNode(nodeGfx);
    return nodeGfx;
  }

  private createNodeLabel() {
    const nodeLabelGfx = new Container();
    nodeLabelGfx.interactive = true;
    nodeLabelGfx.buttonMode = true;
    nodeLabelGfx.on('mousemove', (event: InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
    nodeLabelGfx.on('mouseover', (event: InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    nodeLabelGfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    nodeLabelGfx.on('mousedown', (event: InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    nodeLabelGfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    nodeLabelGfx.on('rightclick', (event: InteractionEvent) => this.emit('rightclick', event.data.originalEvent as MouseEvent));
    createNodeLabel(nodeLabelGfx);
    return nodeLabelGfx;
  }

   createNodeAttach() {
    const nodeAttachGfx = new Container();
    // nodeAttachGfx.interactive = true;
    // nodeAttachGfx.buttonMode = true;
    // nodeAttachGfx.on('mousemove', (event: InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
    // nodeAttachGfx.on('mouseover', (event: InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    // nodeAttachGfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    // nodeAttachGfx.on('mousedown', (event: InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    // nodeAttachGfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    // nodeAttachGfx.on('rightclick', (event: InteractionEvent) => this.emit('rightclick', event.data.originalEvent as MouseEvent));
    createNodeAttach(nodeAttachGfx);
    return nodeAttachGfx;
  }

  updatePosition(position: IPointData) {
    this.nodeGfx.position.copyFrom(position);
    this.nodeLabelGfx.position.copyFrom(position);
    this.nodeAttachGfx.position.copyFrom(position);
  }

  updateStyle(nodeStyle: NodeStyle, textureCache: TextureCache) {
    updateNodeStyle(this.nodeGfx, nodeStyle, textureCache);
    updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
    updateNodeAttachGroup(this.nodeAttachGfx, nodeStyle, textureCache);
  }

  updateVisibility(zoomStep: number) {
    updateNodeVisibility(this.nodeGfx, zoomStep);
    updateNodeLabelVisibility(this.nodeLabelGfx, zoomStep);
    updateNodeAttachVisibility(this.nodeAttachGfx, zoomStep);
  }

  nodeVisibility(visible: boolean) {
    this.nodeGfx.visible = visible;
    this.nodeLabelGfx.visible = visible;
    this.nodeAttachGfx.visible = visible;
  }

  checkNodeVisibility() {
    return this.nodeGfx.visible; // 注意文字和附加容器的可见性
  }
}