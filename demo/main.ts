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

async function main() {
  const { nodes, links } = (await (await fetch('/demo/data/data6-5.json')).json()) as RawData;

  const graph = new Graph<NodeAttrs, EdgeAttrs>({ multi: true, type: 'undirected' });
  nodes.forEach(node => graph.addNode(node.id, { x: 0, y: 0, ...node }));
  links.forEach(link => {
    const key = `${link.source}->${link.target}`;
    if (!graph.hasEdge(key)) graph.addEdgeWithKey(key, link.source, link.target, { ...link });
  });

  // random seed positions, then a force-directed layout
  graph.forEachNode(node => {
    graph.setNodeAttribute(node, 'x', Math.random());
    graph.setNodeAttribute(node, 'y', Math.random());
  });
  forceAtlas2.assign(graph, { iterations: 300, settings: { ...forceAtlas2.inferSettings(graph), scalingRatio: 500 } });

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
