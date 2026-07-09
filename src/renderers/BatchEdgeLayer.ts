import { Container, Graphics, Particle, ParticleContainer, Texture, type Renderer } from 'pixi.js';
import type { AbstractGraph } from 'graphology-types';
import { DEFAULT_STYLE } from '../core/constants';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';
import type { EdgeStyle, GraphStyleDefinition, NodeStyle } from '../style/style';
import { resolveStyleDefinitions } from '../style/style';
import { colorToPixi } from '../utils/color';
import { SpatialEdgeIndex } from '../core/SpatialEdgeIndex';
import { computeCurveGeometry, createCurveGeometry, sampleCurvePoints } from '../core/edgeCurve';
import type { PixiEdge } from '../elements/PixiEdge';
import type { PixiNode } from '../elements/PixiNode';

interface EdgeParticlePair {
  // 线条粒子在 linePool 中的连续区间 [lineStart, lineStart+lineCount)。粒子按 rebuild 顺序从池前缀
  // 连续分配，区间引用到下次 rebuild 前始终有效；比每条边存 Particle[] 省一次数组分配（rebuild 热路径）。
  lineStart: number;
  // 直线 1 个；平行曲线边为折线近似的段数（edgeStyle.curve.segments）。
  lineCount: number;
  arrow: Particle | undefined;
}

// 曲线几何/采样点/扩边矩形的模块级复用缓冲：rebuild 与拾取都是同步逐边处理，单线程下共用安全，
// 避免在逐帧热路径里反复分配。
const scratchCurveGeometry = createCurveGeometry();
let scratchCurvePoints = new Float64Array((12 + 1) * 2);
function ensureCurvePointBuffer(segments: number): Float64Array {
  const needed = (segments + 1) * 2;
  if (scratchCurvePoints.length < needed) scratchCurvePoints = new Float64Array(needed);
  return scratchCurvePoints;
}
const scratchInflatedRect = { left: 0, right: 0, top: 0, bottom: 0 };
function inflateRect(rect: { left: number; right: number; top: number; bottom: number }, pad: number) {
  scratchInflatedRect.left = rect.left - pad;
  scratchInflatedRect.right = rect.right + pad;
  scratchInflatedRect.top = rect.top - pad;
  scratchInflatedRect.bottom = rect.bottom + pad;
  return scratchInflatedRect;
}
const scratchApexPoint = { x: 0, y: 0 };

// 平行边曲线的弧顶偏移（0 = 画直线）。必须与 PixiEdge.updatePosition 的公式完全一致，
// 否则批量画出的曲线与普通模式/游标拾取的判定会错位。
function curveApexOffset(edge: PixiEdge, edgeStyle: EdgeStyle, sx: number, sy: number, tx: number, ty: number): number {
  if (!edgeStyle.curve.enabled || !edge.isBilateral || edge.parallelSlot === 0) return 0;
  return edge.parallelSlot * edgeStyle.curve.curvature * Math.hypot(tx - sx, ty - sy);
}

function curveSegmentCount(edgeStyle: EdgeStyle): number {
  return Math.max(2, Math.round(edgeStyle.curve.segments));
}

// 折线段粒子：段中点定位、法线旋转、长度多加 1 世界单位——相邻旋转矩形首尾微重叠，遮住拼接缝隙。
function fillSegmentParticle(particle: Particle, x0: number, y0: number, x1: number, y1: number, width: number, tint: number, alpha: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  particle.x = (x0 + x1) / 2;
  particle.y = (y0 + y1) / 2;
  particle.scaleX = width;
  particle.scaleY = Math.hypot(dx, dy) + 1;
  particle.rotation = -Math.atan2(dx, dy);
  particle.tint = tint;
  particle.alpha = alpha;
}

/**
 * 由两个 ParticleContainer 支撑的大图边层。沿用 sigma/G6 式的拆分：交互/标签留在普通
 * 对象上，而密集可见的边线条则压成 GPU 友好的连续粒子缓冲。
 */
