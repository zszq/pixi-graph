import type { AbstractGraph } from 'graphology-types';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

export interface SpatialEdgeQueryBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SpatialIndexedEdge {
  key: string;
  sourceKey: string;
  targetKey: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

/**
 * Uniform-grid index for visible-edge restore in large graph mode.
 *
 * The batched edge layer only needs edges intersecting the current viewport.
 * Scanning every edge on each camera tile change makes edge restore CPU-bound
 * on 50k/100k graphs, so we cache each edge in the grid cells crossed by its
 * segment. Queries then visit only viewport cells and do one exact intersection
 * pass on the much smaller candidate set.
 */
export class SpatialEdgeIndex<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  private readonly cells = new Map<string, SpatialIndexedEdge[]>();
  private readonly edges = new Map<string, SpatialIndexedEdge>();
  private readonly edgeCells = new Map<string, string[]>();
  private readonly longEdges = new Set<SpatialIndexedEdge>();
  private edgeCount = 0;
  private cellSize = 1536;
  private fresh = false;

  rebuild(graph: AbstractGraph<NodeAttributes, EdgeAttributes>): void {
    this.cells.clear();
    this.edges.clear();
    this.edgeCells.clear();
    this.longEdges.clear();
    this.edgeCount = graph.size;
    this.cellSize = this.chooseCellSize(graph.size);

    graph.forEachEdge((edgeKey, _edgeAttributes, sourceKey, targetKey, sourceAttributes, targetAttributes) => {
      this.indexSegment(edgeKey, sourceKey, targetKey, sourceAttributes, targetAttributes);
    });

    this.fresh = true;
  }

  ensureFresh(graph: AbstractGraph<NodeAttributes, EdgeAttributes>): void {
    if (!this.fresh || this.edgeCount !== graph.size) this.rebuild(graph);
  }

  query(bounds: SpatialEdgeQueryBounds): string[] {
    return this.queryEntries(bounds).map(edge => edge.key);
  }

  queryEntries(bounds: SpatialEdgeQueryBounds): SpatialIndexedEdge[] {
    const minX = Math.floor(bounds.left / this.cellSize);
    const maxX = Math.floor(bounds.right / this.cellSize);
    const minY = Math.floor(bounds.top / this.cellSize);
    const maxY = Math.floor(bounds.bottom / this.cellSize);
    const seen = new Set<string>();
    const result: SpatialIndexedEdge[] = [];

    for (const edge of this.longEdges) {
      seen.add(edge.key);
      result.push(edge);
    }

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const cell = this.cells.get(this.cellKey(x, y));
        if (!cell) continue;
        for (const edge of cell) {
          if (seen.has(edge.key)) continue;
          seen.add(edge.key);
          result.push(edge);
        }
      }
    }

    return result;
  }

  update(graph: AbstractGraph<NodeAttributes, EdgeAttributes>, edgeKey: string): void {
    if (!this.fresh) return;
    this.remove(edgeKey);
    if (!graph.hasEdge(edgeKey)) {
      this.edgeCount = graph.size;
      return;
    }
    const sourceKey = graph.source(edgeKey);
    const targetKey = graph.target(edgeKey);
    this.indexSegment(edgeKey, sourceKey, targetKey, graph.getNodeAttributes(sourceKey), graph.getNodeAttributes(targetKey));
    this.edgeCount = graph.size;
  }

  updateMany(graph: AbstractGraph<NodeAttributes, EdgeAttributes>, edgeKeys: Iterable<string>): void {
    if (!this.fresh) return;
    for (const edgeKey of edgeKeys) this.update(graph, edgeKey);
  }

  clear(): void {
    this.cells.clear();
    this.edges.clear();
    this.edgeCells.clear();
    this.longEdges.clear();
    this.edgeCount = 0;
    this.fresh = false;
  }

  private indexSegment(edgeKey: string, sourceKey: string, targetKey: string, a: { x: number; y: number }, b: { x: number; y: number }): void {
    const indexedEdge: SpatialIndexedEdge = {
      key: edgeKey,
      sourceKey,
      targetKey,
      sourceX: a.x,
      sourceY: a.y,
      targetX: b.x,
      targetY: b.y
    };
    this.edges.set(edgeKey, indexedEdge);

    const startX = Math.floor(a.x / this.cellSize);
    const startY = Math.floor(a.y / this.cellSize);
    const endX = Math.floor(b.x / this.cellSize);
    const endY = Math.floor(b.y / this.cellSize);
    const estimatedCells = Math.abs(endX - startX) + Math.abs(endY - startY) + 1;

    if (estimatedCells > this.maxCellsPerEdge()) {
      this.longEdges.add(indexedEdge);
      return;
    }

    let x = startX;
    let y = startY;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tDeltaX = stepX === 0 ? Infinity : this.cellSize / Math.abs(dx);
    const tDeltaY = stepY === 0 ? Infinity : this.cellSize / Math.abs(dy);
    let tMaxX = stepX === 0 ? Infinity : ((stepX > 0 ? x + 1 : x) * this.cellSize - a.x) / dx;
    let tMaxY = stepY === 0 ? Infinity : ((stepY > 0 ? y + 1 : y) * this.cellSize - a.y) / dy;

    this.addToCell(x, y, indexedEdge);
    while (x !== endX || y !== endY) {
      if (tMaxX < tMaxY) {
        x += stepX;
        tMaxX += tDeltaX;
      } else if (tMaxY < tMaxX) {
        y += stepY;
        tMaxY += tDeltaY;
      } else {
        x += stepX;
        y += stepY;
        tMaxX += tDeltaX;
        tMaxY += tDeltaY;
      }
      this.addToCell(x, y, indexedEdge);
    }
  }

  private addToCell(x: number, y: number, edge: SpatialIndexedEdge): void {
    const key = this.cellKey(x, y);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(edge);

    let keys = this.edgeCells.get(edge.key);
    if (!keys) {
      keys = [];
      this.edgeCells.set(edge.key, keys);
    }
    keys.push(key);
  }

  private remove(edgeKey: string): void {
    const edge = this.edges.get(edgeKey);
    if (edge) this.longEdges.delete(edge);

    const keys = this.edgeCells.get(edgeKey);
    if (keys) {
      for (const key of keys) {
        const cell = this.cells.get(key);
        if (!cell) continue;
        const index = cell.findIndex(item => item.key === edgeKey);
        if (index >= 0) cell.splice(index, 1);
        if (cell.length === 0) this.cells.delete(key);
      }
      this.edgeCells.delete(edgeKey);
    }

    this.edges.delete(edgeKey);
  }

  private cellKey(x: number, y: number): string {
    return `${x}:${y}`;
  }

  private chooseCellSize(edgeCount: number): number {
    if (edgeCount >= 150000) return 1536;
    if (edgeCount >= 50000) return 1024;
    if (edgeCount >= 10000) return 768;
    return 512;
  }

  private maxCellsPerEdge(): number {
    return 96;
  }
}
