import { Point, type PointData } from 'pixi.js';
import type { AbstractGraph } from 'graphology-types';
import type { Viewport } from 'pixi-viewport';
import { getElementPoint } from '../utils/pointer';
import type { PixiNode } from '../elements/PixiNode';
import type { PixiGraphEvents } from '../core/types';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

type GraphEmit = import('eventemitter3').EventEmitter<PixiGraphEvents>['emit'];

interface NodeDragMutations {
  updateNodePositionByKey(nodeKey: string, position: PointData): void;
  updateConnectedEdgesByNodeKey(nodeKey: string, refreshStyle: boolean): void;
  updateNodeStyleByKey(nodeKey: string): void;
  endNodeDrag(nodeKey: string): void;
}

export interface NodeDragControllerOptions<NodeAttributes extends BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes> {
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  viewport: Viewport;
  container: HTMLElement;
  dragOffset: boolean;
  emit: GraphEmit;
  mutationController: NodeDragMutations;
  suppressedNodeAttributeUpdates: Set<string>;
  hidePerformanceLayers: () => void;
  showPerformanceLayers: () => void;
  isHighMode: () => boolean;
}

export class NodeDragController<NodeAttributes extends BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes> {
  private readonly graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  private readonly viewport: Viewport;
  private readonly container: HTMLElement;
  private readonly dragOffset: boolean;
  private readonly emit: GraphEmit;
  private readonly mutationController: NodeDragMutations;
  private readonly suppressedNodeAttributeUpdates: Set<string>;
  private readonly hidePerformanceLayers: () => void;
  private readonly showPerformanceLayers: () => void;
  private readonly isHighMode: () => boolean;

  private mousedownNodeKey: string | null = null;
  private nodeMouseOffsetX = 0;
  private nodeMouseOffsetY = 0;
  private documentMouseUpHandler: ((event: MouseEvent) => void) | undefined;

  private readonly onDocumentMouseMoveBound = (event: MouseEvent) => this.handleDocumentMouseMove(event);

  constructor(options: NodeDragControllerOptions<NodeAttributes, EdgeAttributes>) {
    this.graph = options.graph;
    this.viewport = options.viewport;
    this.container = options.container;
    this.dragOffset = options.dragOffset;
    this.emit = options.emit;
    this.mutationController = options.mutationController;
    this.suppressedNodeAttributeUpdates = options.suppressedNodeAttributeUpdates;
    this.hidePerformanceLayers = options.hidePerformanceLayers;
    this.showPerformanceLayers = options.showPerformanceLayers;
    this.isHighMode = options.isHighMode;
  }

  isDragging(): boolean {
    return this.mousedownNodeKey !== null;
  }

  start(event: MouseEvent, nodeKey: string, node: PixiNode): void {
    const worldPosition = this.viewport.toWorld(new Point(event.offsetX, event.offsetY));
    this.nodeMouseOffsetX = Math.abs(node.nodeGfx.x - worldPosition.x);
    this.nodeMouseOffsetY = Math.abs(node.nodeGfx.y - worldPosition.y);
    this.mousedownNodeKey = nodeKey;
    this.viewport.pause = true;
    document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
    this.setDocumentMouseUpHandler(nodeKey);
    this.emit('nodeMoveStart', event, nodeKey, worldPosition);
  }

  destroy(): void {
    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
    this.removeDocumentMouseUpHandler();
    this.mousedownNodeKey = null;
  }

  private handleDocumentMouseMove(event: MouseEvent): void {
    if (!this.mousedownNodeKey) return;
    const worldPosition = this.viewport.toWorld(getElementPoint(event, this.container));
    const nodeKey = this.mousedownNodeKey;
    const newPosition = this.dragOffset ? this.offsetPosition(nodeKey, worldPosition) : worldPosition;

    this.suppressedNodeAttributeUpdates.add(nodeKey);
    try {
      this.graph.setNodeAttribute(nodeKey, 'x', newPosition.x);
      this.graph.setNodeAttribute(nodeKey, 'y', newPosition.y);
    } finally {
      this.suppressedNodeAttributeUpdates.delete(nodeKey);
    }

    this.mutationController.updateNodePositionByKey(nodeKey, newPosition);
    this.hidePerformanceLayers();
    if (!this.isHighMode()) this.mutationController.updateConnectedEdgesByNodeKey(nodeKey, false);
    this.emit('nodeMove', event, nodeKey, newPosition);
  }

  private handleDocumentMouseUp(event: MouseEvent, nodeKey: string): void {
    this.viewport.pause = false;
    this.showPerformanceLayers();
    this.mutationController.updateNodeStyleByKey(nodeKey);
    this.mutationController.updateConnectedEdgesByNodeKey(nodeKey, true);

    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
    this.mousedownNodeKey = null;
    this.mutationController.endNodeDrag(nodeKey);

    const point = this.viewport.toWorld(getElementPoint(event, this.container));
    this.emit('nodeMoveEnd', event, nodeKey, point);
  }

  private setDocumentMouseUpHandler(nodeKey: string): void {
    this.removeDocumentMouseUpHandler();
    this.documentMouseUpHandler = (event: MouseEvent) => {
      this.handleDocumentMouseUp(event, nodeKey);
      this.removeDocumentMouseUpHandler();
    };
    document.addEventListener('mouseup', this.documentMouseUpHandler);
  }

  private removeDocumentMouseUpHandler(): void {
    if (!this.documentMouseUpHandler) return;
    document.removeEventListener('mouseup', this.documentMouseUpHandler);
    this.documentMouseUpHandler = undefined;
  }

  private offsetPosition(nodeKey: string, point: PointData): PointData {
    const { x: nodeX, y: nodeY } = this.graph.getNodeAttributes(nodeKey);
    return {
      x: point.x > nodeX ? point.x - this.nodeMouseOffsetX : point.x + this.nodeMouseOffsetX,
      y: point.y > nodeY ? point.y - this.nodeMouseOffsetY : point.y + this.nodeMouseOffsetY
    };
  }
}