export class BatchEdgeLayer<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> extends Container {
  private readonly graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  private readonly style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  private readonly nodes: Map<string, PixiNode>;
  private readonly edges: Map<string, PixiEdge>;
  private readonly edgeParticles = new Map<string, EdgeParticlePair>();
  // ━━ 性能优化⑦｜边粒子对象池 ━━ (tag: perf-v8-pan-gc)
  // ⚠️ PERF-CRITICAL（性能关键·勿改回每次 new Particle）：rebuild 在放大拖拽时逐帧（跨瓦片）触发，
  // 若每帧为每条可见边 new Particle 会造成持续 GC 抖动。改为持久复用池中实例（只改属性、不 new），
  // 池按历史峰值单调增长；lineCount/arrowCount 记录本次实际用量，rebuild 末尾据此把池前缀绑回
  // particleChildren（见 syncParticleChildren）。实测 50k 放大拖拽逐帧 rebuild mean −44%、max −57%。
  private readonly linePool: Particle[] = [];
  private readonly arrowPool: Particle[] = [];
  private lineCount = 0;
  private arrowCount = 0;
  // 边的空间索引：rebuild 时按视口只取候选边，免去遍历全部边（见 rebuild 与 SpatialEdgeIndex）。
  private readonly spatialEdgeIndex = new SpatialEdgeIndex<NodeAttributes, EdgeAttributes>();
  private dirty = true;
  private lastBoundsKey = '';
  private readonly lineLayer = new ParticleContainer({
    texture: Texture.WHITE,
    dynamicProperties: { position: false, rotation: false, vertex: false, uvs: false, color: false },
    roundPixels: true
  });
  private readonly arrowLayer = new ParticleContainer({
    dynamicProperties: { position: false, rotation: false, vertex: false, uvs: false, color: false },
    roundPixels: true
  });
  private arrowTexture: Texture | undefined;

  constructor(options: {
    graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
    style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
    nodes: Map<string, PixiNode>;
    edges: Map<string, PixiEdge>;
  }) {
    super();
    this.graph = options.graph;
    this.style = options.style;
    this.nodes = options.nodes;
    this.edges = options.edges;
    this.eventMode = 'none';
    this.addChild(this.lineLayer, this.arrowLayer);

    // 曲线边在空间索引里按"弦端点→弧顶→弦端点"两段折线登记：弧最多凸出弦线 |apexOffset|，
    // 只按弦登记会漏掉"弦在视口外、弧探进视口"的候选，平移时曲线边会闪现/消失。
    // 这里只读 edge.edgeStyle（已解析缓存），不在 O(E) 的索引重建里做样式解析。
    this.spatialEdgeIndex.setCurveApexResolver((edgeKey, source, target) => {
      const edge = this.edges.get(edgeKey);
      if (!edge || edge.isSelfLoop || !edge.edgeStyle) return null;
      const apexOffset = curveApexOffset(edge, edge.edgeStyle, source.x, source.y, target.x, target.y);
      if (apexOffset === 0) return null;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const chord = Math.hypot(dx, dy);
      if (chord === 0) return null;
      scratchApexPoint.x = (source.x + target.x) / 2 - (dy / chord) * apexOffset;
      scratchApexPoint.y = (source.y + target.y) / 2 + (dx / chord) * apexOffset;
      return scratchApexPoint;
    });
  }

  markDirty(): void {
    this.dirty = true;
    this.lastBoundsKey = '';
  }

  // 标记空间索引过期（节点几何变化、边增删时由上层调用）。与 markDirty 分开：markDirty 被 hover
  // 等纯样式变更高频调用，但那些不改变边的空间分布，不应触发 O(E) 的索引重建；只有位置/拓扑变才标这个。
  markIndexDirty(): void {
    this.spatialEdgeIndex.markDirty();
    this.markDirty();
  }

  setZoomStep(zoomStep: number): void {
    const renderable = zoomStep >= 1;
    this.lineLayer.renderable = renderable;
    this.arrowLayer.renderable = renderable;
  }

