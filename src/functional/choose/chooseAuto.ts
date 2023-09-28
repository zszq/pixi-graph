import { Point } from '@pixi/core';
import { Graphics } from '@pixi/graphics';
import { Container } from '@pixi/display';
import { FederatedPointerEvent } from '@pixi/events';
import { Viewport } from 'pixi-viewport';
import { AbstractGraph } from 'graphology-types';
import judge from './judgeSelected';
import { throttle } from '../../utils/tools';

type CB = ((p: { nodes: string[]; edges: string[] }) => void) | null;
interface Option {
  graph: AbstractGraph;
  stage: Container;
  viewport: Viewport;
  pixiGraph: any;
  complete: CB;
  lazy?: boolean;
  realTime?: boolean;
}

let isChoose = false;
let graph: AbstractGraph;
let viewport: Viewport;
let pixiGraph: any;
let graphics = new Graphics();
let stage: Container;
let startPoint = new Point(0, 0);
let endPointer = new Point(0, 0);
let callback: CB | undefined;
let lazy: boolean | undefined = false;
let realTime: boolean | undefined = false;

export default function chooseAuto(option: Option) {
  graph = option.graph;
  stage = option.stage;
  viewport = option.viewport;
  pixiGraph = option.pixiGraph;
  callback = option.complete;
  lazy = option.lazy;
  realTime = option.realTime;

  stage.eventMode = 'static';
  stage.addChild(graphics);
  stage.on('mousedown', mousedown);
}

function mousedown(e: FederatedPointerEvent) {
  if (e.target !== viewport || pixiGraph.isDragging) return;

  isChoose = true;
  startPoint = e.getLocalPosition(stage);
  endPointer = startPoint;

  stage.on('mousemove', mousemove);
  document.addEventListener('mouseup', mouseup, {
    once: true
  });
}

function mousemove(e: FederatedPointerEvent) {
  const currentPoint = e.getLocalPosition(stage);

  const width = Math.abs(currentPoint.x - startPoint.x);
  const height = Math.abs(currentPoint.y - startPoint.y);
  const left = Math.min(startPoint.x, currentPoint.x);
  const top = Math.min(startPoint.y, currentPoint.y);

  graphics.clear();
  graphics.lineStyle(2, 0x0379f3).drawRect(left, top, width, height);

  endPointer = currentPoint;

  if (realTime) {
    throttledJudge();
  }
}

function mouseup() {
  graphics.clear();
  isChoose = false;
  stage.off('mousemove', mousemove);

  judgeSelected();
}

function judgeSelected() {
  if (startPoint.x === endPointer.x && startPoint.y === endPointer.y) return;

  const data = judge(graph, viewport, startPoint, endPointer, lazy);

  callback && callback(data);
}

const throttledJudge = throttle(judgeSelected, 30);
