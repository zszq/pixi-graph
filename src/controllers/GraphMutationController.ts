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
  updateFastNodeStyle?: (nodeKey: string) => void;
  markBatchEdgesDirty?: () => void;
  updateBatchEdge?: (edgeKey: string) => void;
  shouldDeferConnectedEdgeUpdates?: (nodeKey: string, degree: number) => boolean;
  markLodDirty?: () => void;
  // 仅置 viewport.dirty（不作废 LOD 缓存）：删除元素只需触发一次 frame-end 的批量边重建来清掉
  // 残留粒子，剩余元素的 LOD/标签烘焙无变化，无需像 markLodDirty 那样强制下一帧跑全量 O(N+E) 循环。
  markViewportDirty?: () => void;
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
  private readonly updateFastNodeStyle: (nodeKey: string) => void;
  private readonly markBatchEdgesDirty: () => void;
  private readonly updateBatchEdge: (edgeKey: string) => void;
  private readonly shouldDeferConnectedEdgeUpdates: (nodeKey: string, degree: number) => boolean;
  private readonly markLodDirty: () => void;
  private readonly markViewportDirty: () => void;
  private readonly parallelEdgeIndex = new ParallelEdgeIndex();
  private readonly edgeUpdateScheduler = new EdgeUpdateScheduler(edgeKey => this.updateEdgePositionByKey(edgeKey));

  private mousedownNodeKey: string | null = null;
  // 当前被 hover 的边及其来源。why：批量高性能模式下边线/箭头不可命中，hover 由游标拾取(source='pick')
  // 触发；普通模式/标签则由真实指针事件(source='event')触发。统一经此单一 active 跟踪去重，避免两路同时
  // 触发造成 edgeMouseover/out 重复 emit 或 hover 态错乱。
  private activeHoverEdgeKey: string | null = null;
  private edgeHoverSource: 'event' | 'pick' = 'event';
  // 当前是否有节点处于 hover：游标拾取时若光标在节点上则不拾取边（节点 hover 优先）。
  private hoveredNodeKey: string | null = null;
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
    this.updateFastNodeStyle = options.updateFastNodeStyle ?? (() => undefined);
    this.markBatchEdgesDirty = options.markBatchEdgesDirty ?? (() => undefined);
    this.updateBatchEdge = options.updateBatchEdge ?? (() => undefined);
    this.shouldDeferConnectedEdgeUpdates = options.shouldDeferConnectedEdgeUpdates ?? (() => false);
    this.markLodDirty = options.markLodDirty ?? (() => undefined);
    this.markViewportDirty = options.markViewportDirty ?? (() => undefined);
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
    // 新元素的首次 LOD/标签烘焙依赖下一次完整可见性循环，必须作废档位缓存（见 invalidateLod 注释）
    this.markLodDirty();
    this.createNode(data.key, data.attributes);
  }

  handleGraphNodeDropped(data: { key: string }): void {
    this.markSpatialIndexDirty();
    this.markBatchEdgesDirty();
    // 删除必须置 viewport.dirty：批量边的实际重建由 frame-end 的 updateVisibility 驱动，而删除后
    // 若无后续平移/缩放，viewport 永远不脏，被删边的粒子会一直残留在批量缓冲里逐帧绘制（表现为
    // “删掉节点后连线仍在，拖动画布才消失”）。这里用 markViewportDirty 而非 markLodDirty：删除不
    // 产生新的待烘焙元素、剩余元素 LOD 不变，只需触发一次批量重建，无需强制全量 O(N+E) LOD 循环。
    this.markViewportDirty();
    this.dropRenderedNodeEdges(data.key);
    this.dropNode(data.key);
  }

  handleGraphEdgeAdded(data: { key: string; attributes: EdgeAttributes; source: string; target: string }): void {
    this.markBatchEdgesDirty();
    this.markLodDirty();
    this.createEdge(data.key, data.attributes, data.source, data.target);
  }

  handleGraphEdgeDropped(data: { key: string }): void {
    this.markBatchEdgesDirty();
    this.markViewportDirty(); // 同 handleGraphNodeDropped：否则批量模式下被删边残留到下次平移才消失
    this.dropEdge(data.key);
  }

  handleGraphCleared(): void {
    this.markBatchEdgesDirty();
    this.markViewportDirty(); // 同 handleGraphNodeDropped：否则批量模式下被删边残留到下次平移才消失
    this.parallelEdgeIndex.clear();
    for (const key of Array.from(this.edgeKeyToEdgeObject.keys())) this.dropEdge(key);
    for (const key of Array.from(this.nodeKeyToNodeObject.keys())) this.dropNode(key);
  }

  handleGraphEdgesCleared(): void {
    this.markBatchEdgesDirty();
    this.markViewportDirty(); // 同 handleGraphNodeDropped：否则批量模式下被删边残留到下次平移才消失
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

  // 刷新某节点所有相邻边的位置（节点移动后边端点要跟随）。defer 分支：拖动高密度节点
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
        this.enterEdgeHover(edgeKey, event as unknown as MouseEvent, 'event');
      }
    });
    edge.on('mouseout', event => {
      if (!this.mousedownNodeKey && !this.isViewportDragging()) {
        this.leaveEdgeHoverByEvent(edgeKey, event as unknown as MouseEvent);
      }
    });
    // 批量高性能模式下边线/箭头不可命中,离散事件(按下/抬起/单双击/右键)统一由 PixiGraph 的 canvas
    // DOM 监听经 emitPickedEdgeEvent 转发(复用当前 hover 边);此处仅在非批量模式生效,避免标签的 PIXI
    // 离散事件与 DOM 路径对同一边重复 emit。hover(mouseover/mouseout)两种模式都保留、已统一去重。
    edge.on('mousedown', event => {
      if (this.layers.isBatchEdgesEnabled()) return;
      this.edgeMouseX = event.offsetX;
      this.edgeMouseY = event.offsetY;
      this.emit('edgeMousedown', event, edgeKey, edge.edgeStyle ?? edgeStyle);
    });
    edge.on('mouseup', event => {
      if (this.layers.isBatchEdgesEnabled()) return;
      this.emit('edgeMouseup', event, edgeKey, edge.edgeStyle ?? edgeStyle);
    });
    edge.on('click', event => {
      if (this.layers.isBatchEdgesEnabled()) return;
      if (isSamePoint({ x: this.edgeMouseX, y: this.edgeMouseY }, { x: event.offsetX, y: event.offsetY }, 2)) {
        this.emit('edgeClick', event, edgeKey, edge.edgeStyle ?? edgeStyle);
      }
    });
    edge.on('dbclick', event => {
      if (this.layers.isBatchEdgesEnabled()) return;
      if (isSamePoint({ x: this.edgeMouseX, y: this.edgeMouseY }, { x: event.offsetX, y: event.offsetY }, 2)) {
        this.emit('edgeDbclick', event, edgeKey, edge.edgeStyle ?? edgeStyle);
      }
    });
    edge.on('rightclick', event => {
      if (this.layers.isBatchEdgesEnabled()) return;
      this.emit('edgeRightclick', event, edgeKey, edge.edgeStyle ?? edgeStyle);
    });

    this.layers.edgeLayer.addChild(edge.edgeGfx, edge.edgeArrowGfx);
    this.layers.edgeLabelLayer.addChild(edge.edgeLabelGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);

    this.updateParallelEdgeGroup(edgeKey, sourceNodeKey, targetNodeKey);
  }

  private hoverNode(nodeKey: string): void {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (node.hovered) return;
    this.hoveredNodeKey = nodeKey; // 记录:供游标拾取判断“光标在节点上则不拾取边”
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
    if (this.hoveredNodeKey === nodeKey) this.hoveredNodeKey = null;
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

  // 是否有节点处于 hover（供 PixiGraph 的游标拾取判断:光标在节点上时不拾取边）。
  isNodeHovered(): boolean {
    return this.hoveredNodeKey !== null;
  }

  // 是否有边正经由真实指针事件('event' 源,即光标压在某边标签上)被 hover。供游标拾取判断:此时拾取
  // 应让路,不得越过标签去命中其下方的另一条边而抢走高亮——标签所属的边优先(对称于 isNodeHovered)。
  isEdgeEventHovered(): boolean {
    return this.activeHoverEdgeKey !== null && this.edgeHoverSource === 'event';
  }

  // 游标拾取结果入口（供 PixiGraph 在 pointermove 调用）。edgeKey 为拾取到的边、null 为未命中。
  // 仅 'pick' 来源的 hover 由拾取负责移出；'event' 来源（标签等真实指针事件）由其自身 mouseout 负责，
  // 避免光标仍停在标签上时被拾取的空结果误移出。
  setPickedEdge(edgeKey: string | null, event: MouseEvent): void {
    if (edgeKey) {
      this.enterEdgeHover(edgeKey, event, 'pick');
    } else if (this.activeHoverEdgeKey && this.edgeHoverSource === 'pick') {
      this.clearEdgeHover(event);
    }
  }

  // 批量模式下边线/箭头的离散事件入口(供 PixiGraph 的 canvas DOM 监听调用):用当前 hover 边
  // (由游标拾取或标签 hover 维护的 activeHoverEdgeKey)转发对应事件。无 hover 边则不触发——这天然
  // 把"光标在节点/空白处"排除(那时 activeHoverEdgeKey 为 null),也天然防拖拽误触(拖拽中拾取已清空它)。
  emitPickedEdgeEvent(type: 'edgeMousedown' | 'edgeMouseup' | 'edgeClick' | 'edgeDbclick' | 'edgeRightclick', event: MouseEvent): void {
    const edgeKey = this.activeHoverEdgeKey;
    if (!edgeKey) return;
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (!edge || !this.graph.hasEdge(edgeKey)) return;
    this.emit(type, event, edgeKey, edge.edgeStyle ?? this.resolveEdgeStyle(edge, this.graph.getEdgeAttributes(edgeKey)));
  }

  // 统一的边 hover 进入：去重(同一边重复进入只刷新来源)，切换前先移出旧边，再高亮新边并 emit。
  private enterEdgeHover(edgeKey: string, event: MouseEvent, source: 'event' | 'pick'): void {
    if (this.activeHoverEdgeKey === edgeKey) {
      this.edgeHoverSource = source;
      return;
    }
    this.clearEdgeHover(event);
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (!edge) return;
    this.activeHoverEdgeKey = edgeKey;
    this.edgeHoverSource = source;
    this.hoverEdge(edgeKey);
    this.emit('edgeMouseover', event, edgeKey, edge.edgeStyle ?? this.resolveEdgeStyle(edge, this.graph.getEdgeAttributes(edgeKey)));
  }

  // 真实指针事件(标签等)移出某边时调用：仅当它正是当前 active 边才移出。
  private leaveEdgeHoverByEvent(edgeKey: string, event: MouseEvent): void {
    if (this.activeHoverEdgeKey !== edgeKey) return;
    // source==='pick'：光标虽离开了细线/标签的 PIXI 命中区，但仍在拾取容差内——不在这里拆除，
    // 交给下一帧 runEdgePick 决定(仍命中则保留、离开容差才 setPickedEdge(null) 清除)。否则会先
    // emit 一次 edgeMouseout、紧接着拾取又 emit edgeMouseover，造成一次性 out→in 抖动。
    // source==='event'(纯标签 hover、拾取够不到线)时仍须由本事件负责移出。
    if (this.edgeHoverSource === 'pick') return;
    this.clearEdgeHover(event);
  }

  // 移出当前 active 边：清状态、取消高亮并 emit edgeMouseout。
  private clearEdgeHover(event: MouseEvent): void {
    const edgeKey = this.activeHoverEdgeKey;
    if (!edgeKey) return;
    this.activeHoverEdgeKey = null;
    const edge = this.edgeKeyToEdgeObject.get(edgeKey);
    if (this.graph.hasEdge(edgeKey)) this.unhoverEdge(edgeKey);
    if (edge) this.emit('edgeMouseout', event, edgeKey, edge.edgeStyle ?? this.resolveEdgeStyle(edge, this.graph.getEdgeAttributes(edgeKey)));
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
      // 同步 fast 粒子的颜色/透明度，否则纯样式变化（geometryChanged=false 不走标脏路径）后
      // 再进高性能隐藏态，粒子仍显示旧样式（见 GraphRenderController.updateFastNodeStyle）。
      this.updateFastNodeStyle(nodeKey);
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
    // hover 态下被移除的节点：PIXI 不会对已销毁对象补发 mouseout，若不在此主动清理，hoveredNodeKey
    // 会永久残留——既让游标拾取因 isNodeHovered 恒真而不再拾取边，也让外部依赖 nodeMouseout 清除高亮
    // 的代码收不到事件、高亮迟迟不消失。故销毁前补一次移出：清 hover 状态并补发 nodeMouseout（无真实
    // 指针事件，用合成 MouseEvent 占位）。
    if (this.hoveredNodeKey === nodeKey) this.hoveredNodeKey = null;
    if (node.hovered) {
      node.hovered = false;
      this.emit('nodeMouseout', new MouseEvent('mouseout'), nodeKey, node.nodeStyle);
    }
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
    // 同 dropNode：hover 态下被移除的边也要主动清理并补发 edgeMouseout。尤其 'event' 源（标签/边自身
    // 指针事件触发）的 hover——游标拾取不负责其移出（见 setPickedEdge 只清 'pick' 源），不补则 activeHoverEdgeKey
    // 与外部高亮永久残留。edgeStyle 取渲染对象上已缓存的（含 hover 合并色）：此刻边已从 graph 移除，不能再查属性。
    if (this.activeHoverEdgeKey === edgeKey) {
      this.activeHoverEdgeKey = null;
      if (edge.hovered && edge.edgeStyle) {
        edge.hovered = false;
        this.emit('edgeMouseout', new MouseEvent('mouseout'), edgeKey, edge.edgeStyle);
      }
    }
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
