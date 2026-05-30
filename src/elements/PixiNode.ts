import { Container, type PointData } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createNode, updateNodeStyle, updateNodeVisibility } from '../renderers/node';
import { createNodeLabel, updateNodeLabelStyle, updateNodeLabelVisibility } from '../renderers/nodeLabel';
import type { NodeStyle } from '../style/style';
import type { TextureCache } from '../textures/TextureCache';
import { bindPointerEvents, type DisplayObjectPointerEvents } from './interaction';

export type PixiNodeEvents = DisplayObjectPointerEvents;

/**
 * 单个节点的包装类：持有图形容器（nodeGfx）与标签容器（nodeLabelGfx），把 PIXI 的
 * 指针事件重新发射为带类型的事件，交由 PixiGraph 转发为 nodeClick / nodeMouseover 等。
 * 真正的绘制委托给 renderers/node.ts、renderers/nodeLabel.ts 的纯函数，自身只保存
 * 当前样式与 hover 状态。
 */
export class PixiNode extends EventEmitter<PixiNodeEvents> {
  nodeStyle: NodeStyle;
  readonly nodeGfx: Container; // 节点圆 + 描边 + 图标，加入 nodeLayer
  readonly nodeLabelGfx: Container; // 标签文本 + 背景，加入 nodeLabelLayer

  hovered = false;

  constructor(option: { nodeStyle: NodeStyle }) {
    super();
    this.nodeStyle = option.nodeStyle;
    this.nodeGfx = this.createNodeContainer();
    this.nodeLabelGfx = this.createNodeLabelContainer();
  }

  private bindInteraction(gfx: Container): void {
    bindPointerEvents(gfx, this.emit.bind(this));
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
    this.nodeStyle = nodeStyle;
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

  destroy(): void {
    this.removeAllListeners();
    this.nodeGfx.destroy({ children: true });
    this.nodeLabelGfx.destroy({ children: true });
  }
}
