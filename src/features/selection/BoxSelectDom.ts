import type { AbstractGraph } from 'graphology-types';
import type { Viewport } from 'pixi-viewport';
import type { PointData } from 'pixi.js';
import { selectInRectangle } from './selectionGeometry';
import { throttle } from '../../utils/throttle';

export interface BoxSelectDomOptions {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  onChange: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  onComplete: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  onStateChange?: (active: boolean) => void;
  lazy?: boolean;
  realTime?: boolean;
}

/**
 * 用 DOM 覆盖层实现的框选（橡皮筋选择）。按住 Shift 激活覆盖层，再拖拽即可框选。
 * 与视口平移相互独立。
 *
 * 刻意采用 DOM 覆盖层：避免往场景图里新增一个 PIXI 选择层，并让鼠标偏移保持在屏幕空间——
 * 这正好与 `selectInRectangle`（节点位置经 viewport.toScreen() 转换后）匹配。
 */
export class BoxSelectDom {
  private readonly container: HTMLElement;
  private readonly graph: AbstractGraph;
  private readonly viewport: Viewport;
  private readonly onChange: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  private readonly onComplete: ((selection: { nodes: string[]; edges: string[] }) => void) | null;
  private readonly onStateChange?: (active: boolean) => void;
  private readonly lazy?: boolean;
  private readonly realTime?: boolean;

  private startPoint: PointData = { x: 0, y: 0 };
  private endPoint: PointData = { x: 0, y: 0 };
  private readonly overlay: HTMLElement;
  private readonly selectedArea: HTMLElement;
  private isChoosing = false;
  private shiftHeld = false;
  private hasSelectionDrag = false;

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
    this.onChange = options.onChange;
    this.onComplete = options.onComplete;
    this.onStateChange = options.onStateChange;
    this.lazy = options.lazy;
    this.realTime = options.realTime;

    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    const containerZIndex = Number.parseInt(getComputedStyle(this.container).zIndex, 10);
    this.overlay.style.zIndex = `${Number.isFinite(containerZIndex) ? containerZIndex + 1 : 1}`;
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
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      if (this.shiftHeld) return;
      this.shiftHeld = true;
      this.open();
    }
  }

  private handleKeyup(event: KeyboardEvent): void {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.shiftHeld = false;
      this.cancel();
    }
  }

  private handleMousedown(event: MouseEvent): void {
    if (!this.isChoosing) return;
    this.startPoint = { x: event.offsetX, y: event.offsetY };
    this.endPoint = { x: event.offsetX, y: event.offsetY };
    this.hasSelectionDrag = true;
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
    this.onStateChange?.(true);
    // 覆盖层固定贴合宿主容器当前的视口矩形。
    // 每次打开都重读边界，使激活前发生的 resize/scroll 都能反映进来。
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
    // `cancel` 同时也是正常的 mouseup 路径。仅当确实发生过拖拽才发出"选择完成"；
    // 连点两次开关只应关闭框选模式。
    if (this.hasSelectionDrag) this.complete(this.endPoint);
    this.onStateChange?.(false);

    this.startPoint = { x: 0, y: 0 };
    this.endPoint = { x: 0, y: 0 };
    this.hasSelectionDrag = false;

    Object.assign(this.selectedArea.style, { width: '0px', height: '0px', left: '0px', top: '0px', display: 'none' });
    this.overlay.style.display = 'none';
    this.overlay.removeEventListener('mousemove', this.onMousemove);
    document.removeEventListener('mouseup', this.onMouseup);
  }

  private judge(endPoint: PointData): void {
    const selection = selectInRectangle(this.graph, this.viewport, this.startPoint, endPoint, this.lazy);
    this.onChange?.(selection);
  }

  private complete(endPoint: PointData): void {
    const selection = selectInRectangle(this.graph, this.viewport, this.startPoint, endPoint, this.lazy);
    this.onComplete?.(selection);
  }

  destroy(): void {
    this.overlay.removeEventListener('mousedown', this.onMousedown);
    this.overlay.removeEventListener('mousemove', this.onMousemove);
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('keyup', this.onKeyup);
    document.removeEventListener('mousedown', this.onPreventSelect);
    document.removeEventListener('mouseup', this.onMouseup);
    this.overlay.remove();
  }
}
