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
 * Small lifecycle helper for event sources that expose EventEmitter-like on/off
 * methods. It keeps bind/unbind symmetric and prevents destroy() from becoming
 * a long list of duplicated off() calls.
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
