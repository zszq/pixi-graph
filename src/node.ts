import { Container } from '@pixi/display';
import { IPointData } from '@pixi/core';
import { FederatedPointerEvent } from '@pixi/events';
import { TypedEmitter } from 'tiny-typed-emitter';
import { createNode, updateNodeStyle, updateNodeVisibility } from './renderers/node';
import { createNodeLabel, updateNodeLabelStyle, updateNodeLabelVisibility } from './renderers/node-label';
import { NodeStyle } from './utils/style';
import { TextureCache } from './texture-cache';
// import { SmoothGraphics as Graphics } from '@pixi/graphics-smooth';

interface PixiNodeEvents {
  mousemove: (event: MouseEvent) => void;
  mouseover: (event: MouseEvent) => void;
  mouseout: (event: MouseEvent) => void;
  mousedown: (event: MouseEvent) => void;
  mouseup: (event: MouseEvent) => void;
  rightclick: (event: MouseEvent) => void;
  click: (event: MouseEvent) => void;
  dbclick: (event: MouseEvent) => void;
}

export class PixiNode extends TypedEmitter<PixiNodeEvents> {
  nodeStyle: NodeStyle;
  nodeGfx: Container;
  nodeLabelGfx: Container;
  // nodePlaceholderGfx: Container;
  // nodeLabelPlaceholderGfx: Container;

  hovered: boolean = false;

  constructor(option: { nodeStyle: NodeStyle }) {
    super();

    this.nodeStyle = option.nodeStyle;
    this.nodeGfx = this.createNode();
    this.nodeLabelGfx = this.createNodeLabel();
    // this.nodePlaceholderGfx = new Container();
    // this.nodeLabelPlaceholderGfx = new Container();
  }

  private addCommonEventListener(gfx: Container) {
    gfx.on('mousemove', event => this.emit('mousemove', event.originalEvent as FederatedPointerEvent));
    gfx.on('mouseover', event => this.emit('mouseover', event.originalEvent as FederatedPointerEvent));
    gfx.on('mouseout', event => this.emit('mouseout', event.originalEvent as FederatedPointerEvent));
    gfx.on('mousedown', event => {
      gfx.cursor = 'grabbing';
      this.emit('mousedown', event.originalEvent as FederatedPointerEvent);
    });

    const doubleClickDelay = 180;
    let clickTimeout: number | null;
    gfx.on('mouseup', event => {
      gfx.cursor = 'pointer';
      let originalEvent = event.originalEvent;
      this.emit('mouseup', originalEvent as FederatedPointerEvent);

      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        this.emit('dbclick', originalEvent as FederatedPointerEvent);
      } else {
        clickTimeout = window.setTimeout(() => {
          clickTimeout = null;
          this.emit('click', originalEvent as FederatedPointerEvent);
        }, doubleClickDelay);
      }
    });
    gfx.on('rightclick', event => this.emit('rightclick', event.originalEvent as FederatedPointerEvent));

    // gfx.on('click', (event) => {}); // 通过mouseup上面实现单双击事件，防止单击后移动鼠标由于延迟原因造成的坐标数据为移动后的。
  }

  private createNode() {
    const nodeGfx = new Container();
    nodeGfx.eventMode = 'static';
    nodeGfx.cursor = 'pointer';
    this.addCommonEventListener(nodeGfx);
    createNode(nodeGfx);
    return nodeGfx;
  }

  private createNodeLabel() {
    const nodeLabelGfx = new Container();
    nodeLabelGfx.eventMode = 'static';
    nodeLabelGfx.cursor = 'pointer';
    this.addCommonEventListener(nodeLabelGfx);
    createNodeLabel(nodeLabelGfx);
    return nodeLabelGfx;
  }

  updatePosition(position: IPointData) {
    this.nodeGfx.position.copyFrom(position);
    this.nodeLabelGfx.position.copyFrom(position);
  }

  updateStyle(nodeStyle: NodeStyle, textureCache: TextureCache) {
    updateNodeStyle(this.nodeGfx, nodeStyle, textureCache);
    updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
  }

  updateAlpha(nodeStyle: NodeStyle) {
    this.nodeGfx.alpha = nodeStyle.alpha;
    this.nodeLabelGfx.alpha = nodeStyle.alpha;
  }

  updateVisibility(zoomStep: number) {
    updateNodeVisibility(this.nodeGfx, zoomStep);
    updateNodeLabelVisibility(this.nodeLabelGfx, zoomStep);
  }

  nodeVisibility(visible: boolean) {
    this.nodeGfx.visible = visible;
    this.nodeLabelGfx.visible = visible;
  }

  checkNodeVisibility() {
    return this.nodeGfx.visible; // 注意文字和附加容器的可见性
  }
}
