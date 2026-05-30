import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { PixiGraph, TextType, type GraphStyleDefinition } from 'pixi-graph';

const NODE_COLOR = '#C6CCF5';
const COLOR_SELECTED = '#ff7f0e';

interface RawData {
  nodes: { id: string; label?: string; icon?: string }[];
  links: { source: string; target: string; label?: string; value?: number }[];
}

type NodeAttrs = { x: number; y: number; id: string; label?: string; icon?: string };
type EdgeAttrs = { source: string; target: string; label?: string; value?: number };

// 不同规模的测试数据集，对应右上角切换按钮。
const DATASETS = [
  { key: 'data-50-100', label: '50点100边' },
  { key: 'data-1000-2000', label: '1000点2000边' },
  { key: 'data-10000-20000', label: '10000点20000边' },
  { key: 'data-50000-100000', label: '50000点100000边' },
  { key: 'data-50000-100000-noicon', label: '50000点100000边(无图)' }
];

// 渲染数据集切换按钮，点击后带 ?data= 参数重载页面（切换数据需重建实例，重载最稳妥）。
function renderDatasetButtons(activeKey: string) {
  const panel = document.getElementById('datasets')!;
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = '测试数据';
  panel.appendChild(title);
  DATASETS.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (key === activeKey) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('data', key);
      location.href = url.toString();
    });
    panel.appendChild(btn);
  });
}

async function main() {
  // 从 URL ?data= 读取数据集，缺省用最小图；非法值回退到第一个。
  const requested = new URLSearchParams(location.search).get('data');
  const activeKey = DATASETS.some(d => d.key === requested) ? requested! : DATASETS[0].key;
  renderDatasetButtons(activeKey);

  const dataPath = `/demo/data/${activeKey}.json`;
  const { nodes, links } = (await (await fetch(dataPath)).json()) as RawData;

  const graph = new Graph<NodeAttrs, EdgeAttrs>({ multi: true, type: 'undirected' });
  // 数据里的图标用相对路径 ./images/...，但页面根是 /，图片实际由 /demo/ 提供，
  // 这里归一化到实际可访问的地址，避免 Assets.load 命中 SPA 回退的 index.html。
  nodes.forEach(node => {
    const icon = node.icon ? node.icon.replace(/^\.\//, '/demo/') : node.icon;
    graph.addNode(node.id, { x: 0, y: 0, ...node, icon });
  });
  links.forEach(link => {
    const key = `${link.source}->${link.target}`;
    if (!graph.hasEdge(key)) graph.addEdgeWithKey(key, link.source, link.target, { ...link });
  });

  // random seed positions, then a force-directed layout
  graph.forEachNode(node => {
    graph.setNodeAttribute(node, 'x', Math.random());
    graph.setNodeAttribute(node, 'y', Math.random());
  });
  // 迭代次数按规模自适应：大图跑 300 次 forceAtlas2 会卡死浏览器。
  const order = graph.order;
  const iterations = order > 50000 ? 15 : order > 10000 ? 40 : order > 1000 ? 120 : 300;
  forceAtlas2.assign(graph, { iterations, settings: { ...forceAtlas2.inferSettings(graph), scalingRatio: 500 } });

  const style: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
    node: {
      size: () => 15,
      color: () => NODE_COLOR,
      border: { width: 2, color: '#4A5FE2' },
      icon: {
        type: node => (node.icon ? TextType.IMAGE : TextType.TEXT),
        content: node => node.icon ?? '',
        fontFamily: 'iconfont',
        fontSize: () => 50,
        color: '#ffffff'
      },
      label: {
        content: node => node.label ?? node.id,
        type: TextType.TEXT,
        align: 'center',
        fontSize: 12,
        color: '#000',
        stroke: '#fff',
        strokeThickness: 2,
        padding: 2
      }
    },
    edge: {
      width: () => 1,
      color: () => '#999',
      arrow: { show: true, size: edge => (Math.log((edge.value ?? 0) + 1) + 2) * 2 },
      label: {
        content: edge => edge.label ?? edge.target ?? '',
        type: TextType.TEXT,
        fontSize: 12,
        fontWeight: '500',
        color: '#000',
        stroke: '#fff',
        strokeThickness: 2,
        padding: 2,
        parallel: true
      }
    }
  };

  const hoverStyle: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
    node: { border: { color: COLOR_SELECTED }, label: { backgroundColor: 'rgba(255, 255, 255, 0.6)' } },
    edge: { color: COLOR_SELECTED, label: { backgroundColor: 'rgba(255, 255, 255, 0.6)' } }
  };

  const container = document.getElementById('graph')!;
  const pixiGraph = await PixiGraph.create({
    container,
    graph,
    style,
    hoverStyle,
    highPerformance: { nodeNumber: 5000, edgeNumber: 5000 }
  });

  pixiGraph.enableSelect(selection => console.log('selection', selection), true);
  pixiGraph.on('nodeClick', (_event, nodeKey) => console.log('nodeClick', nodeKey));
  pixiGraph.on('viewportClick', () => console.log('viewportClick'));

  document.getElementById('zoom-in')!.addEventListener('click', () => pixiGraph.zoomIn());
  document.getElementById('zoom-out')!.addEventListener('click', () => pixiGraph.zoomOut());

  let watermarkName: string | undefined;
  document.getElementById('watermark')!.addEventListener('click', () => {
    if (watermarkName) {
      pixiGraph.clearWatermark();
      watermarkName = undefined;
    } else {
      watermarkName = pixiGraph.createWatermark({
        type: 'TEXT',
        content: 'pixi-graph',
        cover: true,
        row: 5,
        column: 6,
        position: { x: 0, y: 0 },
        rotation: -Math.PI / 8,
        style: { fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal', color: 'rgba(0,0,0,0.12)' }
      });
    }
  });

  document.getElementById('extract')!.addEventListener('click', async () => {
    const dataUrl = await pixiGraph.extract();
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'pixi-graph.png';
    link.click();
  });

  // expose for console tinkering
  (window as unknown as Record<string, unknown>).pixiGraph = pixiGraph;
}

main().catch(console.error);
