export type BenchmarkPhase = 'init' | 'select' | 'drag' | 'zoom' | 'cull';

export interface BenchmarkSample {
  phase: BenchmarkPhase;
  durationMs: number;
}

export interface BenchmarkReport {
  dataset: string;
  nodeCount: number;
  edgeCount: number;
  samples: BenchmarkSample[];
  totalMs: number;
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

function now(): number {
  return performance.now();
}

async function nextFrame(): Promise<void> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function measureMemory() {
  const memory = (performance as Performance & { memory?: BenchmarkReport['memory'] }).memory;
  return memory
    ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      }
    : undefined;
}

export async function runBenchmark(options: {
  dataset: string;
  nodeCount: number;
  edgeCount: number;
  init: () => void | Promise<void>;
  select: () => void | Promise<void>;
  drag: () => void | Promise<void>;
  zoom: () => void | Promise<void>;
  cull: () => void | Promise<void>;
}): Promise<BenchmarkReport> {
  const samples: BenchmarkSample[] = [];
  const startedAt = now();

  // Keep benchmark phases cheap and deterministic. Do not call extract() here:
  // it allocates offscreen renderbuffers and can fail on large canvases before measuring useful graph costs.
  const phases: Array<[BenchmarkPhase, () => void | Promise<void>]> = [
    ['init', options.init],
    ['select', options.select],
    ['drag', options.drag],
    ['zoom', options.zoom],
    ['cull', options.cull]
  ];

  for (const [phase, task] of phases) {
    const phaseStartedAt = now();
    await task();
    samples.push({ phase, durationMs: now() - phaseStartedAt });
    await nextFrame();
  }

  const report: BenchmarkReport = {
    dataset: options.dataset,
    nodeCount: options.nodeCount,
    edgeCount: options.edgeCount,
    samples,
    totalMs: now() - startedAt,
    memory: measureMemory()
  };

  console.table(
    samples.map(sample => ({
      phase: sample.phase,
      durationMs: sample.durationMs.toFixed(2)
    }))
  );
  console.log('[pixi-graph benchmark]', report);

  return report;
}
