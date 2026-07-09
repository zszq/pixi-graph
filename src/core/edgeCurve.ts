/**
 * 平行边曲线的共享几何计算（what）：把两点间的一条平行边表示为二次贝塞尔曲线，
 * 端部按节点圆外缘裁剪，并给出箭头位置/朝向与标签（弧顶）位置。
 *
 * 为什么单独成模块（why）：普通模式（PixiEdge 的 Graphics 真贝塞尔）与批量模式
 * （BatchEdgeLayer 的折线粒子近似）、以及批量模式的游标拾取都要用同一套几何，
 * 集中在此保证"画出来的曲线、拾取判定的曲线、箭头停靠点"三者完全一致。
 *
 * 约定：全部输入输出均为世界坐标；apexOffset 为弧顶偏离弦线的有符号距离
 * （符号来自平行边槽位 parallelSlot，正负决定弧在弦的哪一侧）。
 */

export interface CurveGeometry {
  /** 端部裁剪是否成功：两节点过近（裁剪半径吞掉半条曲线）时为 false，此时不应绘制曲线与箭头 */
  valid: boolean;
  /** 裁剪后子贝塞尔的三个控制点（起点、控制点、终点），可直接 moveTo(q0).quadraticCurveTo(q1, q2) */
  q0x: number;
  q0y: number;
  q1x: number;
  q1y: number;
  q2x: number;
  q2y: number;
  /** 箭头中心与朝向（rotation 与直线边约定一致：切线方向角 + π/2） */
  arrowX: number;
  arrowY: number;
  arrowRotation: number;
  /** 标签停靠点：完整曲线的弧顶（t=0.5），平行边标签随弧散开而不互相压盖 */
  labelX: number;
  labelY: number;
}

export function createCurveGeometry(): CurveGeometry {
  return { valid: false, q0x: 0, q0y: 0, q1x: 0, q1y: 0, q2x: 0, q2y: 0, arrowX: 0, arrowY: 0, arrowRotation: 0, labelX: 0, labelY: 0 };
}

/**
 * 计算平行边曲线几何。
 * sourceClearance / targetClearance：曲线在两端各让出的距离（节点半径+描边，目标端另加箭头高度），
 * 与直线边的扣减规则一致，保证曲线不插进节点圆、不压住箭头。
 * arrowBack：箭头中心距曲线终点（目标端裁剪点）沿切线向前的距离（√3/4·箭头边长），0 表示无箭头。
 * out 传入复用对象避免热路径分配（批量重建逐边调用）。
 */
