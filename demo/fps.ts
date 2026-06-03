// 帧率计数：每 ~250ms 统计一次，把数值写入指标 HUD（只写数字，"FPS" 标签在 HTML 里）。
export function startFpsMeter(element: HTMLElement): () => void {
  let rafId = 0;
  let frames = 0;
  let lastUpdate = performance.now();

  const tick = (time: number) => {
    frames += 1;
    const elapsed = time - lastUpdate;
    if (elapsed >= 250) {
      const fps = Math.round((frames * 1000) / elapsed);
      element.textContent = String(fps);
      frames = 0;
      lastUpdate = time;
    }
    rafId = requestAnimationFrame(tick);
  };

  element.textContent = '--';
  rafId = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(rafId);
}
