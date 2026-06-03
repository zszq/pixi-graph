import type { PointData } from 'pixi.js';

export type ScreenPoint = PointData;

export interface ElementBounds {
  left: number;
  top: number;
}

/** 手势开始时读取一次宿主元素的边界。 */
export function getElementBounds(element: HTMLElement): ElementBounds {
  const bounds = element.getBoundingClientRect();
  return { left: bounds.left, top: bounds.top };
}

/** 把 DOM 鼠标/指针事件转换为相对于缓存宿主边界的坐标。 */
export function getElementPointFromBounds(event: Pick<MouseEvent, 'clientX' | 'clientY'>, bounds: ElementBounds): ScreenPoint {
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  };
}

/** 把 DOM 鼠标/指针事件转换为相对于某宿主元素的坐标。 */
export function getElementPoint(event: Pick<MouseEvent, 'clientX' | 'clientY'>, element: HTMLElement): ScreenPoint {
  return getElementPointFromBounds(event, getElementBounds(element));
}

export function isSamePoint(a: PointData, b: PointData, tolerance = 1): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= tolerance * tolerance;
}
