import { Point } from 'pixi.js';
import type { AbstractGraph } from 'graphology-types';
import type { BaseNodeAttributes } from '../types/attributes';

export interface GraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  center: Point;
}

/**
 * 一次遍历算出包围盒，且不把大数组展开给 Math.min / Math.max。
 * 这样 resetView 在 5 万+ 节点的场景下也安全（避免展开超大数组爆栈/卡顿）。
 */
export function computeGraphBounds<NodeAttributes extends BaseNodeAttributes>(graph: AbstractGraph<NodeAttributes>, nodeKeys: Iterable<string>): GraphBounds | undefined {
  let hasNode = false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const nodeKey of nodeKeys) {
    const { x, y } = graph.getNodeAttributes(nodeKey);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    hasNode = true;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (!hasNode) return undefined;

  const width = Math.abs(maxX - minX);
  const height = Math.abs(maxY - minY);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    center: new Point(minX + width / 2, minY + height / 2)
  };
}
