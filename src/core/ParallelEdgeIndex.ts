/**
 * Tracks edges between the same pair of nodes so bilateral offsets can be
 * recomputed locally when one edge is added or removed.
 */
export class ParallelEdgeIndex {
  private readonly pairToEdgeKeys = new Map<string, Set<string>>();
  private readonly edgeToPairKey = new Map<string, string>();

  register(edgeKey: string, sourceKey: string, targetKey: string): string[] {
    const pairKey = this.getPairKey(sourceKey, targetKey);
    this.edgeToPairKey.set(edgeKey, pairKey);

    let edgeKeys = this.pairToEdgeKeys.get(pairKey);
    if (!edgeKeys) {
      edgeKeys = new Set<string>();
      this.pairToEdgeKeys.set(pairKey, edgeKeys);
    }

    edgeKeys.add(edgeKey);
    return Array.from(edgeKeys);
  }

  unregister(edgeKey: string): string[] {
    const pairKey = this.edgeToPairKey.get(edgeKey);
    if (!pairKey) return [];

    this.edgeToPairKey.delete(edgeKey);
    const edgeKeys = this.pairToEdgeKeys.get(pairKey);
    if (!edgeKeys) return [];

    edgeKeys.delete(edgeKey);
    if (edgeKeys.size === 0) {
      this.pairToEdgeKeys.delete(pairKey);
      return [];
    }

    return Array.from(edgeKeys);
  }

  clear(): void {
    this.pairToEdgeKeys.clear();
    this.edgeToPairKey.clear();
  }

  private getPairKey(sourceKey: string, targetKey: string): string {
    return sourceKey < targetKey ? `${sourceKey}\u0000${targetKey}` : `${targetKey}\u0000${sourceKey}`;
  }
}
