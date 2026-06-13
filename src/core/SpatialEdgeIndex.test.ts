import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import { SpatialEdgeIndex } from './SpatialEdgeIndex';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

function makeGraph() {
  return new Graph<BaseNodeAttributes, BaseEdgeAttributes>();
}

describe('SpatialEdgeIndex', () => {
  it('只返回与查询区域相交的候选边，远处的边不返回', () => {
    const graph = makeGraph();
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 100, y: 0 });
    graph.addNode('c', { x: 5000, y: 5000 });
    graph.addNode('d', { x: 5200, y: 5000 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});
    graph.addEdgeWithKey('cd', 'c', 'd', {});

    const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();
    expect(index.query(graph, { left: -10, right: 110, top: -10, bottom: 10 })).toEqual(['ab']);
  });

  it('候选是“可见边”的超集：横穿区域但端点都在区域外的边也会被返回', () => {
    const graph = makeGraph();
    graph.addNode('a', { x: -1000, y: 0 });
    graph.addNode('b', { x: 1000, y: 0 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});

    const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();
    // 查询一个两端点都在外、但被线段横穿的小窗口
    expect(index.query(graph, { left: -10, right: 10, top: -10, bottom: 10 })).toContain('ab');
  });

  it('边增删后（graph.size 变化）自动重建，无需显式标脏', () => {
    const graph = makeGraph();
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 100, y: 0 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});
    const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();
    expect(index.query(graph, { left: -10, right: 110, top: -10, bottom: 10 })).toEqual(['ab']);

    graph.dropEdge('ab');
    expect(index.query(graph, { left: -10, right: 110, top: -10, bottom: 10 })).toEqual([]);
  });

  it('节点移动 + markDirty 后，下次查询按新位置返回', () => {
    const graph = makeGraph();
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 100, y: 0 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});
    const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();
    index.query(graph, { left: -10, right: 110, top: -10, bottom: 10 }); // 触发首次构建

    graph.mergeNodeAttributes('a', { x: 4000, y: 4000 });
    graph.mergeNodeAttributes('b', { x: 4100, y: 4000 });
    index.markDirty();

    expect(index.query(graph, { left: -10, right: 110, top: -10, bottom: 10 })).toEqual([]);
    expect(index.query(graph, { left: 3990, right: 4110, top: 3990, bottom: 4010 })).toEqual(['ab']);
  });

  it('超长边始终可被查询到（不依赖落在哪个格子）', () => {
    const graph = makeGraph();
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 500000, y: 0 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});
    const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();
    expect(index.query(graph, { left: 250000, right: 250100, top: -10, bottom: 10 })).toEqual(['ab']);
  });

  // 回归：端点恰落在格子边界、沿对角穿越格子角点时，旧 DDA 用 tMaxX<tMaxY 裸判方向会因浮点漂移
  // 越过终点格后永不终止，把 cells Map 灌爆抛「Map maximum size exceeded」。守卫式步进后必须正常收敛。
  // 用例覆盖前能跑完即说明已收敛（发散时此 it 会卡到超时/抛错而失败）。
  it('端点落在格子边界的对角边能正常收敛且全程可查（角点穿越回归）', () => {
    const graph = makeGraph();
    // cellSize 在小图下为 512；端点全取 512 的整数倍，强制每一步都恰好踩在格子角点上。
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 512 * 8, y: 512 * 8 });
    graph.addEdgeWithKey('diag', 'a', 'b', {});
    const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();

    // 起点、中点、终点三处都应能查到——证明整条对角路径被完整、有界地登记下来。
    expect(index.query(graph, { left: -10, right: 10, top: -10, bottom: 10 })).toContain('diag');
    expect(index.query(graph, { left: 512 * 4 - 10, right: 512 * 4 + 10, top: 512 * 4 - 10, bottom: 512 * 4 + 10 })).toContain('diag');
    expect(index.query(graph, { left: 512 * 8 - 10, right: 512 * 8 + 10, top: 512 * 8 - 10, bottom: 512 * 8 + 10 })).toContain('diag');
  });

  // 回归：同样踩边界，但用非整除斜率制造浮点漂移——最易触发某轴越过终点格后回不来的发散。
  it('端点落在格子边界、斜率非整除的边也能收敛（浮点漂移回归）', () => {
    const graph = makeGraph();
    graph.addNode('a', { x: 512, y: 512 });
    graph.addNode('b', { x: 512 * 7, y: 512 * 3 }); // Δ=(3072,1024)，斜率非 1，每格 tMax 步进不对齐
    graph.addEdgeWithKey('skew', 'a', 'b', {});
    const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();
    expect(index.query(graph, { left: 512 - 10, right: 512 + 10, top: 512 - 10, bottom: 512 + 10 })).toContain('skew');
    expect(index.query(graph, { left: 512 * 7 - 10, right: 512 * 7 + 10, top: 512 * 3 - 10, bottom: 512 * 3 + 10 })).toContain('skew');
  });
});
