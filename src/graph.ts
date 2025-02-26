import { Point, IPointData } from '@pixi/core';
import { Application } from '@pixi/app';
import { Container } from '@pixi/display';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import { AbstractGraph } from 'graphology-types';
import TypedEmitter from 'eventemitter3';
import { GraphStyleDefinition, resolveStyleDefinitions } from './utils/style';
import { TextType } from './utils/text';
import { isInteger } from './utils/tools';
import type { BaseNodeAttributes, BaseEdgeAttributes } from './types/attributes';
import { TextureCache } from './texture-cache';
import { PixiNode } from './node';
import { PixiEdge } from './edge';
import { NodeStyle, EdgeStyle } from './utils/style';
import { FederatedPointerEvent } from '@pixi/events';
// import { Graphics } from '@pixi/graphics';
import { LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';

import { makeWatermark, WatermarkOption } from './functional/watermark/watermark';
import { ChooseManual, chooseAuto } from './functional/choose/index';

import '@pixi/events';
import '@pixi/extract';

const DEFAULT_STYLE: GraphStyleDefinition = {
  node: {
    size: 20,
    color: '#000',
    alpha: 1,
    border: {
      width: 2,
      color: '#ffffff'
    },
    icon: {
      type: TextType.TEXT,
      content: 'node_icon_content',
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: '400',
      align: 'left',
      color: '#ffffff',
      stroke: 'black',
      strokeThickness: 0
    },
    label: {
      type: TextType.TEXT,
      content: 'node_label_content',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: '400',
      align: 'left',
      color: '#333333', // fill
      stroke: 'black',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4
    }
  },
  edge: {
    width: 1,
    color: '#cccccc',
    alpha: 1,
    selefLoop: {
      radius: 30,
      cross: 10
    },
    gap: 15,
    arrow: {
      show: true,
      size: 15
    },
    label: {
      type: TextType.TEXT,
      content: 'edge_label_content',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: '400',
      align: 'left',
      color: '#333333',
      stroke: 'black',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4,
      parallel: true
    }
  }
};

const WORLD_PADDING = 100;
const VIEWPORT_CLICK_VALID_TIME = 200;

export interface GraphOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  container: HTMLElement;
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  spaceDrag?: boolean; // 按住空格拖拽
  dragOffset?: boolean; // 拖拽保持偏移
  highPerformance?: { nodeNumber: number; edgeNumber: number }; // 高性能模式
  maxScale?: number;
  minScale?: number;
}

interface PixiGraphEvents {
  nodeMousemove: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseover: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseout: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMousedown: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseup: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeClick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeDbclick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeRightclick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMoveStart: (event: MouseEvent, nodeKey: string, point: IPointData) => void;
  nodeMove: (event: MouseEvent, nodeKey: string, point: IPointData) => void;
  nodeMoveEnd: (event: MouseEvent, nodeKey: string, point: IPointData) => void;

  edgeClick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeDbclick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMousemove: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseover: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseout: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMousedown: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseup: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeRightclick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;

  viewportClick: (event: MouseEvent) => void;
  viewportRightClick: (event: MouseEvent) => void;
}

export class PixiGraph<
  NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes,
  EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes
