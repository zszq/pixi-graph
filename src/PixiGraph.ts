import { Application, Container, Culler, Point, type FederatedPointerEvent, type PointData } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'eventemitter3';
import type { AbstractGraph } from 'graphology-types';

import { DEFAULT_STYLE, WORLD_PADDING, VIEWPORT_CLICK_VALID_TIME, ZOOM_STEPS } from './core/constants';
import type { GraphOptions, PixiGraphEvents, HighPerformanceThreshold } from './core/types';
import { resolveStyleDefinitions, type GraphStyleDefinition } from './style/style';
import { isInteger } from './utils/validate';
import { TextureCache } from './textures/TextureCache';
import { PixiNode } from './elements/PixiNode';
import { PixiEdge } from './elements/PixiEdge';
import { makeWatermark, type WatermarkOption } from './features/watermark/watermark';
import { BoxSelectViewport, BoxSelectDom, type SelectionResult } from './features/selection';
import type { BaseNodeAttributes, BaseEdgeAttributes } from './types/attributes';

type SelectionCallback = (selection: SelectionResult) => void;

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

  // 四个独立显示层，按 z 序加入 viewport（边 → 边标签 → 节点标签 → 节点）。
  private edgeLayer!: Container;
  private edgeLabelLayer!: Container;
  private nodeLayer!: Container;
  private nodeLabelLayer!: Container;
  private watermarkLayer!: Container; // 加在 stage 而非 viewport，故不随平移/缩放
  private watermarkCount = 0;

  // 图 key → 渲染对象，事件处理与样式刷新都靠它定位对应元素。
  private readonly nodeKeyToNodeObject = new Map<string, PixiNode>();
  private readonly edgeKeyToEdgeObject = new Map<string, PixiEdge>();

  private mousedownNodeKey: string | null = null; // 当前正被拖拽的节点 key
  private isDragging = false;
  private highMode = false; // 图规模超过 highPerformance 阈值，交互时隐藏边/标签
  // 记录节点按下/抬起的屏幕坐标，用于判定是「点击」还是「拖拽」（起止一致才算点击）。
  private nodeMouseStartX = 0;
  private nodeMouseStartY = 0;
  private nodeMouseEndX = 0;
  private nodeMouseEndY = 0;
  private edgeMouseX = 0; // 同上，用于边的点击/拖拽判定
  private edgeMouseY = 0;
  private nodeMouseOffsetX = 0; // dragOffset 模式下光标相对节点中心的偏移
  private nodeMouseOffsetY = 0;
  private viewportClickStartTime = 0; // 空白处按下时刻，配合 VIEWPORT_CLICK_VALID_TIME 区分点击/拖拽
  private viewportClickTimer: number | undefined;
  private isViewportDragged = false;
  private isCanvasTarget = false; // 指针当前是否落在画布上（用于 hover 穿透判断）

  private boxSelectViewport?: BoxSelectViewport;

  // 事件处理器在字段初始化时一次性预绑定，使 on/off 用的是同一引用，destroy 时才能精确注销。
  private readonly onGraphNodeAddedBound = this.onGraphNodeAdded.bind(this);
  private readonly onGraphEdgeAddedBound = this.onGraphEdgeAdded.bind(this);
  private readonly onGraphNodeDroppedBound = this.onGraphNodeDropped.bind(this);
  private readonly onGraphEdgeDroppedBound = this.onGraphEdgeDropped.bind(this);
  private readonly onGraphClearedBound = this.onGraphCleared.bind(this);
  private readonly onGraphEdgesClearedBound = this.onGraphEdgesCleared.bind(this);
  private readonly onGraphNodeAttributesUpdatedBound = this.onGraphNodeAttributesUpdated.bind(this);
  private readonly onGraphEdgeAttributesUpdatedBound = this.onGraphEdgeAttributesUpdated.bind(this);
  private readonly onGraphEachNodeAttributesUpdatedBound = this.onGraphEachNodeAttributesUpdated.bind(this);
  private readonly onGraphEachEdgeAttributesUpdatedBound = this.onGraphEachEdgeAttributesUpdated.bind(this);
  private readonly onDocumentMouseMoveBound = this.onDocumentMouseMove.bind(this);
  private readonly onDocumentPointerMoveBound = (event: PointerEvent) => {
    this.isCanvasTarget = event.target === this.app.canvas;
  };

  private readonly onViewportDragStartBound = this.onViewportDragStart.bind(this);
  private readonly onViewportDragEndBound = this.onViewportDragEnd.bind(this);
  private readonly onViewportZoomedBound = this.onViewportZoomed.bind(this);
  private readonly onViewportZoomedEndBound = this.onViewportZoomedEnd.bind(this);
  private readonly hidePerformanceLayersBound = this.hidePerformanceLayers.bind(this);
  private readonly showPerformanceLayersBound = this.showPerformanceLayers.bind(this);
  private readonly onViewportClickedBound = this.onViewportClicked.bind(this);
  private readonly onViewportMousedownBound = this.onViewportMousedown.bind(this);
  private readonly onViewportMouseupBound = this.onViewportMouseup.bind(this);

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

    this.edgeLayer = new Container();
    this.edgeLabelLayer = new Container();
    this.nodeLabelLayer = new Container();
    this.nodeLayer = new Container();
    this.viewport.addChild(this.edgeLayer, this.edgeLabelLayer, this.nodeLabelLayer, this.nodeLayer);

    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.viewport.resize(this.container.clientWidth, this.container.clientHeight);
      this.updateGraphVisibility();
    });
    this.resizeObserver.observe(this.container);

    this.viewport.on('frame-end', () => {
      if (this.viewport.dirty) {
        this.updateGraphVisibility();
        this.viewport.dirty = false;
      }
    });

    this.bindGraphEvents();
    this.bindViewportEvents();

    this.createGraph();
    this.resetView(this.graph.nodes());

    this.watermarkLayer = new Container();
    this.app.stage.addChildAt(this.watermarkLayer, 0);

    // Temporary workaround for hover passthrough until PIXI exposes a cleaner hook.
    document.addEventListener('pointermove', this.onDocumentPointerMoveBound);

    return this;
  }

  private bindGraphEvents(): void {
    this.graph.on('nodeAdded', this.onGraphNodeAddedBound);
    this.graph.on('nodeDropped', this.onGraphNodeDroppedBound);
    this.graph.on('edgeAdded', this.onGraphEdgeAddedBound);
    this.graph.on('edgeDropped', this.onGraphEdgeDroppedBound);
    this.graph.on('cleared', this.onGraphClearedBound);
    this.graph.on('edgesCleared', this.onGraphEdgesClearedBound);
    this.graph.on('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
    this.graph.on('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
    this.graph.on('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
    this.graph.on('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);
  }

  private bindViewportEvents(): void {
    this.viewport.on('drag-start', this.onViewportDragStartBound);
    this.viewport.on('drag-end', this.onViewportDragEndBound);
    this.viewport.on('zoomed', this.onViewportZoomedBound);
    this.viewport.on('zoomed-end', this.onViewportZoomedEndBound);
    this.viewport.on('snap-start', this.hidePerformanceLayersBound);
    this.viewport.on('snap-end', this.showPerformanceLayersBound);
    this.viewport.on('snap-zoom-start', this.hidePerformanceLayersBound);
    this.viewport.on('snap-zoom-end', this.showPerformanceLayersBound);
    // pixi-viewport types `clicked` more loosely than our handler; cast is safe
    this.viewport.on('clicked', this.onViewportClickedBound as never);
    this.viewport.on('mousedown', this.onViewportMousedownBound);
    this.viewport.on('mouseup', this.onViewportMouseupBound);
  }

  private createGraph(): void {
    this.graph.forEachNode(this.createNode.bind(this));
    this.graph.forEachEdge(this.createEdge.bind(this));
    this.highMode = this.exceedsHighPerformance();
  }

  destroy(): void {
    this.graph.off('nodeAdded', this.onGraphNodeAddedBound);
    this.graph.off('nodeDropped', this.onGraphNodeDroppedBound);
    this.graph.off('edgeAdded', this.onGraphEdgeAddedBound);
    this.graph.off('edgeDropped', this.onGraphEdgeDroppedBound);
    this.graph.off('cleared', this.onGraphClearedBound);
    this.graph.off('edgesCleared', this.onGraphEdgesClearedBound);
    this.graph.off('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
    this.graph.off('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
    this.graph.off('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
    this.graph.off('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);

    document.removeEventListener('pointermove', this.onDocumentPointerMoveBound);
    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);

    this.boxSelectViewport?.destroy();
    this.choose?.destroy();

    this.resizeObserver.disconnect();
    this.textureCache.destroy();
    this.viewport.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  }

  // 实例销毁开销大；外层一般复用实例并动态调用 resetView 重新定位
  resetView(nodes: string[]): void {
    if (!nodes.length) {
      this.viewport.center = new Point(this.container.clientWidth / 2, this.container.clientHeight / 2);
      return;
    }
    const nodesX = nodes.map(nodeKey => this.graph.getNodeAttribute(nodeKey, 'x') as number);
    const nodesY = nodes.map(nodeKey => this.graph.getNodeAttribute(nodeKey, 'y') as number);
    const minX = Math.min(...nodesX);
    const maxX = Math.max(...nodesX);
    const minY = Math.min(...nodesY);
    const maxY = Math.max(...nodesY);

    const graphWidth = Math.abs(maxX - minX);
    const graphHeight = Math.abs(maxY - minY);
    const graphCenter = new Point(minX + graphWidth / 2, minY + graphHeight / 2);

    const worldWidth = graphWidth + WORLD_PADDING * 2;
    const worldHeight = graphHeight + WORLD_PADDING * 2;

    this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);
    this.viewport.setZoom(1); // otherwise scale is 0 when initialized inside React useEffect
    this.viewport.center = graphCenter;
    this.viewport.fit(true);
  }

  // --- viewport interaction ------------------------------------------------

  private onViewportDragStart(): void {
    this.isDragging = true;
    this.isViewportDragged = true;
    clearTimeout(this.viewportClickTimer);
    this.container.style.cursor = 'grab';
    this.hidePerformanceLayers();
  }

  private onViewportDragEnd(): void {
    this.isDragging = false;
    this.container.style.cursor = 'default';
    this.showPerformanceLayers();
  }

  private onViewportZoomed(): void {
    const scaled = this.viewport.scaled;
    // zoomed fires past the clamp range while zoomed-end does not, so guard the range
    if (scaled > this.minScale && scaled < this.maxScale) {
      this.hidePerformanceLayers();
    }
  }

  private onViewportZoomedEnd(): void {
    this.showPerformanceLayers();
  }

  // pixi-viewport's `clicked` payload: { event: FederatedPointerEvent, screen, world, viewport }
  private onViewportClicked(event: { event: FederatedPointerEvent }): void {
    if (event.event.target !== this.viewport) return;
    const originalEvent = event.event.originalEvent as unknown as MouseEvent;
    if (originalEvent.button === 2) {
      this.emit('viewportRightClick', originalEvent);
    }
  }

  private onViewportMousedown(event: FederatedPointerEvent): void {
    if (event.target !== this.viewport) return;
    this.isViewportDragged = false;
    this.viewportClickStartTime = Date.now();
    this.viewportClickTimer = window.setTimeout(() => {
      this.container.style.cursor = 'grab';
    }, VIEWPORT_CLICK_VALID_TIME);
  }

  private onViewportMouseup(event: FederatedPointerEvent): void {
    clearTimeout(this.viewportClickTimer);
    if (event.target !== this.viewport) return;
    const elapsed = Date.now() - this.viewportClickStartTime;
    if (elapsed < VIEWPORT_CLICK_VALID_TIME && !this.isViewportDragged) {
      this.emit('viewportClick', event);
    }
    this.container.style.cursor = 'default';
  }

  // --- graph mutation handlers --------------------------------------------

  private onGraphNodeAdded(data: { key: string; attributes: NodeAttributes }): void {
    this.highMode = this.exceedsHighPerformance();
    this.createNode(data.key, data.attributes);
  }

  private onGraphNodeDropped(data: { key: string }): void {
    this.highMode = this.exceedsHighPerformance();
    this.dropNode(data.key);
  }

  private onGraphEdgeAdded(data: { key: string; attributes: EdgeAttributes; source: string; target: string }): void {
    this.highMode = this.exceedsHighPerformance();
    const sourceNodeAttributes = this.graph.getNodeAttributes(data.source);
    const targetNodeAttributes = this.graph.getNodeAttributes(data.target);
    this.createEdge(data.key, data.attributes, data.source, data.target, sourceNodeAttributes, targetNodeAttributes);
  }

  private onGraphEdgeDropped(data: { key: string }): void {
    this.highMode = this.exceedsHighPerformance();
    this.dropEdge(data.key);
  }

  private onGraphCleared(): void {
    this.highMode = this.exceedsHighPerformance();
    for (const key of this.edgeKeyToEdgeObject.keys()) this.dropEdge(key);
    for (const key of this.nodeKeyToNodeObject.keys()) this.dropNode(key);
  }

  private onGraphEdgesCleared(): void {
    this.highMode = this.exceedsHighPerformance();
    for (const key of this.edgeKeyToEdgeObject.keys()) this.dropEdge(key);
  }

  private onGraphNodeAttributesUpdated(data: { key: string }): void {
    this.updateNodeStyleByKey(data.key);
  }

  private onGraphEdgeAttributesUpdated(data: { key: string }): void {
    this.updateEdgeStyleByKey(data.key);
  }

  private onGraphEachNodeAttributesUpdated(): void {
    this.graph.forEachNode(this.updateNodeStyle.bind(this));
  }

  private onGraphEachEdgeAttributesUpdated(): void {
    this.graph.forEachEdge(this.updateEdgeStyleByKey.bind(this));
  }

  // --- hover ---------------------------------------------------------------

  private hoverNode(nodeKey: string): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (node.hovered) return;
    node.hovered = true;
    this.updateNodeStyleByKey(nodeKey);
    this.nodeLayer.setChildIndex(node.nodeGfx, this.nodeLayer.children.length - 1);
    this.nodeLabelLayer.setChildIndex(node.nodeLabelGfx, this.nodeLabelLayer.children.length - 1);
  }

  private unhoverNode(nodeKey: string): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (!node.hovered) return;
    node.hovered = false;
    this.updateNodeStyleByKey(nodeKey);
  }

  private hoverEdge(edgeKey: string): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (edge.hovered) return;
    edge.hovered = true;
    this.updateEdgeStyleByKey(edgeKey);
    this.edgeLayer.setChildIndex(edge.edgeGfx, this.edgeLayer.children.length - 1);
    this.edgeLayer.setChildIndex(edge.edgeArrowGfx, this.edgeLayer.children.length - 1);
    this.edgeLabelLayer.setChildIndex(edge.edgeLabelGfx, this.edgeLabelLayer.children.length - 1);
  }

  private unhoverEdge(edgeKey: string): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (!edge.hovered) return;
    edge.hovered = false;
    this.updateEdgeStyleByKey(edgeKey);
  }

  // --- node dragging -------------------------------------------------------

  private nodeMouseOffset(nodeKey: string, point: PointData): PointData {
    const { x: nodeX, y: nodeY } = this.graph.getNodeAttributes(nodeKey);
    return {
      x: point.x > nodeX ? point.x - this.nodeMouseOffsetX : point.x + this.nodeMouseOffsetX,
      y: point.y > nodeY ? point.y - this.nodeMouseOffsetY : point.y + this.nodeMouseOffsetY
    };
  }

  private moveNode(nodeKey: string, point: PointData, event: MouseEvent): void {
    const newPosition = this.dragOffset ? this.nodeMouseOffset(nodeKey, point) : point;
    this.graph.setNodeAttribute(nodeKey, 'x', newPosition.x);
    this.graph.setNodeAttribute(nodeKey, 'y', newPosition.y);

    this.updateNodeStyleByKey(nodeKey);
    this.hidePerformanceLayers();
    if (!this.highMode) this.graph.edges(nodeKey).forEach(edgeKey => this.updateEdgeStyleByKey(edgeKey));

    this.emit('nodeMove', event, nodeKey, newPosition);
  }

  private enableNodeDragging(event: MouseEvent, nodeKey: string, point: PointData): void {
    this.viewport.pause = true;
    document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
    document.addEventListener('mouseup', (e: MouseEvent) => this.onDocumentMouseUp(e, nodeKey), { once: true });
    this.emit('nodeMoveStart', event, nodeKey, point);
  }

  private onDocumentMouseMove(event: MouseEvent): void {
    const worldPosition = this.viewport.toWorld(new Point(event.offsetX, event.offsetY));
    if (this.mousedownNodeKey) {
      this.moveNode(this.mousedownNodeKey, worldPosition, event);
    }
  }

  private onDocumentMouseUp(event: MouseEvent, nodeKey: string): void {
    this.viewport.pause = false;
    this.showPerformanceLayers();
    if (this.highMode) this.graph.edges(nodeKey).forEach(edgeKey => this.updateEdgeStyleByKey(edgeKey));

    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
    this.mousedownNodeKey = null;

    const point = this.viewport.toWorld(new Point(event.offsetX, event.offsetY));
    this.emit('nodeMoveEnd', event, nodeKey, point);
  }

  // --- create / drop -------------------------------------------------------

  private createNode(nodeKey: string, nodeAttributes: NodeAttributes): void {
    const nodeStyle = resolveStyleDefinitions([DEFAULT_STYLE.node, this.style.node, undefined], nodeAttributes);
    const node = new PixiNode({ nodeStyle });

    node.on('mousemove', event => this.emit('nodeMousemove', event, nodeKey, nodeStyle));
    node.on('mouseover', event => {
      if (!this.isCanvasTarget) return;
      if (!this.mousedownNodeKey && !this.isDragging) {
        this.hoverNode(nodeKey);
        this.emit('nodeMouseover', event, nodeKey, nodeStyle);
      }
    });
    node.on('mouseout', event => {
      if (!this.mousedownNodeKey && !this.isDragging) {
        this.unhoverNode(nodeKey);
        this.emit('nodeMouseout', event, nodeKey, nodeStyle);
      }
    });
    node.on('mousedown', event => {
      const worldPosition = this.viewport.toWorld(new Point(event.offsetX, event.offsetY));
      this.nodeMouseOffsetX = Math.abs(node.nodeGfx.x - worldPosition.x);
      this.nodeMouseOffsetY = Math.abs(node.nodeGfx.y - worldPosition.y);
      this.nodeMouseStartX = event.offsetX;
      this.nodeMouseStartY = event.offsetY;
      this.mousedownNodeKey = nodeKey;
      this.enableNodeDragging(event, nodeKey, worldPosition);
      this.emit('nodeMousedown', event, nodeKey, nodeStyle);
    });
    node.on('mouseup', event => {
      this.nodeMouseEndX = event.offsetX;
      this.nodeMouseEndY = event.offsetY;
      this.emit('nodeMouseup', event, nodeKey, nodeStyle);
    });
    node.on('click', event => {
      if (this.nodeMouseStartX === this.nodeMouseEndX && this.nodeMouseStartY === this.nodeMouseEndY) {
        this.emit('nodeClick', event, nodeKey, nodeStyle);
      }
    });
    node.on('dbclick', event => {
      if (this.nodeMouseStartX === this.nodeMouseEndX && this.nodeMouseStartY === this.nodeMouseEndY) {
        this.emit('nodeDbclick', event, nodeKey, nodeStyle);
      }
    });
    node.on('rightclick', event => this.emit('nodeRightclick', event, nodeKey, nodeStyle));

    this.nodeLayer.addChild(node.nodeGfx);
    this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    this.nodeKeyToNodeObject.set(nodeKey, node);

    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private createEdge(
    edgeKey: string,
    edgeAttributes: EdgeAttributes,
    sourceNodeKey: string,
    targetNodeKey: string,
    sourceNodeAttributes: NodeAttributes,
    targetNodeAttributes: NodeAttributes
  ): void {
    const edgeStyle = resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, undefined], edgeAttributes);
    const selfLoop = sourceNodeKey === targetNodeKey;
    const edge = new PixiEdge({ selfLoop });

    edge.on('mousemove', event => this.emit('edgeMousemove', event, edgeKey, edgeStyle));
    edge.on('mouseover', event => {
      if (!this.isCanvasTarget) return;
      if (!this.mousedownNodeKey && !this.isDragging) {
        this.hoverEdge(edgeKey);
        this.emit('edgeMouseover', event, edgeKey, edgeStyle);
      }
    });
    edge.on('mouseout', event => {
      if (!this.mousedownNodeKey && !this.isDragging) {
        this.unhoverEdge(edgeKey);
        this.emit('edgeMouseout', event, edgeKey, edgeStyle);
      }
    });
    edge.on('mousedown', event => {
      this.edgeMouseX = event.offsetX;
      this.edgeMouseY = event.offsetY;
      this.emit('edgeMousedown', event, edgeKey, edgeStyle);
    });
    edge.on('mouseup', event => this.emit('edgeMouseup', event, edgeKey, edgeStyle));
    edge.on('click', event => {
      if (this.edgeMouseX === event.offsetX && this.edgeMouseY === event.offsetY) {
        this.emit('edgeClick', event, edgeKey, edgeStyle);
      }
    });
    edge.on('dbclick', event => {
      if (this.edgeMouseX === event.offsetX && this.edgeMouseY === event.offsetY) {
        this.emit('edgeDbclick', event, edgeKey, edgeStyle);
      }
    });
    edge.on('rightclick', event => this.emit('edgeRightclick', event, edgeKey, edgeStyle));

    this.edgeLayer.addChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.edgeLabelLayer.addChild(edge.edgeLabelGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);

    const parallelEdges = this.graph.edges(targetNodeKey, sourceNodeKey);
    if (parallelEdges.length > 1) {
      // mark parallel edges bilateral so their labels do not overlap
      parallelEdges.forEach(key => {
        const parallel = this.edgeKeyToEdgeObject.get(key);
        if (parallel) {
          parallel.isBilateral = true;
          this.updateEdgeStyleByKey(key);
        }
      });
    } else {
      this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
    }
  }

  private dropNode(nodeKey: string): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (!node) return;
    this.nodeLayer.removeChild(node.nodeGfx);
    this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
    this.nodeKeyToNodeObject.delete(nodeKey);
  }

  private dropEdge(edgeKey: string): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (!edge) return;
    this.edgeLayer.removeChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.edgeLabelLayer.removeChild(edge.edgeLabelGfx);
    this.edgeKeyToEdgeObject.delete(edgeKey);
  }

  // --- style updates -------------------------------------------------------

  private updateNodeStyleByKey(nodeKey: string): void {
    this.updateNodeStyle(nodeKey, this.graph.getNodeAttributes(nodeKey));
  }

  private updateNodeStyle(nodeKey: string, nodeAttributes: NodeAttributes): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    node.updatePosition({ x: nodeAttributes.x, y: nodeAttributes.y });

    const nodeStyle = resolveStyleDefinitions([DEFAULT_STYLE.node, this.style.node, node.hovered ? this.hoverStyle.node : undefined], nodeAttributes);
    node.updateStyle(nodeStyle, this.textureCache);
    node.updateAlpha(nodeStyle);
  }

  private updateEdgeStyleByKey(edgeKey: string): void {
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, this.graph.getNodeAttributes(sourceNodeKey), this.graph.getNodeAttributes(targetNodeKey));
  }

  private updateEdgeStyle(
    edgeKey: string,
    edgeAttributes: EdgeAttributes,
    sourceNodeKey: string,
    targetNodeKey: string,
    sourceNodeAttributes: NodeAttributes,
    targetNodeAttributes: NodeAttributes
  ): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    const sourceNode = this.nodeKeyToNodeObject.get(sourceNodeKey)!;
    const targetNode = this.nodeKeyToNodeObject.get(targetNodeKey)!;

    const edgeStyle = resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined], edgeAttributes);
    edge.updateStyle(edgeStyle, this.textureCache);

    const sourceNodeStyle = resolveStyleDefinitions([DEFAULT_STYLE.node, this.style.node, sourceNode.hovered ? this.hoverStyle.node : undefined], sourceNodeAttributes);
    const targetNodeStyle = resolveStyleDefinitions([DEFAULT_STYLE.node, this.style.node, targetNode.hovered ? this.hoverStyle.node : undefined], targetNodeAttributes);

    edge.updatePosition(
      { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y },
      { x: targetNodeAttributes.x, y: targetNodeAttributes.y },
      edgeStyle,
      sourceNodeStyle,
      targetNodeStyle
    );
    edge.updateAlpha(edgeStyle);
  }

  // --- visibility / culling ------------------------------------------------

  // viewport 标记 dirty（平移/缩放/resize）时运行：先剔除屏外元素，再把当前缩放映射到
  // 离散的 zoomStep 桶，逐个让节点/边按档位切换各部分可见性（LOD）。
  private updateGraphVisibility(): void {
    this.cull();

    const zoom = this.viewport.scaled;
    const zoomStep = ZOOM_STEPS.findIndex(step => zoom <= step);

    for (const node of this.nodeKeyToNodeObject.values()) node.updateVisibility(zoomStep);
    for (const edge of this.edgeKeyToEdgeObject.values()) edge.updateVisibility(zoomStep);
  }

  /** Cull off-screen elements using PIXI v8's built-in culler. */
  private cull(): void {
    Culler.shared.cull(this.viewport, this.app.renderer.screen);
  }

  /** Mark every element on-screen again (used before a full-graph extract). */
  uncull(): void {
    for (const node of this.nodeKeyToNodeObject.values()) {
      node.nodeGfx.culled = false;
      node.nodeLabelGfx.culled = false;
    }
    for (const edge of this.edgeKeyToEdgeObject.values()) {
      edge.edgeGfx.culled = false;
      edge.edgeArrowGfx.culled = false;
      edge.edgeLabelGfx.culled = false;
    }
  }

  // --- high performance mode ----------------------------------------------

  private hidePerformanceLayers(): void {
    if (!this.highMode) return;
    if (this.edgeLayer.renderable) this.setEdgesRenderable(false);
    if (this.nodeLabelLayer.renderable) this.setNodeLabelsRenderable(false);
  }

  private showPerformanceLayers(): void {
    if (!this.highMode) return;
    this.setEdgesRenderable(true);
    this.setNodeLabelsRenderable(true);
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
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node) node.setVisible(visible);
    else console.error(`node not found: ${nodeKey}`);
  }

  isNodeVisible(nodeKey: string): boolean | undefined {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node) return node.isVisible();
    console.error(`node not found: ${nodeKey}`);
    return undefined;
  }

  setEdgeVisible(edgeKey: string, visible: boolean): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (edge) edge.setVisible(visible);
    else console.error(`edge not found: ${edgeKey}`);
  }

  isEdgeVisible(edgeKey: string): boolean | undefined {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (edge) return edge.isVisible();
    console.error(`edge not found: ${edgeKey}`);
    return undefined;
  }

  /** Export the current view as a base64 image. */
  extract(full = true, format: 'png' | 'jpg' | 'webp' = 'png', quality = 0.92): Promise<string> {
    if (full) this.uncull();
    return this.app.renderer.extract.base64({ target: this.viewport, format, quality });
  }

  // --- watermark -----------------------------------------------------------

  createWatermark(option: WatermarkOption): string {
    const watermark = makeWatermark(this.container.clientWidth, this.container.clientHeight, option);
    const name = `watermark_${this.watermarkCount++}`;
    watermark.label = name;
    this.watermarkLayer.addChild(watermark);
    return name;
  }

  removeWatermark(name: string): void {
    const watermark = this.watermarkLayer.getChildByLabel(name);
    if (watermark) this.watermarkLayer.removeChild(watermark);
  }

  clearWatermark(): void {
    this.watermarkLayer.removeChildren();
  }

  // --- renderable toggles --------------------------------------------------

  setEdgesRenderable(renderable: boolean): void {
    this.edgeLayer.renderable = renderable;
    this.edgeLabelLayer.renderable = renderable;
  }

  setEdgeLabelsRenderable(renderable: boolean): void {
    this.edgeLabelLayer.renderable = renderable;
  }

  setNodeEdgesRenderable(nodeKey: string, renderable: boolean): void {
    this.graph.forEachEdge(nodeKey, edgeKey => {
      const edge = this.edgeKeyToEdgeObject.get(edgeKey);
      if (edge) edge.setRenderable(renderable);
      if (renderable) this.updateEdgeStyleByKey(edgeKey);
    });
  }

  setNodeLabelsRenderable(renderable: boolean): void {
    this.nodeLabelLayer.renderable = renderable;
  }

  // --- box selection -------------------------------------------------------

  /** Viewport-based box select; only effective together with `spaceDrag`. */
  enableAutoSelect(complete: SelectionCallback, lazy?: boolean, realTime?: boolean): void {
    if (!this.spaceDrag) return;
    this.boxSelectViewport = new BoxSelectViewport({
      graph: this.graph,
      stage: this.app.stage,
      viewport: this.viewport,
      isDragging: () => this.isDragging,
      complete,
      lazy,
      realTime
    });
  }

  /** DOM-overlay box select; hold Shift then drag, or call `choose.open()`. */
  enableSelect(complete: SelectionCallback, lazy?: boolean, realTime?: boolean): void {
    this.choose = new BoxSelectDom({
      container: this.container,
      graph: this.graph,
      viewport: this.viewport,
      complete,
      lazy,
      realTime
    });
  }

  // --- space-to-pan helper -------------------------------------------------

  private bindSpaceDrag(): void {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.isDragging = true;
        this.container.style.cursor = 'grab';
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        this.isDragging = false;
        this.container.style.cursor = 'default';
      }
    };
    this.container.addEventListener('mouseenter', () => {
      document.addEventListener('keydown', down);
      document.addEventListener('keyup', up);
    });
    this.container.addEventListener('mouseleave', () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      this.container.style.cursor = 'default';
    });
  }
}