  // 重建可见边的粒子缓冲（what）：取候选边、剔除不与视口相交的，把可见边写成线条/箭头粒子。
  // 瓦片量化缓存：把可见边界量化到 128px 网格生成 boundsKey，只要没标脏且仍在同一网格内就跳过
  // 重建——平移不足一格不必重算。'all' 表示不限视口（全量重建）。
  // ⚠️ PERF-CRITICAL（性能关键·勿改回遍历全部边）：有视口时用 SpatialEdgeIndex 只取视口附近的候选边，
  // 而非 graph.forEachEdge 遍历全部边——放大时视口内边仅占全图 1~2%，全遍历是纯浪费（实测 5 万点放大
  // 平移 rebuild ~36ms→个位数 ms）。几何与精确相交仍用实时 graph 坐标，索引只做空间粗筛（候选为可见边
  // 的超集），故结果与全遍历完全一致。索引新鲜度由 markIndexDirty 维护，勿在此对每条边都过索引。
  rebuild(renderer: Renderer, visibleBounds?: { x: number; y: number; width: number; height: number }): void {
    // LOD 低档（zoomStep<1，边整层不渲染，见 setZoomStep）时跳过粒子构建：全览大图时重建
    // 十万级粒子（曲线边还要 ×segments 段）既耗时又占数百 MB，而结果根本不会显示。
    // 不动 dirty/boundsKey，缩放回边可见档位后 frame-end 的下一次 rebuild 自然补建。
    if (!this.lineLayer.renderable) return;
    const boundsKey = visibleBounds ? quantizedBoundsKey(visibleBounds, 128) : 'all';
    if (!this.dirty && boundsKey === this.lastBoundsKey) return;
    const cullBounds = visibleBounds ? padBounds(visibleBounds, 128) : undefined;
    // 重置写入计数（复用池实例，不清空池），并清空 key→粒子映射后逐条重建。
    this.lineCount = 0;
    this.arrowCount = 0;
    this.edgeParticles.clear();

    // selectCandidates 返回候选边；视口几乎覆盖全图时返回 null → 全量遍历更快（避免看全图时的索引开销）。
    const candidates = cullBounds ? this.spatialEdgeIndex.selectCandidates(this.graph, cullBounds) : null;
    if (candidates) {
      for (const edgeKey of candidates) {
        this.appendEdgeParticle(edgeKey, renderer, cullBounds);
      }
    } else {
      this.graph.forEachEdge(edgeKey => this.appendEdgeParticle(edgeKey, renderer, cullBounds));
    }

    // 把池中实际用到的前缀绑回 particleChildren（数组操作廉价，无 Particle 分配）。
    syncParticleChildren(this.lineLayer.particleChildren as Particle[], this.linePool, this.lineCount);
    syncParticleChildren(this.arrowLayer.particleChildren as Particle[], this.arrowPool, this.arrowCount);
    this.lineLayer.update();
    this.arrowLayer.update();
    this.dirty = false;
    this.lastBoundsKey = boundsKey;
  }

