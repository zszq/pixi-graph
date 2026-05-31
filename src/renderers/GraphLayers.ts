import { Container, ParticleContainer } from 'pixi.js';

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
    this.edgeLayer.renderable = renderable;
    this.edgeLabelLayer.renderable = renderable;
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
