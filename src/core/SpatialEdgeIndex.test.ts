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
});
