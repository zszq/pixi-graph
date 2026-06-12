// 页面测试控件：视图、元素增删、显隐开关、框选、水印、导出。
// 每个按钮对应 PixiGraph 的一个公开能力，便于在 demo 里直观试用。
import type { PixiGraph } from 'pixi-graph';
import type { EdgeAttrs, NodeAttrs } from './types';
import { setInspector } from './hud';

let demoNodeSeq = 0;
let demoEdgeSeq = 0;
let selectActive = false;

function $(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

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
  const node =
    pixiGraph.graph
      .nodes()
      .reverse()
      .find(key => key.startsWith('demo-node-')) ?? pixiGraph.graph.nodes().at(-1);
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
  const edge =
    pixiGraph.graph
      .edges()
      .reverse()
      .find(key => key.startsWith('demo-edge-')) ?? pixiGraph.graph.edges().at(-1);
  if (edge) pixiGraph.graph.dropEdge(edge);
}

// 开关型按钮：维护 on/off 状态，更新右侧药丸文案与高亮，并回调实际效果。
function bindToggle(id: string, initialOn: boolean, onChange: (on: boolean) => void): void {
  const btn = $(id);
  let on = initialOn;
  const render = () => {
    btn.classList.toggle('on', on);
    const state = btn.querySelector('.state');
    if (state) state.textContent = on ? 'ON' : 'OFF';
  };
  btn.addEventListener('click', () => {
    on = !on;
    onChange(on);
    render();
  });
  render();
}

function setSelectButtonState(button: HTMLButtonElement, active: boolean): void {
  button.classList.toggle('on', active);
  const state = button.querySelector('.state');
  if (state) state.textContent = active ? 'ON' : 'OFF';
}

function enableSelection(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>, button: HTMLButtonElement): void {
  // demo 全程只保留一个 BoxSelectDom 实例；按钮只切换覆盖层是否打开。状态变更来自选择
  // 控制器，因此当选择完成或被外部取消时，UI 仍能保持同步。
  pixiGraph.enableSelect(
    selection => {
      // 检视器只显示选中数量，完整 key 列表打到控制台（数量可能很大，不适合塞进浮层）。
      setInspector('框选', `${selection.nodes.length} 节点 · ${selection.edges.length} 边`, '打开控制台查看详情');
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

async function exportImage(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>, format: 'png' | 'jpg' | 'webp'): Promise<void> {
  const dataUrl = await pixiGraph.extract(true, format);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `pixi-graph.${format}`;
  link.click();
}

export function bindControls(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>) {
  // 视图
  $('reset-view').addEventListener('click', () => pixiGraph.resetView(pixiGraph.graph.nodes()));
  $('zoom-in').addEventListener('click', () => pixiGraph.zoomIn());
  $('zoom-out').addEventListener('click', () => pixiGraph.zoomOut());

  // 元素增删
  $('add-node').addEventListener('click', () => addNode(pixiGraph));
  $('remove-node').addEventListener('click', () => removeDemoOrLastNode(pixiGraph));
  $('add-edge').addEventListener('click', () => addEdge(pixiGraph));
  $('remove-edge').addEventListener('click', () => removeDemoOrLastEdge(pixiGraph));

  // 显隐开关。需要"期望状态 + 相机移动后重新强制隐藏"：库内 LOD（applyLabelLayerLod）会在
  // 缩放到一定档位的脏帧里重新打开标签层、覆盖一次性的开关；而"隐藏"与 LOD/高性能隐藏天然兼容、
  // 不冲突。故：关 → 持续重申隐藏；开 → 交回 LOD 决定（避免与高性能拖拽相互打架，重新引入闪烁）。
  const vis = { edges: true, nodeLabels: true, edgeLabels: true };
  const applyVisibility = () => {
    pixiGraph.setEdgesRenderable(vis.edges);
    pixiGraph.setNodeLabelsRenderable(vis.nodeLabels);
    // setEdgesRenderable 会连带控制边标签层，故边标签的最终可见 = 边层开 且 边标签开。
    pixiGraph.setEdgeLabelsRenderable(vis.edges && vis.edgeLabels);
  };
  const reassertHidden = () => {
    if (!vis.edges) pixiGraph.setEdgesRenderable(false);
    if (!vis.nodeLabels) pixiGraph.setNodeLabelsRenderable(false);
    if (!vis.edges || !vis.edgeLabels) pixiGraph.setEdgeLabelsRenderable(false);
  };
  // 监听 frame-end 而非 moved：库的 LOD 在 frame-end 里重开标签层；本监听器注册在其后，
  // 同一事件中后执行，于渲染前把用户想隐藏的层再次关掉，最终生效且不闪。
  pixiGraph.viewport.on('frame-end', reassertHidden);
  bindToggle('toggle-edges', true, on => {
    vis.edges = on;
    applyVisibility();
  });
  bindToggle('toggle-node-labels', true, on => {
    vis.nodeLabels = on;
    applyVisibility();
  });
  bindToggle('toggle-edge-labels', true, on => {
    vis.edgeLabels = on;
    applyVisibility();
  });
  $('show-all').addEventListener('click', () => pixiGraph.uncull());

  // 框选
  const selectButton = $('toggle-select');
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

  // 水印：文字 / 图片 / 清除
  $('wm-text').addEventListener('click', () => {
    pixiGraph.clearWatermark();
    pixiGraph.createWatermark({
      type: 'TEXT',
      content: 'pixi-graph',
      cover: true,
      row: 5,
      column: 6,
      position: { x: 0, y: 0 },
      rotation: -Math.PI / 8,
      style: { fontFamily: 'Sora', fontSize: 24, fontWeight: 'normal', color: 'rgba(232,235,244,0.08)' }
    });
  });
  $('wm-image').addEventListener('click', () => {
    pixiGraph.clearWatermark();
    pixiGraph.createWatermark({
      type: 'IMAGE',
      content: '/demo/images/bunny.png',
      cover: true,
      row: 4,
      column: 5,
      position: { x: 0, y: 0 },
      rotation: -Math.PI / 10,
      style: { fontFamily: 'Sora', fontSize: 24, fontWeight: 'normal', color: 'rgba(232,235,244,0.07)' }
    });
  });
  $('wm-clear').addEventListener('click', () => pixiGraph.clearWatermark());

  // 导出：PNG / JPG / WEBP
  $('export-png').addEventListener('click', () => exportImage(pixiGraph, 'png'));
  $('export-jpg').addEventListener('click', () => exportImage(pixiGraph, 'jpg'));
  $('export-webp').addEventListener('click', () => exportImage(pixiGraph, 'webp'));
}