> extends TypedEmitter<PixiGraphEvents> {
  container: HTMLElement;
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  highPerformance?: { nodeNumber: number; edgeNumber: number };
  spaceDrag: boolean; // 启用按住空格拖拽
  choose: any;
  dragOffset: boolean;
  minScale: number;
  maxScale: number;

  private app: Application;
  private textureCache: TextureCache;
  private viewport: Viewport;
  private cull: Cull;
  private resizeObserver: ResizeObserver;
  private edgeLayer: Container;
  private edgeLabelLayer: Container;
  // private edgeArrowLayer: Container;
  // private frontEdgeLayer: Container;
  // private frontEdgeLabelLayer: Container;
  // private frontEdgeArrowLayer: Container;
  private nodeLayer: Container;
  private nodeLabelLayer: Container;
  // private frontNodeLayer: Container;
  // private frontNodeLabelLayer: Container;
  private nodeKeyToNodeObject = new Map<string, PixiNode>();
  // private nodeKeyToNodeObjectTemp = new Map<string, PixiNode>();
  // private nodeTimer: ReturnType<typeof setTimeout> | null = null;
  private edgeKeyToEdgeObject = new Map<string, PixiEdge>();
  // private edgeKeyToNodeObjectTemp = new Map<string, PixiEdge>();
  // private edgeTimer: ReturnType<typeof setTimeout> | null = null;

  private mousedownNodeKey: string | null = null;
  private isDragging: boolean = false; // 是否正在拖拽画布
  // private isNodeMove?: boolean; // 点是否正在移动
  private high?: boolean; // 超过设置的点线数量时操作隐藏edge和label
  private nodeMouseStartX: number = 0; // 记录点击点后鼠标是否移动
  private nodeMouseStartY: number = 0; // 记录点击点后鼠标是否移动
  private nodeMouseEndX: number = 0; // 记录点击点后鼠标是否移动
  private nodeMouseEndY: number = 0; // 记录点击点后鼠标是否移动
  private edgeMouseX: number = 0; // 记录点击线后鼠标是否移动
  private edgeMouseY: number = 0; // 记录点击线后鼠标是否移动
  private nodeMouseOffsetX: number = 0; // 拖拽点时偏移的x坐标
  private nodeMouseOffsetY: number = 0; // 拖拽点时偏移的y坐标
  private viewportClickStartTime: number = 0; // 记录鼠标空白区域按下时的时间，判断是否点击
  private viewportClickTimer: number | undefined = undefined; // 鼠标空白区域按下时的定时器，超过时间指针显示抓手
  private isViewportDragged: boolean = false; // 在点击viewport后是否进行过拖拽, 因为drag-end事件比mouseup事件早，不能用isDragging判断

  private watermarkLayer: Container;
  private watermarkCount: number = 0;
  private isCanvasTarget: boolean = false; // 临时处理hover穿透问题

  private onGraphNodeAddedBound = this.onGraphNodeAdded.bind(this);
  private onGraphEdgeAddedBound = this.onGraphEdgeAdded.bind(this);
  private onGraphNodeDroppedBound = this.onGraphNodeDropped.bind(this);
  private onGraphEdgeDroppedBound = this.onGraphEdgeDropped.bind(this);
  private onGraphClearedBound = this.onGraphCleared.bind(this);
  private onGraphEdgesClearedBound = this.onGraphEdgesCleared.bind(this);
  private onGraphNodeAttributesUpdatedBound = this.onGraphNodeAttributesUpdated.bind(this);
  private onGraphEdgeAttributesUpdatedBound = this.onGraphEdgeAttributesUpdated.bind(this);
  private onGraphEachNodeAttributesUpdatedBound = this.onGraphEachNodeAttributesUpdated.bind(this);
  private onGraphEachEdgeAttributesUpdatedBound = this.onGraphEachEdgeAttributesUpdated.bind(this);
  private onDocumentMouseMoveBound = this.onDocumentMouseMove.bind(this);
  private onDocumentMouseUpBound = this.onDocumentMouseUp.bind(this);

  private onViewportDragStartBound = this.onViewportDragStart.bind(this);
  private onViewportDragEndBound = this.onViewportDragEnd.bind(this);
  private onViewportZoomedBound = this.onViewportZoomed.bind(this);
  private onViewportZoomedEndBound = this.onViewportZoomedEnd.bind(this);
  private onViewportSnapStartBound = this.highEdgeRenderableAllHide.bind(this);
  private onViewportSnapEndBound = this.highEdgeRenderableAllShow.bind(this);
  private onViewportSnapZoomStartBound = this.highEdgeRenderableAllHide.bind(this);
  private onViewportSnapZoomEndBound = this.highEdgeRenderableAllShow.bind(this);
  private onViewportClickedBound = this.onViewportClicked.bind(this);
  private onViewportMousedownBound = this.onViewportMousedown.bind(this);
  private onViewportMouseupBound = this.onViewportMouseup.bind(this);

  constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>) {
    super();

    this.container = options.container;
    this.graph = options.graph;
    this.style = options.style;
    this.hoverStyle = options.hoverStyle;
    this.highPerformance = options.highPerformance;
    this.spaceDrag = options.spaceDrag || false;
    this.dragOffset = options.dragOffset || false;
    this.minScale = options.minScale || 0.1;
    this.maxScale = options.maxScale || 2;

    if (!(this.container instanceof HTMLElement)) {
      throw new Error('container should be a HTMLElement');
    }

    settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL;

    // create PIXI application
    this.app = new Application({
      resizeTo: this.container,
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      // autoStart: false,
      powerPreference: 'high-performance'
    });
    this.container.appendChild(this.app.view as HTMLCanvasElement);
    console.log('pixi-app', this.app);

    (globalThis as any).__PIXI_APP__ = this.app; // PixiJS Devtools

    this.textureCache = new TextureCache(this.app.renderer);

    // create PIXI viewport
    this.viewport = new Viewport({
      screenWidth: this.container.clientWidth,
      screenHeight: this.container.clientHeight,
      worldWidth: this.container.clientWidth,
      worldHeight: this.container.clientHeight,
      events: this.app.renderer.events,
      disableOnContextMenu: true,
      passiveWheel: false
      // stopPropagation: true,
      // allowPreserveDragOutside: true,
    })
      .drag({
        mouseButtons: 'left',
        keyToPress: this.spaceDrag ? ['Space'] : null
      })
      .pinch()
      .wheel()
      .clampZoom({ minScale: this.minScale, maxScale: this.maxScale });
    // .decelerate()
    this.spaceDrag && this.handleSpaceDrag();
    console.log('pixi-viewport', this.viewport);
    this.app.stage.addChild(this.viewport);

    // create cull
    this.cull = new Cull({
      // recursive: false,
      toggle: 'renderable' // visible or renderable
    });

    // create layers
    this.edgeLayer = new Container();
    this.edgeLabelLayer = new Container();
    // this.edgeArrowLayer = new Container();
    // this.frontEdgeLayer = new Container();
    // this.frontEdgeLabelLayer = new Container();
    // this.frontEdgeArrowLayer = new Container();
    this.nodeLayer = new Container();
    this.nodeLabelLayer = new Container();
    // this.frontNodeLayer = new Container();
    // this.frontNodeLabelLayer = new Container();
    this.viewport.addChild(this.edgeLayer);
    this.viewport.addChild(this.edgeLabelLayer);
    // this.viewport.addChild(this.edgeArrowLayer);
    // this.viewport.addChild(this.frontEdgeLayer);
    // this.viewport.addChild(this.frontEdgeLabelLayer);
    // this.viewport.addChild(this.frontEdgeArrowLayer);
    this.viewport.addChild(this.nodeLabelLayer);
    this.viewport.addChild(this.nodeLayer);
    // this.viewport.addChild(this.frontNodeLayer);
    // this.viewport.addChild(this.frontNodeLabelLayer);

    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.viewport.resize(this.container.clientWidth, this.container.clientHeight);
      this.updateGraphVisibility();
    });

    this.viewport.on('frame-end', () => {
      if (this.viewport.dirty) {
        this.updateGraphVisibility();
        this.viewport.dirty = false;
      }
    });

    this.resizeObserver.observe(this.container);

    // listen to graph changes
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

    this.viewport.on('drag-start', this.onViewportDragStartBound);
    this.viewport.on('drag-end', this.onViewportDragEndBound);
    this.viewport.on('zoomed', this.onViewportZoomedBound);
    this.viewport.on('zoomed-end', this.onViewportZoomedEndBound);
    this.viewport.on('snap-start', this.onViewportSnapStartBound);
    this.viewport.on('snap-end', this.onViewportSnapEndBound);
    this.viewport.on('snap-zoom-start', this.onViewportSnapZoomStartBound);
    this.viewport.on('snap-zoom-end', this.onViewportSnapZoomEndBound);
    this.viewport.on('clicked', this.onViewportClickedBound);
    this.viewport.on('mousedown', this.onViewportMousedownBound);
    this.viewport.on('mouseup', this.onViewportMouseupBound);

    // initial draw
    this.createGraph();
    this.resetView(this.graph.nodes());

    // 创建水印
    this.watermarkLayer = new Container();
    this.app.stage.addChildAt(this.watermarkLayer, 0);

    // 临时处理hover穿透问题（关注pixijs最新版本是否解决）
    globalThis.document.addEventListener('pointermove', e => {
      this.isCanvasTarget = e.target === this.app?.view;
    });
  }

  private createGraph() {
    console.time('render-time');
    this.graph.forEachNode(this.createNode.bind(this));
    this.graph.forEachEdge(this.createEdge.bind(this));
    console.timeEnd('render-time');
    this.high = this.checkHighPerformance();
  }

  destroy() {
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

    this.viewport.off('drag-start', this.onViewportDragStartBound);
    this.viewport.off('drag-end', this.onViewportDragEndBound);
    this.viewport.off('zoomed', this.onViewportZoomedBound);
    this.viewport.off('zoomed-end', this.onViewportZoomedEndBound);
    this.viewport.off('snap-start', this.onViewportSnapStartBound);
    this.viewport.off('snap-end', this.onViewportSnapEndBound);
    this.viewport.off('snap-zoom-start', this.onViewportSnapZoomStartBound);
    this.viewport.off('snap-zoom-end', this.onViewportSnapZoomEndBound);
    this.viewport.off('clicked', this.onViewportClickedBound);

    this.resizeObserver.disconnect();
    this.resizeObserver = undefined!;

    this.textureCache.destroy();
    this.textureCache = undefined!;

    this.viewport.destroy();
    this.viewport = null!;

    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = undefined!;
  }

  // 销毁实例无效，多次实例化会造成内存溢出，临时处理：只实例化一次，由外层动态设置位置
  resetView(nodes: any[]) {
    if (!nodes.length) {
      // 设置一个能显示在窗口的，防止外面没调用此函数看不到内容
      this.viewport.center = new Point(this.container.clientWidth / 2, this.container.clientHeight / 2);
      return;
    }
    const nodesX = nodes.map(nodeKey => this.graph.getNodeAttribute(nodeKey, 'x'));
    const nodesY = nodes.map(nodeKey => this.graph.getNodeAttribute(nodeKey, 'y'));
    const minX = Math.min(...nodesX);
    const maxX = Math.max(...nodesX);
    const minY = Math.min(...nodesY);
    const maxY = Math.max(...nodesY);

    const graphWidth = Math.abs(maxX - minX);
    const graphHeight = Math.abs(maxY - minY);
    const graphCenter = new Point(minX + graphWidth / 2, minY + graphHeight / 2);

    const worldWidth = graphWidth + WORLD_PADDING * 2;
    const worldHeight = graphHeight + WORLD_PADDING * 2;

    // TODO: update worldWidth/worldHeight when graph is updated?
    this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);

    this.viewport.setZoom(1); // otherwise scale is 0 when initialized in React useEffect
    this.viewport.center = graphCenter;
    this.viewport.fit(true);
  }

  private onViewportDragStart() {
    this.isDragging = true;

    this.isViewportDragged = true;
    clearTimeout(this.viewportClickTimer); // 拖拽时取消定时器设置
    this.container.style.cursor = 'grab'; // 拖拽时立即设置指针样式

    this.highEdgeRenderableAllHide();
  }
  private onViewportDragEnd() {
    this.isDragging = false;
    this.container.style.cursor = 'default'; // 拖拽结束指针恢复指针样式，因为mouseup可能在容器外触发
    this.highEdgeRenderableAllShow();
  }

  private onViewportZoomed() {
    let scaled = this.viewport.scaled;
    // 加判断原因：超过minScale和maxScale范围继续缩放时scaled会继续变化再变回限定值，所以zoomed事件会执行，但zoomed-end事件不执行
    if (scaled > this.minScale && scaled < this.maxScale) {
      this.highEdgeRenderableAllHide();
    }
    //  else {
    //   this.highEdgeRenderableAllShow();
    // }
  }
  private onViewportZoomedEnd() {
    this.highEdgeRenderableAllShow();

    // test
    // const screenLine = new Graphics().lineStyle(3, 0x0379f3).drawRect(0, 0, this.viewport.screenWidth, this.viewport.screenHeight);
    // const worldLine = new Graphics().lineStyle(1, 0xff0000).drawRect(0, 0, this.viewport.worldWidth, this.viewport.worldHeight);
    // this.app.stage.addChild(screenLine);
    // this.viewport.addChild(worldLine);
  }

  private onViewportClicked(event: any) {
    if (event.event.target === this.viewport) {
      const mouseEvent = event.event.data.originalEvent;
      // if (mouseEvent.button === 0) {
      // this.emit('viewportClick', mouseEvent as MouseEvent); // 改为鼠标按下弹起模拟单击
      // } else
      if (mouseEvent.button === 2) {
        this.emit('viewportRightClick', mouseEvent as MouseEvent);
      }
    }
  }
  private onViewportMousedown(event: FederatedPointerEvent) {
    if (event.target === this.viewport) {
      this.isViewportDragged = false; // 有可能弹起时是在容器外面，所以按下时恢复false
      this.viewportClickStartTime = new Date().getTime();
      this.viewportClickTimer = window.setTimeout(() => {
        this.container.style.cursor = 'grab'; // 按下鼠标超过指定时间指针显示拖拽
      }, VIEWPORT_CLICK_VALID_TIME);
    }
  }
  private onViewportMouseup(event: FederatedPointerEvent) {
    // 注意mouseup可能在容器外触发
    clearTimeout(this.viewportClickTimer);
    if (event.target === this.viewport) {
      const viewportClickEndTime = new Date().getTime();
      if (viewportClickEndTime - this.viewportClickStartTime < VIEWPORT_CLICK_VALID_TIME && !this.isViewportDragged) {
        // 小于指定时间 并且 不是在拖拽 确认为点击事件
        this.emit('viewportClick', event.originalEvent as FederatedPointerEvent);
      }
      this.container.style.cursor = 'default'; // 恢复指针样式
    }
  }

  private onGraphNodeAdded(data: { key: string; attributes: NodeAttributes }) {
    this.high = this.checkHighPerformance();
    const nodeKey = data.key;
    const nodeAttributes = data.attributes;
    this.createNode(nodeKey, nodeAttributes);
  }

  private onGraphNodeDropped(data: { key: string }) {
    this.high = this.checkHighPerformance();
    const nodeKey = data.key;
    this.dropNode(nodeKey);
  }

  private onGraphEdgeAdded(data: { key: string; attributes: EdgeAttributes; source: string; target: string }) {
    this.high = this.checkHighPerformance();
    const edgeKey = data.key;
    const edgeAttributes = data.attributes;
    const sourceNodeKey = data.source;
    const targetNodeKey = data.target;
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.createEdge(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private onGraphEdgeDropped(data: { key: string }) {
    this.high = this.checkHighPerformance();
    const edgeKey = data.key;
    this.dropEdge(edgeKey);
  }

  private onGraphCleared() {
    this.high = this.checkHighPerformance();
    for (const [key] of this.edgeKeyToEdgeObject) {
      this.dropEdge(key);
    }
    for (const [key] of this.nodeKeyToNodeObject) {
      this.dropNode(key);
    }
  }

  private onGraphEdgesCleared() {
    this.high = this.checkHighPerformance();
    for (const [key] of this.edgeKeyToEdgeObject) {
      this.dropEdge(key);
    }
  }

  private onGraphNodeAttributesUpdated(data: { key: string }) {
    const nodeKey = data.key;
    this.updateNodeStyleByKey(nodeKey);
    // TODO: normalize position?
  }

  private onGraphEdgeAttributesUpdated(data: { key: string }) {
    const edgeKey = data.key;
    this.updateEdgeStyleByKey(edgeKey);
  }

  private onGraphEachNodeAttributesUpdated() {
    this.graph.forEachNode(this.updateNodeStyle.bind(this));
  }

  private onGraphEachEdgeAttributesUpdated() {
    this.graph.forEachEdge(this.updateEdgeStyle.bind(this));
  }

  private hoverNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (node.hovered) {
      return;
    }

    // update style
    node.hovered = true;
    this.updateNodeStyleByKey(nodeKey);

    // move to front
    // const nodeIndex = this.nodeLayer.getChildIndex(node.nodeGfx);
    // this.nodeLayer.removeChildAt(nodeIndex);
    // this.nodeLabelLayer.removeChildAt(nodeIndex);
    // this.frontNodeLayer.removeChildAt(nodeIndex);
    // this.frontNodeLabelLayer.removeChildAt(nodeIndex);
    // this.nodeLayer.addChild(node.nodePlaceholderGfx);
    // this.nodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
    // this.frontNodeLayer.addChild(node.nodeGfx);
    // this.frontNodeLabelLayer.addChild(node.nodeLabelGfx);

    const nodeLayerChildren = this.nodeLayer.children;
    const nodeLabelLayerChildren = this.nodeLabelLayer.children;
    this.nodeLayer.setChildIndex(node.nodeGfx, nodeLayerChildren.length - 1);
    this.nodeLabelLayer.setChildIndex(node.nodeLabelGfx, nodeLabelLayerChildren.length - 1);
  }

  private unhoverNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (!node.hovered) {
      return;
    }

    // update style
    node.hovered = false;
    this.updateNodeStyleByKey(nodeKey);

    // move to front
    // const nodeIndex = this.frontNodeLayer.getChildIndex(node.nodeGfx);
    // this.nodeLayer.removeChildAt(nodeIndex);
    // this.nodeLabelLayer.removeChildAt(nodeIndex);
    // this.frontNodeLayer.removeChildAt(nodeIndex);
    // this.frontNodeLabelLayer.removeChildAt(nodeIndex);
    // this.nodeLayer.addChild(node.nodeGfx);
    // this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    // this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
    // this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
  }

  private hoverEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (edge.hovered) {
      return;
    }

    // update style
    edge.hovered = true;
    this.updateEdgeStyleByKey(edgeKey);

    // move to front
    // const edgeIndex = this.edgeLayer.getChildIndex(edge.edgeGfx);
    // this.edgeLayer.removeChildAt(edgeIndex);
    // this.edgeLabelLayer.removeChildAt(edgeIndex);
    // this.edgeArrowLayer.removeChildAt(edgeIndex);
    // this.frontEdgeLayer.removeChildAt(edgeIndex);
    // this.frontEdgeLabelLayer.removeChildAt(edgeIndex);
    // this.frontEdgeArrowLayer.removeChildAt(edgeIndex);
    // this.edgeLayer.addChild(edge.edgePlaceholderGfx);
    // this.edgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
    // this.edgeArrowLayer.addChild(edge.edgeArrowPlaceholderGfx);
    // this.frontEdgeLayer.addChild(edge.edgeGfx);
    // this.frontEdgeLabelLayer.addChild(edge.edgeLabelGfx);
    // this.frontEdgeArrowLayer.addChild(edge.edgeArrowGfx);

    const edgeLayerChildrens = this.edgeLayer.children;
    const edgeLabelLayerChildrens = this.edgeLabelLayer.children;
    this.edgeLayer.setChildIndex(edge.edgeGfx, edgeLayerChildrens.length - 1);
    this.edgeLayer.setChildIndex(edge.edgeArrowGfx, edgeLayerChildrens.length - 1);
    this.edgeLabelLayer.setChildIndex(edge.edgeLabelGfx, edgeLabelLayerChildrens.length - 1);
  }

  private unhoverEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (!edge.hovered) {
      return;
    }

    // update style
    edge.hovered = false;
    this.updateEdgeStyleByKey(edgeKey);

    // move back
    // const edgeIndex = this.frontEdgeLayer.getChildIndex(edge.edgeGfx);
    // this.edgeLayer.removeChildAt(edgeIndex);
    // this.edgeLabelLayer.removeChildAt(edgeIndex);
    // this.edgeArrowLayer.removeChildAt(edgeIndex);
    // this.frontEdgeLayer.removeChildAt(edgeIndex);
    // this.frontEdgeLabelLayer.removeChildAt(edgeIndex);
    // this.frontEdgeArrowLayer.removeChildAt(edgeIndex);
    // this.edgeLayer.addChild(edge.edgeGfx);
    // this.edgeLabelLayer.addChild(edge.edgeLabelGfx);
    // this.edgeArrowLayer.addChild(edge.edgeArrowGfx);
    // this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
    // this.frontEdgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
    // this.frontEdgeArrowLayer.addChild(edge.edgeArrowPlaceholderGfx);
  }

  // 移动后点中心不移动到鼠标位置，保持偏移(卡顿会出现鼠标点内移动的情况？)
  private nodeMouseOffset(nodeKey: string, point: IPointData) {
    let attrs = this.graph.getNodeAttributes(nodeKey);
    let nodeX = attrs.x;
    let nodeY = attrs.y;
    let position = { x: 0, y: 0 };
    point.x > nodeX ? (position.x = point.x - this.nodeMouseOffsetX) : (position.x = point.x + this.nodeMouseOffsetX);
    point.y > nodeY ? (position.y = point.y - this.nodeMouseOffsetY) : (position.y = point.y + this.nodeMouseOffsetY);
    return position;
  }

  private moveNode(nodeKey: string, point: IPointData, event: MouseEvent) {
    let newPosition = this.dragOffset ? this.nodeMouseOffset(nodeKey, point) : point;
    this.graph.setNodeAttribute(nodeKey, 'x', newPosition.x);
    this.graph.setNodeAttribute(nodeKey, 'y', newPosition.y);

    // update style
    this.updateNodeStyleByKey(nodeKey); // 在这里更新节点，比在nodeAttributesUpdated事件监听里性能更好 why？

    this.highEdgeRenderableAllHide();
    if (!this.high) this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));

    this.emit('nodeMove', event, nodeKey, newPosition);
  }

  private enableNodeDragging(event: MouseEvent, nodeKey: string, point: IPointData) {
    this.viewport.pause = true; // disable viewport dragging

    document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
    document.addEventListener('mouseup', event => this.onDocumentMouseUpBound(event, nodeKey), { once: true });

    this.emit('nodeMoveStart', event, nodeKey, point);
  }

  private onDocumentMouseMove(event: MouseEvent) {
    const eventPosition = new Point(event.offsetX, event.offsetY);
    const worldPosition = this.viewport.toWorld(eventPosition);

    if (this.mousedownNodeKey) {
      this.moveNode(this.mousedownNodeKey, worldPosition, event);
    }
  }

  private onDocumentMouseUp(event: MouseEvent, nodeKey: string) {
    this.viewport.pause = false; // enable viewport dragging

    this.highEdgeRenderableAllShow();
    if (this.high) this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this)); // 显示后更新拖拽点相关的线

    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
    this.mousedownNodeKey = null;

    const eventPosition = new Point(event.offsetX, event.offsetY);
    const point = this.viewport.toWorld(eventPosition);

    this.emit('nodeMoveEnd', event, nodeKey, point);
  }

  private createNode(nodeKey: string, nodeAttributes: NodeAttributes) {
    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, undefined];
    const nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, nodeAttributes);

    const node = new PixiNode({ nodeStyle });
    node.on('mousemove', (event: MouseEvent) => {
      this.emit('nodeMousemove', event, nodeKey, nodeStyle);
    });
    node.on('mouseover', (event: MouseEvent) => {
      if (!this.isCanvasTarget) return;

      if (!this.mousedownNodeKey && !this.isDragging) {
        // 防止拖拽时触发
        this.hoverNode(nodeKey);
        this.emit('nodeMouseover', event, nodeKey, nodeStyle);
      }
    });
    node.on('mouseout', (event: MouseEvent) => {
      if (!this.mousedownNodeKey && !this.isDragging) {
        // 防止拖拽时触发hover
        this.unhoverNode(nodeKey);
        this.emit('nodeMouseout', event, nodeKey, nodeStyle);
      }
    });
    node.on('mousedown', (event: MouseEvent) => {
      const eventPosition = new Point(event.offsetX, event.offsetY);
      const worldPosition = this.viewport.toWorld(eventPosition);
      this.nodeMouseOffsetX = Math.abs(node.nodeGfx.x - worldPosition.x);
      this.nodeMouseOffsetY = Math.abs(node.nodeGfx.y - worldPosition.y);

      this.nodeMouseStartX = event.offsetX;
      this.nodeMouseStartY = event.offsetY;

      this.mousedownNodeKey = nodeKey;
      this.enableNodeDragging(event, nodeKey, worldPosition);
      this.emit('nodeMousedown', event, nodeKey, nodeStyle);
    });
    node.on('mouseup', (event: MouseEvent) => {
      this.nodeMouseEndX = event.offsetX;
      this.nodeMouseEndY = event.offsetY;

      this.emit('nodeMouseup', event, nodeKey, nodeStyle);
    });
    node.on('click', (event: MouseEvent) => {
      if (this.nodeMouseStartX === this.nodeMouseEndX && this.nodeMouseStartY === this.nodeMouseEndY) {
        // 防止拖拽触发点击事件，因为双击事件原因，单击延迟执行后防止点击移动鼠标后不执行。
        this.emit('nodeClick', event, nodeKey, nodeStyle);
      }
    });
    node.on('dbclick', (event: MouseEvent) => {
      if (this.nodeMouseStartX === this.nodeMouseEndX && this.nodeMouseStartY === this.nodeMouseEndY) {
        // 防止拖拽触发点击事件
        this.emit('nodeDbclick', event, nodeKey, nodeStyle);
      }
    });
    node.on('rightclick', (event: MouseEvent) => {
      this.emit('nodeRightclick', event, nodeKey, nodeStyle);
    });

    this.nodeLayer.addChild(node.nodeGfx);
    this.nodeLabelLayer.addChild(node.nodeLabelGfx);

    // this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    // this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
    // this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
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
  ) {
    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, undefined];
    const edgeStyle = resolveStyleDefinitions(edgeStyleDefinitions, edgeAttributes);
    const selfLoop = sourceNodeKey === targetNodeKey;

    const edge = new PixiEdge({ selfLoop });
    edge.on('mousemove', (event: MouseEvent) => {
      this.emit('edgeMousemove', event, edgeKey, edgeStyle);
    });
    edge.on('mouseover', (event: MouseEvent) => {
      if (!this.isCanvasTarget) return;

      if (!this.mousedownNodeKey && !this.isDragging) {
        this.hoverEdge(edgeKey);
        this.emit('edgeMouseover', event, edgeKey, edgeStyle);
      }
    });
    edge.on('mouseout', (event: MouseEvent) => {
      if (!this.mousedownNodeKey && !this.isDragging) {
        this.unhoverEdge(edgeKey);
        this.emit('edgeMouseout', event, edgeKey, edgeStyle);
      }
    });
    edge.on('mousedown', (event: MouseEvent) => {
      this.edgeMouseX = event.offsetX;
      this.edgeMouseY = event.offsetY;
      this.emit('edgeMousedown', event, edgeKey, edgeStyle);
    });
    edge.on('mouseup', (event: MouseEvent) => {
      this.emit('edgeMouseup', event, edgeKey, edgeStyle);
    });
    edge.on('click', (event: MouseEvent) => {
      if (this.edgeMouseX === event.offsetX && this.edgeMouseY === event.offsetY) {
        // 防止拖拽出发点击事件
        this.emit('edgeClick', event, edgeKey, edgeStyle);
      }
    });
    edge.on('dbclick', (event: MouseEvent) => {
      if (this.edgeMouseX === event.offsetX && this.edgeMouseY === event.offsetY) {
        // 防止拖拽出发点击事件
        this.emit('edgeDbclick', event, edgeKey, edgeStyle);
      }
    });
    edge.on('rightclick', (event: MouseEvent) => {
      this.emit('edgeRightclick', event, edgeKey, edgeStyle);
    });

    this.edgeLayer.addChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.edgeLabelLayer.addChild(edge.edgeLabelGfx);

    // this.edgeArrowLayer.addChild(edge.edgeArrowGfx);
    // this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
    // this.frontEdgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
    // this.frontEdgeArrowLayer.addChild(edge.edgeArrowPlaceholderGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);

    const allLinesBetweenNodes = this.graph.edges(targetNodeKey, sourceNodeKey);
    if (allLinesBetweenNodes.length > 1) {
      // 更新此线两点间所有线样式，以更新先添加的相反线位置，防止间距太小label互相覆盖
      allLinesBetweenNodes.forEach(edgeKey => {
        const edge = this.edgeKeyToEdgeObject.get(edgeKey);
        if (edge) {
          edge.isBilateral = true;
          this.updateEdgeStyleByKey(edgeKey);
        }
      });
    } else {
      // 直接更新当前线样式
      this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
    }
  }

  private dropNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;

    this.nodeLayer.removeChild(node.nodeGfx);
    this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
    // this.frontNodeLayer.removeChild(node.nodePlaceholderGfx);
    // this.frontNodeLabelLayer.removeChild(node.nodeLabelPlaceholderGfx);
    this.nodeKeyToNodeObject.delete(nodeKey);
  }

  private dropEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;

    this.edgeLayer.removeChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.edgeLabelLayer.removeChild(edge.edgeLabelGfx);
    // this.edgeArrowLayer.removeChild(edge.edgeArrowGfx);
    // this.frontEdgeLayer.removeChild(edge.edgePlaceholderGfx);
    // this.frontEdgeLabelLayer.removeChild(edge.edgeLabelPlaceholderGfx);
    // this.frontEdgeArrowLayer.removeChild(edge.edgeArrowPlaceholderGfx);
    this.edgeKeyToEdgeObject.delete(edgeKey);
  }

  private updateNodeStyleByKey(nodeKey: string) {
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private updateNodeStyle(nodeKey: string, nodeAttributes: NodeAttributes) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;

    const nodePosition = { x: nodeAttributes.x, y: nodeAttributes.y };
    node.updatePosition(nodePosition);

    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, node.hovered ? this.hoverStyle.node : undefined];
    const nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, nodeAttributes);
    node.updateStyle(nodeStyle, this.textureCache);

    node.updateAlpha(nodeStyle);
  }

  private updateEdgeStyleByKey(edgeKey: string) {
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private updateEdgeStyle(
    edgeKey: string,
    edgeAttributes: EdgeAttributes,
    _sourceNodeKey: string,
    _targetNodeKey: string,
    sourceNodeAttributes: NodeAttributes,
    targetNodeAttributes: NodeAttributes
  ) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    const sourceNode = this.nodeKeyToNodeObject.get(_sourceNodeKey)!;
    const targetNode = this.nodeKeyToNodeObject.get(_targetNodeKey)!;

    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined];
    const edgeStyle = resolveStyleDefinitions(edgeStyleDefinitions, edgeAttributes);
    edge.updateStyle(edgeStyle, this.textureCache);

    const nodeSourceStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, sourceNode.hovered ? this.hoverStyle.node : undefined];
    const sourceNodeStyle = resolveStyleDefinitions(nodeSourceStyleDefinitions, sourceNodeAttributes);
    const nodeTargetStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, targetNode.hovered ? this.hoverStyle.node : undefined];
    const targetNodeStyle = resolveStyleDefinitions(nodeTargetStyleDefinitions, targetNodeAttributes);

    const sourceNodePosition = { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y };
    const targetNodePosition = { x: targetNodeAttributes.x, y: targetNodeAttributes.y };

    edge.updatePosition(sourceNodePosition, targetNodePosition, edgeStyle, sourceNodeStyle, targetNodeStyle);

    edge.updateAlpha(edgeStyle);
  }

  // 可见性（剔除）
  private updateGraphVisibility() {
    this.culling();

    // levels of detail
    const zoom = this.viewport.scaled;
    const zoomSteps = [0.1, 0.2, 0.3, 0.4, 0.5, Infinity];
    const zoomStep = zoomSteps.findIndex(zoomStep => zoom <= zoomStep);
    // this.currentZoomStep = zoomStep;

    this.graph.forEachNode(nodeKey => {
      const node = this.nodeKeyToNodeObject.get(nodeKey)!;
      node.updateVisibility(zoomStep);
    });

    this.graph.forEachEdge(edgeKey => {
      const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
      edge.updateVisibility(zoomStep);
    });
  }

  // 剔除
  culling() {
    this.cull.addAll((this.viewport.children as Container[]).map(layer => layer.children).flat());
    this.cull.cull(this.app.renderer.screen);
  }
  // 取消剔除
  uncull() {
    this.cull.uncull();
  }

  // 高性能模式下隐藏所有线
  private highEdgeRenderableAllHide() {
    if (this.high) {
      this.edgeLayer.renderable && this.edgeRenderableAll(false);
      this.nodeLabelLayer.renderable && this.nodeLabelRenderableAll(false);
    }
  }
  // 高性能模式下显示所有线
  private highEdgeRenderableAllShow() {
    if (this.high) {
      this.edgeRenderableAll(true);
      this.nodeLabelRenderableAll(true);
    }
  }

  // 检查highPerformance
  private checkHighPerformance(): boolean {
    if (this.highPerformance) {
      let nodeNumber = this.highPerformance.nodeNumber;
      let edgeNumber = this.highPerformance.edgeNumber;
      let nodeNumberType = isInteger(nodeNumber);
      let edgeNumberType = isInteger(edgeNumber);

      if (nodeNumberType && edgeNumberType) {
        let order = this.graph.order;
        let size = this.graph.size;
        return order >= nodeNumber || size >= edgeNumber;
      } else {
        console.error('highPerformance中必须是整数: { nodeNumber: number, edgeNumber: number }');
      }
    }
    return false;
  }

  // 设置缩放
  private get zoomStep() {
    return Math.min(this.viewport.worldWidth, this.viewport.worldHeight) / 10;
  }
  zoomIn() {
    this.viewport.zoom(-this.zoomStep, true);
  }
  zoomOut() {
    this.viewport.zoom(this.zoomStep, true);
  }

  // 设置node可见性
  nodeVisibility(nodeKey: string, visible: boolean) {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node) {
      node.nodeVisibility(visible);
    } else {
      console.error(`根据${nodeKey}获取点失败!`);
    }
  }
  // 检查node可见性
  checkNodeVisibility(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node) {
      return node.checkNodeVisibility();
    } else {
      console.error(`根据${nodeKey}获取点失败!`);
    }
  }
  // 设置edge可见性
  edgeVisibility(edgeKey: string, visible: boolean) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (edge) {
      edge.edgeVisibility(visible);
    } else {
      console.error(`根据${edgeKey}获取线失败!`);
    }
  }
  // 检查edge可见性
  checkEdgeVisibility(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (edge) {
      return edge.checkEdgeVisibility();
    } else {
      console.error(`根据${edgeKey}获取线失败!`);
    }
  }

  // 提取图片（锯齿严重，图大截图不完全）
  extract(full: boolean = true, format: string = 'image/png', quality: number = 0.92) {
    full && this.uncull();
    return this.app.renderer.extract.base64(this.viewport, format, quality);

    // const imageThis = this.app.renderer.generateTexture(this.viewport, {
    //   region: this.app.screen,
    //   resolution: 2
    // });
    // this.app.renderer.extract.image(imageThis, 'image/png', 1.0).then((img) => {
    //   const image: HTMLImageElement = img;
    //   const createEl = document.createElement('a');
    //   createEl.href = image.src;
    //   createEl.download = 'my-canvas';
    //   createEl.click();
    //   createEl.remove();
    //   imageThis.destroy();
    // })
  }
  // 提取图片，多次截图合并（无锯齿，图大移动卡顿，图大截图不完全）
  // extractWithScreenShot() {
  //   // this.uncull();
  //   const corner = this.viewport.corner;
  //   const scaled = this.viewport.scaled;
  //   this.viewport.setZoom(1);

  //   const nodesX = this.graph.mapNodes((nodeKey, attributes) => attributes.x);
  //   const nodesY = this.graph.mapNodes((nodeKey, attributes) => attributes.y);

  //   const width = this.container.clientWidth;
  //   const height = this.container.clientHeight;
  //   const minX = Math.min(...nodesX);
  //   const maxX = Math.max(...nodesX);
  //   const minY = Math.min(...nodesY);
  //   const maxY = Math.max(...nodesY);
  //   const startX = minX - WORLD_PADDING;
  //   const startY = minY - WORLD_PADDING;

  //   const rows = Math.ceil((maxY - minY + WORLD_PADDING * 2) / height);
  //   const cols = Math.ceil((maxX - minX + WORLD_PADDING * 2) / width);

  //   const canvas = document.createElement('canvas');
  //   let limit = 16384 * 16384;
  //   let viewWidth = width * cols;
  //   let viewHeight = height * rows;

  //   if (viewWidth * viewHeight > limit) {
  //     this.viewport.setZoom(scaled);
  //     return Promise.reject('图片过大无法导出');
  //   }

  //   canvas.width = viewWidth;
  //   canvas.height = viewHeight;
  //   const context = canvas.getContext('2d')!;
  //   context.fillStyle = '#fff';
  //   context.fillRect(0, 0, canvas.width, canvas.height);

  //   const execute = async () => {
  //     for (let i = 0; i < cols; i++) {
  //       for (let j = 0; j < rows; j++) {
  //         await moveAndDraw(startX + i * width, startY + j * height, width * i, height * j);
  //       }
  //     }
  //     this.viewport.setZoom(scaled);
  //     this.viewport.moveCorner(corner);
  //     // this.culling();
  //     return canvas.toDataURL();
  //   };

  //   const moveAndDraw = async (moveX: number, moveY: number, canvasX: number, canvasY: number) => {
  //     return new Promise((resolve, reject) => {
  //       this.viewport.moveCorner(moveX, moveY);
  //       setTimeout(() => {
  //         requestAnimationFrame(() => {
  //           let img: HTMLImageElement | null = new Image();
  //           img.src = this.app.view.toDataURL ? this.app.view.toDataURL('image/png') : '';
  //           img.onload = () => {
  //             context.drawImage(<HTMLImageElement>img, canvasX, canvasY, width, height);
  //             img = null;
  //             resolve(undefined);
  //           };
  //         });
  //       }, 16.7);
  //     });
  //   };
  //   return execute();
  // }

  // 添加水印
  createWatermark(option: WatermarkOption) {
    let containerWidth = this.container.clientWidth;
    let containerHeight = this.container.clientHeight;
    let watermark = makeWatermark(containerWidth, containerHeight, option);
    let name = `watermark_${this.watermarkCount++}`;
    watermark.name = name;
    this.watermarkLayer.addChild(watermark);
    return name;
  }
  // 删除指定水印
  removeWatermark(name: string) {
    let children = this.watermarkLayer.getChildByName(name);
    if (children) this.watermarkLayer.removeChild(children);
  }
  // 清除所有水印
  clearWatermark() {
    this.watermarkLayer.removeChildren();
  }

  // 显示或者隐藏所有的线和线label(可渲染)
  edgeRenderableAll(renderable: boolean) {
    this.edgeLayer.renderable = renderable;
    this.edgeLabelLayer.renderable = renderable;
  }
  // 显示或者隐藏所有的线label(可渲染)
  edgeLabelRenderableAll(renderable: boolean) {
    this.edgeLabelLayer.renderable = renderable;
  }
  // 显示隐藏点相关的线(可渲染)
  edgeRenderable(nodeKey: string, renderable: boolean) {
    this.graph.forEachEdge(nodeKey, (edgeKey, attributes, source, target, sourceAttributes, targetAttributes) => {
      const edge = this.edgeKeyToEdgeObject.get(edgeKey);
      if (edge) edge.edgeRenderable(renderable);
      if (renderable) this.updateEdgeStyleByKey(edgeKey);
    });
  }
  // 显示隐藏所有点的label(可渲染)
  nodeLabelRenderableAll(renderable: boolean) {
    this.nodeLabelLayer.renderable = renderable;
  }

  // 空格拖拽时禁止空格滚动页面及鼠标样式修改
  private handleSpaceDrag() {
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

  // 自动框选
  choosesAutoEnable(cb: () => {}, lazy?: boolean, realTime?: boolean) {
    if (this.spaceDrag) {
      //空格拖拽才可生效
      // chooseAuto(this.graph, this.app.stage, this.viewport, this, cb, lazy, realTime);
      chooseAuto({
        graph: this.graph,
        stage: this.app.stage,
        viewport: this.viewport,
        pixiGraph: this,
        complete: cb,
        lazy,
        realTime
      });
    }
  }
  // 手动框选
  choosesEnable(cb: () => {}, lazy?: boolean, realTime?: boolean) {
    this.choose = new ChooseManual({
      container: this.container,
      graph: this.graph,
      viewport: this.viewport,
      pixiGraph: this,
      complete: cb,
      lazy,
      realTime
    });
  }
}
