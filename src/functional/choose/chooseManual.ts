import { AbstractGraph } from 'graphology-types';
import { Viewport } from 'pixi-viewport';
import judge from './judgeSelected';

type CB = ((p: { nodes: string[]; edges: string[] }) => void) | null;

export default class ChooseManual {
  container: HTMLElement;
  graph: AbstractGraph;
  viewport: Viewport;
  startX: number;
  startY: number;
  overlay: HTMLElement | null;
  selectedArea: HTMLElement | null;

  private isChoose = false;
  private callback: CB | undefined;

  private mousedownBound = this.mousedown.bind(this);
  private mousemoveBound = this.mousemove.bind(this);
  private mouseupBound = this.mouseup.bind(this);
  private cancelBound = this.cancel.bind(this);

  constructor(container: HTMLElement, graph: AbstractGraph, viewport: Viewport, complete?: CB) {
    this.container = container;
    this.graph = graph;
    this.viewport = viewport;
    this.startX = 0;
    this.startY = 0;
    this.overlay = null;
    this.selectedArea = null;
    this.callback = complete;

    this.init();
  }

  init() {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = '0px';
    overlay.style.right = '0px';
    overlay.style.top = '0px';
    overlay.style.bottom = '0px';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    overlay.style.zIndex = this.container.style.zIndex + 1;
    overlay.style.display = 'none';

    const selectedArea = document.createElement('div');
    selectedArea.style.position = 'absolute';
    selectedArea.style.backgroundColor = '#5a72f8';
    selectedArea.style.opacity = '0.4';
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
  }

  mouseup(e: MouseEvent) {
    const startPoint = { x: this.startX, y: this.startY };
    const endPoint = { x: e.offsetX, y: e.offsetY };
    const data = judge(this.graph, this.viewport, startPoint, endPoint);

    if (this.callback) {
      this.callback(data);
    }

    this.cancel();
  }

  cancel() {
    this.overlay!.style.display = 'none';
    this.selectedArea!.style.display = 'none';
    this.isChoose = false;
    this.overlay!.removeEventListener('mousemove', this.mousemoveBound);

    document.removeEventListener('keydown', this.cancelBound);
  }

  start(complete?: CB) {
    this.isChoose = true;
    this.overlay!.style.display = 'block';

    if (complete) {
      this.callback = complete;
    }

    document.addEventListener('keydown', this.cancelBound);
  }
}
