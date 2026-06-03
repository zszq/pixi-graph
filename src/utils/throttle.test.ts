import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('invokes immediately on the leading edge', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
  });

  it('coalesces rapid calls into a trailing call with the latest args', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled(1); // 首次立即触发
    throttled(2);
    throttled(3); // 结尾以最新参数为准
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  it('allows another leading call after the window elapses', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled('first');
    vi.advanceTimersByTime(150);
    throttled('second');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
  });
});
