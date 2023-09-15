import { AbstractGraph } from 'graphology-types';
import { Viewport } from 'pixi-viewport';
import { IPointData } from '@pixi/math';

export default function judge(graph: AbstractGraph, viewport: Viewport, startPoint: IPointData, endPoint: IPointData) {
  const nodes = new Set();
  const edges = new Set();

  const endX = endPoint.x;
  const endY = endPoint.y;

  const minX = Math.min(startPoint.x, endX);
  const maxX = Math.max(startPoint.x, endX);
  const minY = Math.min(startPoint.y, endY);
  const maxY = Math.max(startPoint.y, endY);

  graph.forEachNode((nodeKey, attributes) => {
    const position = viewport.toScreen(attributes.x, attributes.y);
    const { x, y } = position;

    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      nodes.add(nodeKey);
    }
  });

  graph.forEachEdge((edgeKey, attributes, source, target, sourceAttributes, targetAttributes) => {
    const sourcePosition = viewport.toScreen(sourceAttributes.x, sourceAttributes.y);
    const targetPosition = viewport.toScreen(targetAttributes.x, targetAttributes.y);
    const { x: x1, y: y1 } = sourcePosition;
    const { x: x2, y: y2 } = targetPosition;

    const k = (y2 - y1) / (x2 - x1);
    const b = y1 - k * x1;

    if (
      ((minY - b) / k >= minX && (minY - b) / k <= maxX && (minY - b) / k >= Math.min(x1, x2) && (minY - b) / k <= Math.max(x1, x2)) ||
      (x2 - x1 === 0 && x2 >= minX && x2 <= maxX && !((y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY))) ||
      ((maxY - b) / k >= minX && (maxY - b) / k <= maxX && (maxY - b) / k >= Math.min(x1, x2) && (maxY - b) / k <= Math.max(x1, x2)) ||
      (k * minX + b >= minY && k * minX + b <= maxY && k * minX + b >= Math.min(y1, y2) && k * minX + b <= Math.max(y1, y2) && Math.min(x1, x2) <= minX && Math.max(x1, x2) >= minX) ||
      (k * maxX + b >= minY && k * maxX + b <= maxY && k * maxX + b >= Math.min(y1, y2) && k * maxX + b <= Math.max(y1, y2) && Math.min(x1, x2) <= maxX && Math.max(x1, x2) >= maxX) ||
      (x1 >= minX && x1 <= maxX && x2 >= minX && x2 <= maxX && y1 >= minY && y1 <= maxY && y2 >= minY && y2 <= maxY)
    ) {
      edges.add(edgeKey);
    }
  });

  return {
    nodes: Array.from(nodes) as string[],
    edges: Array.from(edges) as string[]
  };
}