  // 处理单条候选边：过滤（自环/隐藏由各自层负责，不入批量）→ 精确视口相交剔除 → 算几何 →
  // 写线条/箭头粒子。坐标全部取自实时 graph，保证即便索引候选偏多/偏旧也不会画错位置。
  // 注意：hover 边仍保留在批量层。高性能模式下独立边层不渲染，若把 hover 边剔除会导致其消失/不变色；
  // 改为用 edge.edgeStyle（已含 hover 合并色）直接在批量粒子里上色，代价是失去“置顶”z 序（可接受）。
  private appendEdgeParticle(edgeKey: string, renderer: Renderer, cullBounds: { left: number; right: number; top: number; bottom: number } | undefined): void {
    const edge = this.edges.get(edgeKey);
    if (!edge || edge.isSelfLoop || !edge.isVisible()) return;
    if (!this.graph.hasEdge(edgeKey)) return;

    const sourceKey = this.graph.source(edgeKey);
    const targetKey = this.graph.target(edgeKey);
    const sourceNode = this.nodes.get(sourceKey);
    const targetNode = this.nodes.get(targetKey);
    if (!sourceNode || !targetNode) return;

    const sourceAttributes = this.graph.getNodeAttributes(sourceKey);
    const targetAttributes = this.graph.getNodeAttributes(targetKey);

    const edgeStyle = edge.edgeStyle ?? resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, undefined], this.graph.getEdgeAttributes(edgeKey));
    if (edgeStyle.width <= 0) return;

    // 曲线边粗剔除：仍用弦线判交，但矩形向外扩 |弧顶偏移|——弧凸出弦线不超过该距离，扩边后不漏画。
    const apexOffset = curveApexOffset(edge, edgeStyle, sourceAttributes.x, sourceAttributes.y, targetAttributes.x, targetAttributes.y);
    if (cullBounds) {
      const rect = apexOffset === 0 ? cullBounds : inflateRect(cullBounds, Math.abs(apexOffset));
      if (!segmentIntersectsRect(sourceAttributes, targetAttributes, rect)) return;
    }

    const [tint, colorAlpha] = colorToPixi(edgeStyle.color);
    const alpha = colorAlpha * edgeStyle.alpha;
    const arrowHeight = edgeStyle.arrow.show ? (Math.sqrt(3) / 2) * edgeStyle.arrow.size : 0;

    if (apexOffset !== 0) {
      const geometry = computeCurveGeometry(
        sourceAttributes.x,
        sourceAttributes.y,
        targetAttributes.x,
        targetAttributes.y,
        apexOffset,
        sourceNode.nodeStyle.size + sourceNode.nodeStyle.border.width,
        targetNode.nodeStyle.size + targetNode.nodeStyle.border.width + arrowHeight,
        edgeStyle.arrow.show ? (Math.sqrt(3) / 4) * edgeStyle.arrow.size : 0,
        scratchCurveGeometry
      );
      if (geometry.valid) {
        const segments = curveSegmentCount(edgeStyle);
        const points = ensureCurvePointBuffer(segments);
        sampleCurvePoints(geometry, segments, points);
        const lineStart = this.lineCount;
        for (let s = 0; s < segments; s += 1) {
          fillSegmentParticle(this.takeLineParticle(), points[s * 2], points[s * 2 + 1], points[s * 2 + 2], points[s * 2 + 3], edgeStyle.width, tint, alpha);
        }
        const arrow = this.writeArrowParticle(renderer, edgeStyle, geometry.arrowX, geometry.arrowY, geometry.arrowRotation, tint, alpha);
        this.edgeParticles.set(edgeKey, { lineStart, lineCount: segments, arrow });
        return;
      }
      // 裁剪失败（两节点过近弧被吞尽）回退直线，与普通模式 PixiEdge.updatePosition 的回退行为一致。
    }

    const geometry = computeEdgeGeometry(
      { x: sourceAttributes.x, y: sourceAttributes.y },
      { x: targetAttributes.x, y: targetAttributes.y },
      edgeStyle,
      sourceNode.nodeStyle,
      targetNode.nodeStyle,
      edge.isBilateral && !edgeStyle.curve.enabled
    );
    if (geometry.lineLength <= 0) return;

    const lineStart = this.lineCount;
    const line = this.takeLineParticle();
    line.x = geometry.lineX;
    line.y = geometry.lineY;
    line.scaleX = edgeStyle.width;
    line.scaleY = geometry.lineLength;
    line.rotation = geometry.lineRotation;
    line.tint = tint;
    line.alpha = alpha;

    const arrow = this.writeArrowParticle(renderer, edgeStyle, geometry.arrowX, geometry.arrowY, geometry.arrowRotation, tint, alpha);
    this.edgeParticles.set(edgeKey, { lineStart, lineCount: 1, arrow });
  }

  // PERF-CRITICAL (tag: perf-v8-pan-gc)：从池取（不足才 new），只设属性，勿改成每次 new Particle。
  // 锚点固定 0.5，建池时设一次即可。
  private takeLineParticle(): Particle {
    let line = this.linePool[this.lineCount];
    if (!line) {
      line = new Particle({ texture: Texture.WHITE, anchorX: 0.5, anchorY: 0.5 });
      this.linePool[this.lineCount] = line;
    }
    this.lineCount += 1;
    return line;
  }

  // 需要箭头时从池取一个箭头粒子并写入位置/朝向/颜色；不显示箭头返回 undefined。
  private writeArrowParticle(renderer: Renderer, edgeStyle: EdgeStyle, x: number, y: number, rotation: number, tint: number, alpha: number): Particle | undefined {
    if (!edgeStyle.arrow.show || edgeStyle.arrow.size <= 0) return undefined;
    const texture = this.getArrowTexture(renderer, edgeStyle.arrow.size);
    let arrow = this.arrowPool[this.arrowCount];
    if (!arrow) {
      arrow = new Particle({ texture, anchorX: 0.5, anchorY: 0.5 });
      this.arrowPool[this.arrowCount] = arrow;
    } else {
      arrow.texture = texture;
    }
    arrow.x = x;
    arrow.y = y;
    arrow.rotation = rotation;
    arrow.tint = tint;
    arrow.alpha = alpha;
    this.arrowCount += 1;
    return arrow;
  }

  updateEdge(edgeKey: string): void {
    const pair = this.edgeParticles.get(edgeKey);
    if (!pair) return;
    const edge = this.edges.get(edgeKey);
    if (!edge || !this.graph.hasEdge(edgeKey)) {
      this.dirty = true;
      return;
    }
    const sourceKey = this.graph.source(edgeKey);
    const targetKey = this.graph.target(edgeKey);
    const sourceNode = this.nodes.get(sourceKey);
    const targetNode = this.nodes.get(targetKey);
    // hover 边不再从批量层剔除（见 appendEdgeParticle 注释），保证高性能模式下 hover 也能即时变色
    if (!sourceNode || !targetNode || edge.isSelfLoop || !edge.isVisible()) {
      this.dirty = true;
      return;
    }
    const edgeStyle = edge.edgeStyle ?? resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, undefined], this.graph.getEdgeAttributes(edgeKey));
    const sourceAttributes = this.graph.getNodeAttributes(sourceKey);
    const targetAttributes = this.graph.getNodeAttributes(targetKey);

    // 颜色（tint/alpha）必须在这里同步：选中/高亮等纯样式变更只走 updateEdge（不触发整层 rebuild），
    // 若此处只更新几何而不更新颜色，被高亮的边会保持旧色，直到下次平移/缩放触发 rebuild 才变色。
    // colorToPixi 内部有颜色串缓存，热路径（拖拽逐边刷新）实际是一次 Map 命中，开销可忽略。
    const [tint, colorAlpha] = colorToPixi(edgeStyle.color);
    const alpha = colorAlpha * edgeStyle.alpha;
    const arrowHeight = edgeStyle.arrow.show ? (Math.sqrt(3) / 2) * edgeStyle.arrow.size : 0;

    const apexOffset = curveApexOffset(edge, edgeStyle, sourceAttributes.x, sourceAttributes.y, targetAttributes.x, targetAttributes.y);
    let curveUpdated = false;
    if (apexOffset !== 0) {
      const geometry = computeCurveGeometry(
        sourceAttributes.x,
        sourceAttributes.y,
        targetAttributes.x,
        targetAttributes.y,
        apexOffset,
        sourceNode.nodeStyle.size + sourceNode.nodeStyle.border.width,
        targetNode.nodeStyle.size + targetNode.nodeStyle.border.width + arrowHeight,
        edgeStyle.arrow.show ? (Math.sqrt(3) / 4) * edgeStyle.arrow.size : 0,
        scratchCurveGeometry
      );
      if (geometry.valid) {
        const segments = curveSegmentCount(edgeStyle);
        // 形态/段数与当前粒子区间不符（直线↔曲线切换、segments 变更）：粒子数无法就地增减，交给整层重建。
        if (pair.lineCount !== segments) {
          this.dirty = true;
          return;
        }
        const points = ensureCurvePointBuffer(segments);
        sampleCurvePoints(geometry, segments, points);
        for (let s = 0; s < segments; s += 1) {
          fillSegmentParticle(this.linePool[pair.lineStart + s], points[s * 2], points[s * 2 + 1], points[s * 2 + 2], points[s * 2 + 3], edgeStyle.width, tint, alpha);
        }
        if (pair.arrow) {
          pair.arrow.x = geometry.arrowX;
          pair.arrow.y = geometry.arrowY;
          pair.arrow.rotation = geometry.arrowRotation;
          pair.arrow.tint = tint;
          pair.arrow.alpha = alpha;
        }
        curveUpdated = true;
      }
    }

    if (!curveUpdated) {
      if (pair.lineCount !== 1) {
        this.dirty = true;
        return;
      }
      const geometry = computeEdgeGeometry(sourceAttributes, targetAttributes, edgeStyle, sourceNode.nodeStyle, targetNode.nodeStyle, edge.isBilateral && !edgeStyle.curve.enabled);
      const line = this.linePool[pair.lineStart];
      line.x = geometry.lineX;
      line.y = geometry.lineY;
      line.scaleX = edgeStyle.width;
      line.scaleY = geometry.lineLength;
      line.rotation = geometry.lineRotation;
      line.tint = tint;
      line.alpha = alpha;
      if (pair.arrow) {
        pair.arrow.x = geometry.arrowX;
        pair.arrow.y = geometry.arrowY;
        pair.arrow.rotation = geometry.arrowRotation;
        pair.arrow.tint = tint;
        pair.arrow.alpha = alpha;
      }
    }
    this.lineLayer.update();
    this.arrowLayer.update();
  }

  /**
   * 游标拾取最近的边（what）：高性能批量模式下边线/箭头是不可交互的 Particle，无法靠 PIXI 命中
   * 测试触发 hover，故由上层在 pointermove 时调用本方法，按光标世界坐标拾取最近的可见边。
   * why 复用本层：SpatialEdgeIndex、节点/边映射与绘制几何都在这里，拾取判定与渲染共用同一套坐标，
   * 不会出现“高亮的边和画出来的边对不上”。先用索引只取光标附近格子的候选，再对每条候选用实际绘制
   * 几何（含平行边偏移）做精确距离判定：线段命中或箭头命中均可。
   * toleranceWorld：命中容差（世界单位），由上层按屏幕像素 / 缩放换算后传入。返回边 key 或 null。
   */
  pickEdgeAt(point: { x: number; y: number }, toleranceWorld: number): string | null {
    const candidates = this.spatialEdgeIndex.query(this.graph, {
      left: point.x - toleranceWorld,
      right: point.x + toleranceWorld,
      top: point.y - toleranceWorld,
      bottom: point.y + toleranceWorld
    });
    let bestKey: string | null = null;
    let bestDistance = Infinity;
    for (const edgeKey of candidates) {
      const edge = this.edges.get(edgeKey);
      // 自环边不入批量层、批量模式下也不可见；LOD/隐藏的边同样不参与拾取。
      if (!edge || edge.isSelfLoop || !edge.isVisible() || !this.graph.hasEdge(edgeKey)) continue;
      const sourceKey = this.graph.source(edgeKey);
      const targetKey = this.graph.target(edgeKey);
      const sourceNode = this.nodes.get(sourceKey);
      const targetNode = this.nodes.get(targetKey);
      if (!sourceNode || !targetNode) continue;
      const sourceAttributes = this.graph.getNodeAttributes(sourceKey);
      const targetAttributes = this.graph.getNodeAttributes(targetKey);
      const edgeStyle = edge.edgeStyle ?? resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, undefined], this.graph.getEdgeAttributes(edgeKey));
      const arrowHeight = edgeStyle.arrow.show ? (Math.sqrt(3) / 2) * edgeStyle.arrow.size : 0;

      // 曲线边：用与绘制完全相同的几何采样折线，逐段做点到线段距离——"点得中的"就是"画出来的"。
      const apexOffset = curveApexOffset(edge, edgeStyle, sourceAttributes.x, sourceAttributes.y, targetAttributes.x, targetAttributes.y);
      if (apexOffset !== 0) {
        const curveGeometry = computeCurveGeometry(
          sourceAttributes.x,
          sourceAttributes.y,
          targetAttributes.x,
          targetAttributes.y,
          apexOffset,
          sourceNode.nodeStyle.size + sourceNode.nodeStyle.border.width,
          targetNode.nodeStyle.size + targetNode.nodeStyle.border.width + arrowHeight,
          edgeStyle.arrow.show ? (Math.sqrt(3) / 4) * edgeStyle.arrow.size : 0,
          scratchCurveGeometry
        );
        if (curveGeometry.valid) {
          const segments = curveSegmentCount(edgeStyle);
          const points = ensureCurvePointBuffer(segments);
          sampleCurvePoints(curveGeometry, segments, points);
          for (let s = 0; s < segments; s += 1) {
            const segmentDistance = pointToSegmentDistance(point.x, point.y, points[s * 2], points[s * 2 + 1], points[s * 2 + 2], points[s * 2 + 3]);
            if (segmentDistance <= edgeStyle.width / 2 + toleranceWorld && segmentDistance < bestDistance) {
              bestDistance = segmentDistance;
              bestKey = edgeKey;
            }
          }
          if (edgeStyle.arrow.show && edgeStyle.arrow.size > 0) {
            const arrowDistance = Math.hypot(point.x - curveGeometry.arrowX, point.y - curveGeometry.arrowY);
            if (arrowDistance <= edgeStyle.arrow.size / 2 + toleranceWorld && arrowDistance < bestDistance) {
              bestDistance = arrowDistance;
              bestKey = edgeKey;
            }
          }
          continue;
        }
        // 曲线裁剪失败时下方按直线判定，与绘制端的回退一致。
      }

      const geometry = computeEdgeGeometry(
        { x: sourceAttributes.x, y: sourceAttributes.y },
        { x: targetAttributes.x, y: targetAttributes.y },
        edgeStyle,
        sourceNode.nodeStyle,
        targetNode.nodeStyle,
        edge.isBilateral && !edgeStyle.curve.enabled
      );
      // 线段命中：由绘制几何还原线段两端点（中心 ± 半长 · 法向单位向量），算点到线段距离；
      // 容差叠加半个线宽，让粗线更容易命中。
      if (geometry.lineLength > 0) {
        const dirX = -Math.sin(geometry.lineRotation);
        const dirY = Math.cos(geometry.lineRotation);
        const half = geometry.lineLength / 2;
        const lineDistance = pointToSegmentDistance(
          point.x,
          point.y,
          geometry.lineX + dirX * half,
          geometry.lineY + dirY * half,
          geometry.lineX - dirX * half,
          geometry.lineY - dirY * half
        );
        if (lineDistance <= edgeStyle.width / 2 + toleranceWorld && lineDistance < bestDistance) {
          bestDistance = lineDistance;
          bestKey = edgeKey;
        }
      }
      // 箭头命中：箭头画在目标端、不在线段上，单独按到箭头中心的距离判定（容差叠加箭头外接半径）。
      if (edgeStyle.arrow.show && edgeStyle.arrow.size > 0) {
        const arrowDistance = Math.hypot(point.x - geometry.arrowX, point.y - geometry.arrowY);
        if (arrowDistance <= edgeStyle.arrow.size / 2 + toleranceWorld && arrowDistance < bestDistance) {
          bestDistance = arrowDistance;
          bestKey = edgeKey;
        }
      }
    }
    return bestKey;
  }

  private getArrowTexture(renderer: Renderer, size: number): Texture {
    if (this.arrowTexture) return this.arrowTexture;
    const arrowSize = Math.ceil(size % 2 === 0 ? size : size + 1);
    const graphics = new Graphics().poly([-arrowSize / 2, arrowSize, arrowSize / 2, arrowSize, 0, 0]).fill(0xffffff);
    this.arrowTexture = renderer.generateTexture({ target: graphics });
    graphics.destroy();
    return this.arrowTexture;
  }
}

