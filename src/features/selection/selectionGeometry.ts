import type { AbstractGraph } from 'graphology-types';
import type { Viewport } from 'pixi-viewport';
import type { PointData } from 'pixi.js';

export interface SelectionResult {
  nodes: string[];
  edges: string[];
}

/**
 * Hit-test graph nodes (and optionally edges) against a screen-space rectangle.
 *
 * @param lazy when true, skip edge line intersection and instead select every
 *   edge incident to a selected node (cheaper, "select edges with nodes").
 */
export function selectInRectangle(graph: AbstractGraph, viewport: Viewport, startPoint: PointData, endPoint: PointData, lazy?: boolean): SelectionResult {
  const nodes = new Set<string>();
  const edges = new Set<string>();

  const startX = Math.min(startPoint.x, endPoint.x);
  const startY = Math.min(startPoint.y, endPoint.y);
  const endX = Math.max(startPoint.x, endPoint.x);
  const endY = Math.max(startPoint.y, endPoint.y);

  graph.forEachNode((nodeKey, attributes) => {
    const { x, y } = viewport.toScreen(attributes.x, attributes.y);
    if (x >= startX && x <= endX && y >= startY && y <= endY) {
      nodes.add(nodeKey);
      if (lazy) {
        graph.edges(nodeKey).forEach(edgeKey => edges.add(edgeKey));
      }
    }
  });

  if (!lazy) {
    // 非 lazy：逐条做「线段 vs 矩形」相交判定。把边看作直线 y = kx + b，下面几个条件分别检查：
    //   1) 直线与矩形上/下边（y=startY、y=endY）的交点是否落在矩形横向范围且在线段内；
    //   2) 竖直边（x2-x1=0）的特例；
    //   3) 直线与矩形左/右边（x=startX、x=endX）的交点是否落在矩形纵向范围且在线段内；
    //   4) 线段两端点是否都在矩形内（完全包含）。
    // 任一成立即视为该边被框选命中。
    graph.forEachEdge((edgeKey, _attributes, _source, _target, sourceAttributes, targetAttributes) => {
      const { x: x1, y: y1 } = viewport.toScreen(sourceAttributes.x, sourceAttributes.y);
      const { x: x2, y: y2 } = viewport.toScreen(targetAttributes.x, targetAttributes.y);

      const k = (y2 - y1) / (x2 - x1);
      const b = y1 - k * x1;

      if (
        ((startY - b) / k >= startX && (startY - b) / k <= endX && (startY - b) / k >= Math.min(x1, x2) && (startY - b) / k <= Math.max(x1, x2)) ||
        (x2 - x1 === 0 && x2 >= startX && x2 <= endX && !((y1 < startY && y2 < startY) || (y1 > endY && y2 > endY))) ||
        ((endY - b) / k >= startX && (endY - b) / k <= endX && (endY - b) / k >= Math.min(x1, x2) && (endY - b) / k <= Math.max(x1, x2)) ||
        (k * startX + b >= startY &&
          k * startX + b <= endY &&
          k * startX + b >= Math.min(y1, y2) &&
          k * startX + b <= Math.max(y1, y2) &&
          Math.min(x1, x2) <= startX &&
          Math.max(x1, x2) >= startX) ||
        (k * endX + b >= startY &&
          k * endX + b <= endY &&
          k * endX + b >= Math.min(y1, y2) &&
          k * endX + b <= Math.max(y1, y2) &&
          Math.min(x1, x2) <= endX &&
          Math.max(x1, x2) >= endX) ||
        (x1 >= startX && x1 <= endX && x2 >= startX && x2 <= endX && y1 >= startY && y1 <= endY && y2 >= startY && y2 <= endY)
      ) {
        edges.add(edgeKey);
      }
    });
  }

  return { nodes: Array.from(nodes), edges: Array.from(edges) };
}
