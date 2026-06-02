import { Application, Point } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'eventemitter3';
import type { AbstractGraph } from 'graphology-types';

import { WORLD_PADDING } from './core/constants';
import type { GraphOptions, PixiGraphEvents, HighPerformanceThreshold } from './core/types';
import type { GraphStyleDefinition } from './style/style';
import { isInteger } from './utils/validate';
import { TextureCache } from './textures/TextureCache';
import type { PixiNode } from './elements/PixiNode';
import type { PixiEdge } from './elements/PixiEdge';
import type { WatermarkOption } from './features/watermark/watermark';
import { BoxSelectViewport, BoxSelectDom, type SelectionResult } from './features/selection';
import type { BaseNodeAttributes, BaseEdgeAttributes } from './types/attributes';
import { computeGraphBounds } from './core/graphBounds';
import { SpaceDragController } from './features/spaceDrag/SpaceDragController';
import { EventSubscriptions } from './core/EventSubscriptions';
import { GraphLayers } from './renderers/GraphLayers';
import { BatchEdgeLayer } from './renderers/BatchEdgeLayer';
import { ViewportInteractionController } from './controllers/ViewportInteractionController';
import { GraphRenderController } from './controllers/GraphRenderController';
import { GraphMutationController } from './controllers/GraphMutationController';
import { GraphEventController } from './controllers/GraphEventController';
import { NodeDragController } from './controllers/NodeDragController';

type SelectionCallback = (selection: SelectionResult) => void;
type SelectionStateCallback = (active: boolean) => void;

/**
 * 库的核心类：把一张 Graphology 图渲染到 PIXI 画布上，并维护两者的同步。
 *
 * 职责：持有 PIXI Application、pixi-viewport 的 Viewport（平移/缩放）与 Culler（剔除）；
 * 订阅图的增删改事件，将变更映射到对应的 PixiNode / PixiEdge 渲染对象（见两张 key→对象 Map）；
 * 转发指针交互为类型化事件（nodeClick、edgeMouseover 等）；按缩放档位做 LOD 与高性能模式切换。
 *
 * 由于 PIXI v8 渲染器异步初始化，请用 `await PixiGraph.create(options)` 构造，或在
 * `new` 之后 `await instance.ready`；在 ready 兑现前 viewport、textureCache 等字段尚未就绪。
 */
export class PixiGraph<
  NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes,
  EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes
