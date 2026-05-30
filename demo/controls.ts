// 页面测试控件：缩放、水印、导出、动态增删、框选开关。
import type { PixiGraph } from 'pixi-graph';
import type { EdgeAttrs, NodeAttrs } from './types';

let demoNodeSeq = 0;
let demoEdgeSeq = 0;
let selectActive = false;

function pickNodePair(nodes: string[]): [string, string] | null {
  if (nodes.length < 2) return null;
  const source = nodes[Math.floor(Math.random() * nodes.length)];
  let target = nodes[Math.floor(Math.random() * nodes.length)];
  if (target === source) target = nodes[(nodes.indexOf(source) + 1) % nodes.length];
  return [source, target];
}

function addNode(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>): void {
  const center = pixiGraph.viewport.center;
  const id = `demo-node-${++demoNodeSeq}`;
  pixiGraph.graph.addNode(id, {
    id,
    label: id,
    x: center.x + (Math.random() - 0.5) * 300,
    y: center.y + (Math.random() - 0.5) * 300
  });
}

function removeDemoOrLastNode(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>): void {
  const node = pixiGraph.graph.nodes().reverse().find(key => key.startsWith('demo-node-')) ?? pixiGraph.graph.nodes().at(-1);
  if (node) pixiGraph.graph.dropNode(node);
}

function addEdge(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>): void {
  const pair = pickNodePair(pixiGraph.graph.nodes());
  if (!pair) return;
  const [source, target] = pair;
  const key = `demo-edge-${++demoEdgeSeq}`;
  pixiGraph.graph.addEdgeWithKey(key, source, target, { source, target, label: key, value: 1 });
}

function removeDemoOrLastEdge(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>): void {
  const edge = pixiGraph.graph.edges().reverse().find(key => key.startsWith('demo-edge-')) ?? pixiGraph.graph.edges().at(-1);
  if (edge) pixiGraph.graph.dropEdge(edge);
}

function setSelectButtonState(button: HTMLButtonElement, active: boolean): void {
  button.classList.toggle('active', active);
  button.textContent = active ? 'Box Select: On' : 'Box Select: Off';
}

function enableSelection(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>, button: HTMLButtonElement): void {
  // The demo keeps a single BoxSelectDom instance alive; the button only toggles
  // whether the overlay is open. State changes come from the selection controller
  // so the UI stays in sync when selection completes or is cancelled externally.
  pixiGraph.enableSelect(
    selection => {
      console.log('selection', selection);
    },
    true,
    false,
    active => {
      selectActive = active;
      setSelectButtonState(button, active);
    }
  );
}

export function bindControls(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>) {
  document.getElementById('zoom-in')!.addEventListener('click', () => pixiGraph.zoomIn());
  document.getElementById('zoom-out')!.addEventListener('click', () => pixiGraph.zoomOut());
  document.getElementById('add-node')!.addEventListener('click', () => addNode(pixiGraph));
  document.getElementById('remove-node')!.addEventListener('click', () => removeDemoOrLastNode(pixiGraph));
  document.getElementById('add-edge')!.addEventListener('click', () => addEdge(pixiGraph));
  document.getElementById('remove-edge')!.addEventListener('click', () => removeDemoOrLastEdge(pixiGraph));
  document.getElementById('recenter')!.addEventListener('click', () => pixiGraph.resetView(pixiGraph.graph.nodes()));
  const selectButton = document.getElementById('toggle-select') as HTMLButtonElement;
  pixiGraph.choose?.destroy();
  pixiGraph.choose = undefined;
  enableSelection(pixiGraph, selectButton);
  setSelectButtonState(selectButton, false);
  selectButton.addEventListener('click', () => {
    if (selectActive) {
      pixiGraph.choose?.cancel();
      return;
    }

    pixiGraph.choose?.open();
  });

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
}
