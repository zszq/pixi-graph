import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import type { Viewport } from 'pixi-viewport';
import { selectInRectangle } from './selectionGeometry';

// Identity screen projection: world coordinates map straight to screen space.
const fakeViewport = {
  toScreen: (x: number, y: number) => ({ x, y })
} as unknown as Viewport;

function buildGraph() {
  const graph = new Graph();
  graph.addNode('A', { x: 0, y: 0 });
  graph.addNode('B', { x: 10, y: 10 });
  graph.addNode('C', { x: 100, y: 100 });
  graph.addEdgeWithKey('A-B', 'A', 'B');
  graph.addEdgeWithKey('B-C', 'B', 'C');
  return graph;
}

describe('selectInRectangle', () => {
  it('selects nodes whose screen position falls inside the rectangle', () => {
    const result = selectInRectangle(buildGraph(), fakeViewport, { x: -1, y: -1 }, { x: 20, y: 20 }, true);
    expect(result.nodes.sort()).toEqual(['A', 'B']);
  });

  it('normalizes inverted rectangles (end before start)', () => {
    const result = selectInRectangle(buildGraph(), fakeViewport, { x: 20, y: 20 }, { x: -1, y: -1 }, true);
    expect(result.nodes.sort()).toEqual(['A', 'B']);
  });

  it('in lazy mode selects every edge incident to a selected node', () => {
    const result = selectInRectangle(buildGraph(), fakeViewport, { x: -1, y: -1 }, { x: 20, y: 20 }, true);
    expect(result.edges.sort()).toEqual(['A-B', 'B-C']);
  });

  it('in non-lazy mode includes an edge fully inside the rectangle', () => {
    const result = selectInRectangle(buildGraph(), fakeViewport, { x: -1, y: -1 }, { x: 20, y: 20 }, false);
    expect(result.edges).toContain('A-B');
  });

  it('in non-lazy mode includes horizontal and vertical edges crossing the rectangle', () => {
    const graph = new Graph();
    graph.addNode('L', { x: -10, y: 5 });
    graph.addNode('R', { x: 10, y: 5 });
    graph.addNode('T', { x: 5, y: -10 });
    graph.addNode('B', { x: 5, y: 10 });
    graph.addEdgeWithKey('horizontal', 'L', 'R');
    graph.addEdgeWithKey('vertical', 'T', 'B');

    const result = selectInRectangle(graph, fakeViewport, { x: 0, y: 0 }, { x: 6, y: 6 }, false);

    expect(result.edges.sort()).toEqual(['horizontal', 'vertical']);
  });

  it('selects nothing for a rectangle away from the graph', () => {
    const result = selectInRectangle(buildGraph(), fakeViewport, { x: 200, y: 200 }, { x: 300, y: 300 }, true);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
