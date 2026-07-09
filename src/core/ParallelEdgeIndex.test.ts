import { describe, it, expect } from 'vitest';
import { assignParallelSlots } from './ParallelEdgeIndex';

// 槽位分配规则（产品要求）：同向组允许中间直线（对称扇形）；存在双向时不出现直线，
// 每个方向独占弦的一侧、各自向外扩弧。返回值符号按"边自身方向"，反向边法线相反即分居两侧。

describe('assignParallelSlots', () => {
  it('单边居中（slot=0，直线）', () => {
    expect(assignParallelSlots([true])).toEqual([0]);
    expect(assignParallelSlots([false])).toEqual([0]);
  });

  it('2 条同向：对称双弧 ±0.5，无直线', () => {
    expect(assignParallelSlots([true, true])).toEqual([-0.5, 0.5]);
    // 全反向组翻符号后仍是对称集合
    expect(assignParallelSlots([false, false])).toEqual([0.5, -0.5]);
  });

  it('3 条同向：对称扇形含中间直线（-1/0/+1）', () => {
    expect(assignParallelSlots([true, true, true])).toEqual([-1, 0, 1]);
  });

  it('2 条双向：各占一侧（各自 slot=1），无直线', () => {
    expect(assignParallelSlots([true, false])).toEqual([1, 1]);
    expect(assignParallelSlots([false, true])).toEqual([1, 1]);
  });

  it('3 条 2正1反：正向一侧 1/2 递增，反向另一侧 1，无 0', () => {
    expect(assignParallelSlots([true, true, false])).toEqual([1, 2, 1]);
    expect(assignParallelSlots([true, false, true])).toEqual([1, 1, 2]);
  });

  it('5 条 3正2反：两侧各自递增，无 0', () => {
    const slots = assignParallelSlots([true, true, true, false, false]);
    expect(slots).toEqual([1, 2, 3, 1, 2]);
    expect(slots).not.toContain(0);
  });

  it('混合方向组任何规模都不出现中间直线（slot=0）', () => {
    for (let canonicalCount = 1; canonicalCount <= 4; canonicalCount += 1) {
      for (let reverseCount = 1; reverseCount <= 4; reverseCount += 1) {
        const flags = [...Array(canonicalCount).fill(true), ...Array(reverseCount).fill(false)];
        expect(assignParallelSlots(flags)).not.toContain(0);
      }
    }
  });
});
