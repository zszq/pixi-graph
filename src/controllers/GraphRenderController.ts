import { Culler, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { ZOOM_STEPS } from '../core/constants';
import { makeWatermark, type WatermarkOption } from '../features/watermark/watermark';
import type { PixiEdge } from '../elements/PixiEdge';
import type { PixiNode } from '../elements/PixiNode';
import type { GraphLayers } from '../renderers/GraphLayers';

export interface GraphRenderControllerOptions {
  app: Application;
  container: HTMLElement;
  viewport: Viewport;
  layers: GraphLayers;
  nodes: Map<string, PixiNode>;
  edges: Map<string, PixiEdge>;
}

/**
 * Owns render-only concerns: culling, LOD visibility, layer renderability,
 * watermark lifecycle, and image extraction.
 */
export class GraphRenderController {
  private readonly app: Application;
  private readonly container: HTMLElement;
  private readonly viewport: Viewport;
  private readonly layers: GraphLayers;
  private readonly nodes: Map<string, PixiNode>;
  private readonly edges: Map<string, PixiEdge>;
  private lastZoomStep = -1;
  private watermarkCount = 0;

  constructor(options: GraphRenderControllerOptions) {
    this.app = options.app;
    this.container = options.container;
    this.viewport = options.viewport;
    this.layers = options.layers;
    this.nodes = options.nodes;
    this.edges = options.edges;
  }

  updateVisibility(): void {
    this.cull();

    const zoomStep = this.currentZoomStep();
    if (zoomStep === this.lastZoomStep) return;
    this.lastZoomStep = zoomStep;

    for (const node of this.nodes.values()) node.updateVisibility(zoomStep);
    for (const edge of this.edges.values()) edge.updateVisibility(zoomStep);
  }

  currentZoomStep(): number {
    const zoom = this.viewport.scaled;
    return ZOOM_STEPS.findIndex(step => zoom <= step);
  }

  uncull(): void {
    for (const node of this.nodes.values()) {
      node.nodeGfx.culled = false;
      node.nodeLabelGfx.culled = false;
    }
    for (const edge of this.edges.values()) {
      edge.edgeGfx.culled = false;
      edge.edgeArrowGfx.culled = false;
      edge.edgeLabelGfx.culled = false;
    }
  }

  extract(full = true, format: 'png' | 'jpg' | 'webp' = 'png', quality = 0.92): Promise<string> {
    if (full) this.uncull();
    return this.app.renderer.extract.base64({ target: this.viewport, format, quality });
  }

  createWatermark(option: WatermarkOption): string {
    const watermark = makeWatermark(this.container.clientWidth, this.container.clientHeight, option);
    const name = `watermark_${this.watermarkCount++}`;
    watermark.label = name;
    this.layers.watermarkLayer.addChild(watermark);
    return name;
  }

  removeWatermark(name: string): void {
    const watermark = this.layers.watermarkLayer.getChildByLabel(name);
    if (watermark) {
      this.layers.watermarkLayer.removeChild(watermark);
      watermark.destroy({ children: true });
    }
  }

  clearWatermark(): void {
    this.layers.destroyWatermarks();
  }

  setEdgesRenderable(renderable: boolean): void {
    this.layers.setEdgesRenderable(renderable);
  }

  setEdgeLabelsRenderable(renderable: boolean): void {
    this.layers.setEdgeLabelsRenderable(renderable);
  }

  setNodeLabelsRenderable(renderable: boolean): void {
    this.layers.setNodeLabelsRenderable(renderable);
  }

  edgesRenderable(): boolean {
    return this.layers.edgeLayer.renderable;
  }

  nodeLabelsRenderable(): boolean {
    return this.layers.nodeLabelLayer.renderable;
  }

  private cull(): void {
    Culler.shared.cull(this.viewport, this.app.renderer.screen);
  }
}
