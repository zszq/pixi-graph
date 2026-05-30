// 数据加载与图构建：下载 JSON → 建 graphology 图 → 跑力导向布局。
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { nextFrame } from './loading';
import type { EdgeAttrs, NodeAttrs, RawData } from './types';

// 流式读取 JSON，借 Content-Length 给出真实的下载百分比；拿不到长度时退化为普通 fetch。
export async function fetchJsonWithProgress(url: string, onProgress: (ratio: number) => void): Promise<RawData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载数据失败：${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body?.getReader();
  if (!reader || !total) {
    onProgress(1);
    return (await res.json()) as RawData;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  const buf = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(buf)) as RawData;
}

// 把原始数据建成 graphology 图，并给节点随机初始坐标供布局迭代。
export function buildGraph({ nodes, links }: RawData): Graph<NodeAttrs, EdgeAttrs> {
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
  return graph;
}

// 跑 forceAtlas2 力导向布局。把迭代分成若干批，每批后让出一帧，既能推进进度条又不冻结页面。
export async function runLayout(graph: Graph<NodeAttrs, EdgeAttrs>, onProgress: (ratio: number) => void) {
  // 迭代次数按规模自适应：大图跑 300 次 forceAtlas2 会卡死浏览器。
  const order = graph.order;
  const iterations = order > 50000 ? 15 : order > 10000 ? 40 : order > 1000 ? 120 : 300;
  const settings = { ...forceAtlas2.inferSettings(graph), scalingRatio: 500 };
  const chunk = Math.max(1, Math.ceil(iterations / 20));
  for (let done = 0; done < iterations; done += chunk) {
    const n = Math.min(chunk, iterations - done);
    forceAtlas2.assign(graph, { iterations: n, settings });
    onProgress((done + n) / iterations);
    await nextFrame();
  }
}
