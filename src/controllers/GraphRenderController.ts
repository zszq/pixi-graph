import { Culler, Graphics, Particle, Texture, type Application, type PointData } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { ZOOM_STEPS } from '../core/constants';
import { makeWatermark, type WatermarkOption } from '../features/watermark/watermark';
import type { PixiEdge } from '../elements/PixiEdge';
import type { PixiNode } from '../elements/PixiNode';
import type { GraphLayers } from '../renderers/GraphLayers';
import { SpatialNodeIndex } from '../core/SpatialNodeIndex';
import { colorToPixi } from '../utils/color';

const FAST_NODE_TEXTURE_SIZE = 32;

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
  private interactionDisabled = false;
  private fastNodesDirty = true;
  private fastNodeTexture: Texture | undefined;
  private readonly fastNodeParticles = new Map<string, Particle>();

  constructor(options: GraphRenderControllerOptions) {
    this.app = options.app;
    this.container = options.container;
    this.viewport = options.viewport;
    this.layers = options.layers;
    this.nodes = options.nodes;
    this.edges = options.edges;
  }

  updateVisibility(options: { fastNodeCull?: boolean; forceLod?: boolean; skipBatchEdges?: boolean } = {}): void {
    if (options.fastNodeCull) this.fastCullNodes();
    else this.cull();

    const zoomStep = this.currentZoomStep();

    // 高性能隐藏态：node/edge/label 层均不渲染（只渲染 fast 节点层与批量边），对数万个
    // 节点/边逐个跑 LOD 可见性纯属浪费（实测 5万点跨档位约 45ms）。此处只更新批量边的
    // LOD 档位，跳过逐对象循环，并保持 lastZoomStep 不变——使恢复后的第一个正常帧重新
    // 跑一次完整 LOD 循环，补上隐藏期间的档位变化。
    if (options.fastNodeCull) {
      this.layers.batchEdgeLayer?.setZoomStep(zoomStep);
      if (!options.skipBatchEdges) this.rebuildBatchEdges();
      return;
    }

    if (!options.forceLod && zoomStep === this.lastZoomStep) {
      if (!options.skipBatchEdges) this.rebuildBatchEdges();
      return;
    }
    this.lastZoomStep = zoomStep;
    this.layers.batchEdgeLayer?.setZoomStep(zoomStep);

    for (const node of this.nodes.values()) {
      node.updateVisibility(zoomStep);
      if (!this.nodeDetailsRenderable) node.setDetailsRenderable(false);
    }
    for (const edge of this.edges.values()) edge.updateVisibility(zoomStep);
    if (!options.skipBatchEdges) this.rebuildBatchEdges();
  }

  refreshBatchEdges(): void {
    this.rebuildBatchEdges();
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
    this.fastNodesDirty = true;
  }

  setEdgesRenderable(renderable: boolean): void {
    if (renderable) this.rebuildBatchEdges();
    this.layers.setEdgesRenderable(renderable);
  }

  setBatchEdgesEnabled(enabled: boolean): void {
    this.layers.setBatchEdgesEnabled(enabled);
    if (enabled) this.rebuildBatchEdges();
  }

  markBatchEdgesDirty(): void {
    this.layers.batchEdgeLayer?.markDirty();
  }

  updateBatchEdge(edgeKey: string): void {
    this.layers.batchEdgeLayer?.updateEdge(edgeKey);
  }

  setNodesRenderable(renderable: boolean): void {
    this.layers.setNodesRenderable(renderable);
  }

  setFastNodesRenderable(renderable: boolean): void {
    if (renderable && this.fastNodesDirty) this.rebuildFastNodes();
    this.layers.fastNodeLayer.renderable = renderable;
  }

  updateFastNodePosition(nodeKey: string, position: PointData): void {
    const particle = this.fastNodeParticles.get(nodeKey);
    if (!particle) return;
    particle.x = position.x;
    particle.y = position.y;
    // fastNodeLayer keeps positions static for cheaper pan/zoom rendering, so
    // explicitly upload the one changed particle when a node is dragged.
    this.layers.fastNodeLayer.update();
  }

  markFastNodesDirty(): void {
    this.fastNodesDirty = true;
  }

  setInteractionEnabled(enabled: boolean): void {
    if (this.interactionDisabled === !enabled) return;
    this.interactionDisabled = !enabled;
    const eventMode = enabled ? 'static' : 'none';
    for (const node of this.nodes.values()) node.nodeGfx.eventMode = eventMode;
    for (const edge of this.edges.values()) {
      edge.edgeGfx.eventMode = eventMode;
      edge.edgeArrowGfx.eventMode = eventMode;
      edge.edgeLabelGfx.eventMode = eventMode;
    }
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
    this.nodeDetailsRestoreList = this.buildVisibleNodeDetailsRestoreList();
    requestAnimationFrame(() => this.restoreNodeDetailsChunk());
  }

  edgesRenderable(): boolean {
    return this.layers.edgesRenderable();
  }

  nodeLabelsRenderable(): boolean {
    return this.layers.nodeLabelLayer.renderable;
  }

  nodesRenderable(): boolean {
    return this.layers.nodeLayer.renderable;
  }

  private rebuildBatchEdges(): void {
    if (!this.layers.isBatchEdgesEnabled()) return;
    this.layers.batchEdgeLayer?.rebuild(this.app.renderer, this.viewport.getVisibleBounds());
  }

  private rebuildFastNodes(): void {
    const particles = this.layers.fastNodeLayer.particleChildren as Particle[];
    particles.length = 0;
    this.fastNodeParticles.clear();
    const texture = this.getFastNodeTexture();

    for (const [nodeKey, node] of this.nodes) {
      const style = node.nodeStyle;
      const [tint, colorAlpha] = colorToPixi(style.color);
      const diameter = Math.max(1, style.size * 2);
      const scale = diameter / FAST_NODE_TEXTURE_SIZE;
      const particle = new Particle({
        texture,
        x: node.nodeGfx.x,
        y: node.nodeGfx.y,
        scaleX: scale,
        scaleY: scale,
        anchorX: 0.5,
        anchorY: 0.5,
        tint,
        alpha: colorAlpha * style.alpha
      });
      particles.push(particle);
      this.fastNodeParticles.set(nodeKey, particle);
    }

    this.layers.fastNodeLayer.update();
    this.fastNodesDirty = false;
  }

  private getFastNodeTexture(): Texture {
    if (this.fastNodeTexture) return this.fastNodeTexture;
    const radius = FAST_NODE_TEXTURE_SIZE / 2;
    const graphics = new Graphics().circle(radius, radius, radius).fill(0xffffff);
    this.fastNodeTexture = this.app.renderer.generateTexture({ target: graphics });
    graphics.destroy();
    return this.fastNodeTexture;
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

  private buildVisibleNodeDetailsRestoreList(): PixiNode[] {
    this.spatialNodeIndex.ensureFresh(this.nodes);
    const visibleNodes: PixiNode[] = [];
    for (const nodeKey of this.spatialNodeIndex.query(this.viewport.getVisibleBounds(), 0)) {
      const node = this.nodes.get(nodeKey);
      if (node) visibleNodes.push(node);
    }
    return visibleNodes;
  }

  private cull(): void {
    Culler.shared.cull(this.viewport, this.app.renderer.screen);
    this.fastVisibleInitialized = false;
  }

  private fastCullNodes(): void {
    this.spatialNodeIndex.ensureFresh(this.nodes);
    const zoomStep = this.currentZoomStep();
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
      if (this.nodeDetailsRenderable) node.updateVisibility(zoomStep);
    }

    this.fastVisibleNodes.clear();
    for (const key of nextVisible) this.fastVisibleNodes.add(key);
  }
}
