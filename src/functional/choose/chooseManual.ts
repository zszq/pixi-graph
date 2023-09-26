import { AbstractGraph } from 'graphology-types';
import { Viewport } from 'pixi-viewport';
import { IPointData } from '@pixi/core';
import judge from './judgeSelected';
import { throttle } from "../../utils/tools";

type CB = ((p: { nodes: string[]; edges: string[] }) => void) | null;
interface Option {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  complete: CB;
  realTime?: boolean;
}

export default class ChooseManual {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  private startX: number;
  private startY: number;
  private overlay: HTMLElement | null;
  private selectedArea: HTMLElement | null;
  private isChoose = false;
  private callback: CB | undefined;
  private realTime?: boolean;
  private mousedownBound = this.mousedown.bind(this);
  private mousemoveBound = this.mousemove.bind(this);
  private mouseupBound = this.mouseup.bind(this);
  private cancelBound = this.cancel.bind(this);
  private throttledJudge: Function;

  constructor(option: Option) {
    this.container = option.container;
    this.graph = option.graph;
    this.viewport = option.viewport;
    this.callback = option.complete;
    this.realTime = option.realTime;

    this.startX = 0;
    this.startY = 0;
    this.overlay = null;
    this.selectedArea = null;

    this.throttledJudge = throttle(this.judgeSelected, 30);

    this.init();
  }

  init() {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = '0px';
    overlay.style.right = '0px';
    overlay.style.top = '0px';
    overlay.style.bottom = '0px';
    overlay.style.backgroundColor = '#000';
    overlay.style.opacity = '0.2';
    overlay.style.zIndex = this.container.style.zIndex + 1;
    overlay.style.display = 'none';

    const selectedArea = document.createElement('div');
    selectedArea.style.position = 'absolute';
    selectedArea.style.backgroundColor = '#fff';
    selectedArea.style.opacity = '1';
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

  mousedown(e: MouseEvent) {
    if (!this.isChoose) return;

    this.startX = e.offsetX;
    this.startY = e.offsetY;

    const selectedArea = this.selectedArea!;
    selectedArea.style.width = 0 + 'px';
    selectedArea.style.height = 0 + 'px';
    selectedArea.style.left = e.offsetX + 'px';
    selectedArea.style.top = e.offsetY + 'px';
    selectedArea.style.display = 'block';

    this.overlay!.addEventListener('mousemove', this.mousemoveBound);
    document.addEventListener('mouseup', this.mouseupBound, {
      once: true
    });
  }

  mousemove(e: MouseEvent) {
    const moveX = e.offsetX;
    const moveY = e.offsetY;
    const selectedArea = this.selectedArea!;
    const width = Math.abs(moveX - this.startX);
    const height = Math.abs(moveY - this.startY);
    const left = Math.min(this.startX, moveX);
    const top = Math.min(this.startY, moveY);

    selectedArea.style.width = width + 'px';
    selectedArea.style.height = height + 'px';
    selectedArea.style.left = left + 'px';
    selectedArea.style.top = top + 'px';

    if (this.realTime) {
      const endPoint = { x: e.offsetX, y: e.offsetY };
      this.throttledJudge(endPoint);
    }
  }

  mouseup(e: MouseEvent) {
    const endPoint = { x: e.offsetX, y: e.offsetY };
    this.judgeSelected(endPoint);

    this.cancel();
  }

  private judgeSelected(endPoint: IPointData) {
    const startPoint = { x: this.startX, y: this.startY };
    const data = judge(this.graph, this.viewport, startPoint, endPoint);

    if (this.callback) {
      this.callback(data);
    }
  }

  cancel() {
    this.overlay!.style.display = 'none';
    this.selectedArea!.style.display = 'none';
    this.isChoose = false;
    this.overlay!.removeEventListener('mousemove', this.mousemoveBound);

    document.removeEventListener('keydown', this.cancelBound);
  }

  show() {
    this.isChoose = true;
    this.overlay!.style.display = 'block';

    document.addEventListener('keydown', this.cancelBound);
  }
}
