export function startFpsMeter(element: HTMLElement): () => void {
  let rafId = 0;
  let frames = 0;
  let lastUpdate = performance.now();

  const tick = (time: number) => {
    frames += 1;
    const elapsed = time - lastUpdate;
    if (elapsed >= 250) {
      const fps = Math.round((frames * 1000) / elapsed);
      element.textContent = `FPS ${fps}`;
      frames = 0;
      lastUpdate = time;
    }
    rafId = requestAnimationFrame(tick);
  };

  element.textContent = 'FPS --';
  rafId = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(rafId);
}
