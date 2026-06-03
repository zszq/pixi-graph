import type { AbstractGraph } from 'graphology-types';
import type { Viewport } from 'pixi-viewport';
import type { PointData } from 'pixi.js';

export interface SelectionResult {
  nodes: string[];
  edges: string[];
}

interface RectBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function pointInRect(point: PointData, rect: RectBounds): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function orientation(a: PointData, b: PointData, c: PointData): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < Number.EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(a: PointData, b: PointData, c: PointData): boolean {
  return b.x <= Math.max(a.x, c.x) && b.x >= Math.min(a.x, c.x) && b.y <= Math.max(a.y, c.y) && b.y >= Math.min(a.y, c.y);
}

function segmentsIntersect(a1: PointData, a2: PointData, b1: PointData, b2: PointData): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a1, b1, a2)) return true;
  if (o2 === 0 && pointOnSegment(a1, b2, a2)) return true;
  if (o3 === 0 && pointOnSegment(b1, a1, b2)) return true;
  if (o4 === 0 && pointOnSegment(b1, a2, b2)) return true;
  return false;
}

function segmentIntersectsRect(a: PointData, b: PointData, rect: RectBounds): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;

  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomRight = { x: rect.right, y: rect.bottom };
  const bottomLeft = { x: rect.left, y: rect.bottom };

  return (
    segmentsIntersect(a, b, topLeft, topRight) ||
    segmentsIntersect(a, b, topRight, bottomRight) ||
    segmentsIntersect(a, b, bottomRight, bottomLeft) ||
    segmentsIntersect(a, b, bottomLeft, topLeft)
  );
}

/**
 * 用屏幕空间矩形对图节点（以及可选的边）做命中测试。
 *
 * @param lazy 为 true 时跳过边线相交判定，改为选中所有与已选节点相连的边
 *   （更省，即“随节点一起选中边”）。
 */
export function selectInRectangle(graph: AbstractGraph, viewport: Viewport, startPoint: PointData, endPoint: PointData, lazy?: boolean): SelectionResult {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  // 选择框和节点坐标不在同一坐标系：框选用 screen-space，图数据是 world-space。
  // 先统一把 world 坐标转成 screen 坐标，再做矩形命中。
  const rect = {
    left: Math.min(startPoint.x, endPoint.x),
    top: Math.min(startPoint.y, endPoint.y),
    right: Math.max(startPoint.x, endPoint.x),
    bottom: Math.max(startPoint.y, endPoint.y)
  };

  if (lazy) {
    // lazy 模式只做“节点命中 -> 收集关联边”，避免逐条边做相交检测，适合大图和实时拖拽。
    graph.forEachNode((nodeKey, attributes) => {
      const screenPosition = viewport.toScreen(attributes.x, attributes.y);
      if (!pointInRect(screenPosition, rect)) return;
      nodes.add(nodeKey);
      graph.forEachEdge(nodeKey, edgeKey => edges.add(edgeKey));
    });
    return { nodes: Array.from(nodes), edges: Array.from(edges) };
  }

  const nodeScreenPositions = new Map<string, PointData>();

  graph.forEachNode((nodeKey, attributes) => {
    const screenPosition = viewport.toScreen(attributes.x, attributes.y);
    nodeScreenPositions.set(nodeKey, screenPosition);

    if (pointInRect(screenPosition, rect)) {
      nodes.add(nodeKey);
    }
  });

  // 非 lazy：逐条做稳健的「线段 vs 矩形」相交判定，避免斜率法在水平/竖直边上出现
  // Infinity/NaN 分支，也让完全包含、穿过边界、端点接触都走同一套逻辑。
  graph.forEachEdge((edgeKey, _attributes, sourceKey, targetKey, sourceAttributes, targetAttributes) => {
    const source = nodeScreenPositions.get(sourceKey) ?? viewport.toScreen(sourceAttributes.x, sourceAttributes.y);
    const target = nodeScreenPositions.get(targetKey) ?? viewport.toScreen(targetAttributes.x, targetAttributes.y);

    if (segmentIntersectsRect(source, target, rect)) {
      edges.add(edgeKey);
    }
  });

  return { nodes: Array.from(nodes), edges: Array.from(edges) };
}
