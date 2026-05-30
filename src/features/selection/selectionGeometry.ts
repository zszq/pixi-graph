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
 * Hit-test graph nodes (and optionally edges) against a screen-space rectangle.
 *
 * @param lazy when true, skip edge line intersection and instead select every
 *   edge incident to a selected node (cheaper, "select edges with nodes").
 */
export function selectInRectangle(graph: AbstractGraph, viewport: Viewport, startPoint: PointData, endPoint: PointData, lazy?: boolean): SelectionResult {
  const nodes = new Set<string>();
  const edges = new Set<string>();

  const rect = {
    left: Math.min(startPoint.x, endPoint.x),
    top: Math.min(startPoint.y, endPoint.y),
    right: Math.max(startPoint.x, endPoint.x),
    bottom: Math.max(startPoint.y, endPoint.y)
  };

  graph.forEachNode((nodeKey, attributes) => {
    if (pointInRect(viewport.toScreen(attributes.x, attributes.y), rect)) {
      nodes.add(nodeKey);
      if (lazy) {
        graph.edges(nodeKey).forEach(edgeKey => edges.add(edgeKey));
      }
    }
  });

  if (!lazy) {
    // 非 lazy：逐条做稳健的「线段 vs 矩形」相交判定，避免斜率法在水平/竖直边上出现
    // Infinity/NaN 分支，也让完全包含、穿过边界、端点接触都走同一套逻辑。
    graph.forEachEdge((edgeKey, _attributes, _source, _target, sourceAttributes, targetAttributes) => {
      const source = viewport.toScreen(sourceAttributes.x, sourceAttributes.y);
      const target = viewport.toScreen(targetAttributes.x, targetAttributes.y);

      if (segmentIntersectsRect(source, target, rect)) {
        edges.add(edgeKey);
      }
    });
  }

  return { nodes: Array.from(nodes), edges: Array.from(edges) };
}
