import type { AbstractGraph } from 'graphology-types';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

export interface SpatialEdgeQueryBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 边的均匀网格空间索引（what）：按当前节点坐标，把每条边登记进它线段穿过的所有网格格子；
 * query 时只访问视口覆盖到的格子，得到"可能与视口相交"的候选边集（只多不少），由调用方再做
 * 一次精确相交过滤。用于大图批量边重建时，把"遍历全部边"缩小为"只看视口附近的边"。
 *
 * 只返回候选 edgeKey、不存坐标快照：边的几何与精确剔除仍用实时 graph 坐标，索引只做空间
 * 粗筛。即便索引轻微过期，最多让候选集略大/略小，几何永远准确，绝不会出现"用旧坐标把边画错位置"
 * （这正是早期带坐标快照的实现的隐患）。网格保证候选集是真正可见边的超集，故不会漏画。
 *
 * 网格而非 R-tree：本库布局以静态为主、偶尔整体重建，网格 O(1) 构建、对相机微动返回结果稳定
 * （契合瓦片缓存）、实现简单无需重平衡。见 redblobgames / metafunctor 关于动态场景网格优于 R-tree。
 *
 * 新鲜度：query 前 ensureFresh——显式 markDirty（节点几何变/边增删时由上层调用）或 graph.size 变化
 * 都会触发一次全量重建；其余时间（平移/缩放不改节点坐标）索引保持新鲜，多帧查询复用，这是收益来源。
 */
