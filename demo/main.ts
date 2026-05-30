import { PixiGraph, selectInRectangle } from 'pixi-graph';
import { bindControls } from './controls';
import { runBenchmark } from './benchmark';
import { buildGraph, fetchJsonWithProgress, runLayout } from './data';
import { renderDatasetButtons, resolveActiveKey } from './datasets';
import { hideLoading, nextFrame, setProgress, showError, stage } from './loading';
import { hoverStyle, style } from './style';

const BENCHMARK_DEFAULT_DATASET = 'data-50000-100000';

function isBenchmarkMode(): boolean {
  const params = new URLSearchParams(location.search);
  return params.get('bench') === '1' || params.get('benchmark') === '1';
}

async function main() {
  const bench = isBenchmarkMode();
  const activeKey = resolveActiveKey(bench ? BENCHMARK_DEFAULT_DATASET : undefined);
  renderDatasetButtons(activeKey);

  const timings: Record<string, number> = {};
  const mark = (name: string) => {
    timings[name] = performance.now();
  };
  const measure = (start: string, end: string) => timings[end] - timings[start];

  // 各阶段在进度条上的区间：下载 0~40%、建图 ~50%、布局 55~90%、渲染 92~100%。
  const dataPath = `/demo/data/${activeKey}.json`;
  mark('download:start');
  const raw = await fetchJsonWithProgress(dataPath, stage(0, 0.4, '下载数据…'));
  mark('download:end');

  setProgress(0.42, '构建图…');
  await nextFrame();
  mark('build:start');
  const graph = buildGraph(raw);
  mark('build:end');

  mark('layout:start');
  await runLayout(graph, stage(0.55, 0.9, '布局计算…'));
  mark('layout:end');

  setProgress(0.92, '渲染…');
  await nextFrame();
  const container = document.getElementById('graph')!;
  mark('pixi:start');
  const pixiGraph = await PixiGraph.create({
    container,
    graph,
    style,
    hoverStyle,
    highPerformance: { nodeNumber: 5000, edgeNumber: 5000 }
  });
  mark('pixi:end');
  setProgress(1, '完成');
  hideLoading();

  pixiGraph.enableSelect(selection => console.log('selection', selection), true);
  pixiGraph.on('nodeClick', (_event, nodeKey) => console.log('nodeClick', nodeKey));
  pixiGraph.on('viewportClick', () => console.log('viewportClick'));

  bindControls(pixiGraph);

  // expose for console tinkering
  (window as unknown as Record<string, unknown>).pixiGraph = pixiGraph;

  if (bench) {
    const center = pixiGraph.viewport.center;
    const start = pixiGraph.viewport.toScreen(center.x - 300, center.y - 300);
    const end = pixiGraph.viewport.toScreen(center.x + 300, center.y + 300);
    const report = await runBenchmark({
      dataset: activeKey,
      nodeCount: graph.order,
      edgeCount: graph.size,
      init: () => {
        console.log('[pixi-graph benchmark:init]', {
          downloadMs: measure('download:start', 'download:end'),
          buildMs: measure('build:start', 'build:end'),
          layoutMs: measure('layout:start', 'layout:end'),
          pixiCreateMs: measure('pixi:start', 'pixi:end')
        });
      },
      select: () => {
        selectInRectangle(graph, pixiGraph.viewport, start, end, true);
      },
      drag: () => {
        const nodeKey = graph.nodes()[0];
        if (!nodeKey) return;
        const attributes = graph.getNodeAttributes(nodeKey);
        graph.updateNodeAttributes(nodeKey, current => ({ ...current, x: attributes.x + 10, y: attributes.y + 10 }));
      },
      zoom: () => {
        pixiGraph.zoomIn();
        pixiGraph.zoomOut();
      },
      cull: () => pixiGraph.uncull()
    });
    (window as unknown as Record<string, unknown>).pixiGraphBenchmark = report;
  }
}

main().catch(showError);
