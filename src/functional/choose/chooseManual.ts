import { AbstractGraph } from 'graphology-types';
import { Viewport } from 'pixi-viewport';
import { IPointData, Point } from '@pixi/core';
import judge from './judgeSelected';
import { throttle } from '../../utils/tools';

type CB = ((p: { nodes: string[]; edges: string[] }) => void) | null;
interface Option {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  pixiGraph: any;
  complete: CB;
  lazy?: boolean;
  realTime?: boolean;
}

export default class ChooseManual {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  pixiGraph: any;
  private startPoint: IPointData = { x: 0, y: 0 };
  private endPoint: IPointData = { x: 0, y: 0 };
  private overlay: HTMLElement | null;
  private selectedArea: HTMLElement | null;
  private isChoose = false;
  private callback: CB | undefined;
  private lazy?: boolean;
  private realTime?: boolean;
  private mousedownBound = this.mousedown.bind(this);
  private mousemoveBound = this.mousemove.bind(this);
  private mouseupBound = this.mouseup.bind(this);
  private throttledJudge: Function;

  constructor(option: Option) {
    this.container = option.container;
    this.graph = option.graph;
    this.viewport = option.viewport;
    this.pixiGraph = option.pixiGraph;
    this.callback = option.complete;
    this.lazy = option.lazy;
    this.realTime = option.realTime;

    this.overlay = null;
    this.selectedArea = null;

    this.throttledJudge = throttle(this.judgeSelected, 30);

    this.init();
  }

  init() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.zIndex = this.container.style.zIndex + 1;
    // overlay.style.backgroundColor = 'red';
    // overlay.style.opacity = '0.2';
    overlay.style.display = 'none';

    const selectedArea = document.createElement('div');
    selectedArea.style.position = 'absolute';
    selectedArea.style.backgroundColor = '#F4B400';
    selectedArea.style.opacity = '0.2';
    selectedArea.style.width = '10px';
    selectedArea.style.height = '10px';
    selectedArea.style.border = '1.5px solid #000';
    selectedArea.style.display = 'none';
    selectedArea.style.pointerEvents = 'none';

    overlay.appendChild(selectedArea);
    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.selectedArea = selectedArea;

    this.overlay!.addEventListener('mousedown', this.mousedownBound);

    let keyDownFlag = false;
    document.addEventListener('keydown', e => {
      if (!keyDownFlag) {
        keyDownFlag = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          this.open();
        }
      }
    });
    document.addEventListener('keyup', e => {
      keyDownFlag = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.cancel();
      }
    });
    // 处理按下shift和点击鼠标选中文字问题
    document.addEventListener('mousedown', e => {
      if (e.shiftKey) {
        e.preventDefault();
      }
    });
  }

  mousedown(e: MouseEvent) {
    if (!this.isChoose) return;

    this.startPoint = { x: e.offsetX, y: e.offsetY };
    this.endPoint = { x: e.offsetX, y: e.offsetY };

    this.selectedArea!.style.display = 'block';

    this.overlay!.addEventListener('mousemove', this.mousemoveBound);
    document.addEventListener('mouseup', this.mouseupBound, { once: true });
  }

  mousemove(e: MouseEvent) {
    const moveX = e.offsetX;
    const moveY = e.offsetY;
    const width = Math.abs(moveX - this.startPoint.x);
    const height = Math.abs(moveY - this.startPoint.y);
    const left = Math.min(this.startPoint.x, moveX);
    const top = Math.min(this.startPoint.y, moveY);
    const selectedArea = this.selectedArea!;

    selectedArea.style.width = width + 'px';
    selectedArea.style.height = height + 'px';
    selectedArea.style.left = left + 'px';
    selectedArea.style.top = top + 'px';

    this.endPoint = { x: e.offsetX, y: e.offsetY };

    if (this.realTime) {
      this.throttledJudge(this.endPoint);
    }
  }

  mouseup(e: MouseEvent) {
    this.cancel();
  }

  cancel() {
    if (this.isChoose) {
      this.isChoose = false;

      this.judgeSelected(this.endPoint);

      this.startPoint = { x: 0, y: 0 };
      this.endPoint = { x: 0, y: 0 };

      // this.pixiGraph.highEdgeRenderableAllShow();

      const selectedArea = this.selectedArea!;
      selectedArea.style.width = 0 + 'px';
      selectedArea.style.height = 0 + 'px';
      selectedArea.style.left = 0 + 'px';
      selectedArea.style.top = 0 + 'px';
      selectedArea.style.display = 'none';

      this.overlay!.style.display = 'none';
      this.overlay!.removeEventListener('mousemove', this.mousemoveBound);
    }
  }

  open() {
    this.isChoose = true;

    // this.pixiGraph.highEdgeRenderableAllHide();

    const overlay = this.overlay!;
    const { width, height, top, left } = this.container.getBoundingClientRect();
    overlay.style.width = width + 'px';
    overlay.style.height = height + 'px';
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    overlay.style.display = 'block';
  }

  private judgeSelected(endPoint: IPointData) {
    const data = judge(this.graph, this.viewport, this.startPoint, endPoint, this.lazy);

    if (this.callback) this.callback(data);
  }
}