export function computeCurveGeometry(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  apexOffset: number,
  sourceClearance: number,
  targetClearance: number,
  arrowBack: number,
  out: CurveGeometry
): CurveGeometry {
  const dx = tx - sx;
  const dy = ty - sy;
  const chord = Math.hypot(dx, dy);
  out.valid = false;
  if (chord === 0 || !Number.isFinite(chord)) return out;

  // 控制点在弦中点沿法线偏移 2·apexOffset：二次贝塞尔 t=0.5 处恰位于中点与控制点连线的中点，
  // 于是弧顶到弦线的距离正好是 apexOffset——这让 curvature 的"弧顶间距"语义精确成立。
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const nx = -dy / chord;
  const ny = dx / chord;
  const cx = mx + nx * apexOffset * 2;
  const cy = my + ny * apexOffset * 2;

  out.labelX = mx + nx * apexOffset;
  out.labelY = my + ny * apexOffset;

  // 端部裁剪：在 [0,0.5] 上找离源点距离 = sourceClearance 的参数 t0（目标端对称）。
  // |B(t)-P0| 随 t 单调增（曲率有限的贝塞尔前半段），二分十几次精度已达亚像素，成本可忽略。
  const t0 = solveClearance(sx, sy, cx, cy, tx, ty, sx, sy, sourceClearance, 0, 0.5);
  const t1 = solveClearance(sx, sy, cx, cy, tx, ty, tx, ty, targetClearance, 1, 0.5);
  if (t0 < 0 || t1 < 0 || t0 >= t1) return out;

  // 子曲线控制点（blossom/极形式）：限制在 [t0,t1] 的二次贝塞尔仍是二次贝塞尔，
  // 端点为 B(t0)、B(t1)，控制点为对称双仿射形 b(t0,t1)。
  out.q0x = bezier(sx, cx, tx, t0);
  out.q0y = bezier(sy, cy, ty, t0);
  out.q2x = bezier(sx, cx, tx, t1);
  out.q2y = bezier(sy, cy, ty, t1);
  out.q1x = blossom(sx, cx, tx, t0, t1);
  out.q1y = blossom(sy, cy, ty, t0, t1);

  // 箭头：贴在曲线终点，沿该点切线指向目标节点。切线 B'(t) = 2(1-t)(C-P0) + 2t(P2-C)。
  const dxT = (1 - t1) * (cx - sx) + t1 * (tx - cx);
  const dyT = (1 - t1) * (cy - sy) + t1 * (ty - cy);
  const tangentLength = Math.hypot(dxT, dyT);
  if (tangentLength > 0 && arrowBack > 0) {
    const ux = dxT / tangentLength;
    const uy = dyT / tangentLength;
    out.arrowX = out.q2x + ux * arrowBack;
    out.arrowY = out.q2y + uy * arrowBack;
    out.arrowRotation = Math.atan2(uy, ux) + Math.PI / 2;
  } else {
    out.arrowX = out.q2x;
    out.arrowY = out.q2y;
    out.arrowRotation = 0;
  }

  out.valid = true;
  return out;
}

/**
 * 把（裁剪后的）子贝塞尔均匀采样成 segments+1 个点写入 outPoints（[x0,y0,x1,y1,...]）。
 * 批量模式的折线粒子与游标拾取共用，保证"画的"与"点得中的"是同一条折线。
 * outPoints 长度必须 ≥ 2*(segments+1)，由调用方复用缓冲避免分配。
 */
export function sampleCurvePoints(geometry: CurveGeometry, segments: number, outPoints: Float64Array): void {
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    outPoints[i * 2] = bezier(geometry.q0x, geometry.q1x, geometry.q2x, t);
    outPoints[i * 2 + 1] = bezier(geometry.q0y, geometry.q1y, geometry.q2y, t);
  }
}

/** 二次贝塞尔单轴取值。 */
function bezier(p0: number, c: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p2;
}

/** 二次贝塞尔的 blossom（极形式）单轴取值：b(s,t)，用于子区间的控制点。 */
function blossom(p0: number, c: number, p2: number, s: number, t: number): number {
  return (1 - s) * (1 - t) * p0 + (s * (1 - t) + t * (1 - s)) * c + s * t * p2;
}

// 在 [tFar, tNear]（无序）间二分求 |B(t) - 圆心| = clearance 的 t。
// tAnchor 是"圆心所在端"的参数（源端 0 / 目标端 1），该端距离必为 0 < clearance；
// 若 t=0.5（曲线中点）仍在圆内说明节点过近吞掉了半条曲线，返回 -1 由调用方判定不可见。
function solveClearance(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  centerX: number,
  centerY: number,
  clearance: number,
  tAnchor: number,
  tMid: number
): number {
  const distanceAt = (t: number): number => {
    const bx = bezier(sx, cx, tx, t);
    const by = bezier(sy, cy, ty, t);
    return Math.hypot(bx - centerX, by - centerY);
  };
  if (clearance <= 0) return tAnchor;
  if (distanceAt(tMid) <= clearance) return -1;

  let inside = tAnchor; // 距离 < clearance 的一侧
  let outside = tMid; // 距离 > clearance 的一侧
  for (let i = 0; i < 20; i += 1) {
    const t = (inside + outside) / 2;
    if (distanceAt(t) < clearance) inside = t;
    else outside = t;
  }
  return outside;
}
