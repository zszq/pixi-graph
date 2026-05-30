/**
 * Leading-and-trailing throttle: invokes `fn` immediately, then at most once
 * per `delay` ms, always firing a final trailing call with the latest args.
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
