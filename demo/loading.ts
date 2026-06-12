// 加载进度遮罩：大数据加载分多个阶段，逐段更新进度条，避免长时间白屏。
const $loading = document.getElementById('loading')!;
const $bar = document.getElementById('loading-bar')!;
const $text = document.getElementById('loading-text')!;
const $pct = document.getElementById('loading-pct')!;

export function setProgress(ratio: number, text?: string) {
  const pct = Math.max(0, Math.min(1, ratio));
  $bar.style.width = `${Math.round(pct * 100)}%`;
  $pct.textContent = `${Math.round(pct * 100)}%`;
  if (text) $text.textContent = text;
}

export function hideLoading() {
  $loading.classList.add('hidden');
}

// 出错时别让进度遮罩一直盖着，把错误显示出来。
export function showError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  $text.textContent = `加载失败：${message}`;
  // 与页面 CSS 变量 --danger 同值，错误色全站统一
  $text.style.color = '#ff6369';
}

// 返回一个把「阶段内 0~1」映射到全局区间 [from, to] 的进度回调，便于各阶段独立汇报进度。
export function stage(from: number, to: number, label: string): (local: number) => void {
  setProgress(from, label);
  return local => setProgress(from + (to - from) * local, label);
}

// 让出一帧给浏览器，使进度条/文案能真正绘制出来（同步循环会一直占着主线程）。
export const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
