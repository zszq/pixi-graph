import { Graphics, Point, type Container, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { AbstractGraph } from 'graphology-types';
import { selectInRectangle } from './selectionGeometry';
import { throttle } from '../../utils/throttle';

export interface BoxSelectViewportOptions {
  graph: AbstractGraph;
  stage: Container;
  viewport: Viewport;
  isDragging: () => boolean;
  onChange: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  onComplete: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  lazy?: boolean;
  realTime?: boolean;
}

/**
 * Rubber-band selection drawn directly on the PIXI stage. Intended to pair with
 * space-to-pan so a plain drag starts a selection rectangle on empty canvas.
 */
export class BoxSelectViewport {
  private readonly graph: AbstractGraph;
  private readonly stage: Container;
  private readonly viewport: Viewport;
  private readonly isDragging: () => boolean;
  private readonly onChange: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  private readonly onComplete: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  private readonly lazy?: boolean;
  private readonly realTime?: boolean;

  private readonly graphics = new Graphics();
  private startPoint = new Point(0, 0);
  private endPoint = new Point(0, 0);
  private isSelecting = false;

  private readonly onMousedown = (event: FederatedPointerEvent) => this.handleMousedown(event);
  private readonly onMousemove = (event: FederatedPointerEvent) => this.handleMousemove(event);
  private readonly onMouseup = () => this.handleMouseup();
  private readonly throttledJudge = throttle(() => this.judge(), 30);

  constructor(options: BoxSelectViewportOptions) {
    this.graph = options.graph;
    this.stage = options.stage;
    this.viewport = options.viewport;
    this.isDragging = options.isDragging;
    this.onChange = options.onChange;
    this.onComplete = options.onComplete;
    this.lazy = options.lazy;
    this.realTime = options.realTime;

    this.stage.eventMode = 'static';
    this.stage.addChild(this.graphics);
    this.stage.on('mousedown', this.onMousedown);
  }

  private handleMousedown(event: FederatedPointerEvent): void {
    if (event.target !== this.viewport || this.isDragging()) return;

    this.startPoint = event.getLocalPosition(this.stage);
    this.endPoint = this.startPoint;
    this.isSelecting = true;

    this.stage.on('mousemove', this.onMousemove);
    document.addEventListener('mouseup', this.onMouseup, { once: true });
  }

  private handleMousemove(event: FederatedPointerEvent): void {
    const currentPoint = event.getLocalPosition(this.stage);
    const width = Math.abs(currentPoint.x - this.startPoint.x);
    const height = Math.abs(currentPoint.y - this.startPoint.y);
    const left = Math.min(this.startPoint.x, currentPoint.x);
    const top = Math.min(this.startPoint.y, currentPoint.y);

    this.graphics.clear();
    this.graphics.rect(left, top, width, height).stroke({ width: 2, color: 0x0379f3 });

    this.endPoint = currentPoint;

    if (this.realTime) this.throttledJudge();
  }

  private handleMouseup(): void {
    if (!this.isSelecting) return;
    this.isSelecting = false;
    this.graphics.clear();
    this.stage.off('mousemove', this.onMousemove);
    document.removeEventListener('mouseup', this.onMouseup);
    this.complete();
  }

  private judge(): void {
    if (this.startPoint.x === this.endPoint.x && this.startPoint.y === this.endPoint.y) return;
    const selection = selectInRectangle(this.graph, this.viewport, this.startPoint, this.endPoint, this.lazy);
    this.onChange?.(selection);
  }

  private complete(): void {
    if (this.startPoint.x === this.endPoint.x && this.startPoint.y === this.endPoint.y) return;
    const selection = selectInRectangle(this.graph, this.viewport, this.startPoint, this.endPoint, this.lazy);
    this.onComplete?.(selection);
  }

  destroy(): void {
    this.stage.off('mousedown', this.onMousedown);
    this.stage.off('mousemove', this.onMousemove);
    document.removeEventListener('mouseup', this.onMouseup);
    this.graphics.destroy();
  }
}
