import { type PointData } from 'pixi.js';
import type { AbstractGraph } from 'graphology-types';
import type { EdgeStyle, GraphStyleDefinition, NodeStyle } from '../style/style';
import { DEFAULT_STYLE } from '../core/constants';
import { resolveStyleDefinitions, sameEdgeStyle, sameNodeStyle } from '../style/style';
import { isSamePoint } from '../utils/pointer';
import { ParallelEdgeIndex } from '../core/ParallelEdgeIndex';
import { EdgeUpdateScheduler } from '../core/EdgeUpdateScheduler';
import { PixiNode } from '../elements/PixiNode';
import { PixiEdge } from '../elements/PixiEdge';
import type { TextureCache } from '../textures/TextureCache';
import type { GraphLayers } from '../renderers/GraphLayers';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';
import type { EventEmitter } from 'eventemitter3';
import type { PixiGraphEvents } from '../core/types';

type GraphEventEmitter = EventEmitter<PixiGraphEvents>;
type GraphEmit = GraphEventEmitter['emit'];

export interface GraphMutationControllerOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  textureCache: TextureCache;
  layers: GraphLayers;
  nodes: Map<string, PixiNode>;
  edges: Map<string, PixiEdge>;
  emit: GraphEmit;
  isCanvasTarget: () => boolean;
  isViewportDragging: () => boolean;
  shouldIgnoreNodeAttributeUpdate: (nodeKey: string) => boolean;
  startNodeDrag: (event: MouseEvent, nodeKey: string, node: PixiNode) => void;
  markSpatialIndexDirty?: () => void;
  updateFastNodePosition?: (nodeKey: string, position: PointData) => void;
  markBatchEdgesDirty?: () => void;
  markBatchEdgeIndexDirty?: () => void;
  updateBatchEdgeIndex?: (edgeKey: string) => void;
  updateBatchEdgeIndexMany?: (edgeKeys: Iterable<string>) => void;
  updateBatchEdge?: (edgeKey: string) => void;
  shouldDeferConnectedEdgeUpdates?: (nodeKey: string, degree: number) => boolean;
}

/**
 * Owns graph mutation, hover, and element lifecycle concerns.
 */