// 计算一条边线段（及箭头）的绘制几何（what）：线条用一个矩形 Particle 表示，需要其中心点、旋转角、
// 长度；箭头需要其位置与朝向。各种扣减：线段两端要从节点圆"外缘"起止（扣掉两端 size+border，
// 目标端再扣箭头高度），否则线会插进节点圆里或被箭头盖住；applyBilateralOffset（有平行边且未启用
// 曲线扇形）时整体沿法向侧移半个 gap，让来回两条边分开不重叠——曲线模式下分离由弧顶偏移承担，
// 调用方须传 false。三角函数：radian 是端到端方向，rotation 是其法向（线条
// Particle 以竖直为基准，故用法向旋转）。
function computeEdgeGeometry(
  sourceNodePosition: { x: number; y: number },
  targetNodePosition: { x: number; y: number },
  edgeStyle: EdgeStyle,
  sourceNodeStyle: NodeStyle,
  targetNodeStyle: NodeStyle,
  applyBilateralOffset: boolean
): {
  lineX: number;
  lineY: number;
  lineRotation: number;
  lineLength: number;
  arrowX: number;
  arrowY: number;
  arrowRotation: number;
} {
  const radian = Math.atan2(targetNodePosition.y - sourceNodePosition.y, targetNodePosition.x - sourceNodePosition.x);
  const rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
  const stLength = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
  const arrowHeight = edgeStyle.arrow.show ? (Math.sqrt(3) / 2) * edgeStyle.arrow.size : 0;
  const lineLength = Math.max(0, stLength - arrowHeight - targetNodeStyle.size - sourceNodeStyle.size - targetNodeStyle.border.width - sourceNodeStyle.border.width);
  const lineLengthHalf = lineLength / 2 + targetNodeStyle.size + arrowHeight + targetNodeStyle.border.width;

  const centerPosition = {
    x: targetNodePosition.x + Math.sin(rotation) * lineLengthHalf,
    y: targetNodePosition.y - Math.cos(rotation) * lineLengthHalf
  };
  if (applyBilateralOffset) {
    centerPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    centerPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
  }

  const arrowRadius = targetNodeStyle.size + targetNodeStyle.border.width + (Math.sqrt(3) / 4) * edgeStyle.arrow.size;
  const arrowPosition = { x: targetNodePosition.x - Math.cos(radian) * arrowRadius, y: targetNodePosition.y - Math.sin(radian) * arrowRadius };
  if (applyBilateralOffset) {
    arrowPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    arrowPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
  }

  return {
    lineX: centerPosition.x,
    lineY: centerPosition.y,
    lineRotation: rotation,
    lineLength,
    arrowX: arrowPosition.x,
    arrowY: arrowPosition.y,
    arrowRotation: radian + Math.PI / 2
  };
}

