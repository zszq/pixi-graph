import { Culler, Graphics, Particle, Texture, type Application, type PointData } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { LABEL_ZOOM_STEP, ZOOM_STEPS } from '../core/constants';
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
 * 负责纯渲染相关的事务：剔除、LOD 可见性、各层可渲染开关、水印生命周期与图像导出。
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
  private fastVisibleNodes = new Set<string>();
  // ━━ 性能优化⑧｜cull 可见集复用 ━━ (tag: perf-v8-pan-gc)
  // ⚠️ PERF-CRITICAL（性能关键·勿改回 new Set + O(n) 拷贝）：fastCullNodes 平移时每帧调用，复用下一帧
  // 可见集与查询缓冲、末尾交换引用，免去每帧 new Set/new Array 与 O(n) 拷贝的 GC 抖动。
  private nextVisibleNodes = new Set<string>();
  private readonly fastCullQueryBuffer: string[] = [];
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

    // ━━ 性能优化②｜隐藏态跳过逐对象 LOD 循环 ━━ (tag: perf-v4-rendergroup)
    // ⚠️ PERF-CRITICAL（性能关键·勿在此分支里跑逐对象 LOD 循环、勿在此更新 lastZoomStep）：
    // 高性能隐藏态下 node/edge/label 层均不渲染（只渲染 fast 节点层与批量边），对数万个节点/边逐个
    // 跑 LOD 可见性纯属浪费（实测 5 万点跨档位约 45ms 卡顿）。此处只更新批量边的 LOD 档位、跳过逐对象
    // 循环并提前返回。lastZoomStep 表示“逐对象 LOD 上次实际应用到的档位”，本分支没有应用 LOD，
    // 故不得更新它；隐藏期间档位若发生变化，由恢复路径的 invalidateLodIfZoomStepChanged 作废缓存，
    // 保证恢复后的第一个正常帧重跑完整 LOD 循环。
    if (options.fastNodeCull) {
      this.layers.batchEdgeLayer?.setZoomStep(zoomStep);
      if (!options.skipBatchEdges) this.rebuildBatchEdges();
      return;
    }

    // ━━ 性能优化④｜标签层按缩放档位整层开关 ━━ (tag: perf-v5-restore-lod)
    // 非隐藏态：标签整层按 LOD 档位开关。低于标签档位时所有标签本就逐个隐藏，这里直接把整层
    // renderable 置 false，让渲染组跳过其下数万个标签容器的遍历，省去无谓的指令重建开销。
    this.applyLabelLayerLod(zoomStep);

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
      // 整图导出前确保所有标签纹理已烘焙：懒加载(性能优化⑤)下未被访问到的标签尚未生成，
      // 否则导出的整图会缺失这些标签。仅在 uncull(导出等)这类刻意全量操作时才付出该代价。
      node.ensureLabelBaked();
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
    // 节点几何变/增删会改变边的空间分布，同时标脏边索引（边增删另由其 size 校验兜底）。
    this.layers.batchEdgeLayer?.markIndexDirty();
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
    // 拖拽逐帧改节点位置 → 边空间分布变，标脏边索引（仅置标志，很便宜；高性能拖拽期不 rebuild，
    // 松手恢复时才按新位置重建一次索引）。放在最前面，确保非高性能模式（无 fast 粒子）也能标脏。
    this.layers.batchEdgeLayer?.markIndexDirty();
    const particle = this.fastNodeParticles.get(nodeKey);
    if (!particle) return;
    particle.x = position.x;
    particle.y = position.y;
    // fastNodeLayer 把位置视为静态以换取更廉价的平移/缩放渲染，故拖拽某节点时
    // 需显式上传这一个改动的粒子。
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

  // ━━ 性能优化④｜标签层按缩放档位整层开关 ━━ (tag: perf-v5-restore-lod)
  // ⚠️ PERF-CRITICAL（性能关键·勿改成始终让标签层可见）：标签整层按 LOD 档位开关——低于 LABEL_ZOOM_STEP
  // 时把整层 renderable=false，让渲染组直接跳过其下数万个标签容器的遍历（配合优化③，5 万点恢复后首个
  // 细节帧渲染 ~346ms→~112ms）。若恒置 true，恢复/缩放时渲染组要遍历全部标签容器，卡顿回归。
  applyLabelLayerLod(zoomStep = this.currentZoomStep()): void {
    const showLabels = zoomStep >= LABEL_ZOOM_STEP;
    this.layers.setNodeLabelsRenderable(showLabels);
    this.layers.setEdgeLabelsRenderable(showLabels);
  }

  // 恢复高性能层后，刷新每条边的逐元素 LOD（边线 / 标签 / 箭头的 renderable）。
  // why：节点的逐元素 LOD 由 cullViewport→fastCullNodes 即时刷新，但边没有等价的逐元素刷新——
  // 隐藏态的 updateVisibility 提前返回不跑逐边循环，且刻意保留 lastZoomStep。若恢复时不补这一刷新，
  // 边标签/箭头的 renderable 会停留在隐藏前的旧档位，导致“缩放后边标签不显示、直到点击才出现”。
  // 仅在恢复时调用一次（非逐帧），O(E) 只做标志赋值，成本可忽略。
  refreshEdgeLod(zoomStep = this.currentZoomStep()): void {
    for (const edge of this.edges.values()) edge.updateVisibility(zoomStep);
  }

  // 恢复细节层后调用：若隐藏期间缩放档位变了，作废 LOD 档位缓存（置 -1）。
  // why：恢复路径只把边与“当前可见”的节点刷到新档位，屏外节点仍停留在 lastZoomStep 旧档位，
  // 此时 lastZoomStep 已不能代表全体对象的真实状态。若不作废，当缩放又回到隐藏前的旧档位
  // （典型：复位视图把相机拉回最小缩放 fit，而隐藏前正是从最小缩放开始放大的）时，
  // updateVisibility 的等值判断会误判“档位没变”而跳过完整 LOD 循环，使边线/节点图标
  // 停留在高档位的可见状态。档位未变时保留缓存——此时对象状态与缓存一致，作废只会让
  // 恢复后第一个脏帧白跑一次 O(N+E) 全量循环（5 万点约 45ms）。
  invalidateLodIfZoomStepChanged(zoomStep = this.currentZoomStep()): void {
    if (zoomStep !== this.lastZoomStep) this.lastZoomStep = -1;
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
    // 相机空闲后快速恢复。大图应在数帧内完成，而非让用户肉眼等待数秒。
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

  // ━━ 性能优化③｜恢复时快速空间剔除 ━━ (tag: perf-v5-restore-lod)
  // ⚠️ PERF-CRITICAL（性能关键·勿改回 this.cull() 全量 Culler、勿改成不剔除）：恢复高性能层时，细节层
  // 重新可见后必须立即剔除屏外节点/标签。渲染组下若沿用隐藏期间的陈旧剔除标志，首个全细节帧会把大量
  // 屏外对象纳入渲染组指令，造成数百 ms 卡顿。这里**必须用基于空间索引的快速剔除**（约 10ms）；实测
  // 改用全量 PIXI Culler 在 5 万点要上百 ms，反而让恢复更卡（曾从 ~270ms 恶化到 ~420ms）。
  cullViewport(): void {
    this.fastCullNodes();
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

    // 复用持久 Set：清空后从查询缓冲填入，避免每帧 new Set。
    const nextVisible = this.nextVisibleNodes;
    nextVisible.clear();
    this.spatialNodeIndex.queryInto(this.viewport.getVisibleBounds(), this.fastCullQueryBuffer);
    for (const key of this.fastCullQueryBuffer) nextVisible.add(key);

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

    // PERF-CRITICAL (tag: perf-v8-pan-gc)：交换引用（O(1)）——nextVisible 成为新的 fastVisibleNodes，
    // 旧集留作下帧复用。勿改回 fastVisibleNodes.clear()+逐个 add 拷贝。
    this.nextVisibleNodes = this.fastVisibleNodes;
    this.fastVisibleNodes = nextVisible;
  }
}
