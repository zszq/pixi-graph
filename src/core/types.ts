import type { AbstractGraph } from 'graphology-types';
import type { FederatedPointerEvent, PointData } from 'pixi.js';
import type { BaseNodeAttributes, BaseEdgeAttributes } from '../types/attributes';
import type { GraphStyleDefinition, NodeStyle, EdgeStyle } from '../style/style';

export interface HighPerformanceThreshold {
  nodeNumber: number;
  edgeNumber: number;
}

export interface GraphOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  /** Host element the canvas is appended to and sized against. */
  container: HTMLElement;
  /** Graphology graph providing the data model (nodes need `x`/`y` attributes). */
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  /** Base style definition (functions, partials, or full values at any level). */
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  /** Style overrides applied while a node/edge is hovered. */
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  /** Pan only while holding Space (frees plain drag for box selection). */
  spaceDrag?: boolean;
  /** Keep the cursor-to-node offset while dragging instead of snapping to center. */
  dragOffset?: boolean;
  /** Above these counts, edges/labels are hidden during interaction for performance. */
  highPerformance?: HighPerformanceThreshold;
  /** Maximum zoom scale. Defaults to 2. */
  maxScale?: number;
  /** Minimum zoom scale. Defaults to 0.1. */
  minScale?: number;
}

export interface PixiGraphEvents {
  nodeMousemove: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseover: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseout: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMousedown: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMouseup: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeClick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeDbclick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeRightclick: (event: MouseEvent, nodeKey: string, nodeStyle: NodeStyle) => void;
  nodeMoveStart: (event: MouseEvent, nodeKey: string, point: PointData) => void;
  nodeMove: (event: MouseEvent, nodeKey: string, point: PointData) => void;
  nodeMoveEnd: (event: MouseEvent, nodeKey: string, point: PointData) => void;

  edgeClick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeDbclick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMousemove: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseover: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseout: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMousedown: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeMouseup: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;
  edgeRightclick: (event: MouseEvent, edgeKey: string, edgeStyle: EdgeStyle) => void;

  viewportClick: (event: FederatedPointerEvent) => void;
  viewportRightClick: (event: MouseEvent) => void;
}
