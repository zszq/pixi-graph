/**
 * 跟踪同一对节点之间的平行边，使得增删某条边时能就地重算双向偏移（bilateral offset），
 * 而不必全图重扫。
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

/**
 * 给一组平行边分配扇形槽位。返回值的符号按"每条边自身方向"约定：弧弯向该边行进方向的法线正侧，
 * 反向边法线相反，同数值自然落在弦的另一侧。
 *
 * canonicalFlags[i]：第 i 条边是否为规范方向（source <= target）。
 *
 * 规则（产品要求）：
 * - 全部同向：对称扇形 i-(n-1)/2（…-1、0、+1…），奇数条时中间一条 slot=0 画直线。
 * - 存在双向：不出现中间直线——每个方向的边独占弦的一侧，各自从 1 开始向外扩弧
 *   （1、2、3…）；两个方向靠法线相反分居两侧，互不重叠。
 */
export function assignParallelSlots(canonicalFlags: boolean[]): number[] {
  const n = canonicalFlags.length;
  if (n <= 1) return canonicalFlags.map(() => 0);

  const hasCanonical = canonicalFlags.includes(true);
  const hasReverse = canonicalFlags.includes(false);
  if (hasCanonical && hasReverse) {
    let canonicalRank = 0;
    let reverseRank = 0;
    return canonicalFlags.map(flag => (flag ? ++canonicalRank : ++reverseRank));
  }

  // 同向组：槽位在规范坐标系下对称分布，再按边自身方向翻符号。
  // 全反向组翻转后仍是对称集合，视觉效果与规范方向组一致。
  return canonicalFlags.map((flag, i) => {
    const slot = i - (n - 1) / 2;
    return flag ? slot : -slot;
  });
}
