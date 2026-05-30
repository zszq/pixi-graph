import { type PointData } from 'pixi.js';
import type { AbstractGraph } from 'graphology-types';
import type { Viewport } from 'pixi-viewport';
import { getElementBounds, getElementPointFromBounds, type ElementBounds } from '../utils/pointer';
import type { PixiNode } from '../elements/PixiNode';
import type { PixiGraphEvents } from '../core/types';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

type GraphEmit = import('eventemitter3').EventEmitter<PixiGraphEvents>['emit'];

interface NodeDragMutations {
  updateNodePositionByKey(nodeKey: string, position: PointData): void;
  updateConnectedEdgesByNodeKey(nodeKey: string, immediate?: boolean): void;
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
  // 拖拽时缓存一次容器边界，mousemove 不再重复读布局；mouseup 再重新读取一次，保证结束点准确。
  private nodeMouseOffsetX = 0;
  private nodeMouseOffsetY = 0;
  private documentMouseUpHandler: ((event: MouseEvent) => void) | undefined;
  private dragBounds: ElementBounds | null = null;

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
    this.dragBounds = getElementBounds(this.container);
    const worldPosition = this.viewport.toWorld(getElementPointFromBounds(event, this.dragBounds));
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
    this.dragBounds = null;
  }

  private handleDocumentMouseMove(event: MouseEvent): void {
    if (!this.mousedownNodeKey) return;
    // 这里是拖拽热路径：用缓存边界把 DOM 坐标转回 screen，再交给 viewport 转 world。
    const bounds = this.dragBounds ?? getElementBounds(this.container);
    const worldPosition = this.viewport.toWorld(getElementPointFromBounds(event, bounds));
    const nodeKey = this.mousedownNodeKey;
    const newPosition = this.dragOffset ? this.offsetPosition(nodeKey, worldPosition) : worldPosition;

    this.suppressedNodeAttributeUpdates.add(nodeKey);
    try {
      this.graph.updateNodeAttributes(nodeKey, attributes => ({
        ...attributes,
        x: newPosition.x,
        y: newPosition.y
      }));
    } finally {
      this.suppressedNodeAttributeUpdates.delete(nodeKey);
    }

    this.mutationController.updateNodePositionByKey(nodeKey, newPosition);
    this.hidePerformanceLayers();
    if (!this.isHighMode()) this.mutationController.updateConnectedEdgesByNodeKey(nodeKey);
    this.emit('nodeMove', event, nodeKey, newPosition);
  }

  private handleDocumentMouseUp(event: MouseEvent, nodeKey: string): void {
    this.viewport.pause = false;
    this.showPerformanceLayers();
    this.mutationController.updateConnectedEdgesByNodeKey(nodeKey, true);

    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
    this.mousedownNodeKey = null;
    this.dragBounds = null;
    // 释放 hover gate，让被拖拽节点重新参与悬停；否则会残留“拖拽中禁止 hover”的状态。
    this.mutationController.endNodeDrag(nodeKey);

    const point = this.viewport.toWorld(getElementPointFromBounds(event, getElementBounds(this.container)));
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
