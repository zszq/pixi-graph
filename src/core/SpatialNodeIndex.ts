import type { Rectangle } from 'pixi.js';
import type { PixiNode } from '../elements/PixiNode';

interface IndexedNode {
  key: string;
  x: number;
  y: number;
  radius: number;
}

/**
 * Uniform-grid world-space visibility index for large static graph views.
 *
 * A quadtree is attractive, but for graph layouts with fairly even point
 * distribution a fixed grid has lower allocation overhead, simpler rebuilds,
 * and very fast viewport range queries. This is used only during high-mode
 * camera interaction where edges/labels are hidden and node positions are
 * usually stable.
 */
export class SpatialNodeIndex {
  private readonly cells = new Map<string, IndexedNode[]>();
  private nodeCount = 0;
  private cellSize = 512;

  rebuild(nodes: Map<string, PixiNode>): void {
    this.cells.clear();
    this.nodeCount = nodes.size;
    this.cellSize = this.chooseCellSize(nodes.size);

    for (const [key, node] of nodes) {
      const indexed: IndexedNode = {
        key,
        x: node.nodeGfx.x,
        y: node.nodeGfx.y,
        radius: node.nodeStyle.size + node.nodeStyle.border.width
      };
      const cellKey = this.cellKeyFor(indexed.x, indexed.y);
      let cell = this.cells.get(cellKey);
      if (!cell) {
        cell = [];
        this.cells.set(cellKey, cell);
      }
      cell.push(indexed);
    }
  }

  ensureFresh(nodes: Map<string, PixiNode>): void {
    if (this.nodeCount !== nodes.size || this.cells.size === 0) this.rebuild(nodes);
  }

  query(bounds: Rectangle, margin = 128): string[] {
    const result: string[] = [];
    this.queryInto(bounds, result, margin);
    return result;
  }

  // ━━ 性能优化⑧｜查询写入复用缓冲 ━━ (tag: perf-v8-pan-gc)
  // ⚠️ PERF-CRITICAL（性能关键·勿改回每次返回新数组）：把命中节点 key 填入调用方提供的数组（先清空）。
  // fastCullNodes 平移时每帧调用，复用缓冲避免每帧新建数组造成 GC 抖动；需要独立数组的调用方用 query()。
  queryInto(bounds: Rectangle, out: string[], margin = 128): void {
    const left = bounds.left - margin;
    const right = bounds.right + margin;
    const top = bounds.top - margin;
    const bottom = bounds.bottom + margin;
    const minX = Math.floor(left / this.cellSize);
    const maxX = Math.floor(right / this.cellSize);
    const minY = Math.floor(top / this.cellSize);
    const maxY = Math.floor(bottom / this.cellSize);
    out.length = 0;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const cell = this.cells.get(`${x}:${y}`);
        if (!cell) continue;
        for (const node of cell) {
          if (node.x + node.radius < left || node.x - node.radius > right || node.y + node.radius < top || node.y - node.radius > bottom) continue;
          out.push(node.key);
        }
      }
    }
  }

  clear(): void {
    this.cells.clear();
    this.nodeCount = 0;
  }

  private cellKeyFor(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }

  private chooseCellSize(nodeCount: number): number {
    if (nodeCount >= 50000) return 768;
    if (nodeCount >= 10000) return 512;
    return 384;
  }
}
