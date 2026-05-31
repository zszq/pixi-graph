import { Container, ParticleContainer } from 'pixi.js';
import type { BatchEdgeLayer } from './BatchEdgeLayer';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

export class GraphLayers {
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
  readonly edgeLayer = this.createCullableLayer();
  batchEdgeLayer: BatchEdgeLayer<BaseNodeAttributes, BaseEdgeAttributes> | undefined;
  private batchEdgesEnabled = false;
  readonly edgeLabelLayer = this.createCullableLayer();
  readonly nodeLabelLayer = this.createCullableLayer();
  readonly nodeLayer = this.createCullableLayer();
  readonly watermarkLayer = new Container();

  attachToViewport(viewport: Pick<Container, 'addChild'>): void {
    this.fastNodeLayer.renderable = false;
    this.fastNodeLayer.eventMode = 'none';
    viewport.addChild(this.edgeLayer, this.edgeLabelLayer, this.nodeLabelLayer, this.fastNodeLayer, this.nodeLayer);
  }

  attachWatermarkLayer(stage: Pick<Container, 'addChildAt'>): void {
    stage.addChildAt(this.watermarkLayer, 0);
  }

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

  private createCullableLayer(): Container {
    const layer = new Container();
    layer.cullableChildren = true;
    return layer;
  }
}