export class GraphMutationController<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  private readonly graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  private readonly style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  private readonly hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  private readonly textureCache: TextureCache;
  private readonly layers: GraphLayers;
  private readonly nodeKeyToNodeObject: Map<string, PixiNode>;
  private readonly edgeKeyToEdgeObject: Map<string, PixiEdge>;
  private readonly emit: GraphEmit;
  private readonly isCanvasTarget: () => boolean;
  private readonly isViewportDragging: () => boolean;
  private readonly shouldIgnoreNodeAttributeUpdate: (nodeKey: string) => boolean;
  private readonly startNodeDrag: (event: MouseEvent, nodeKey: string, node: PixiNode) => void;
  private readonly markSpatialIndexDirty: () => void;
  private readonly updateFastNodePosition: (nodeKey: string, position: PointData) => void;
  private readonly markBatchEdgesDirty: () => void;
  private readonly markBatchEdgeIndexDirty: () => void;
  private readonly updateBatchEdgeIndexMany: (edgeKeys: Iterable<string>) => void;
  private readonly updateBatchEdge: (edgeKey: string) => void;
  private readonly shouldDeferConnectedEdgeUpdates: (nodeKey: string, degree: number) => boolean;
  private readonly parallelEdgeIndex = new ParallelEdgeIndex();
  private readonly edgeUpdateScheduler = new EdgeUpdateScheduler(edgeKey => this.updateEdgePositionByKey(edgeKey));

  private mousedownNodeKey: string | null = null;
  private nodeMouseStartX = 0;
  private nodeMouseStartY = 0;
  private nodeMouseEndX = 0;
  private nodeMouseEndY = 0;
  private edgeMouseX = 0;
  private edgeMouseY = 0;

  constructor(options: GraphMutationControllerOptions<NodeAttributes, EdgeAttributes>) {
    this.graph = options.graph;
    this.style = options.style;
    this.hoverStyle = options.hoverStyle;
    this.textureCache = options.textureCache;
    this.layers = options.layers;
    this.nodeKeyToNodeObject = options.nodes;
    this.edgeKeyToEdgeObject = options.edges;
    this.emit = options.emit;
    this.isCanvasTarget = options.isCanvasTarget;
    this.isViewportDragging = options.isViewportDragging;
    this.shouldIgnoreNodeAttributeUpdate = options.shouldIgnoreNodeAttributeUpdate;
    this.startNodeDrag = options.startNodeDrag;
    this.markSpatialIndexDirty = options.markSpatialIndexDirty ?? (() => undefined);
    this.updateFastNodePosition = options.updateFastNodePosition ?? (() => undefined);
    this.markBatchEdgesDirty = options.markBatchEdgesDirty ?? (() => undefined);
    this.markBatchEdgeIndexDirty = options.markBatchEdgeIndexDirty ?? this.markBatchEdgesDirty;
    this.updateBatchEdgeIndexMany = options.updateBatchEdgeIndexMany ?? (() => this.markBatchEdgeIndexDirty());
    this.updateBatchEdge = options.updateBatchEdge ?? (() => undefined);
    this.shouldDeferConnectedEdgeUpdates = options.shouldDeferConnectedEdgeUpdates ?? (() => false);
  }

  destroy(): void {
    this.edgeUpdateScheduler.clear();
    this.parallelEdgeIndex.clear();
  }

  handleGraphNodeAdded(data: { key: string; attributes: NodeAttributes }): void {
    this.markSpatialIndexDirty();
    this.markBatchEdgeIndexDirty();
    this.createNode(data.key, data.attributes);
  }

  handleGraphNodeDropped(data: { key: string }): void {
    this.markSpatialIndexDirty();
    this.markBatchEdgeIndexDirty();
    this.dropRenderedNodeEdges(data.key);
    this.dropNode(data.key);
  }

  handleGraphEdgeAdded(data: { key: string; attributes: EdgeAttributes; source: string; target: string }): void {
    this.markBatchEdgeIndexDirty();
    this.createEdge(data.key, data.attributes, data.source, data.target);
  }

  handleGraphEdgeDropped(data: { key: string }): void {
    this.markBatchEdgeIndexDirty();
    this.dropEdge(data.key);
  }

  handleGraphCleared(): void {
    this.markBatchEdgeIndexDirty();
    this.parallelEdgeIndex.clear();
    for (const key of Array.from(this.edgeKeyToEdgeObject.keys())) this.dropEdge(key);
    for (const key of Array.from(this.nodeKeyToNodeObject.keys())) this.dropNode(key);
  }

  handleGraphEdgesCleared(): void {
    this.markBatchEdgeIndexDirty();
    this.parallelEdgeIndex.clear();
    for (const key of Array.from(this.edgeKeyToEdgeObject.keys())) this.dropEdge(key);
  }

  handleGraphNodeAttributesUpdated(data: { key: string }): void {
    if (this.shouldIgnoreNodeAttributeUpdate(data.key)) return;
    // syncNodeByKey 返回“几何是否变化”。只有位置/尺寸/描边宽度变化才需要刷新相邻边。
    // 纯颜色/透明度/标签变化不影响边端点，避免在属性热路径里做多余边更新。
    if (this.syncNodeByKey(data.key)) {
      this.markSpatialIndexDirty();
      const edgeKeys = this.connectedRenderedEdgeKeys(data.key);
      this.updateBatchEdgeIndexMany(edgeKeys);
      this.updateConnectedEdgesByKeys(edgeKeys, data.key);
    }
  }

  handleGraphEdgeAttributesUpdated(data: { key: string }): void {
    this.updateEdgeStyleByKey(data.key);
  }

  handleGraphEachNodeAttributesUpdated(): void {
    const affectedEdges = new Set<string>();
    this.graph.forEachNode(nodeKey => {
      if (!this.syncNodeByKey(nodeKey)) return;
      this.graph.forEachEdge(nodeKey, edgeKey => affectedEdges.add(edgeKey));
    });
    if (affectedEdges.size > 0) {
      this.markSpatialIndexDirty();
      this.updateBatchEdgeIndexMany(affectedEdges);
    }
    for (const edgeKey of affectedEdges) this.updateEdgePositionByKey(edgeKey);
  }

  handleGraphEachEdgeAttributesUpdated(): void {
    this.graph.forEachEdge(this.updateEdgeStyleByKey.bind(this));
  }

  setNodeVisible(nodeKey: string, visible: boolean): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node) node.setVisible(visible);
  }

  isNodeVisible(nodeKey: string): boolean | undefined {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    return node?.isVisible();
  }

  setEdgeVisible(edgeKey: string, visible: boolean): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (edge) {
      edge.setVisible(visible);
      this.markBatchEdgesDirty();
    }
  }

  isEdgeVisible(edgeKey: string): boolean | undefined {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    return edge?.isVisible();
  }

  setNodeEdgesRenderable(nodeKey: string, renderable: boolean): void {
    this.graph.forEachEdge(nodeKey, edgeKey => {
      const edge = this.edgeKeyToEdgeObject.get(edgeKey);
      if (!edge) return;
      edge.setRenderable(renderable);
      if (renderable) this.updateEdgeStyleByKey(edgeKey);
    });
  }

  updateNodeStyleByKey(nodeKey: string): void {
    this.syncNodeByKey(nodeKey);
  }

  updateEdgeStyleByKey(edgeKey: string): void {
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, this.graph.getNodeAttributes(sourceNodeKey), this.graph.getNodeAttributes(targetNodeKey));
    this.markBatchEdgesDirty();
  }

  updateConnectedEdgesByNodeKey(nodeKey: string, immediate = false): void {
    const edgeKeys = this.connectedRenderedEdgeKeys(nodeKey);
    this.updateConnectedEdgesByKeys(edgeKeys, nodeKey, immediate);
  }

  private updateConnectedEdgesByKeys(edgeKeys: string[], nodeKey: string, immediate = false): void {
    if (!immediate && this.shouldDeferConnectedEdgeUpdates(nodeKey, edgeKeys.length)) {
      this.edgeUpdateScheduler.markMany(edgeKeys, false);
      return;
    }
    for (const edgeKey of edgeKeys) this.updateEdgePositionByKey(edgeKey);
  }

  private connectedRenderedEdgeKeys(nodeKey: string): string[] {
    return this.graph.edges(nodeKey).filter(edgeKey => this.edgeKeyToEdgeObject.has(edgeKey));
  }

  flushScheduledEdgeUpdates(): void {
    this.edgeUpdateScheduler.flushAll();
  }

  updateNodePositionByKey(nodeKey: string, position: PointData): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node) node.updatePosition(position);
    this.updateFastNodePosition(nodeKey, position);
    this.markSpatialIndexDirty();
    this.updateBatchEdgeIndexMany(this.connectedRenderedEdgeKeys(nodeKey));
  }

  endNodeDrag(nodeKey: string): void {
    this.mousedownNodeKey = null;
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node && node.hovered) {
      // 拖拽期间会屏蔽 hover 进入/离开事件；结束时主动清掉旧 hover，避免拖拽节点一直高亮。
      this.unhoverNode(nodeKey);
    }
  }

  updateEdgePositionByKey(edgeKey: string): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    const sourceNode = this.nodeKeyToNodeObject.get(sourceNodeKey)!;
    const targetNode = this.nodeKeyToNodeObject.get(targetNodeKey)!;

    edge.updatePosition(
      { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y },
      { x: targetNodeAttributes.x, y: targetNodeAttributes.y },
      edge.edgeStyle ?? this.resolveEdgeStyle(edge, this.graph.getEdgeAttributes(edgeKey)),
      sourceNode.nodeStyle,
      targetNode.nodeStyle
    );
    this.updateBatchEdge(edgeKey);
  }

  private createNode(nodeKey: string, nodeAttributes: NodeAttributes): void {
    const nodeStyle = resolveStyleDefinitions([DEFAULT_STYLE.node, this.style.node, undefined], nodeAttributes);
    const node = new PixiNode({ nodeStyle });

    node.on('mousemove', event => this.emit('nodeMousemove', event, nodeKey, node.nodeStyle));
    node.on('mouseover', event => {
      if (!this.isCanvasTarget()) return;
      if (!this.mousedownNodeKey && !this.isViewportDragging()) {
        this.hoverNode(nodeKey);
        this.emit('nodeMouseover', event, nodeKey, node.nodeStyle);
      }
    });
    node.on('mouseout', event => {
      if (!this.mousedownNodeKey && !this.isViewportDragging()) {
        this.unhoverNode(nodeKey);
        this.emit('nodeMouseout', event, nodeKey, node.nodeStyle);
      }
    });
    node.on('mousedown', event => {
      this.nodeMouseStartX = event.offsetX;
      this.nodeMouseStartY = event.offsetY;
      this.mousedownNodeKey = nodeKey;
      this.startNodeDrag(event, nodeKey, node);
      this.emit('nodeMousedown', event, nodeKey, node.nodeStyle);
    });
    node.on('mouseup', event => {
      this.nodeMouseEndX = event.offsetX;
      this.nodeMouseEndY = event.offsetY;
      this.emit('nodeMouseup', event, nodeKey, node.nodeStyle);
    });
    node.on('click', event => {
      if (isSamePoint({ x: this.nodeMouseStartX, y: this.nodeMouseStartY }, { x: this.nodeMouseEndX, y: this.nodeMouseEndY }, 2)) {
        this.emit('nodeClick', event, nodeKey, node.nodeStyle);
      }
    });
    node.on('dbclick', event => {
      if (isSamePoint({ x: this.nodeMouseStartX, y: this.nodeMouseStartY }, { x: this.nodeMouseEndX, y: this.nodeMouseEndY }, 2)) {
        this.emit('nodeDbclick', event, nodeKey, node.nodeStyle);
      }
    });
    node.on('rightclick', event => this.emit('nodeRightclick', event, nodeKey, node.nodeStyle));

    this.layers.nodeLayer.addChild(node.nodeGfx);
    this.layers.nodeLabelLayer.addChild(node.nodeLabelGfx);
    this.nodeKeyToNodeObject.set(nodeKey, node);

    this.syncNodeByKey(nodeKey, nodeAttributes, true);
  }

  private createEdge(edgeKey: string, edgeAttributes: EdgeAttributes, sourceNodeKey: string, targetNodeKey: string): void {
    const edgeStyle = resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, undefined], edgeAttributes);
    const selfLoop = sourceNodeKey === targetNodeKey;
    const edge = new PixiEdge({ selfLoop });

    edge.on('mousemove', event => this.emit('edgeMousemove', event, edgeKey, edge.edgeStyle ?? edgeStyle));
    edge.on('mouseover', event => {
      if (!this.isCanvasTarget()) return;
      if (!this.mousedownNodeKey && !this.isViewportDragging()) {
        this.hoverEdge(edgeKey);
        this.emit('edgeMouseover', event, edgeKey, edge.edgeStyle ?? edgeStyle);
      }
    });
    edge.on('mouseout', event => {
      if (!this.mousedownNodeKey && !this.isViewportDragging()) {
        this.unhoverEdge(edgeKey);
        this.emit('edgeMouseout', event, edgeKey, edge.edgeStyle ?? edgeStyle);
      }
    });
    edge.on('mousedown', event => {
      this.edgeMouseX = event.offsetX;
      this.edgeMouseY = event.offsetY;
      this.emit('edgeMousedown', event, edgeKey, edge.edgeStyle ?? edgeStyle);
    });
    edge.on('mouseup', event => this.emit('edgeMouseup', event, edgeKey, edge.edgeStyle ?? edgeStyle));
    edge.on('click', event => {
      if (isSamePoint({ x: this.edgeMouseX, y: this.edgeMouseY }, { x: event.offsetX, y: event.offsetY }, 2)) {
        this.emit('edgeClick', event, edgeKey, edge.edgeStyle ?? edgeStyle);
      }
    });
    edge.on('dbclick', event => {
      if (isSamePoint({ x: this.edgeMouseX, y: this.edgeMouseY }, { x: event.offsetX, y: event.offsetY }, 2)) {
        this.emit('edgeDbclick', event, edgeKey, edge.edgeStyle ?? edgeStyle);
      }
    });
    edge.on('rightclick', event => this.emit('edgeRightclick', event, edgeKey, edge.edgeStyle ?? edgeStyle));

    this.layers.edgeLayer.addChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.layers.edgeLabelLayer.addChild(edge.edgeLabelGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);

    this.updateParallelEdgeGroup(edgeKey, sourceNodeKey, targetNodeKey);
  }

  private hoverNode(nodeKey: string): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (node.hovered) return;
    node.hovered = true;
    if (this.syncNodeByKey(nodeKey)) {
      this.markBatchEdgesDirty();
      this.updateConnectedEdgesByNodeKey(nodeKey);
    }
    this.moveToFront(this.layers.nodeLayer, node.nodeGfx);
    this.moveToFront(this.layers.nodeLabelLayer, node.nodeLabelGfx);
  }

  private unhoverNode(nodeKey: string): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (!node.hovered) return;
    node.hovered = false;
    if (this.syncNodeByKey(nodeKey)) {
      this.markBatchEdgesDirty();
      this.updateConnectedEdgesByNodeKey(nodeKey);
    }
  }

  private hoverEdge(edgeKey: string): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (edge.hovered) return;
    edge.hovered = true;
    this.updateEdgeStyleByKey(edgeKey);
    this.markBatchEdgesDirty();
    this.moveToFront(this.layers.edgeLayer, edge.edgeGfx);
    this.moveToFront(this.layers.edgeLayer, edge.edgeArrowGfx);
    this.moveToFront(this.layers.edgeLabelLayer, edge.edgeLabelGfx);
  }

  private unhoverEdge(edgeKey: string): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (!edge.hovered) return;
    edge.hovered = false;
    this.updateEdgeStyleByKey(edgeKey);
    this.markBatchEdgesDirty();
  }

  private syncNodeByKey(nodeKey: string, nodeAttributes?: NodeAttributes, forceStyle = false): boolean {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    const attributes = nodeAttributes ?? this.graph.getNodeAttributes(nodeKey);
    const nodeStyle = this.resolveNodeStyle(node, attributes);
    // 边几何只依赖节点中心、半径和描边宽度。把这个判断集中在这里，
    // 上层可用返回值决定是否更新相邻边，避免全量保守刷新。
    const geometryChanged =
      node.nodeGfx.x !== attributes.x || node.nodeGfx.y !== attributes.y || node.nodeStyle.size !== nodeStyle.size || node.nodeStyle.border.width !== nodeStyle.border.width;

    node.updatePosition({ x: attributes.x, y: attributes.y });
    if (forceStyle || !sameNodeStyle(node.nodeStyle, nodeStyle)) {
      node.updateStyle(nodeStyle, this.textureCache);
      node.updateAlpha(nodeStyle);
      this.markBatchEdgesDirty();
    }
    return geometryChanged;
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

    const edgeStyle = this.resolveEdgeStyle(edge, edgeAttributes);
    if (!sameEdgeStyle(edge.edgeStyle, edgeStyle)) {
      edge.updateStyle(edgeStyle, this.textureCache);
      edge.updateAlpha(edgeStyle);
      this.markBatchEdgesDirty();
    }

    edge.updatePosition(
      { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y },
      { x: targetNodeAttributes.x, y: targetNodeAttributes.y },
      edgeStyle,
      sourceNode.nodeStyle,
      targetNode.nodeStyle
    );
    this.updateBatchEdge(edgeKey);
  }

  private resolveNodeStyle(node: PixiNode, nodeAttributes: NodeAttributes): NodeStyle {
    return resolveStyleDefinitions([DEFAULT_STYLE.node, this.style.node, node.hovered ? this.hoverStyle.node : undefined], nodeAttributes);
  }

  private resolveEdgeStyle(edge: PixiEdge, edgeAttributes: EdgeAttributes): EdgeStyle {
    return resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined], edgeAttributes);
  }

  private updateParallelEdgeGroup(edgeKey: string, sourceNodeKey: string, targetNodeKey: string): void {
    const parallelEdgeKeys = this.parallelEdgeIndex.register(edgeKey, sourceNodeKey, targetNodeKey);
    const hasParallelEdges = parallelEdgeKeys.length > 1;

    for (const key of parallelEdgeKeys) {
      const edge = this.edgeKeyToEdgeObject.get(key);
      if (!edge) continue;
      edge.isBilateral = hasParallelEdges;
      this.markBatchEdgesDirty();
      if (key === edgeKey) {
        this.updateEdgeStyleByKey(key);
      } else {
        this.updateEdgePositionByKey(key);
      }
    }
  }

  private moveToFront(layer: { children: Array<unknown>; setChildIndex(child: any, index: number): void }, child: unknown): void {
    const lastIndex = layer.children.length - 1;
    if (lastIndex < 0 || layer.children[lastIndex] === child) return;
    layer.setChildIndex(child, lastIndex);
  }

  private dropNode(nodeKey: string): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (!node) return;
    this.layers.nodeLayer.removeChild(node.nodeGfx);
    this.layers.nodeLabelLayer.removeChild(node.nodeLabelGfx);
    this.nodeKeyToNodeObject.delete(nodeKey);
    node.destroy();
  }

  private dropRenderedNodeEdges(nodeKey: string): void {
    for (const edgeKey of Array.from(this.edgeKeyToEdgeObject.keys())) {
      if (!this.graph.hasEdge(edgeKey)) {
        this.dropEdge(edgeKey);
        continue;
      }
      if (this.graph.source(edgeKey) === nodeKey || this.graph.target(edgeKey) === nodeKey) {
        this.dropEdge(edgeKey);
      }
    }
  }

  private dropEdge(edgeKey: string): void {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (!edge) return;
    const parallelEdgeKeys = this.parallelEdgeIndex.unregister(edgeKey);
    this.layers.edgeLayer.removeChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.layers.edgeLabelLayer.removeChild(edge.edgeLabelGfx);
    this.edgeKeyToEdgeObject.delete(edgeKey);
    edge.destroy();
    for (const parallelEdgeKey of parallelEdgeKeys) {
      if (this.graph.hasEdge(parallelEdgeKey)) {
        this.updateParallelEdgeGroup(parallelEdgeKey, this.graph.source(parallelEdgeKey), this.graph.target(parallelEdgeKey));
      }
    }
  }
}
