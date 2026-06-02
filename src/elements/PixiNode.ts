import { Container, type PointData } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createNode, updateNodeStyle, updateNodeVisibility } from '../renderers/node';
import { createNodeLabel, updateNodeLabelStyle, updateNodeLabelVisibility } from '../renderers/nodeLabel';
import { LABEL_ZOOM_STEP } from '../core/constants';
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

  // 性能优化⑤：标签样式延迟烘焙——待执行闭包与“标签当前是否可见”状态
  private pendingLabelStyle: (() => void) | null = null;
  private labelVisible = false;

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
    // ━━ 性能优化⑤｜延迟生成节点标签纹理 ━━
    // 标签仅在放大(zoomStep>=LABEL_ZOOM_STEP)且在屏时才需要。创建时为数万个不可见标签
    // 逐个烘焙文本纹理是巨大浪费（实测 5 万点 create 31s→2.6s）。这里把标签样式存为待执行
    // 闭包，待 updateVisibility 判定标签将显示时再按需烘焙；若标签当前就可见则立即烘焙
    // （覆盖放大状态下的样式变更）。
    this.pendingLabelStyle = () => updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
    if (this.labelVisible) this.bakeLabelIfPending();
  }

  private bakeLabelIfPending(): void {
    if (!this.pendingLabelStyle) return;
    const bake = this.pendingLabelStyle;
    this.pendingLabelStyle = null;
    bake();
  }

  /** 强制立即烘焙延迟的标签纹理（性能优化⑤）。用于整图导出(uncull→extract)等需要全部标签的场景。 */
  ensureLabelBaked(): void {
    this.bakeLabelIfPending();
  }

  updateAlpha(nodeStyle: NodeStyle): void {
    this.nodeGfx.alpha = nodeStyle.alpha;
    this.nodeLabelGfx.alpha = nodeStyle.alpha;
  }

  updateVisibility(zoomStep: number): void {
    // 标签将显示且节点在屏时，按需烘焙之前延迟的标签纹理（性能优化⑤）。culled 标志由剔除
    // 阶段在本次调用前刷新，故只为可见节点烘焙，避免一次性烘焙数万个屏外标签。
    this.labelVisible = zoomStep >= LABEL_ZOOM_STEP && !this.nodeGfx.culled;
    if (this.labelVisible) this.bakeLabelIfPending();
    updateNodeVisibility(this.nodeGfx, zoomStep);
    updateNodeLabelVisibility(this.nodeLabelGfx, zoomStep);
  }

  setDetailsRenderable(renderable: boolean): void {
    if (this.nodeGfx.children[1]) this.nodeGfx.children[1].renderable = renderable;
    if (this.nodeGfx.children[2]) this.nodeGfx.children[2].renderable = renderable;
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
