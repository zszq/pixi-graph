import { Application } from '@pixi/app';
import { TickerPlugin } from '@pixi/ticker';
import { AppLoaderPlugin, Loader } from '@pixi/loaders';
import { BitmapFontLoader } from '@pixi/text-bitmap';
import { Renderer, BatchRenderer } from '@pixi/core';
import { InteractionManager } from '@pixi/interaction';
import { Extract } from '@pixi/extract';
import { Container } from '@pixi/display';
import { Point, IPointData } from '@pixi/math';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import { AbstractGraph } from 'graphology-types';
import { IAddOptions } from 'resource-loader';
import { TypedEmitter } from 'tiny-typed-emitter';
import { GraphStyleDefinition, resolveStyleDefinitions } from './utils/style';
import { TextType } from './utils/text';
import { BaseNodeAttributes, BaseEdgeAttributes } from './attributes';
import { TextureCache } from './texture-cache';
import { PixiNode } from './node';
import { PixiEdge } from './edge';
import { NodeStyle } from './utils/style';
import { EdgeStyle } from './utils/style';
// import '@pixi/filter-fxaa';

Application.registerPlugin(TickerPlugin);
Application.registerPlugin(AppLoaderPlugin);
Loader.registerPlugin(BitmapFontLoader);
Renderer.registerPlugin('batch', BatchRenderer);
Renderer.registerPlugin('interaction', InteractionManager);
Renderer.registerPlugin('extract', Extract);

const DEFAULT_STYLE: GraphStyleDefinition = {
  node: {
    shape: 'circle', //circle or rect
    size: 20,
    color: '#000',
    border: {
      width: 2,
      color: '#ffffff',
    },
    icon: {
      type: TextType.TEXT,
      content: '',
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: '400',
      color: '#ffffff',
      stroke: 'black',
      strokeThickness: 0,
    },
    label: {
      type: TextType.TEXT,
      content: '',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: '400',
      color: '#333333', // fill
      stroke: 'black',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4,
    },
    attach: {
      group: [],
      shape: 'rect', // circle or rect
      size: 20,
      colors: {},
      text: {
        type: TextType.TEXT, // TEXT or IMAGE
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: '400',
        color: '#333333', // fill
        stroke: 'black',
        strokeThickness: 0,
      },
      colGap: 5, // 分组图标列间距
      rowGap: 5, // 分组图标行间距
      crevice: 5 // 与目标之间的上下距离
    }
  },
  edge: {
    width: 1,
    color: '#cccccc',
    selefLoop: {
      radius: 30,
      cross: 10
    },
    gap: 15,
    bilateralKey: 'brother',
    arrow: {
      show: false,
      size: 15
    },
    label: {
      type: TextType.TEXT,
      content: '',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: '400',
      color: '#333333',
      stroke: 'black',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4,
    },
  },
};

const WORLD_PADDING = 100;

export interface GraphOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  container: HTMLElement;
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  resources?: IAddOptions[];
  onprogress?: Function;
}

interface PixiGraphEvents {
  nodeClick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMousemove: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseover: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseout: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMousedown: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseup: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeRightclick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMove: (event: MouseEvent, nodeKey: string, point: IPointData) => void;
  
  edgeClick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMousemove: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseover: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseout: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMousedown: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseup: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeRightclick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  
  viewClick: (event: any) => void;
  // progress: (percentage: number) => void;
}

export class PixiGraph<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> extends TypedEmitter<PixiGraphEvents> {
  container: HTMLElement;
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  resources?: IAddOptions[];
  onprogress?: Function;

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
  // private nodeLabelLayer: Container;
  // private frontNodeLayer: Container;
  // private frontNodeLabelLayer: Container;
  private nodeKeyToNodeObject = new Map<string, PixiNode>();
  // private nodeKeyToNodeObjectTemp = new Map<string, PixiNode>();
  // private nodeTimer: ReturnType<typeof setTimeout> | null = null;
  private edgeKeyToEdgeObject = new Map<string, PixiEdge>();
  // private edgeKeyToNodeObjectTemp = new Map<string, PixiEdge>();
  // private edgeTimer: ReturnType<typeof setTimeout> | null = null;

