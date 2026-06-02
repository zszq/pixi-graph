import { Container, type FederatedPointerEvent } from 'pixi.js';

export interface DisplayObjectPointerEvents {
  mousemove: (event: FederatedPointerEvent) => void;
  mouseover: (event: FederatedPointerEvent) => void;
  mouseout: (event: FederatedPointerEvent) => void;
  mousedown: (event: FederatedPointerEvent) => void;
  mouseup: (event: FederatedPointerEvent) => void;
  rightclick: (event: FederatedPointerEvent) => void;
  click: (event: FederatedPointerEvent) => void;
  dbclick: (event: FederatedPointerEvent) => void;
}

type EmitPointerEvent = <EventName extends keyof DisplayObjectPointerEvents>(eventName: EventName, event: Parameters<DisplayObjectPointerEvents[EventName]>[0]) => boolean;

/**
 * Bridge PIXI's federated events to the small typed event surface used by graph
 * elements. Keeping this in one place avoids duplicated node/edge listeners.
 */
export function bindPointerEvents(gfx: Container, emit: EmitPointerEvent): void {
  gfx.on('mousemove', event => emit('mousemove', event.originalEvent as FederatedPointerEvent));
  gfx.on('mouseover', event => emit('mouseover', event.originalEvent as FederatedPointerEvent));
  gfx.on('mouseout', event => emit('mouseout', event.originalEvent as FederatedPointerEvent));
  gfx.on('mousedown', event => emit('mousedown', event.originalEvent as FederatedPointerEvent));
  gfx.on('mouseup', event => emit('mouseup', event.originalEvent as FederatedPointerEvent));
  gfx.on('rightclick', event => emit('rightclick', event.originalEvent as FederatedPointerEvent));
  // 用 PIXI 的 click.detail（连击计数）区分单击/双击：detail===2 视为双击、===1 为单击。
  // why：避免自己维护双击计时器，直接复用事件系统的连击语义。
  gfx.on('click', event => {
    if (event.detail === 2) {
      emit('dbclick', event.originalEvent as FederatedPointerEvent);
    } else if (event.detail === 1) {
      emit('click', event.originalEvent as FederatedPointerEvent);
    }
  });
}
