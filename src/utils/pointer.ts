import type { PointData } from 'pixi.js';

export type ScreenPoint = PointData;

export interface ElementBounds {
  left: number;
  top: number;
}

/** Read the host element bounds once when a gesture starts. */
export function getElementBounds(element: HTMLElement): ElementBounds {
  const bounds = element.getBoundingClientRect();
  return { left: bounds.left, top: bounds.top };
}

/** Convert a DOM mouse/pointer event into coordinates relative to cached host bounds. */
export function getElementPointFromBounds(event: Pick<MouseEvent, 'clientX' | 'clientY'>, bounds: ElementBounds): ScreenPoint {
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  };
}

/** Convert a DOM mouse/pointer event into coordinates relative to a host element. */
export function getElementPoint(event: Pick<MouseEvent, 'clientX' | 'clientY'>, element: HTMLElement): ScreenPoint {
  return getElementPointFromBounds(event, getElementBounds(element));
}

export function isSamePoint(a: PointData, b: PointData, tolerance = 1): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= tolerance * tolerance;
}
