import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import { SpatialEdgeIndex } from './SpatialEdgeIndex';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';

function makeIndex(graph: Graph<BaseNodeAttributes, BaseEdgeAttributes>) {
  const index = new SpatialEdgeIndex<BaseNodeAttributes, BaseEdgeAttributes>();
  index.rebuild(graph);
  return index;
}

describe('SpatialEdgeIndex', () => {
  it('returns only candidate edges crossing queried cells', () => {
    const graph = new Graph<BaseNodeAttributes, BaseEdgeAttributes>();
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 100, y: 0 });
    graph.addNode('c', { x: 5000, y: 5000 });
    graph.addNode('d', { x: 5200, y: 5000 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});
    graph.addEdgeWithKey('cd', 'c', 'd', {});

    const index = makeIndex(graph);
    expect(index.query({ left: -10, right: 110, top: -10, bottom: 10 })).toEqual(['ab']);
  });

  it('updates one moved edge without rebuilding the whole index', () => {
    const graph = new Graph<BaseNodeAttributes, BaseEdgeAttributes>();
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 100, y: 0 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});

    const index = makeIndex(graph);
    graph.mergeNodeAttributes('a', { x: 4000, y: 4000 });
    graph.mergeNodeAttributes('b', { x: 4100, y: 4000 });
    index.update(graph, 'ab');

    expect(index.query({ left: -10, right: 110, top: -10, bottom: 10 })).toEqual([]);
    expect(index.query({ left: 3990, right: 4110, top: 3990, bottom: 4010 })).toEqual(['ab']);
  });

  it('keeps very long edges globally queryable', () => {
    const graph = new Graph<BaseNodeAttributes, BaseEdgeAttributes>();
    graph.addNode('a', { x: 0, y: 0 });
    graph.addNode('b', { x: 500000, y: 0 });
    graph.addEdgeWithKey('ab', 'a', 'b', {});

    const index = makeIndex(graph);
    expect(index.query({ left: 250000, right: 250100, top: -10, bottom: 10 })).toEqual(['ab']);
  });
});
