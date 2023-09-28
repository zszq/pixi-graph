import { AbstractGraph } from 'graphology-types';
import { Viewport } from 'pixi-viewport';
import { IPointData } from '@pixi/core';

/**
 *
 * @param graph 图数据管理
 * @param viewport pixi-viewport
 * @param startPoint 起始点
 * @param endPoint 结束点
 * @param lazy 是否选中线
 * @returns 选中的点线
 */
export default function judge(graph: AbstractGraph, viewport: Viewport, startPoint: IPointData, endPoint: IPointData, lazy?: boolean) {
  const nodes = new Set();
  const edges = new Set();

  const startX = Math.min(startPoint.x, endPoint.x);
  const startY = Math.min(startPoint.y, endPoint.y);
  const endX = Math.max(startPoint.x, endPoint.x);
  const endY = Math.max(startPoint.y, endPoint.y);

  graph.forEachNode((nodeKey, attributes) => {
    const { x, y } = viewport.toScreen(attributes.x, attributes.y);
    if (x >= startX && x <= endX && y >= startY && y <= endY) {
      nodes.add(nodeKey);

      if (lazy) {
        let edgeNeighbors = graph.edges(nodeKey);
        edgeNeighbors.forEach(edgeKey => {
          edges.add(edgeKey);
        });
      }
    }
  });

  if (!lazy) {
    graph.forEachEdge((edgeKey, attributes, source, target, sourceAttributes, targetAttributes) => {
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

  return {
    nodes: Array.from(nodes) as string[],
    edges: Array.from(edges) as string[]
  };
}