// PERF-CRITICAL (tag: perf-v8-pan-gc)：把池前缀 [0,count) 绑回 particleChildren——原地改长度并赋值，
// 避免重建数组或 new 粒子。勿改成 target = pool.slice(...) 或重新 push new Particle。
function syncParticleChildren(target: Particle[], pool: Particle[], count: number): void {
  for (let i = 0; i < count; i += 1) target[i] = pool[i];
  target.length = count;
}

// 点到线段的最短距离（游标拾取边的判定用）：把点投影到线段上、把参数 t 夹到 [0,1] 得到最近点，
// 再取欧氏距离。线段退化为一点时直接退化为点距离。
function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

function padBounds(bounds: { x: number; y: number; width: number; height: number }, padding: number) {
  return {
    left: bounds.x - padding,
    right: bounds.x + bounds.width + padding,
    top: bounds.y - padding,
    bottom: bounds.y + bounds.height + padding
  };
}

function pointInRect(point: { x: number; y: number }, rect: { left: number; right: number; top: number; bottom: number }): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < Number.EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): boolean {
  return b.x <= Math.max(a.x, c.x) && b.x >= Math.min(a.x, c.x) && b.y <= Math.max(a.y, c.y) && b.y >= Math.min(a.y, c.y);
}

function segmentsIntersect(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a1, b1, a2)) return true;
  if (o2 === 0 && pointOnSegment(a1, b2, a2)) return true;
  if (o3 === 0 && pointOnSegment(b1, a1, b2)) return true;
  if (o4 === 0 && pointOnSegment(b1, a2, b2)) return true;
  return false;
}

// 线段是否与矩形相交（边的视口剔除判据）。what：先看任一端点是否在矩形内（快速命中），否则
// 逐条检测线段与矩形四边是否相交。why：不能只看端点——两端都在屏外、但中段横穿视口的长边也得绘制。
function segmentIntersectsRect(a: { x: number; y: number }, b: { x: number; y: number }, rect: { left: number; right: number; top: number; bottom: number }): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;

  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomRight = { x: rect.right, y: rect.bottom };
  const bottomLeft = { x: rect.left, y: rect.bottom };

  return (
    segmentsIntersect(a, b, topLeft, topRight) ||
    segmentsIntersect(a, b, topRight, bottomRight) ||
    segmentsIntersect(a, b, bottomRight, bottomLeft) ||
    segmentsIntersect(a, b, bottomLeft, topLeft)
  );
}

function quantizedBoundsKey(bounds: { x: number; y: number; width: number; height: number }, tileSize: number): string {
  const left = Math.floor(bounds.x / tileSize);
  const top = Math.floor(bounds.y / tileSize);
  const right = Math.ceil((bounds.x + bounds.width) / tileSize);
  const bottom = Math.ceil((bounds.y + bounds.height) / tileSize);
  return `${left}:${top}:${right}:${bottom}`;
}
