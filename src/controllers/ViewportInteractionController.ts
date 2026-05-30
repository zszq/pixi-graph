import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { VIEWPORT_CLICK_VALID_TIME } from '../core/constants';
import { EventSubscriptions } from '../core/EventSubscriptions';

export interface ViewportInteractionControllerOptions {
  container: HTMLElement;
  viewport: Viewport;
  minScale: number;
  maxScale: number;
  subscriptions: EventSubscriptions;
  emitViewportClick: (event: FederatedPointerEvent) => void;
  emitViewportRightClick: (event: MouseEvent) => void;
  hidePerformanceLayers: () => void;
  showPerformanceLayers: () => void;
}

/**
 * Owns viewport pointer/zoom/pan interaction state. PixiGraph can ask whether
 * the viewport is dragging, while this controller keeps cursor, click timing,
 * and high-performance layer toggles local to viewport behavior.
 */
export class ViewportInteractionController {
  private readonly container: HTMLElement;
  private readonly viewport: Viewport;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly subscriptions: EventSubscriptions;
  private readonly emitViewportClick: (event: FederatedPointerEvent) => void;
  private readonly emitViewportRightClick: (event: MouseEvent) => void;
  private readonly hidePerformanceLayers: () => void;
  private readonly showPerformanceLayers: () => void;

  private viewportClickStartTime = 0;
  private viewportClickTimer: number | undefined;
  private viewportDragged = false;
  private dragging = false;

  private readonly onDragStart = () => this.handleDragStart();
  private readonly onDragEnd = () => this.handleDragEnd();
  private readonly onZoomed = () => this.handleZoomed();
  private readonly onZoomedEnd = () => this.handleZoomedEnd();
  private readonly onClicked = (event: { event: FederatedPointerEvent }) => this.handleClicked(event);
  private readonly onMousedown = (event: FederatedPointerEvent) => this.handleMousedown(event);
  private readonly onMouseup = (event: FederatedPointerEvent) => this.handleMouseup(event);

  constructor(options: ViewportInteractionControllerOptions) {
    this.container = options.container;
    this.viewport = options.viewport;
    this.minScale = options.minScale;
    this.maxScale = options.maxScale;
    this.subscriptions = options.subscriptions;
    this.emitViewportClick = options.emitViewportClick;
    this.emitViewportRightClick = options.emitViewportRightClick;
    this.hidePerformanceLayers = options.hidePerformanceLayers;
    this.showPerformanceLayers = options.showPerformanceLayers;
  }

  bind(): void {
    this.subscriptions.add(this.viewport, 'drag-start', this.onDragStart);
    this.subscriptions.add(this.viewport, 'drag-end', this.onDragEnd);
    this.subscriptions.add(this.viewport, 'zoomed', this.onZoomed);
    this.subscriptions.add(this.viewport, 'zoomed-end', this.onZoomedEnd);
    this.subscriptions.add(this.viewport, 'snap-start', this.hidePerformanceLayers);
    this.subscriptions.add(this.viewport, 'snap-end', this.showPerformanceLayers);
    this.subscriptions.add(this.viewport, 'snap-zoom-start', this.hidePerformanceLayers);
    this.subscriptions.add(this.viewport, 'snap-zoom-end', this.showPerformanceLayers);
    this.subscriptions.add(this.viewport, 'clicked', this.onClicked as never);
    this.subscriptions.add(this.viewport, 'mousedown', this.onMousedown);
    this.subscriptions.add(this.viewport, 'mouseup', this.onMouseup);
  }

  isDragging(): boolean {
    return this.dragging;
  }

  setDragging(dragging: boolean): void {
    this.dragging = dragging;
  }

  destroy(): void {
    clearTimeout(this.viewportClickTimer);
    this.container.style.cursor = 'default';
  }

  private handleDragStart(): void {
    this.dragging = true;
    this.viewportDragged = true;
    clearTimeout(this.viewportClickTimer);
    this.container.style.cursor = 'grab';
    this.hidePerformanceLayers();
  }

  private handleDragEnd(): void {
    this.dragging = false;
    this.container.style.cursor = 'default';
    this.showPerformanceLayers();
  }

  private handleZoomed(): void {
    const scaled = this.viewport.scaled;
    // zoomed fires past the clamp range while zoomed-end does not, so guard the range
    if (scaled > this.minScale && scaled < this.maxScale) {
      this.hidePerformanceLayers();
    }
  }

  private handleZoomedEnd(): void {
    this.showPerformanceLayers();
  }

  private handleClicked(event: { event: FederatedPointerEvent }): void {
    if (event.event.target !== this.viewport) return;
    const originalEvent = event.event.originalEvent as unknown as MouseEvent;
    if (originalEvent.button === 2) {
      this.emitViewportRightClick(originalEvent);
    }
  }

  private handleMousedown(event: FederatedPointerEvent): void {
    if (event.target !== this.viewport) return;
    this.viewportDragged = false;
    this.viewportClickStartTime = Date.now();
    this.viewportClickTimer = window.setTimeout(() => {
      this.container.style.cursor = 'grab';
    }, VIEWPORT_CLICK_VALID_TIME);
  }

  private handleMouseup(event: FederatedPointerEvent): void {
    clearTimeout(this.viewportClickTimer);
    if (event.target !== this.viewport) return;
    const elapsed = Date.now() - this.viewportClickStartTime;
    if (elapsed < VIEWPORT_CLICK_VALID_TIME && !this.viewportDragged) {
      this.emitViewportClick(event);
    }
    this.container.style.cursor = 'default';
  }
}
