import { PixiGraph } from 'pixi-graph';
import { bindControls } from './controls';
import { buildGraph, fetchJsonWithProgress, runLayout } from './data';
import { renderDatasetButtons, resolveActiveKey } from './datasets';
import { hideLoading, nextFrame, setProgress, showError, stage } from './loading';
import { hoverStyle, style } from './style';

async function main() {
  const activeKey = resolveActiveKey();
  renderDatasetButtons(activeKey);

  // 各阶段在进度条上的区间：下载 0~40%、建图 ~50%、布局 55~90%、渲染 92~100%。
  const dataPath = `/demo/data/${activeKey}.json`;
  const raw = await fetchJsonWithProgress(dataPath, stage(0, 0.4, '下载数据…'));

  setProgress(0.42, '构建图…');
  await nextFrame();
  const graph = buildGraph(raw);

  await runLayout(graph, stage(0.55, 0.9, '布局计算…'));

  setProgress(0.92, '渲染…');
  await nextFrame();
  const container = document.getElementById('graph')!;
  const pixiGraph = await PixiGraph.create({
    container,
    graph,
    style,
    hoverStyle,
    highPerformance: { nodeNumber: 5000, edgeNumber: 5000 }
  });
  setProgress(1, '完成');
  hideLoading();

  pixiGraph.enableSelect(selection => console.log('selection', selection), true);
  pixiGraph.on('nodeClick', (_event, nodeKey) => console.log('nodeClick', nodeKey));
  pixiGraph.on('viewportClick', () => console.log('viewportClick'));

  bindControls(pixiGraph);

  // expose for console tinkering
  (window as unknown as Record<string, unknown>).pixiGraph = pixiGraph;
}

main().catch(showError);
