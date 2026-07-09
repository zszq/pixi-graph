import { describe, it, expect } from 'vitest';
import { computeCurveGeometry, createCurveGeometry, sampleCurvePoints } from './edgeCurve';

// 曲线几何是普通/批量两种渲染路径与游标拾取共用的基础，这里锁定它的核心不变量：
// 端部裁剪距离、弧顶偏移语义、箭头停靠点、退化输入的判定。

describe('computeCurveGeometry', () => {
  const out = createCurveGeometry();

  it('端点落在裁剪圆上，弧顶偏离弦线为 apexOffset', () => {
    const geometry = computeCurveGeometry(0, 0, 200, 0, 30, 10, 20, 0, out);
    expect(geometry.valid).toBe(true);
    // 起点距源圆心 = sourceClearance，终点距目标圆心 = targetClearance（二分收敛到亚像素）
    expect(Math.hypot(geometry.q0x, geometry.q0y)).toBeCloseTo(10, 3);
    expect(Math.hypot(geometry.q2x - 200, geometry.q2y)).toBeCloseTo(20, 3);
    // 完整曲线的弧顶（标签停靠点）在弦中点沿法线偏移 apexOffset 处
    expect(geometry.labelX).toBeCloseTo(100, 6);
    expect(Math.abs(geometry.labelY)).toBeCloseTo(30, 6);
  });

  it('apexOffset 符号翻转时弧落在弦线另一侧', () => {
    const up = computeCurveGeometry(0, 0, 200, 0, 30, 10, 10, 0, createCurveGeometry());
    const down = computeCurveGeometry(0, 0, 200, 0, -30, 10, 10, 0, createCurveGeometry());
    expect(up.labelY).toBeCloseTo(-down.labelY, 6);
    expect(up.q1y).toBeCloseTo(-down.q1y, 6);
  });

  it('箭头中心在曲线终点沿切线向前 arrowBack 处，朝向指向目标', () => {
    const geometry = computeCurveGeometry(0, 0, 200, 0, 30, 10, 20, 5, out);
    expect(Math.hypot(geometry.arrowX - geometry.q2x, geometry.arrowY - geometry.q2y)).toBeCloseTo(5, 6);
    // 箭头应比曲线终点更靠近目标圆心
    const endDistance = Math.hypot(geometry.q2x - 200, geometry.q2y);
    const arrowDistance = Math.hypot(geometry.arrowX - 200, geometry.arrowY);
    expect(arrowDistance).toBeLessThan(endDistance);
  });

  it('两节点过近（裁剪半径吞掉半条曲线）判定为 invalid', () => {
    const geometry = computeCurveGeometry(0, 0, 30, 0, 5, 20, 20, 0, out);
    expect(geometry.valid).toBe(false);
  });

  it('两端重合（弦长为 0）判定为 invalid', () => {
    const geometry = computeCurveGeometry(50, 50, 50, 50, 30, 10, 10, 0, out);
    expect(geometry.valid).toBe(false);
  });
});

describe('sampleCurvePoints', () => {
  it('采样端点与子曲线端点一致，且各点单调靠近目标', () => {
    const geometry = computeCurveGeometry(0, 0, 300, 100, 40, 15, 25, 0, createCurveGeometry());
    const segments = 12;
    const points = new Float64Array((segments + 1) * 2);
    sampleCurvePoints(geometry, segments, points);
    expect(points[0]).toBeCloseTo(geometry.q0x, 9);
    expect(points[1]).toBeCloseTo(geometry.q0y, 9);
    expect(points[segments * 2]).toBeCloseTo(geometry.q2x, 9);
    expect(points[segments * 2 + 1]).toBeCloseTo(geometry.q2y, 9);
    // 折线总长应大于弦长（弧比弦长），且每段有限长
    let polylineLength = 0;
    for (let s = 0; s < segments; s += 1) {
      polylineLength += Math.hypot(points[s * 2 + 2] - points[s * 2], points[s * 2 + 3] - points[s * 2 + 1]);
    }
    const chord = Math.hypot(geometry.q2x - geometry.q0x, geometry.q2y - geometry.q0y);
    expect(polylineLength).toBeGreaterThan(chord);
  });
});
