import { AbstractGraph } from 'graphology-types';
import { Viewport } from 'pixi-viewport';
import { Graphics } from '@pixi/graphics';
import { InteractionEvent } from '@pixi/interaction';
import { Point } from '@pixi/math';
import judge from './judgeSelected';

type CB = ((p: { nodes: string[]; edges: string[] }) => void) | null;

let isChoose = false;
let graph: AbstractGraph;
let viewport: Viewport;
let pixiGraph: any;
let graphics = new Graphics();
let startPoint = new Point(0, 0);
let endPointer = new Point(0, 0);
let callback: CB | undefined;

export default function chooseAuto(graphParam: AbstractGraph, viewportParam: Viewport, pixiGraphParam: any, complete?: CB) {
  graph = graphParam;
  viewport = viewportParam;
  pixiGraph = pixiGraphParam;
  callback = complete;

  viewport.addChild(graphics);
  viewport.on('mousedown', mousedown);
}

function mousedown(e: InteractionEvent) {
  if (e.target !== viewport || pixiGraph.isDragging) return;

  isChoose = true;
  startPoint = e.data.getLocalPosition(viewport);
  endPointer = startPoint;

  viewport.on('mousemove', mousemove);
  document.addEventListener('mouseup', mouseup, {
    once: true
  });
}

function mousemove(e: InteractionEvent) {
  const currentPoint = e.data.getLocalPosition(viewport);

  const width = Math.abs(currentPoint.x - startPoint.x);
  const height = Math.abs(currentPoint.y - startPoint.y);
  const left = Math.min(startPoint.x, currentPoint.x);
  const top = Math.min(startPoint.y, currentPoint.y);

  graphics.clear();
  graphics.lineStyle(1, 0x0379f3).drawRect(left, top, width, height);

  endPointer = currentPoint;
}

function mouseup() {
  graphics.clear();
  isChoose = false;
  viewport.off('mousemove', mousemove);

  if (startPoint.x === endPointer.x && startPoint.y === endPointer.y) {
    return;
  }

  const startPointToScreen = viewport.toScreen(startPoint);
  const endPointerToScreen = viewport.toScreen(endPointer);
  const data = judge(graph, viewport, startPointToScreen, endPointerToScreen);

  if (callback) {
    callback(data);
  }
}
