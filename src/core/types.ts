import type { AbstractGraph } from 'graphology-types';
import type { FederatedPointerEvent, PointData } from 'pixi.js';
import type { BaseNodeAttributes, BaseEdgeAttributes } from '../types/attributes';
import type { GraphStyleDefinition, NodeStyle, EdgeStyle } from '../style/style';

export interface HighPerformanceThreshold {
  nodeNumber: number;
  edgeNumber: number;
}

export interface GraphOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  /** 画布将被追加到的宿主元素，并以其尺寸为基准。 */
  container: HTMLElement;
  /** 提供数据模型的 Graphology 图（节点需带 `x`/`y` 属性）。 */
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  /** 基础样式定义（任意层级可为函数、部分对象或完整值）。 */
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  /** 节点/边悬停时叠加的样式覆盖。 */
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  /** 仅按住空格时才平移（让普通拖拽空出来做框选）。 */
  spaceDrag?: boolean;
  /** 拖拽时保持光标相对节点的偏移，而非吸附到节点中心。 */
  dragOffset?: boolean;
  /** 超过这些数量时，交互期间隐藏边/标签以提升性能。 */
  highPerformance?: HighPerformanceThreshold;
  /** 最大缩放比例，默认 2。 */
  maxScale?: number;
  /** 最小缩放比例，默认 0.1。 */
  minScale?: number;
  /**
   * 渲染分辨率（画布物理像素 / CSS 像素），默认 `max(window.devicePixelRatio, 2)`。
   * why 默认下限取 2：Windows 上 100% 缩放的低 DPI 屏 devicePixelRatio=1，按 1× 渲染
   * 边缘锯齿明显；强制 2× 超采样后由浏览器缩回显示，观感接近 Retina。代价是约 4 倍
   * 像素填充量，超大图可显式传 `window.devicePixelRatio` 换性能。
   */
  resolution?: number;
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
