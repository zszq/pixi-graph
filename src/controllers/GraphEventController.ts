import type { AbstractGraph } from 'graphology-types';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';
import { EventSubscriptions } from '../core/EventSubscriptions';

interface GraphMutationHandlers<NodeAttributes extends BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes> {
  handleGraphNodeAdded(data: { key: string; attributes: NodeAttributes }): void;
  handleGraphNodeDropped(data: { key: string }): void;
  handleGraphEdgeAdded(data: { key: string; attributes: EdgeAttributes; source: string; target: string }): void;
  handleGraphEdgeDropped(data: { key: string }): void;
  handleGraphCleared(): void;
  handleGraphEdgesCleared(): void;
  handleGraphNodeAttributesUpdated(data: { key: string }): void;
  handleGraphEdgeAttributesUpdated(data: { key: string }): void;
  handleGraphEachNodeAttributesUpdated(): void;
  handleGraphEachEdgeAttributesUpdated(): void;
}

export interface GraphEventControllerOptions<NodeAttributes extends BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes> {
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  subscriptions: EventSubscriptions;
  mutationController: GraphMutationHandlers<NodeAttributes, EdgeAttributes>;
  updateHighMode: () => void;
}

/**
 * 图事件订阅与转发层（what）：把 Graphology 图发出的 nodeAdded/edgeDropped/
 * attributesUpdated 等事件，统一转发给 GraphMutationController 的对应 handler。
 *
 * 单独成类：把"订阅/退订图事件"从同步逻辑里分离出来，使 PixiGraph 只需提供一个
 * updateHighMode 回调；所有订阅都经 EventSubscriptions 登记，destroy 时能成对注销，
 * 避免实例销毁后回调仍持有图引用导致泄漏。
 *
 * 增删才调 updateHighMode：节点/边的增删会改变图规模，可能跨过 highPerformance 阈值，
 * 需要重算是否进入高性能模式；而纯属性更新不改变规模，故 attributesUpdated 系列不触发它。
 */
export class GraphEventController<NodeAttributes extends BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes> {
  private readonly graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  private readonly subscriptions: EventSubscriptions;
  private readonly mutationController: GraphMutationHandlers<NodeAttributes, EdgeAttributes>;
  private readonly updateHighMode: () => void;

  private readonly onGraphNodeAddedBound = (data: { key: string; attributes: NodeAttributes }) => {
    this.updateHighMode();
    this.mutationController.handleGraphNodeAdded(data);
  };
  private readonly onGraphEdgeAddedBound = (data: { key: string; attributes: EdgeAttributes; source: string; target: string }) => {
    this.updateHighMode();
    this.mutationController.handleGraphEdgeAdded(data);
  };
  private readonly onGraphNodeDroppedBound = (data: { key: string }) => {
    this.updateHighMode();
    this.mutationController.handleGraphNodeDropped(data);
  };
  private readonly onGraphEdgeDroppedBound = (data: { key: string }) => {
    this.updateHighMode();
    this.mutationController.handleGraphEdgeDropped(data);
  };
  private readonly onGraphClearedBound = () => {
    this.updateHighMode();
    this.mutationController.handleGraphCleared();
  };
  private readonly onGraphEdgesClearedBound = () => {
    this.updateHighMode();
    this.mutationController.handleGraphEdgesCleared();
  };
  private readonly onGraphNodeAttributesUpdatedBound = (data: { key: string }) => this.mutationController.handleGraphNodeAttributesUpdated(data);
  private readonly onGraphEdgeAttributesUpdatedBound = (data: { key: string }) => this.mutationController.handleGraphEdgeAttributesUpdated(data);
  private readonly onGraphEachNodeAttributesUpdatedBound = () => this.mutationController.handleGraphEachNodeAttributesUpdated();
  private readonly onGraphEachEdgeAttributesUpdatedBound = () => this.mutationController.handleGraphEachEdgeAttributesUpdated();

  constructor(options: GraphEventControllerOptions<NodeAttributes, EdgeAttributes>) {
    this.graph = options.graph;
    this.subscriptions = options.subscriptions;
    this.mutationController = options.mutationController;
    this.updateHighMode = options.updateHighMode;
  }

  bind(): void {
    this.subscriptions.add(this.graph, 'nodeAdded', this.onGraphNodeAddedBound);
    this.subscriptions.add(this.graph, 'nodeDropped', this.onGraphNodeDroppedBound);
    this.subscriptions.add(this.graph, 'edgeAdded', this.onGraphEdgeAddedBound);
    this.subscriptions.add(this.graph, 'edgeDropped', this.onGraphEdgeDroppedBound);
    this.subscriptions.add(this.graph, 'cleared', this.onGraphClearedBound);
    this.subscriptions.add(this.graph, 'edgesCleared', this.onGraphEdgesClearedBound);
    this.subscriptions.add(this.graph, 'nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
    this.subscriptions.add(this.graph, 'edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
    this.subscriptions.add(this.graph, 'eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
    this.subscriptions.add(this.graph, 'eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);
  }
}
