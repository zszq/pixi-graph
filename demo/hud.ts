// 实时指标 HUD 与事件检视器：把图的规模、相机缩放、以及节点/边的交互事件实时呈现在浮层上，
// 用来直观演示 PixiGraph 暴露的图变更监听与各类指针事件。
import type { PixiGraph } from 'pixi-graph';
import type { EdgeAttrs, NodeAttrs } from './types';

type AnyGraph = PixiGraph<NodeAttrs, EdgeAttrs>;

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

// ── 指标：节点数 / 边数 / 缩放 ──
function bindStats(pixiGraph: AnyGraph): void {
  const $nodes = el('stat-nodes');
  const $edges = el('stat-edges');
  const $zoom = el('stat-zoom');
  const graph = pixiGraph.graph;

  const refreshCounts = () => {
    $nodes.textContent = String(graph.order);
    $edges.textContent = String(graph.size);
  };
  const refreshZoom = () => {
    $zoom.innerHTML = `${pixiGraph.viewport.scaled.toFixed(2)}<span class="u">×</span>`;
  };

  refreshCounts();
  refreshZoom();
  for (const ev of ['nodeAdded', 'nodeDropped', 'edgeAdded', 'edgeDropped', 'cleared'] as const) {
    graph.on(ev, refreshCounts);
  }
  // zoomed 覆盖滚轮/按钮缩放；moved 兜底吸附/复位等带缩放的相机变化。
  pixiGraph.viewport.on('zoomed', refreshZoom);
  pixiGraph.viewport.on('moved', refreshZoom);
}

// 把一条记录写进事件检视器（节点/边交互、框选结果等都复用它）。导出以便其它模块（如框选）调用。
export function setInspector(type: string, key: string, detail = ''): void {
  el('insp-empty').style.display = 'none';
  el('insp-active').style.display = 'flex';
  el('insp-type').textContent = type;
  el('insp-key').textContent = key;
  el('insp-detail').textContent = detail;
  // 重新触发徽标的弹入动画
  const root = el('inspector');
  root.classList.remove('flash');
  void root.offsetWidth;
  root.classList.add('flash');
}

// ── 检视器：最近一次节点/边交互 ──
function bindInspector(pixiGraph: AnyGraph): void {
  pixiGraph.on('nodeClick', (_e, key, style) => setInspector('节点·点击', key, `size ${style.size} · ${style.color}`));
  pixiGraph.on('nodeDbclick', (_e, key) => setInspector('节点·双击', key));
  pixiGraph.on('nodeRightclick', (_e, key) => setInspector('节点·右键', key));
  pixiGraph.on('nodeMouseover', (_e, key, style) => setInspector('节点·悬停', key, `size ${style.size} · ${style.color}`));
  pixiGraph.on('edgeClick', (_e, key, style) => setInspector('边·点击', key, `width ${style.width} · ${style.color}`));
  pixiGraph.on('edgeDbclick', (_e, key) => setInspector('边·双击', key));
  pixiGraph.on('edgeRightclick', (_e, key) => setInspector('边·右键', key));
  pixiGraph.on('edgeMouseover', (_e, key, style) => setInspector('边·悬停', key, `width ${style.width} · ${style.color}`));

  // 画布空白处的点击 / 右键（未命中任何节点或边时触发）
  pixiGraph.on('viewportClick', e => {
    const p = pixiGraph.viewport.toWorld(e.global.x, e.global.y);
    setInspector('画布·点击', '空白处', `(${Math.round(p.x)}, ${Math.round(p.y)})`);
  });
  pixiGraph.on('viewportRightClick', e => {
    const p = pixiGraph.viewport.toWorld(e.offsetX, e.offsetY);
    setInspector('画布·右键', '空白处', `(${Math.round(p.x)}, ${Math.round(p.y)})`);
  });
}

export function bindHud(pixiGraph: AnyGraph): void {
  bindStats(pixiGraph);
  bindInspector(pixiGraph);
}
