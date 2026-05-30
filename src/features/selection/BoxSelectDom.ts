import type { AbstractGraph } from 'graphology-types';
import type { Viewport } from 'pixi-viewport';
import type { PointData } from 'pixi.js';
import { selectInRectangle, type SelectionResult } from './selectionGeometry';
import { throttle } from '../../utils/throttle';

export interface BoxSelectDomOptions {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  complete: ((selection: SelectionResult) => void) | null;
  lazy?: boolean;
  realTime?: boolean;
}

/**
 * Rubber-band selection implemented with a DOM overlay. Hold Shift to arm the
 * overlay, then drag to select. Works independently of viewport panning.
 */
export class BoxSelectDom {
  private readonly container: HTMLElement;
  private readonly graph: AbstractGraph;
  private readonly viewport: Viewport;
  private readonly complete: ((selection: SelectionResult) => void) | null;
  private readonly lazy?: boolean;
  private readonly realTime?: boolean;

  private startPoint: PointData = { x: 0, y: 0 };
  private endPoint: PointData = { x: 0, y: 0 };
  private readonly overlay: HTMLElement;
  private readonly selectedArea: HTMLElement;
  private isChoosing = false;
  private shiftHeld = false;

  private readonly onMousedown = (event: MouseEvent) => this.handleMousedown(event);
  private readonly onMousemove = (event: MouseEvent) => this.handleMousemove(event);
  private readonly onMouseup = () => this.cancel();
  private readonly onKeydown = (event: KeyboardEvent) => this.handleKeydown(event);
  private readonly onKeyup = (event: KeyboardEvent) => this.handleKeyup(event);
  private readonly onPreventSelect = (event: MouseEvent) => {
    if (event.shiftKey) event.preventDefault();
  };
  private readonly throttledJudge = throttle((endPoint: PointData) => this.judge(endPoint), 30);

  constructor(options: BoxSelectDomOptions) {
    this.container = options.container;
    this.graph = options.graph;
    this.viewport = options.viewport;
    this.complete = options.complete;
    this.lazy = options.lazy;
    this.realTime = options.realTime;

    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.zIndex = `${Number(this.container.style.zIndex) + 1}`;
    this.overlay.style.display = 'none';

    this.selectedArea = document.createElement('div');
    Object.assign(this.selectedArea.style, {
      position: 'absolute',
      backgroundColor: '#F4B400',
      opacity: '0.2',
      width: '0px',
      height: '0px',
      border: '1.5px solid #000',
      display: 'none',
      pointerEvents: 'none'
    });

    this.overlay.appendChild(this.selectedArea);
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('mousedown', this.onMousedown);
    document.addEventListener('keydown', this.onKeydown);
    document.addEventListener('keyup', this.onKeyup);
    document.addEventListener('mousedown', this.onPreventSelect);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (this.shiftHeld) return;
    this.shiftHeld = true;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.open();
    }
  }

  private handleKeyup(event: KeyboardEvent): void {
    this.shiftHeld = false;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.cancel();
    }
  }

  private handleMousedown(event: MouseEvent): void {
    if (!this.isChoosing) return;
    this.startPoint = { x: event.offsetX, y: event.offsetY };
    this.endPoint = { x: event.offsetX, y: event.offsetY };
    this.selectedArea.style.display = 'block';
    this.overlay.addEventListener('mousemove', this.onMousemove);
    document.addEventListener('mouseup', this.onMouseup, { once: true });
  }

  private handleMousemove(event: MouseEvent): void {
    const moveX = event.offsetX;
    const moveY = event.offsetY;
    this.selectedArea.style.width = `${Math.abs(moveX - this.startPoint.x)}px`;
    this.selectedArea.style.height = `${Math.abs(moveY - this.startPoint.y)}px`;
    this.selectedArea.style.left = `${Math.min(this.startPoint.x, moveX)}px`;
    this.selectedArea.style.top = `${Math.min(this.startPoint.y, moveY)}px`;
    this.endPoint = { x: moveX, y: moveY };
    if (this.realTime) this.throttledJudge(this.endPoint);
  }

  open(): void {
    this.isChoosing = true;
    const { width, height, top, left } = this.container.getBoundingClientRect();
    Object.assign(this.overlay.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`,
      display: 'block'
    });
  }

  cancel(): void {
    if (!this.isChoosing) return;
    this.isChoosing = false;
    this.judge(this.endPoint);

    this.startPoint = { x: 0, y: 0 };
    this.endPoint = { x: 0, y: 0 };

    Object.assign(this.selectedArea.style, { width: '0px', height: '0px', left: '0px', top: '0px', display: 'none' });
    this.overlay.style.display = 'none';
    this.overlay.removeEventListener('mousemove', this.onMousemove);
  }

  private judge(endPoint: PointData): void {
    const selection = selectInRectangle(this.graph, this.viewport, this.startPoint, endPoint, this.lazy);
    this.complete?.(selection);
  }

  destroy(): void {
    this.overlay.removeEventListener('mousedown', this.onMousedown);
    this.overlay.removeEventListener('mousemove', this.onMousemove);
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('keyup', this.onKeyup);
    document.removeEventListener('mousedown', this.onPreventSelect);
    this.overlay.remove();
  }
}
