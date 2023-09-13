import { AbstractGraph } from 'graphology-types';
import { Viewport } from 'pixi-viewport';

export default class Choose {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  startX: number;
  startY: number;
  overlay: HTMLElement | null;
  selectedArea: HTMLElement | null;
  callback: ((p: any) => any) | null;

  private isDragging = false;

  private mousedownBound = this.mousedown.bind(this);
  private mousemoveBound = this.mousemove.bind(this);
  private mouseupBound = this.mouseup.bind(this);

  constructor(container: HTMLElement, graph: AbstractGraph, viewport: Viewport) {
    this.container = container;
    this.graph = graph;
    this.viewport = viewport;
    this.startX = 0;
    this.startY = 0;
    this.overlay = null;
    this.selectedArea = null;
    this.callback = null;

    this.init();
  }

  init() {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = '0px';
    overlay.style.right = '0px';
    overlay.style.top = '0px';
    overlay.style.bottom = '0px';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = this.container.style.zIndex + 1;
    overlay.style.display = 'none';

    const selectedArea = document.createElement('div');
    selectedArea.style.position = 'absolute';
    selectedArea.style.backgroundColor = '#5a72f8';
    selectedArea.style.opacity = '0.6';
    selectedArea.style.border = '1px dashed blue';
    selectedArea.style.width = '10px';
    selectedArea.style.height = '10px';
    selectedArea.style.display = 'none';
    selectedArea.style.pointerEvents = 'none';

    this.container.style.position = 'relative';
    overlay.appendChild(selectedArea);
    this.container.appendChild(overlay);

    this.overlay = overlay;
    this.selectedArea = selectedArea;

    this.overlay!.addEventListener('mousedown', this.mousedownBound);
  }

  start(cb: (p: any) => any) {
    this.overlay!.style.display = 'block';
    if (cb) this.callback = cb;
  }

  mousedown(event: MouseEvent) {
    this.startX = event.offsetX;
    this.startY = event.offsetY;

    const selectedArea = this.selectedArea!;
    selectedArea.style.width = 0 + 'px';
    selectedArea.style.height = 0 + 'px';
    selectedArea.style.left = event.offsetX + 'px';
    selectedArea.style.top = event.offsetY + 'px';
    selectedArea.style.display = 'block';

    this.overlay!.addEventListener('mousemove', this.mousemoveBound);
    document.addEventListener('mouseup', this.mouseupBound, {
      once: true
    });

    this.isDragging = true;
  }

  mousemove(event: MouseEvent) {
    if (this.isDragging) {
      const moveX = event.offsetX;
      const moveY = event.offsetY;
      const selectedArea = this.selectedArea!;
      const width = Math.abs(moveX - this.startX);
      const height = Math.abs(moveY - this.startY);
      const left = Math.min(this.startX, moveX);
      const top = Math.min(this.startY, moveY);

      selectedArea.style.width = width + 'px';
      selectedArea.style.height = height + 'px';
      selectedArea.style.left = left + 'px';
      selectedArea.style.top = top + 'px';
    }
  }

  mouseup(event: MouseEvent) {
    const nodes = new Set();
    const edges = new Set();

    const endX = event.offsetX;
    const endY = event.offsetY;

    const minX = Math.min(this.startX, endX);
    const maxX = Math.max(this.startX, endX);
    const minY = Math.min(this.startY, endY);
    const maxY = Math.max(this.startY, endY);

    this.graph.forEachNode((nodeKey, attributes) => {
      const position = this.viewport.toScreen(attributes.x, attributes.y);
      const { x, y } = position;

      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        nodes.add(nodeKey);
      }
    });

    this.graph.forEachEdge((edgeKey, attributes, source, target, sourceAttributes, targetAttributes) => {
      const sourcePosition = this.viewport.toScreen(sourceAttributes.x, sourceAttributes.y);
      const targetPosition = this.viewport.toScreen(targetAttributes.x, targetAttributes.y);
      const { x: x1, y: y1 } = sourcePosition;
      const { x: x2, y: y2 } = targetPosition;

      const k = (y2 - y1) / (x2 - x1);
      const b = y1 - k * x1;

      if (
        ((minY - b) / k >= minX && (minY - b) / k <= maxX && (minY - b) / k >= Math.min(x1, x2) && (minY - b) / k <= Math.max(x1, x2)) ||
        (x2 - x1 === 0 && x2 >= minX && x2 <= maxX && !((y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY))) ||
        ((maxY - b) / k >= minX && (maxY - b) / k <= maxX && (maxY - b) / k >= Math.min(x1, x2) && (maxY - b) / k <= Math.max(x1, x2)) ||
        (k * minX + b >= minY &&
          k * minX + b <= maxY &&
          k * minX + b >= Math.min(y1, y2) &&
          k * minX + b <= Math.max(y1, y2) &&
          Math.min(x1, x2) <= minX &&
          Math.max(x1, x2) >= minX) ||
        (k * maxX + b >= minY &&
          k * maxX + b <= maxY &&
          k * maxX + b >= Math.min(y1, y2) &&
          k * maxX + b <= Math.max(y1, y2) &&
          Math.min(x1, x2) <= maxX &&
          Math.max(x1, x2) >= maxX) ||
        (x1 >= minX && x1 <= maxX && x2 >= minX && x2 <= maxX && y1 >= minY && y1 <= maxY && y2 >= minY && y2 <= maxY)
      ) {
        edges.add(edgeKey);
      }
    });

    if (this.callback) {
      this.callback({
        nodes: Array.from(nodes),
        edges: Array.from(edges)
      });
    }

    this.overlay!.style.display = 'none';
    this.selectedArea!.style.display = 'none';
    this.isDragging = false;

    this.overlay!.removeEventListener('mousemove', this.mousemoveBound);
  }
}