export class SpatialEdgeIndex<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  private readonly cells = new Map<string, string[]>();
  // 跨格子过多的超长边单独存：登记进太多格子既占内存又拖慢查询，干脆每次查询都算作候选（只多不少）。
  // 坐标非有限值的退化边也归入此集，保证不会被漏掉。
  private readonly longEdges = new Set<string>();
  // ━━ 性能优化⑦｜候选缓冲复用 ━━ (tag: perf-v8-pan-gc)
  // ⚠️ PERF-CRITICAL（性能关键·勿在 selectCandidates 里 new Set/new Array）：selectCandidates 是
  // rebuild 每帧跨瓦片调用的热路径，复用此缓冲避免逐帧分配造成 GC。仅供 selectCandidates；公共 query
  // 仍返回全新数组，保证外部持有返回值时不被下次调用覆盖——勿让 query 也复用缓冲。
  private readonly candidateBuffer: string[] = [];
  private readonly seenBuffer = new Set<string>();
  private edgeCount = 0;
  private cellSize = 1024;
  private fresh = false;
  // 已占用格子的包围范围（格坐标），用于判断查询视口是否几乎覆盖全图（见 selectCandidates）。
  private minCellX = 0;
  private maxCellX = 0;
  private minCellY = 0;
  private maxCellY = 0;

  /** 标记索引过期（节点几何变化、边增删时调用）。下次 query 会重建。 */
  markDirty(): void {
    this.fresh = false;
  }

  clear(): void {
    this.cells.clear();
    this.longEdges.clear();
    this.edgeCount = 0;
    this.fresh = false;
  }

  /** 返回与视口可能相交的候选边 key（真正可见边的超集，需调用方再做精确相交过滤）。 */
  query(graph: AbstractGraph<NodeAttributes, EdgeAttributes>, bounds: SpatialEdgeQueryBounds): string[] {
    this.ensureFresh(graph);
    return this.collectCandidates(bounds, [], new Set());
  }

  /**
   * 为 rebuild 选候选边：返回候选 key 列表；若视口几乎覆盖整张图（索引筛不掉多少、纯属开销），
   * 返回 null 表示"直接全量遍历更快"。这样放大时走索引（大幅提速），看全图时退回全遍历（不回退）。
   */
  selectCandidates(graph: AbstractGraph<NodeAttributes, EdgeAttributes>, bounds: SpatialEdgeQueryBounds): string[] | null {
    this.ensureFresh(graph);
    if (this.coversMostCells(bounds)) return null;
    return this.collectCandidates(bounds, this.candidateBuffer, this.seenBuffer);
  }

  private collectCandidates(bounds: SpatialEdgeQueryBounds, result: string[], seen: Set<string>): string[] {
    const minX = Math.floor(bounds.left / this.cellSize);
    const maxX = Math.floor(bounds.right / this.cellSize);
    const minY = Math.floor(bounds.top / this.cellSize);
    const maxY = Math.floor(bounds.bottom / this.cellSize);

    result.length = 0;
    seen.clear();
    for (const key of this.longEdges) {
      seen.add(key);
      result.push(key);
    }
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const cell = this.cells.get(cellKey(x, y));
        if (!cell) continue;
        for (const key of cell) {
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(key);
        }
      }
    }
    return result;
  }

  // 查询视口是否覆盖了已占用格子范围的大部分。覆盖大部分时索引几乎返回全部边、只剩开销，不如全遍历。
  private coversMostCells(bounds: SpatialEdgeQueryBounds): boolean {
    if (this.cells.size === 0) return true; // 只有超长边/退化边：无格可筛，全遍历即可
    const qMinX = Math.max(this.minCellX, Math.floor(bounds.left / this.cellSize));
    const qMaxX = Math.min(this.maxCellX, Math.floor(bounds.right / this.cellSize));
    const qMinY = Math.max(this.minCellY, Math.floor(bounds.top / this.cellSize));
    const qMaxY = Math.min(this.maxCellY, Math.floor(bounds.bottom / this.cellSize));
    if (qMaxX < qMinX || qMaxY < qMinY) return false; // 视口在图范围外：候选近空，用索引最划算
    const overlap = (qMaxX - qMinX + 1) * (qMaxY - qMinY + 1);
    const populated = (this.maxCellX - this.minCellX + 1) * (this.maxCellY - this.minCellY + 1);
    return overlap >= populated * COVERAGE_FALLBACK_RATIO;
  }

  private ensureFresh(graph: AbstractGraph<NodeAttributes, EdgeAttributes>): void {
    // graph.size 变化（边增删）即便上层漏标也能兜底重建；节点移动不改 size，须靠显式 markDirty。
    if (this.fresh && this.edgeCount === graph.size) return;
    this.rebuild(graph);
  }

  private rebuild(graph: AbstractGraph<NodeAttributes, EdgeAttributes>): void {
    this.cells.clear();
    this.longEdges.clear();
    this.edgeCount = graph.size;
    this.cellSize = chooseCellSize(graph.size);
    this.minCellX = Infinity;
    this.maxCellX = -Infinity;
    this.minCellY = Infinity;
    this.maxCellY = -Infinity;
    graph.forEachEdge((edgeKey, _edgeAttributes, _sourceKey, _targetKey, sourceAttributes, targetAttributes) => {
      this.indexSegment(edgeKey, sourceAttributes, targetAttributes);
    });
    this.fresh = true;
  }

  // 用网格 DDA（数字微分分析）光栅化线段：沿线段步进，把它经过的每个格子都登记上 edgeKey。
  private indexSegment(edgeKey: string, a: { x: number; y: number }, b: { x: number; y: number }): void {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      this.longEdges.add(edgeKey);
      return;
    }
    const size = this.cellSize;
    const startX = Math.floor(a.x / size);
    const startY = Math.floor(a.y / size);
    const endX = Math.floor(b.x / size);
    const endY = Math.floor(b.y / size);
    const estimatedCells = Math.abs(endX - startX) + Math.abs(endY - startY) + 1;
    if (estimatedCells > MAX_CELLS_PER_EDGE) {
      this.longEdges.add(edgeKey);
      return;
    }

    let x = startX;
    let y = startY;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tDeltaX = stepX === 0 ? Infinity : size / Math.abs(dx);
    const tDeltaY = stepY === 0 ? Infinity : size / Math.abs(dy);
    let tMaxX = stepX === 0 ? Infinity : ((stepX > 0 ? x + 1 : x) * size - a.x) / dx;
    let tMaxY = stepY === 0 ? Infinity : ((stepY > 0 ? y + 1 : y) * size - a.y) / dy;

    this.addToCell(x, y, edgeKey);
    // 守卫式步进：只对「尚未到达终点」的轴步进。stepX/stepY 恒指向终点方向，故每次迭代必让
    // |x-endX| 或 |y-endY| 单调减 1，恰好走 |endX-startX|+|endY-startY| 步后停在终点格——
    // 数学上不可能发散。这修掉了原始 DDA 的角点穿越缺陷：用 tMaxX<tMaxY 裸判方向时，端点恰落
    // 格子边界处的浮点漂移会让某轴越过终点格后 (x!==endX) 永真，无限灌 cells Map 直至 V8 抛
    // 「Map maximum size exceeded」。角点处此处走 L 形而非对角双步，多登记一个格无妨（索引允许候选偏多）。
    while (x !== endX || y !== endY) {
      if (y === endY || (x !== endX && tMaxX < tMaxY)) {
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        y += stepY;
        tMaxY += tDeltaY;
      }
      this.addToCell(x, y, edgeKey);
    }
  }

  private addToCell(x: number, y: number, edgeKey: string): void {
    const key = cellKey(x, y);
    const cell = this.cells.get(key);
    if (cell) cell.push(edgeKey);
    else this.cells.set(key, [edgeKey]);
    if (x < this.minCellX) this.minCellX = x;
    if (x > this.maxCellX) this.maxCellX = x;
    if (y < this.minCellY) this.minCellY = y;
    if (y > this.maxCellY) this.maxCellY = y;
  }
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

// 格子边长按规模自适应：大图用更大格子，控制每条边登记的格子数与查询访问的格子数之间的平衡。
function chooseCellSize(edgeCount: number): number {
  if (edgeCount >= 150000) return 1536;
  if (edgeCount >= 50000) return 1024;
  if (edgeCount >= 10000) return 768;
  return 512;
}

// 单条边最多登记的格子数：超过则视为"超长边"放进 longEdges（每次查询都返回），避免长边污染大量格子。
const MAX_CELLS_PER_EDGE = 96;

// 查询视口覆盖已占用格子范围达此比例时，判定"索引筛不掉多少"，回退到全量遍历（避免看全图时的索引开销）。
const COVERAGE_FALLBACK_RATIO = 0.5;
