import { Container, ParticleContainer } from 'pixi.js';
import type { BatchEdgeLayer } from './BatchEdgeLayer';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

/**
 * 显示层集合（what）：集中持有按 z 序排列的各显示层 Container，并提供成组切换可见性/可渲染的
 * 方法。加入 viewport 的顺序即叠放顺序（先加在底）：edge → edgeLabel → nodeLabel → fastNode →
 * node，故节点画在最上、边在最下。watermark 加在 stage（viewport 之外），不随平移缩放移动。
 *
 * why 分这么多层：把"边/边标签/节点标签/节点"拆成独立层，才能按缩放档位(LOD)或高性能模式整层
 * 开关 renderable（见 GraphRenderController），而不必逐个对象处理；分层也保证绘制顺序稳定。
 */
export class GraphLayers {
  // 高性能模式专用的"快速节点层"：所有节点压成一个 ParticleContainer（1 次绘制画全部节点）。
  // dynamicProperties 全 false=位置/颜色等视为静态，GPU 缓冲只上传一次，平移/缩放期间几乎零开销；
  // 拖动单个节点时再手动 update。用于大图交互期替代昂贵的逐节点 Container 渲染。
  readonly fastNodeLayer = new ParticleContainer({
    dynamicProperties: {
      position: false,
      rotation: false,
      vertex: false,
      uvs: false,
      color: false
    },
    roundPixels: true
  });
  // 普通边层：每条边是独立 Graphics（小图用，可交互/hover）。
  readonly edgeLayer = this.createCullableLayer();
  // 批量边层：把可见边压成粒子缓冲（大图用，见 BatchEdgeLayer）。与 edgeLayer 互斥启用。
  batchEdgeLayer: BatchEdgeLayer<BaseNodeAttributes, BaseEdgeAttributes> | undefined;
  private batchEdgesEnabled = false;
  readonly edgeLabelLayer = this.createCullableLayer();
  readonly nodeLabelLayer = this.createCullableLayer();
  readonly nodeLayer = this.createCullableLayer();
  // 水印层：加在 stage 而非 viewport，故固定在屏幕上、不随平移/缩放变化。
  readonly watermarkLayer = new Container();

  attachToViewport(viewport: Pick<Container, 'addChild'>): void {
    this.fastNodeLayer.renderable = false;
    this.fastNodeLayer.eventMode = 'none';
    viewport.addChild(this.edgeLayer, this.edgeLabelLayer, this.nodeLabelLayer, this.fastNodeLayer, this.nodeLayer);
  }

  attachWatermarkLayer(stage: Pick<Container, 'addChildAt'>): void {
    stage.addChildAt(this.watermarkLayer, 0);
  }

  // 切换"边"的可渲染。普通边层与批量边层互斥：同一时刻只渲染其中一个（由 batchEdgesEnabled 决定），
  // 避免同一批边被画两遍。边标签层始终跟随 renderable（它独立于普通/批量边）。
  setEdgesRenderable(renderable: boolean): void {
    this.edgeLayer.renderable = renderable && !this.batchEdgesEnabled;
    if (this.batchEdgeLayer) this.batchEdgeLayer.renderable = renderable && this.batchEdgesEnabled;
    this.edgeLabelLayer.renderable = renderable;
  }

  edgesRenderable(): boolean {
    return this.batchEdgesEnabled ? !!this.batchEdgeLayer?.renderable : this.edgeLayer.renderable;
  }

  setBatchEdgesEnabled(enabled: boolean): void {
    const wasRenderable = this.edgesRenderable() || this.edgeLayer.renderable || !!this.batchEdgeLayer?.renderable;
    this.batchEdgesEnabled = enabled && !!this.batchEdgeLayer;
    this.edgeLayer.renderable = wasRenderable && !this.batchEdgesEnabled;
    if (this.batchEdgeLayer) this.batchEdgeLayer.renderable = wasRenderable && this.batchEdgesEnabled;
  }

  isBatchEdgesEnabled(): boolean {
    return this.batchEdgesEnabled;
  }

  // 注入批量边层并把它插到普通边层正上方（紧邻同一 z 段），保证两者在同一绘制位置互换时视觉一致。
  setBatchEdgeLayer(batchEdgeLayer: BatchEdgeLayer<BaseNodeAttributes, BaseEdgeAttributes>): void {
    this.batchEdgeLayer = batchEdgeLayer;
    const edgeIndex = this.edgeLayer.parent?.getChildIndex(this.edgeLayer) ?? -1;
    if (edgeIndex >= 0) this.edgeLayer.parent?.addChildAt(batchEdgeLayer, edgeIndex + 1);
  }

  setEdgeLabelsRenderable(renderable: boolean): void {
    this.edgeLabelLayer.renderable = renderable;
  }

  setNodeLabelsRenderable(renderable: boolean): void {
    this.nodeLabelLayer.renderable = renderable;
  }

  setNodesRenderable(renderable: boolean): void {
    this.nodeLayer.renderable = renderable;
  }

  destroyWatermarks(): void {
    for (const watermark of this.watermarkLayer.removeChildren()) {
      watermark.destroy({ children: true });
    }
  }

  // 建一个开启子节点剔除的层：cullableChildren=true 让 PIXI Culler 能对该层子元素逐个按屏幕
  // 边界剔除（屏外不绘制），这是大图按视口剔除的前提。
  private createCullableLayer(): Container {
    const layer = new Container();
    layer.cullableChildren = true;
    return layer;
  }
}
