import type { PointData } from 'pixi.js';

export type ScreenPoint = PointData;

/** Convert a DOM mouse/pointer event into coordinates relative to a host element. */
export function getElementPoint(event: Pick<MouseEvent, 'clientX' | 'clientY'>, element: HTMLElement): ScreenPoint {
  const bounds = element.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  };
}

export function isSamePoint(a: PointData, b: PointData, tolerance = 1): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= tolerance * tolerance;
}