> extends EventEmitter<PixiGraphEvents> {
  readonly container: HTMLElement;
  readonly graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  highPerformance?: HighPerformanceThreshold;
  readonly spaceDrag: boolean;
  readonly dragOffset: boolean;
  readonly minScale: number;
  readonly maxScale: number;

  /** Resolves once the async PIXI renderer is initialized and the graph drawn. */
  readonly ready: Promise<this>;

  viewport!: Viewport;
  choose?: BoxSelectDom;

  private app: Application;
  private textureCache!: TextureCache;
  private resizeObserver!: ResizeObserver;

  private readonly layers = new GraphLayers();
  private renderController!: GraphRenderController;
  private mutationController!: GraphMutationController<NodeAttributes, EdgeAttributes>;
  private graphEventController!: GraphEventController<NodeAttributes, EdgeAttributes>;
  private nodeDragController!: NodeDragController<NodeAttributes, EdgeAttributes>;

  // 图 key → 渲染对象，事件处理与样式刷新都靠它定位对应元素。
  private readonly nodeKeyToNodeObject = new Map<string, PixiNode>();
  private readonly edgeKeyToEdgeObject = new Map<string, PixiEdge>();

  private highMode = false; // 图规模超过 highPerformance 阈值，交互时隐藏边/标签
  private performanceLayersHidden = false;
  private performanceRestoreTimer: number | undefined;
  private isCanvasTarget = false; // 指针当前是否落在画布上（用于 hover 穿透判断）

  private boxSelectViewport?: BoxSelectViewport;
  private spaceDragController?: SpaceDragController;
  private viewportInteraction?: ViewportInteractionController;
  private readonly suppressedNodeAttributeUpdates = new Set<string>();
  private readonly subscriptions = new EventSubscriptions();

  private readonly onDocumentPointerMoveBound = (event: PointerEvent) => {
    this.isCanvasTarget = event.target === this.app.canvas;
  };

  private readonly hidePerformanceLayersBound = this.hidePerformanceLayers.bind(this);
  private readonly showPerformanceLayersBound = this.showPerformanceLayers.bind(this);
  private readonly onViewportFrameEndBound = this.onViewportFrameEnd.bind(this);

  constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>) {
    super();

    if (!(options.container instanceof HTMLElement)) {
      throw new Error('container should be a HTMLElement');
    }

    this.container = options.container;
    this.graph = options.graph;
    this.style = options.style;
    this.hoverStyle = options.hoverStyle;
    this.highPerformance = options.highPerformance;
    this.spaceDrag = options.spaceDrag ?? false;
    this.dragOffset = options.dragOffset ?? false;
    this.minScale = options.minScale ?? 0.1;
    this.maxScale = options.maxScale ?? 2;

    this.app = new Application();
    this.ready = this.init();
  }

  /** Async factory — preferred over `new`, since PIXI v8 initializes the renderer asynchronously. */
  static async create<N extends BaseNodeAttributes = BaseNodeAttributes, E extends BaseEdgeAttributes = BaseEdgeAttributes>(options: GraphOptions<N, E>): Promise<PixiGraph<N, E>> {
    const instance = new PixiGraph(options);
    await instance.ready;
    return instance;
  }

  private async init(): Promise<this> {
    await this.app.init({
      resizeTo: this.container,
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      powerPreference: 'high-performance'
    });
    this.container.appendChild(this.app.canvas);
    (globalThis as Record<string, unknown>).__PIXI_APP__ = this.app; // PixiJS devtools

    this.textureCache = new TextureCache(this.app.renderer);

    this.viewport = new Viewport({
      screenWidth: this.container.clientWidth,
      screenHeight: this.container.clientHeight,
      worldWidth: this.container.clientWidth,
      worldHeight: this.container.clientHeight,
      events: this.app.renderer.events,
      disableOnContextMenu: true,
      passiveWheel: false
    })
      .drag({ mouseButtons: 'left', keyToPress: this.spaceDrag ? ['Space'] : null })
      .pinch()
      .wheel()
      .clampZoom({ minScale: this.minScale, maxScale: this.maxScale });
    if (this.spaceDrag) this.bindSpaceDrag();
    this.app.stage.addChild(this.viewport);

    this.layers.attachToViewport(this.viewport);
    this.layers.setBatchEdgeLayer(
      new BatchEdgeLayer({
        graph: this.graph,
        style: this.style,
        nodes: this.nodeKeyToNodeObject,
        edges: this.edgeKeyToEdgeObject
      }) as unknown as BatchEdgeLayer<BaseNodeAttributes, BaseEdgeAttributes>
    );
    this.layers.attachWatermarkLayer(this.app.stage);
    this.renderController = new GraphRenderController({
      app: this.app,
      container: this.container,
      viewport: this.viewport,
      layers: this.layers,
      nodes: this.nodeKeyToNodeObject,
      edges: this.edgeKeyToEdgeObject
    });
    this.mutationController = new GraphMutationController({
      graph: this.graph,
      style: this.style,
      hoverStyle: this.hoverStyle,
      textureCache: this.textureCache,
      layers: this.layers,
      nodes: this.nodeKeyToNodeObject,
      edges: this.edgeKeyToEdgeObject,
      emit: this.emit.bind(this),
      isCanvasTarget: () => this.isCanvasTarget,
      isViewportDragging: () => this.isViewportDragging(),
      shouldIgnoreNodeAttributeUpdate: nodeKey => this.suppressedNodeAttributeUpdates.has(nodeKey),
      startNodeDrag: (event, nodeKey, node) => this.nodeDragController.start(event, nodeKey, node),
      markSpatialIndexDirty: () => {
        this.renderController.markSpatialIndexDirty();
        this.renderController.markFastNodesDirty();
        this.renderController.markBatchEdgesDirty();
      },
      updateFastNodePosition: (nodeKey, position) => this.renderController.updateFastNodePosition(nodeKey, position),
      markBatchEdgesDirty: () => this.renderController.markBatchEdgesDirty(),
      updateBatchEdge: edgeKey => this.renderController.updateBatchEdge(edgeKey),
      shouldDeferConnectedEdgeUpdates: (_nodeKey, degree) => this.highMode && degree > 64
    });
    this.nodeDragController = new NodeDragController({
      graph: this.graph,
      viewport: this.viewport,
      container: this.container,
      dragOffset: this.dragOffset,
      emit: this.emit.bind(this),
      mutationController: this.mutationController,
      suppressedNodeAttributeUpdates: this.suppressedNodeAttributeUpdates,
      hidePerformanceLayers: this.hidePerformanceLayersBound,
      showPerformanceLayers: this.showPerformanceLayersBound,
      isHighMode: () => this.highMode
    });

    this.graphEventController = new GraphEventController({
      graph: this.graph,
      subscriptions: this.subscriptions,
      mutationController: this.mutationController,
      updateHighMode: () => {
        this.highMode = this.exceedsHighPerformance();
        this.renderController.setBatchEdgesEnabled(this.highMode);
      }
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.viewport.resize(this.container.clientWidth, this.container.clientHeight);
      this.updateGraphVisibility();
    });
    this.resizeObserver.observe(this.container);

    this.graphEventController.bind();
    this.bindViewportEvents();

    // ⚠️ PERF-CRITICAL（性能关键·改前必读，勿调换以下三步顺序）：
    //   createGraph → resetView(定位相机到 fit) → updateGraphVisibility(首次可见性更新)。
    //   why：updateGraphVisibility 必须在 resetView 把缩放定到最终 fit 档位之后才跑。若在此之前
    //   （初始 zoom=1、档位高于标签档）跑，优化⑤会把全部标签误判为可见而全量烘焙，create 退回
    //   到未优化的 ~31s（实测）。createGraph 内部已刻意不做首次可见性更新，就是为此。
    this.createGraph();
    this.resetView(this.graph.nodes());
    this.updateGraphVisibility();

    // ━━ 性能优化①｜viewport 渲染组（RenderGroup）━━ (tag: perf-v4-rendergroup)
    // ⚠️ PERF-CRITICAL（性能关键·勿删/勿前移）：把整个 viewport 标记为 PIXI v8 渲染组后，平移/缩放
    // 只更新该组的变换矩阵，不再逐帧重算其下数万个节点/边的世界变换。大图平移渲染降一个数量级
    // （实测 5 万点 ~120ms→~1ms/帧，约 47×），原理同 sigma.js“相机即 uniform”。这是整套高性能的
    // 基石，删除会让大图平移直接卡死。代价：变换变廉价，但可见性/结构变更仍需 O(子节点数) 重建
    // 指令——见优化③④的补偿。
    this.enableViewportRenderGroup();

    // Temporary workaround for hover passthrough until PIXI exposes a cleaner hook.
    document.addEventListener('pointermove', this.onDocumentPointerMoveBound);

    return this;
  }

  private bindViewportEvents(): void {
    this.viewportInteraction = new ViewportInteractionController({
      container: this.container,
      viewport: this.viewport,
      minScale: this.minScale,
      maxScale: this.maxScale,
      subscriptions: this.subscriptions,
      emitViewportClick: event => this.emit('viewportClick', event),
      emitViewportRightClick: event => this.emit('viewportRightClick', event),
      hidePerformanceLayers: this.hidePerformanceLayersBound,
      showPerformanceLayers: this.showPerformanceLayersBound
    });
    this.viewportInteraction.bind();
    this.subscriptions.add(this.viewport, 'frame-end', this.onViewportFrameEndBound);
  }

  // ⚠️ PERF-CRITICAL（性能关键·勿改成构造期直接 enableRenderGroup）：viewport 的 parentRenderGroup
  // 要等首次渲染把它并入 stage 的渲染组后才建立。在此之前调用 enableRenderGroup 会创建出未与父组
  // 链接的 renderGroup，随后被首帧渲染重置而失效（表现为优化①“没生效”、平移又变卡）。因此必须逐帧
  // 轮询等 parentRenderGroup 就绪后再启用，对初始化时机免疫。改动此处务必重新验证大图平移帧时。
  private enableViewportRenderGroup(attempts = 0): void {
    if (this.viewport.isRenderGroup) return;
    if (!this.viewport.parentRenderGroup) {
      if (attempts < 120) requestAnimationFrame(() => this.enableViewportRenderGroup(attempts + 1));
      return;
    }
    this.viewport.enableRenderGroup();
  }

  private createGraph(): void {
    this.graph.forEachNode((nodeKey, attributes) => this.mutationController.handleGraphNodeAdded({ key: nodeKey, attributes }));
    this.graph.forEachEdge((edgeKey, attributes, source, target) => this.mutationController.handleGraphEdgeAdded({ key: edgeKey, attributes, source, target }));
    this.highMode = this.exceedsHighPerformance();
    this.renderController.setBatchEdgesEnabled(this.highMode);
    // 可见性更新放到 resetView 把相机定位到最终 fit 缩放之后再做（见 init）。否则此处运行在
    // 初始 zoom=1（zoomStep 高于标签档位）、节点尚未被有效剔除的瞬态，会触发优化⑤把全部
    // 标签误判为“可见”而全量烘焙，使创建退回到未优化的耗时。
  }

  destroy(): void {
    document.removeEventListener('pointermove', this.onDocumentPointerMoveBound);
    this.subscriptions.clear();
    clearTimeout(this.performanceRestoreTimer);

    this.spaceDragController?.destroy();
    this.viewportInteraction?.destroy();
    this.nodeDragController?.destroy();
    this.boxSelectViewport?.destroy();
    this.choose?.destroy();
    this.mutationController.destroy();

    this.resizeObserver.disconnect();
    this.textureCache.destroy();
    this.viewport.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  }

  // 实例销毁开销大；外层一般复用实例并动态调用 resetView 重新定位
  resetView(nodes: string[]): void {
    const bounds = computeGraphBounds(this.graph, nodes);
    if (!bounds) {
      this.viewport.center = new Point(this.container.clientWidth / 2, this.container.clientHeight / 2);
      return;
    }

    const worldWidth = bounds.width + WORLD_PADDING * 2;
    const worldHeight = bounds.height + WORLD_PADDING * 2;

    this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);
    this.viewport.setZoom(1); // otherwise scale is 0 when initialized inside React useEffect
    this.viewport.center = bounds.center;
    this.viewport.fit(true);
  }

  // --- viewport interaction ------------------------------------------------

  private onViewportFrameEnd(): void {
    if (!this.viewport.dirty) return;
    // 视口拖拽时可能短暂停住（例如鼠标停顿），但不应在拖拽过程中自动恢复边/标签/icon，
    // 否则会在鼠标松开时再次恢复，造成两次闪动。和节点拖拽一样，把恢复时机统一放到鼠标弹起。
    if (this.highMode && !this.isViewportDragging()) this.deferPerformanceLayerRestore();
    this.updateGraphVisibility();
    this.viewport.dirty = false;
  }

  // --- visibility / culling ------------------------------------------------

  // viewport 标记 dirty（平移/缩放/resize）时运行：先剔除屏外元素，再把当前缩放映射到
  // 离散的 zoomStep 桶，逐个让节点/边按档位切换各部分可见性（LOD）。
  private updateGraphVisibility(): void {
    this.renderController.updateVisibility({ fastNodeCull: this.highMode && this.performanceLayersHidden, skipBatchEdges: this.highMode && this.performanceLayersHidden });
  }

  /** Mark every element on-screen again (used before a full-graph extract). */
  uncull(): void {
    this.restorePerformanceLayersNow();
    this.mutationController.flushScheduledEdgeUpdates();
    this.renderController.uncull();
  }

  // --- high performance mode ----------------------------------------------

  private hidePerformanceLayers(): void {
    if (!this.highMode) return;
    // 先无条件取消待恢复定时器：缩放/吸附结束会设一个 140ms 恢复定时器，若此后拖拽开始而本方法
    // 因“已隐藏”提前 return、未清掉它，定时器会在拖拽过程中 fire，把边/标签错误地恢复显示（拖拽
    // 期间本应保持高性能隐藏态）。故清除定时器要放在 performanceLayersHidden 的提前返回之前。
    clearTimeout(this.performanceRestoreTimer);
    this.performanceRestoreTimer = undefined;
    if (this.performanceLayersHidden) return;
    this.performanceLayersHidden = true;
    this.renderController.setInteractionEnabled(false);
    this.renderController.setFastNodesRenderable(true);
    if (this.renderController.nodesRenderable()) this.renderController.setNodesRenderable(false);
    if (this.renderController.edgesRenderable()) this.setEdgesRenderable(false);
    if (this.renderController.nodeLabelsRenderable()) this.setNodeLabelsRenderable(false);
    this.renderController.setNodeDetailsRenderable(false);
  }

  private showPerformanceLayers(): void {
    if (!this.highMode) return;
    this.deferPerformanceLayerRestore();
  }

  private restorePerformanceLayersNow(): void {
    if (!this.highMode || !this.performanceLayersHidden) return;
    // ⚠️ 拖拽（画布平移或节点拖拽）进行中绝不恢复细节层。缩放/吸附结束等"延迟 end 事件"可能在拖拽
    // 开始之后才触发，并经 deferPerformanceLayerRestore 安排一个恢复定时器；若该定时器在拖拽中
    // fire 就会让边/标签错误地在拖拽过程中冒出来。这里统一拦截，恢复改由 drag-end 的
    // showPerformanceLayers 兜底。这是覆盖所有路径的根本保险（zoomed-end / snap-end / snap-zoom-end…）。
    if (this.isViewportDragging() || this.nodeDragController?.isDragging()) {
      clearTimeout(this.performanceRestoreTimer);
      this.performanceRestoreTimer = undefined;
      return;
    }
    clearTimeout(this.performanceRestoreTimer);
    this.performanceRestoreTimer = undefined;
    this.mutationController.flushScheduledEdgeUpdates();
    this.performanceLayersHidden = false;
    this.renderController.setFastNodesRenderable(false);
    this.renderController.setNodesRenderable(true);
    this.renderController.refreshBatchEdges();
    this.setEdgesRenderable(true);
    // 性能优化④（见 GraphRenderController.applyLabelLayerLod）：标签整层按当前缩放档位开关，
    // 低缩放下整层关闭让渲染组跳过其下数万个标签容器的遍历，显著降低恢复时的指令重建成本。
    this.renderController.applyLabelLayerLod();
    this.renderController.setNodeDetailsRenderable(true);
    this.renderController.setInteractionEnabled(true);
    // 性能优化③（见 GraphRenderController.cullViewport）：细节层恢复可见后立即用快速空间剔除
    // 屏外对象。viewport 已是渲染组，若沿用隐藏期间的陈旧剔除标志，首个全细节帧会把大量屏外
    // 节点/标签纳入渲染组指令，造成数百 ms 卡顿（实测 5 万点松手曾 ~500ms）。
    this.renderController.cullViewport();
  }

  private deferPerformanceLayerRestore(): void {
    this.hidePerformanceLayers();
    clearTimeout(this.performanceRestoreTimer);
    this.performanceRestoreTimer = window.setTimeout(() => this.restorePerformanceLayersNow(), 140);
  }

  private exceedsHighPerformance(): boolean {
    if (!this.highPerformance) return false;
    const { nodeNumber, edgeNumber } = this.highPerformance;
    if (!isInteger(nodeNumber) || !isInteger(edgeNumber)) {
      console.error('highPerformance must be integers: { nodeNumber: number, edgeNumber: number }');
      return false;
    }
    return this.graph.order >= nodeNumber || this.graph.size >= edgeNumber;
  }

  // --- public controls -----------------------------------------------------

  private get zoomStepAmount(): number {
    return Math.min(this.viewport.worldWidth, this.viewport.worldHeight) / 10;
  }

  zoomIn(): void {
    this.viewport.zoom(-this.zoomStepAmount, true);
  }

  zoomOut(): void {
    this.viewport.zoom(this.zoomStepAmount, true);
  }

  setNodeVisible(nodeKey: string, visible: boolean): void {
    if (this.mutationController.isNodeVisible(nodeKey) !== undefined) this.mutationController.setNodeVisible(nodeKey, visible);
    else console.error(`node not found: ${nodeKey}`);
  }

  isNodeVisible(nodeKey: string): boolean | undefined {
    const visible = this.mutationController.isNodeVisible(nodeKey);
    if (visible !== undefined) return visible;
    console.error(`node not found: ${nodeKey}`);
    return undefined;
  }

  setEdgeVisible(edgeKey: string, visible: boolean): void {
    if (this.mutationController.isEdgeVisible(edgeKey) !== undefined) this.mutationController.setEdgeVisible(edgeKey, visible);
    else console.error(`edge not found: ${edgeKey}`);
  }

  isEdgeVisible(edgeKey: string): boolean | undefined {
    const visible = this.mutationController.isEdgeVisible(edgeKey);
    if (visible !== undefined) return visible;
    console.error(`edge not found: ${edgeKey}`);
    return undefined;
  }

  /** Export the current view as a base64 image. */
  extract(full = true, format: 'png' | 'jpg' | 'webp' = 'png', quality = 0.92): Promise<string> {
    this.restorePerformanceLayersNow();
    this.mutationController.flushScheduledEdgeUpdates();
    return this.renderController.extract(full, format, quality);
  }

  // --- watermark -----------------------------------------------------------

  createWatermark(option: WatermarkOption): string {
    return this.renderController.createWatermark(option);
  }

  removeWatermark(name: string): void {
    this.renderController.removeWatermark(name);
  }

  clearWatermark(): void {
    this.renderController.clearWatermark();
  }

  // --- renderable toggles --------------------------------------------------

  setEdgesRenderable(renderable: boolean): void {
    this.renderController.setEdgesRenderable(renderable);
  }

  setEdgeLabelsRenderable(renderable: boolean): void {
    this.renderController.setEdgeLabelsRenderable(renderable);
  }

  setNodeEdgesRenderable(nodeKey: string, renderable: boolean): void {
    this.mutationController.setNodeEdgesRenderable(nodeKey, renderable);
  }

  setNodeLabelsRenderable(renderable: boolean): void {
    this.renderController.setNodeLabelsRenderable(renderable);
  }

  // --- box selection -------------------------------------------------------

  /** Viewport-based box select; only effective together with `spaceDrag`. */
  enableAutoSelect(complete: SelectionCallback, lazy?: boolean, realTime?: boolean): void {
    if (!this.spaceDrag) return;
    this.boxSelectViewport = new BoxSelectViewport({
      graph: this.graph,
      stage: this.app.stage,
      viewport: this.viewport,
      isDragging: () => this.isViewportDragging(),
      onChange: realTime ? complete : null,
      onComplete: complete,
      lazy,
      realTime
    });
  }

  /** DOM-overlay box select; hold Shift then drag, or call `choose.open()`. */
  enableSelect(complete: SelectionCallback, lazy?: boolean, realTime?: boolean, onStateChange?: SelectionStateCallback): void {
    this.choose = new BoxSelectDom({
      container: this.container,
      graph: this.graph,
      viewport: this.viewport,
      onChange: realTime ? complete : null,
      onComplete: complete,
      onStateChange,
      lazy,
      realTime
    });
  }

  // --- space-to-pan helper -------------------------------------------------

  private bindSpaceDrag(): void {
    this.spaceDragController = new SpaceDragController({
      container: this.container,
      onActiveChange: active => {
        this.viewportInteraction?.setDragging(active);
        this.container.style.cursor = active ? 'grab' : 'default';
      }
    });
  }

  private isViewportDragging(): boolean {
    return this.viewportInteraction?.isDragging() ?? false;
  }
}
