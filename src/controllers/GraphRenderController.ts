import { Culler, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { ZOOM_STEPS } from '../core/constants';
import { makeWatermark, type WatermarkOption } from '../features/watermark/watermark';
import type { PixiEdge } from '../elements/PixiEdge';
import type { PixiNode } from '../elements/PixiNode';
import type { GraphLayers } from '../renderers/GraphLayers';
import { SpatialNodeIndex } from '../core/SpatialNodeIndex';

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
  private nodeDetailsRenderable = true;
  private nodeDetailsRestorePending = false;
  private nodeDetailsRestoreCursor = 0;
  private nodeDetailsRestoreList: PixiNode[] = [];
  private readonly spatialNodeIndex = new SpatialNodeIndex();
  private readonly fastVisibleNodes = new Set<string>();
  private fastVisibleInitialized = false;

  constructor(options: GraphRenderControllerOptions) {
    this.app = options.app;
    this.container = options.container;
    this.viewport = options.viewport;
    this.layers = options.layers;
    this.nodes = options.nodes;
    this.edges = options.edges;
  }

  updateVisibility(options: { fastNodeCull?: boolean; forceLod?: boolean } = {}): void {
    if (options.fastNodeCull) this.fastCullNodes();
    else this.cull();

    const zoomStep = this.currentZoomStep();
    if (!options.forceLod && zoomStep === this.lastZoomStep) return;
    this.lastZoomStep = zoomStep;

    for (const node of this.nodes.values()) {
      node.updateVisibility(zoomStep);
      if (!this.nodeDetailsRenderable) node.setDetailsRenderable(false);
    }
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

  markSpatialIndexDirty(): void {
    this.spatialNodeIndex.clear();
    this.fastVisibleNodes.clear();
    this.fastVisibleInitialized = false;
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

  setNodeDetailsRenderable(renderable: boolean): void {
    if (this.nodeDetailsRenderable === renderable && !this.nodeDetailsRestorePending) return;
    this.nodeDetailsRenderable = renderable;
    if (!renderable) {
      this.nodeDetailsRestorePending = false;
      this.nodeDetailsRestoreList = [];
      for (const node of this.nodes.values()) node.setDetailsRenderable(false);
      return;
    }
    this.nodeDetailsRestorePending = true;
    this.nodeDetailsRestoreCursor = 0;
    this.nodeDetailsRestoreList = Array.from(this.nodes.values());
    requestAnimationFrame(() => this.restoreNodeDetailsChunk());
  }

  edgesRenderable(): boolean {
    return this.layers.edgeLayer.renderable;
  }

  nodeLabelsRenderable(): boolean {
    return this.layers.nodeLabelLayer.renderable;
  }

  private restoreNodeDetailsChunk(): void {
    if (!this.nodeDetailsRestorePending) return;
    const nodes = this.nodeDetailsRestoreList;
    // Restore quickly after camera idle. Large graphs should finish in a few
    // frames rather than visibly waiting for seconds.
    const budget = this.nodes.size >= 50000 ? 12000 : 6000;
    const end = Math.min(nodes.length, this.nodeDetailsRestoreCursor + budget);
    const zoomStep = this.currentZoomStep();
    for (let i = this.nodeDetailsRestoreCursor; i < end; i += 1) {
      nodes[i].updateVisibility(zoomStep);
    }
    this.nodeDetailsRestoreCursor = end;
    if (this.nodeDetailsRestoreCursor < nodes.length) {
      requestAnimationFrame(() => this.restoreNodeDetailsChunk());
    } else {
      this.nodeDetailsRestorePending = false;
      this.nodeDetailsRestoreCursor = 0;
      this.nodeDetailsRestoreList = [];
    }
  }

  private cull(): void {
    Culler.shared.cull(this.viewport, this.app.renderer.screen);
    this.fastVisibleInitialized = false;
  }

  private fastCullNodes(): void {
    this.spatialNodeIndex.ensureFresh(this.nodes);
    if (!this.fastVisibleInitialized) {
      this.fastVisibleNodes.clear();
      for (const [key, node] of this.nodes) {
        if (!node.nodeGfx.culled) this.fastVisibleNodes.add(key);
      }
      this.fastVisibleInitialized = true;
    }

    const nextVisible = new Set(this.spatialNodeIndex.query(this.viewport.getVisibleBounds()));
    for (const key of this.fastVisibleNodes) {
      if (nextVisible.has(key)) continue;
      const node = this.nodes.get(key);
      if (!node) continue;
      node.nodeGfx.culled = true;
      node.nodeLabelGfx.culled = true;
    }
    for (const key of nextVisible) {
      const node = this.nodes.get(key);
      if (!node) continue;
      node.nodeGfx.culled = false;
      node.nodeLabelGfx.culled = false;
    }

    this.fastVisibleNodes.clear();
    for (const key of nextVisible) this.fastVisibleNodes.add(key);
  }
}
