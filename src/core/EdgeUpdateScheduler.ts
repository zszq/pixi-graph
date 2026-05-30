/**
 * Frame-budgeted edge update scheduler.
 *
 * High-degree node updates can dirty thousands of incident edges. Updating all
 * of them synchronously keeps geometry perfectly current but destroys frame
 * time. This scheduler coalesces repeated dirty marks and processes them in
 * small batches on subsequent animation frames. Call `flushAll()` for API paths
 * that require immediate consistency, e.g. export or drag end before showing
 * hidden layers.
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
