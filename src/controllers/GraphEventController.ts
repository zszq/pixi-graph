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
 * Owns Graphology event subscriptions and routes graph mutations to the render
 * mutation layer. PixiGraph only needs to provide the high-performance mode
 * recomputation hook.
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
