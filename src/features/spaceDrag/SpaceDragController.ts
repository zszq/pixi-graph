export interface SpaceDragControllerOptions {
  container: HTMLElement;
  onActiveChange: (active: boolean) => void;
}

/**
 * 空格拖拽控制器（what）：实现"按住空格 + 拖拽 = 平移画布"（与框选共用普通拖拽手势时用它切换）。
 * 集中管理所需的全局键盘监听，使 PixiGraph.destroy() 能可靠注销，避免泄漏。
 *
 * arm-on-enter（指针进入容器才挂键盘监听、离开即卸）：只在鼠标悬于图上时才响应空格，
 * 避免在页面别处按空格（如滚动页面）被本组件劫持；也减少常驻全局监听。
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
