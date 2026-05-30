export interface SpaceDragControllerOptions {
  container: HTMLElement;
  onActiveChange: (active: boolean) => void;
}

/**
 * Owns all global keyboard listeners needed for "hold Space to pan", so
 * PixiGraph.destroy() can reliably unbind them.
 */
export class SpaceDragController {
  private readonly container: HTMLElement;
  private readonly onActiveChange: (active: boolean) => void;
  private armed = false;
  private active = false;

  private readonly onMouseenter = () => this.arm();
  private readonly onMouseleave = () => this.disarm();
  private readonly onKeydown = (event: KeyboardEvent) => this.handleKeydown(event);
  private readonly onKeyup = (event: KeyboardEvent) => this.handleKeyup(event);

  constructor(options: SpaceDragControllerOptions) {
    this.container = options.container;
    this.onActiveChange = options.onActiveChange;
    this.container.addEventListener('mouseenter', this.onMouseenter);
    this.container.addEventListener('mouseleave', this.onMouseleave);
  }

  private arm(): void {
    if (this.armed) return;
    this.armed = true;
    document.addEventListener('keydown', this.onKeydown);
    document.addEventListener('keyup', this.onKeyup);
  }

  private disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('keyup', this.onKeyup);
    this.setActive(false);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;
    event.preventDefault();
    this.setActive(true);
  }

  private handleKeyup(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;
    this.setActive(false);
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.onActiveChange(active);
  }

  destroy(): void {
    this.disarm();
    this.container.removeEventListener('mouseenter', this.onMouseenter);
    this.container.removeEventListener('mouseleave', this.onMouseleave);
  }
}
