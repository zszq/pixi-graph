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
  updateBatchEdge?: (edgeKey: string) => void;
  shouldDeferConnectedEdgeUpdates?: (nodeKey: string, degree: number) => boolean;
}


/**
 * 图数据 → 渲染对象的同步层（what）。
 *
 * 职责：把 Graphology 图的增删改事件（节点/边的 added/dropped/attributesUpdated）翻译成对
 * 应 PixiNode / PixiEdge 渲染对象的创建、销毁、样式与位置更新；并处理 hover 高亮、节点拖拽
 * 起手、平行边（同一对端点间多条边）的弧形偏移分组。
 *
 * 为什么单独成类（why）：PixiGraph 主类只负责"画布/视口/渲染调度"，把"数据模型 ↔ 渲染对象"
 * 的映射与维护抽到这里，保持职责单一、便于测试。所有渲染对象的生命周期都集中在此，避免散落各处
 * 导致增删不对称（内存泄漏）或样式/位置不同步。
 *
 * 关键设计：构造参数里的一组可选回调（markSpatialIndexDirty / updateFastNodePosition /
 * markBatchEdgesDirty / updateBatchEdge / shouldDeferConnectedEdgeUpdates）是与
 * GraphRenderController 的解耦边界——本类只在数据变化时"通知"渲染层把相应缓存标脏或局部更新，
 * 而不直接依赖渲染层实现，从而让两个控制器互不知晓彼此内部。
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
    this.updateBatchEdge = options.updateBatchEdge ?? (() => undefined);
    this.shouldDeferConnectedEdgeUpdates = options.shouldDeferConnectedEdgeUpdates ?? (() => false);
  }

  destroy(): void {
    this.edgeUpdateScheduler.clear();
    this.parallelEdgeIndex.clear();
  }

  // --- Graphology 图事件处理器 ---------------------------------------------
  // 以下 handleGraph* 由 GraphEventController 绑定到图的 nodeAdded/edgeDropped/
  // attributesUpdated 等事件。它们是"数据变更 → 渲染对象同步"的唯一入口，确保渲染对象与图
  // 数据始终一致；每个增删都顺带把空间索引/批量边缓存标脏（why：这些缓存按全量数据构建，
  // 数据一变就必须失效重建，否则会渲染出过期的节点位置或边）。

  handleGraphNodeAdded(data: { key: string; attributes: NodeAttributes }): void {
    this.markSpatialIndexDirty();
    this.markBatchEdgesDirty();
    this.createNode(data.key, data.attributes);
  }

  handleGraphNodeDropped(data: { key: string }): void {
    this.markSpatialIndexDirty();
    this.markBatchEdgesDirty();
    this.dropRenderedNodeEdges(data.key);
    this.dropNode(data.key);
  }

  handleGraphEdgeAdded(data: { key: string; attributes: EdgeAttributes; source: string; target: string }): void {
    this.markBatchEdgesDirty();
    this.createEdge(data.key, data.attributes, data.source, data.target);
  }

  handleGraphEdgeDropped(data: { key: string }): void {
    this.markBatchEdgesDirty();
    this.dropEdge(data.key);
  }

  handleGraphCleared(): void {
    this.markBatchEdgesDirty();
    this.parallelEdgeIndex.clear();
    for (const key of Array.from(this.edgeKeyToEdgeObject.keys())) this.dropEdge(key);
    for (const key of Array.from(this.nodeKeyToNodeObject.keys())) this.dropNode(key);
  }

  handleGraphEdgesCleared(): void {
    this.markBatchEdgesDirty();
    this.parallelEdgeIndex.clear();
    for (const key of Array.from(this.edgeKeyToEdgeObject.keys())) this.dropEdge(key);
  }

  handleGraphNodeAttributesUpdated(data: { key: string }): void {
    if (this.shouldIgnoreNodeAttributeUpdate(data.key)) return;
    // syncNodeByKey 返回“几何是否变化”。只有位置/尺寸/描边宽度变化才需要刷新相邻边。
    // 纯颜色/透明度/标签变化不影响边端点，避免在属性热路径里做多余边更新。
    if (this.syncNodeByKey(data.key)) {
      this.markSpatialIndexDirty();
      this.markBatchEdgesDirty();
      this.updateConnectedEdgesByNodeKey(data.key);
    }
  }

  handleGraphEdgeAttributesUpdated(data: { key: string }): void {
    this.updateEdgeStyleByKey(data.key);
  }

  // 全量节点属性更新（如整体重新布局后）：逐节点同步，并只收集"几何真正变化"的节点的相邻边
  // 一次性更新。why：用 Set 去重相邻边，避免相邻两端都动时同一条边被更新两次。
  handleGraphEachNodeAttributesUpdated(): void {
    const affectedEdges = new Set<string>();
    this.graph.forEachNode(nodeKey => {
      if (!this.syncNodeByKey(nodeKey)) return;
      this.graph.forEachEdge(nodeKey, edgeKey => affectedEdges.add(edgeKey));
    });
    if (affectedEdges.size > 0) {
      this.markSpatialIndexDirty();
      this.markBatchEdgesDirty();
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

  // 刷新某节点所有相邻边的位置（节点移动后边端点要跟随）。的 defer 分支：拖动高密度节点
  // （度数极大，如星形中心）会瞬间弄脏上千条边，同步全更会卡帧；交给 EdgeUpdateScheduler 分帧
  // 处理。immediate=true 用于必须立即一致的场景（如导出前 flush）。
  updateConnectedEdgesByNodeKey(nodeKey: string, immediate = false): void {
    const edgeKeys = this.graph.edges(nodeKey).filter(edgeKey => this.edgeKeyToEdgeObject.has(edgeKey));
    if (!immediate && this.shouldDeferConnectedEdgeUpdates(nodeKey, edgeKeys.length)) {
      this.edgeUpdateScheduler.markMany(edgeKeys, false);
      return;
    }
    for (const edgeKey of edgeKeys) this.updateEdgePositionByKey(edgeKey);
  }

  flushScheduledEdgeUpdates(): void {
    this.edgeUpdateScheduler.flushAll();
  }

  updateNodePositionByKey(nodeKey: string, position: PointData): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node) node.updatePosition(position);
    this.updateFastNodePosition(nodeKey, position);
  }

  endNodeDrag(nodeKey: string): void {
    this.mousedownNodeKey = null;
    const node = this.nodeKeyToNodeObject.get(nodeKey);
    if (node && node.hovered) {
      // 拖拽期间会屏蔽 hover 进入/离开事件；结束时主动清掉旧 hover，避免拖拽节点一直高亮。
      this.unhoverNode(nodeKey);
    }
    // 标脏节点空间索引：拖拽通过 suppressedNodeAttributeUpdates 跳过了属性更新事件（那里本会标脏），
    // 且逐帧 updateNodePositionByKey 也不标脏（避免每帧 O(N) 重建）。若结束时不补标脏，索引仍记录旧
    // 位置，之后平移的 fastCullNodes 会按旧位置把"已拖入视口的节点"误剔除——节点看不见却仍能 hover
    // 拖动（看起来像被边遮挡）。拖拽期 viewport.pause=true 无法同时平移，故只需结束时标脏一次。
    this.markSpatialIndexDirty();
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

  // 维护"平行边组"：同一对端点之间有多条边时需互相错开（isBilateral=true 触发弧形/侧移偏移），
  // 否则会完全重叠看不清。what：把本边登记进 ParallelEdgeIndex，取回该端点对的全部边；only-one
  // 时不偏移。要刷新整组：新增/删除一条平行边会改变整组的"是否平行"状态，组内每条边的偏移
  // 都得重算，否则旧成员仍按重叠方式绘制。
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

  // 把被 hover 的元素移到同层最后（绘制在最上层），避免高亮节点/边被相邻元素压住。
  // 提前 return：已在末尾时无需移动，省去无谓的子节点重排（hover 是高频事件）。
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
