/**
 * 带帧预算的边更新调度器。
 *
 * 更新高度数节点会弄脏其相连的成千上万条边。若同步更新全部边，几何虽完全实时，却会
 * 拖垮帧时间。本调度器把重复的脏标记合并，在后续动画帧里分小批处理。对需要立即一致的
 * API 路径（如导出、或拖拽结束后显示隐藏层之前）调用 `flushAll()`。
 */
export class EdgeUpdateScheduler {
  private readonly dirtyEdges = new Set<string>();
  private scheduled = false;

  constructor(
    private readonly updateEdge: (edgeKey: string) => void,
    private readonly options: { maxEdgesPerFrame?: number; maxMsPerFrame?: number } = {}
  ) {}

  mark(edgeKey: string, schedule = true): void {
    this.dirtyEdges.add(edgeKey);
    if (schedule) this.schedule();
  }

  markMany(edgeKeys: Iterable<string>, schedule = true): void {
    for (const edgeKey of edgeKeys) this.dirtyEdges.add(edgeKey);
    if (schedule) this.schedule();
  }

  flushAll(): void {
    this.scheduled = false;
    const edges = Array.from(this.dirtyEdges);
    this.dirtyEdges.clear();
    for (const edgeKey of edges) this.updateEdge(edgeKey);
  }

  clear(): void {
    this.dirtyEdges.clear();
    this.scheduled = false;
  }

  private schedule(): void {
    if (this.scheduled || this.dirtyEdges.size === 0) return;
    this.scheduled = true;
    requestAnimationFrame(() => this.flushFrame());
  }

  private flushFrame(): void {
    this.scheduled = false;
    const maxEdges = this.options.maxEdgesPerFrame ?? 800;
    const maxMs = this.options.maxMsPerFrame ?? 6;
    const startedAt = performance.now();
    let count = 0;

    for (const edgeKey of this.dirtyEdges) {
      this.dirtyEdges.delete(edgeKey);
      this.updateEdge(edgeKey);
      count += 1;
      if (count >= maxEdges || performance.now() - startedAt >= maxMs) break;
    }

    if (this.dirtyEdges.size > 0) this.schedule();
  }
}
