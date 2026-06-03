/**
 * 首尾触发的节流：立即调用一次 `fn`，之后每 `delay` 毫秒最多调用一次，
 * 并始终用最新参数补一次结尾调用。
 */
export function throttle<Args extends unknown[]>(fn: (...args: Args) => void, delay: number): (...args: Args) => void {
  let lastCalledTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return function (this: unknown, ...args: Args) {
    const now = Date.now();
    const remaining = delay - (now - lastCalledTime);

    if (!lastCalledTime || remaining <= 0) {
      fn.apply(this, args);
      lastCalledTime = now;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
        lastCalledTime = Date.now();
      }, remaining);
    }
  };
}
