import { describe, it, expect, vi } from 'vitest';
import Graph from 'graphology';
import type { Viewport } from 'pixi-viewport';
import type { PixiNode } from '../elements/PixiNode';

vi.mock('pixi.js', () => ({
  Point: class Point {
    constructor(
      public x = 0,
      public y = 0
    ) {}
  }
}));

const viewport = {
  pause: false,
  toWorld: (point: { x: number; y: number }) => point
} as unknown as Viewport;

function createNode(): PixiNode {
  return {
    nodeGfx: { x: 0, y: 0 },
    updatePosition: vi.fn(),
    updateStyle: vi.fn(),
    updateAlpha: vi.fn(),
    hovered: false
  } as unknown as PixiNode;
}

describe('NodeDragController', () => {
  it('releases drag state and restores node hover eligibility on mouseup', async () => {
    const { NodeDragController } = await import('./NodeDragController');
    const graph = new Graph();
    graph.addNode('A', { x: 10, y: 20 });
    const node = createNode();
    const mutationController = {
      updateNodePositionByKey: vi.fn(),
      updateConnectedEdgesByNodeKey: vi.fn(),
      updateNodeStyleByKey: vi.fn(),
      endNodeDrag: vi.fn()
    };
    const emit = vi.fn();
    const controller = new NodeDragController({
      graph: graph as never,
      viewport,
      container: document.createElement('div'),
      dragOffset: false,
      emit: emit as never,
      mutationController,
      suppressedNodeAttributeUpdates: new Set<string>(),
      hidePerformanceLayers: vi.fn(),
      showPerformanceLayers: vi.fn(),
      isHighMode: () => false
    });

    controller.start(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), 'A', node);
    expect(controller.isDragging()).toBe(true);

    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 5, clientY: 6 }));

    expect(controller.isDragging()).toBe(false);
    expect(mutationController.endNodeDrag).toHaveBeenCalledWith('A');
    expect(mutationController.updateConnectedEdgesByNodeKey).toHaveBeenCalledWith('A');
  });
});
