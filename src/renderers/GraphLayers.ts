import { Container, Graphics } from 'pixi.js';

export class GraphLayers {
  readonly fastEdgeLayer = new Graphics();
  readonly edgeLayer = this.createCullableLayer();
  readonly edgeLabelLayer = this.createCullableLayer();
  readonly nodeLabelLayer = this.createCullableLayer();
  readonly nodeLayer = this.createCullableLayer();
  readonly watermarkLayer = new Container();

  attachToViewport(viewport: Pick<Container, 'addChild'>): void {
    this.fastEdgeLayer.renderable = false;
    viewport.addChild(this.fastEdgeLayer, this.edgeLayer, this.edgeLabelLayer, this.nodeLabelLayer, this.nodeLayer);
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
