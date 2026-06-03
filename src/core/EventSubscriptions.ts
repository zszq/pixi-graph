type EventHandler = (...args: any[]) => void;

interface EventSource {
  on(eventName: string, handler: EventHandler): unknown;
  off(eventName: string, handler: EventHandler): unknown;
}

interface Subscription {
  source: EventSource;
  eventName: string;
  handler: EventHandler;
}

/**
 * 事件订阅生命周期小助手：面向暴露 EventEmitter 式 on/off 的事件源。
 * 它让绑定/解绑保持对称，避免 destroy() 退化成一长串重复的 off() 调用。
 */
export class EventSubscriptions {
  private readonly subscriptions: Subscription[] = [];

  add(source: EventSource, eventName: string, handler: EventHandler): void {
    source.on(eventName, handler);
    this.subscriptions.push({ source, eventName, handler });
  }

  clear(): void {
    for (const { source, eventName, handler } of this.subscriptions.splice(0)) {
      source.off(eventName, handler);
    }
  }
}