  private mousedownNodeKey: string | null = null;
  // private mousedownEdgeKey: string | null = null;
  private nodeMouseX: number = 0;
  private nodeMouseY: number = 0;
  private edgeMouseX: number = 0;
  private edgeMouseY: number = 0;

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

  constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>) {
    super();

    this.container = options.container;
    this.graph = options.graph;
    this.style = options.style;
    this.hoverStyle = options.hoverStyle;
    this.resources = options.resources;
    this.onprogress = options.onprogress;

    if (!(this.container instanceof HTMLElement)) {
      throw new Error('container should be a HTMLElement');
    }

    // create PIXI application
    this.app = new Application({
      resizeTo: this.container,
      // resolution: window.devicePixelRatio,
      resolution: 2,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      powerPreference: "high-performance",
      // forceCanvas: true
    });
    this.container.appendChild(this.app.view);

    this.app.renderer.plugins.interaction.moveWhenInside = true;
    this.app.view.addEventListener('wheel', event => { event.preventDefault() });

    this.textureCache = new TextureCache(this.app.renderer);

    // create PIXI viewport
    this.viewport = new Viewport({
      screenWidth: this.container.clientWidth,
      screenHeight: this.container.clientHeight,
      worldWidth: this.container.clientWidth,
      worldHeight: this.container.clientHeight,
      interaction: this.app.renderer.plugins.interaction
    })
      .drag()
      .pinch()
      .wheel()
      // .decelerate()
      .clampZoom({ maxScale: 1.5, minScale: 0.1 });
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
    // this.nodeLabelLayer = new Container();
    // this.frontNodeLayer = new Container();
    // this.frontNodeLabelLayer = new Container();
    this.viewport.addChild(this.edgeLayer);
    this.viewport.addChild(this.edgeLabelLayer);
    // this.viewport.addChild(this.edgeArrowLayer);
    // this.viewport.addChild(this.frontEdgeLayer);
    // this.viewport.addChild(this.frontEdgeLabelLayer);
    // this.viewport.addChild(this.frontEdgeArrowLayer);
    this.viewport.addChild(this.nodeLayer);
    // this.viewport.addChild(this.nodeLabelLayer);
    // this.viewport.addChild(this.frontNodeLayer);
    // this.viewport.addChild(this.frontNodeLabelLayer);

    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.viewport.resize(this.container.clientWidth, this.container.clientHeight);
      this.updateGraphVisibility();
    });

    // preload resources
    if (this.resources) {
      this.app.loader.add(this.resources);
    }
    this.app.loader.load(() => {
      this.viewport.on('frame-end', () => {
        if (this.viewport.dirty) {
          this.updateGraphVisibility();
          this.viewport.dirty = false;
        }
      });

      this.resizeObserver.observe(this.container);

      // listen to graph changes
      this.graph.on('nodeAdded', this.onGraphNodeAddedBound);
      this.graph.on('edgeAdded', this.onGraphEdgeAddedBound);
      this.graph.on('nodeDropped', this.onGraphNodeDroppedBound);
      this.graph.on('edgeDropped', this.onGraphEdgeDroppedBound);
      this.graph.on('cleared', this.onGraphClearedBound);
      this.graph.on('edgesCleared', this.onGraphEdgesClearedBound);
      this.graph.on('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
      this.graph.on('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
      this.graph.on('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
      this.graph.on('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);

      this.viewport.on('clicked', (event) => {
        this.emit('viewClick', event);
      });

      // initial draw
      this.createGraph();
      this.resetView(this.graph.nodes());
    });
  }

  destroy() {
    this.graph.off('nodeAdded', this.onGraphNodeAddedBound);
    this.graph.off('edgeAdded', this.onGraphEdgeAddedBound);
    this.graph.off('nodeDropped', this.onGraphNodeDroppedBound);
    this.graph.off('edgeDropped', this.onGraphEdgeDroppedBound);
    this.graph.off('cleared', this.onGraphClearedBound);
    this.graph.off('edgesCleared', this.onGraphEdgesClearedBound);
    this.graph.off('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
    this.graph.off('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
    this.graph.off('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
    this.graph.off('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);

    this.resizeObserver.disconnect();
    this.resizeObserver = undefined!;

    this.textureCache.destroy();
    this.textureCache = undefined!;

    this.viewport.destroy();
    this.viewport = null!;

    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = undefined!;
  }

  private get zoomStep() {
    return Math.min(this.viewport.worldWidth, this.viewport.worldHeight) / 10;
  }

  zoomIn() {
    this.viewport.zoom(-this.zoomStep, true);
  }

  zoomOut() {
    this.viewport.zoom(this.zoomStep, true);
  }
  // 多次实例化，销毁实例无效，会造成内存溢出，临时处理方法：只实例化一次，由外层动态设置位置
  resetView(nodes: any[]) {
    if (!nodes.length) { // 设置一个能显示在窗口的，防止外面没调用此函数看不到内容
      this.viewport.center = new Point(this.container.clientWidth/2, this.container.clientHeight/2);
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
  
  private onGraphNodeAdded(data: { key: string, attributes: NodeAttributes }) {
    const nodeKey = data.key;
    const nodeAttributes = data.attributes;
    this.createNode(nodeKey, nodeAttributes);
  }

  private onGraphEdgeAdded(data: { key: string, attributes: EdgeAttributes, source: string, target: string }) {
    const edgeKey = data.key;
    const edgeAttributes = data.attributes;
    const sourceNodeKey = data.source;
    const targetNodeKey = data.target;
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.createEdge(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private onGraphNodeDropped(data: { key: string }) {
    const nodeKey = data.key;
    this.dropNode(nodeKey);
  }

  private onGraphEdgeDropped(data: { key: string }) {
    const edgeKey = data.key;
    this.dropEdge(edgeKey);
  }

  private onGraphCleared() {
    Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
    Array.from(this.nodeKeyToNodeObject.keys()).forEach(this.dropNode.bind(this));
  }

  private onGraphEdgesCleared() {
    Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
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
    
    const nodeLayerChildrens = this.nodeLayer.children;
    this.nodeLayer.setChildIndex(node.nodeGfx, nodeLayerChildrens.length - 1);
    this.nodeLayer.setChildIndex(node.nodeLabelGfx, nodeLayerChildrens.length - 1);
    this.nodeLayer.setChildIndex(node.nodeAttachGfx, nodeLayerChildrens.length - 1);
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

  private moveNode(nodeKey: string, point: IPointData, event: MouseEvent) {
    this.graph.setNodeAttribute(nodeKey, 'x', point.x);
    this.graph.setNodeAttribute(nodeKey, 'y', point.y);

    // update style
    this.updateNodeStyleByKey(nodeKey);
    this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));

    this.emit('nodeMove', event, nodeKey, point);
  }

  private enableNodeDragging() {
    this.viewport.pause = true; // disable viewport dragging

    document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
    document.addEventListener('mouseup', this.onDocumentMouseUpBound, { once: true });
  }

  private onDocumentMouseMove(event: MouseEvent) {
    const eventPosition = new Point(event.offsetX, event.offsetY);
    const worldPosition = this.viewport.toWorld(eventPosition);

    if (this.mousedownNodeKey) {
      this.moveNode(this.mousedownNodeKey, worldPosition, event);
    }
  }

  private onDocumentMouseUp() {
    this.viewport.pause = false; // enable viewport dragging

    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);

    this.mousedownNodeKey = null;
    // this.mousedownEdgeKey = null;
  }

  private createGraph() {
    console.time('create-render');
    // this.emit('progress', 0); // 线上使用时不生效
    this.onprogress && this.onprogress(0);
    this.graph.forEachNode(this.createNode.bind(this));
    // this.emit('progress', 50);
    this.onprogress && this.onprogress(50);
    this.graph.forEachEdge(this.createEdge.bind(this));
    // this.emit('progress', 100);
    this.onprogress && this.onprogress(100);
    console.timeEnd('create-render');
  }

  private createNode(nodeKey: string, nodeAttributes: NodeAttributes) {
    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, undefined];
    const nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, nodeAttributes);
    
    const node = new PixiNode({nodeStyle});
    node.on('mousemove', (event: MouseEvent) => {
      this.emit('nodeMousemove', event, nodeKey, nodeStyle);
    });
    node.on('mouseover', (event: MouseEvent) => {
      if (!this.mousedownNodeKey) {
        this.hoverNode(nodeKey);
      }
      this.emit('nodeMouseover', event, nodeKey, nodeStyle);
    });
    node.on('mouseout', (event: MouseEvent) => {
      if (!this.mousedownNodeKey) {
        this.unhoverNode(nodeKey);
      }
      this.emit('nodeMouseout', event, nodeKey, nodeStyle);
    });
    node.on('mousedown', (event: MouseEvent) => {
      this.nodeMouseX = event.offsetX;
      this.nodeMouseY = event.offsetY;
      this.mousedownNodeKey = nodeKey;
      this.enableNodeDragging();
      this.emit('nodeMousedown', event, nodeKey, nodeStyle);
    });
    node.on('mouseup', (event: MouseEvent) => {
      this.emit('nodeMouseup', event, nodeKey, nodeStyle);
      if (this.nodeMouseX === event.offsetX && this.nodeMouseY === event.offsetY) {
        this.emit('nodeClick', event, nodeKey, nodeStyle);
      }
    });
    node.on('rightclick', (event: MouseEvent) => {
      this.emit('nodeRightclick', event, nodeKey, nodeStyle);
    });

    // this.nodeKeyToNodeObjectTemp.set(nodeKey, node);
    // if (this.nodeTimer) clearTimeout(this.nodeTimer);
    // this.nodeTimer = setTimeout(() => {
    //   console.time('renderNode');
    //   this.nodeKeyToNodeObjectTemp.forEach((node) => {
    //     this.nodeLayer.addChild(node.nodeGfx, node.nodeLabelGfx);
    //   })
    //   console.timeEnd('renderNode');
    //   this.nodeKeyToNodeObjectTemp.clear();
    // }, 300)
    this.nodeLayer.addChild(node.nodeGfx, node.nodeLabelGfx, node.nodeAttachGfx);

    // this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    // this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
    // this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
    this.nodeKeyToNodeObject.set(nodeKey, node);

    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private createEdge(edgeKey: string, edgeAttributes: EdgeAttributes, sourceNodeKey: string, targetNodeKey: string, sourceNodeAttributes: NodeAttributes, targetNodeAttributes: NodeAttributes) {
    const selfLoop = sourceNodeKey === targetNodeKey;
    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, undefined];
    const edgeStyle = resolveStyleDefinitions(edgeStyleDefinitions, edgeAttributes);
    const bilateralByKey = edgeAttributes[edgeStyle.bilateralKey];
    const bilateralByGraph = this.graph.edges(targetNodeKey, sourceNodeKey).length > 1;
    const bilateral = (bilateralByKey === true ? bilateralByKey : false) || bilateralByGraph;

    const edge = new PixiEdge({selfLoop, bilateral});
    edge.on('mousemove', (event: MouseEvent) => {
      this.emit('edgeMousemove', event, edgeKey, edgeStyle);
    });
    edge.on('mouseover', (event: MouseEvent) => {
      this.hoverEdge(edgeKey);
      this.emit('edgeMouseover', event, edgeKey, edgeStyle);
    });
    edge.on('mouseout', (event: MouseEvent) => {
      this.unhoverEdge(edgeKey);
      this.emit('edgeMouseout', event, edgeKey, edgeStyle);
    });
    edge.on('mousedown', (event: MouseEvent) => {
      this.edgeMouseX = event.offsetX;
      this.edgeMouseY = event.offsetY;
      // this.mousedownEdgeKey = edgeKey;
      this.emit('edgeMousedown', event, edgeKey, edgeStyle);
    });
    edge.on('mouseup', (event: MouseEvent) => {
      this.emit('edgeMouseup', event, edgeKey, edgeStyle);
      if (this.edgeMouseX === event.offsetX && this.edgeMouseY === event.offsetY) {
        this.emit('edgeClick', event, edgeKey, edgeStyle);
      }
    });
    edge.on('rightclick', (event: MouseEvent) => {
      this.emit('edgeRightclick', event, edgeKey, edgeStyle);
    });

    // this.edgeKeyToNodeObjectTemp.set(edgeKey, edge);
    // if (this.edgeTimer) clearTimeout(this.edgeTimer);
    // this.edgeTimer = setTimeout(() => {
    //   console.time('renderEdge');
    //   this.edgeKeyToNodeObjectTemp.forEach((edge) => {
    //     this.edgeLayer.addChild(edge.edgeGfx, edge.edgeArrowGfx);
    //     this.edgeLabelLayer.addChild(edge.edgeLabelGfx);
    //   })
    //   console.timeEnd('renderEdge');
    //   this.edgeKeyToNodeObjectTemp.clear();
    // }, 300)
    this.edgeLayer.addChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.edgeLabelLayer.addChild(edge.edgeLabelGfx);

    // this.edgeArrowLayer.addChild(edge.edgeArrowGfx);
    // this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
    // this.frontEdgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
    // this.frontEdgeArrowLayer.addChild(edge.edgeArrowPlaceholderGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);

    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private dropNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    
    this.nodeLayer.removeChild(node.nodeGfx, node.nodeLabelGfx, node.nodeAttachGfx);
    // this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
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
  }

  private updateEdgeStyleByKey(edgeKey: string) {
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private updateEdgeStyle(edgeKey: string, edgeAttributes: EdgeAttributes, _sourceNodeKey: string, _targetNodeKey: string, sourceNodeAttributes: NodeAttributes, targetNodeAttributes: NodeAttributes) {
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
  }

  private updateGraphVisibility() {
    this.culling();

    // levels of detail
    const zoom = this.viewport.scale.x;
    const zoomSteps = [0.1, 0.2, 0.3, 0.4, 0.5, Infinity];
    const zoomStep = zoomSteps.findIndex(zoomStep => zoom <= zoomStep);

    this.graph.forEachNode(nodeKey => {
      const node = this.nodeKeyToNodeObject.get(nodeKey)!;
      node.updateVisibility(zoomStep);
    });

    this.graph.forEachEdge(edgeKey => {
      const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
      edge.updateVisibility(zoomStep);
    });
    // 处理隐藏线之后拖拽放大后线不显示问题(大量数据缩放会很卡)
    // if (zoomStep === 1) {
    //   this.onGraphEachEdgeAttributesUpdated();
    // }
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
  
  // 剔除
  culling() {
    this.cull.addAll((this.viewport.children as Container[]).map(layer => layer.children).flat());
    this.cull.cull(this.app.renderer.screen);
  }
  // 取消剔除
  uncull() {
    this.cull.uncull();
  }

  // 提取图片
  extract(full: boolean = true, format: string = 'image/png', quality: number = 0.92) {
    full && this.uncull();
    return this.app.renderer.plugins.extract.base64(this.viewport, format, quality);
  }
  
  // 激活拖拽
  dragEnable() {
    this.viewport.pause = false;
  }
  // 暂停拖拽
  dragDisable() {
    this.viewport.pause = true;
  }
}