import { Viewport } from "pixi-viewport";
import { Point } from "@pixi/math";
import { InteractionEvent } from "@pixi/interaction";

export interface ViewportEvent {
  event: InteractionEvent;
  screen: Point;
  viewport: Viewport;
  world: Point;
}
