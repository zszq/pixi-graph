// 生成曲线压测数据集（demo/data/data-curve-*.json）。
// 目标：点/边总数与同规模的原始数据集完全一致（便于直接对比性能），边全部组织成
// 平行边组——覆盖单条、同向多条（2/3/4/5）、双向及混合（1+1、2+1、2+2、3+2、3+3、4+4、5+5）
// 等形态。每组消耗一对新节点，组平均边数 (53/12≈4.4) 略高于数据集的边点比(2)，
// 多出的节点自然成为孤立点（允许存在，正是为了保住"点数相同"这一约束）。
// 用法：node scripts/generate-curve-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'data');

// 组形态：forward/reverse 为两个方向的边数。desc 写进 a 端节点标签，放大画面即可核对形态。
const GROUP_TYPES = {
  single: { forward: 1, reverse: 0, desc: '1条·单边' },
  same2: { forward: 2, reverse: 0, desc: '2条·同向' },
  both2: { forward: 1, reverse: 1, desc: '2条·双向' },
  same3: { forward: 3, reverse: 0, desc: '3条·同向' },
  mix3: { forward: 2, reverse: 1, desc: '3条·2正1反' },
  same4: { forward: 4, reverse: 0, desc: '4条·同向' },
  mix4: { forward: 2, reverse: 2, desc: '4条·2正2反' },
  same5: { forward: 5, reverse: 0, desc: '5条·同向' },
  mix5: { forward: 3, reverse: 2, desc: '5条·3正2反' },
  mix6: { forward: 3, reverse: 3, desc: '6条·3正3反' },
  mix7: { forward: 4, reverse: 3, desc: '7条·4正3反' },
  mix8: { forward: 4, reverse: 4, desc: '8条·4正4反' },
  mix9: { forward: 5, reverse: 4, desc: '9条·5正4反' },
  mix10: { forward: 5, reverse: 5, desc: '10条·5正5反' }
};

// 主循环形态序列（覆盖所有常规形态；mix7/mix9 只作尾数兜底，保证 1..10 每个余量都有单组可精确凑齐）。
const PATTERN = ['single', 'same2', 'both2', 'same3', 'mix3', 'same4', 'mix4', 'same5', 'mix5', 'mix6', 'mix8', 'mix10'];
const BY_SIZE = { 1: 'single', 2: 'both2', 3: 'mix3', 4: 'mix4', 5: 'mix5', 6: 'mix6', 7: 'mix7', 8: 'mix8', 9: 'mix9', 10: 'mix10' };
const MAX_GROUP_SIZE = 10;

const groupSize = name => GROUP_TYPES[name].forward + GROUP_TYPES[name].reverse;

// 确定性伪随机（mulberry32）：value 只影响 demo 箭头大小/标签文案，固定种子保证重复生成结果一致。
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(nodeCount, edgeCount) {
  const random = mulberry32(nodeCount * 31 + edgeCount);
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i}`, label: `n${i}` }));
  const links = [];
  const groupCounts = {};

  let p = 0; // 节点指针：每组独占一对新节点，保证平行组之间互不合并
  let r = edgeCount; // 剩余边配额
  let cursor = 0; // pattern 游标

  while (r > 0) {
    const pairsLeft = Math.floor((nodeCount - p) / 2);
    if (pairsLeft <= 0) throw new Error(`节点不足：还剩 ${r} 条边没有端点对可用（N=${nodeCount}, E=${edgeCount}）`);

    let name = PATTERN[cursor % PATTERN.length];
    cursor += 1;
    // 尾数或点预算紧张时改放"能精确容纳余量的最大组"：
    // - 组大小超过剩余配额时不能放（会超边数）；
    // - 放小组后若剩余端点对全放最大组也凑不齐边数，说明点要先于边耗尽，必须改放大组。
    if (groupSize(name) > r || (pairsLeft - 1) * MAX_GROUP_SIZE < r - groupSize(name)) {
      name = BY_SIZE[Math.min(r, MAX_GROUP_SIZE)];
    }

    const type = GROUP_TYPES[name];
    const a = nodes[p].id;
    const b = nodes[p + 1].id;
    nodes[p].label = type.desc; // a 端标注组形态，放大画面即可核对
    p += 2;

    for (let i = 1; i <= type.forward; i += 1) {
      links.push({ source: a, target: b, label: `正${i}/${type.forward}`, value: Math.floor(random() * 9 + 1) * 100 });
    }
    for (let i = 1; i <= type.reverse; i += 1) {
      links.push({ source: b, target: a, label: `反${i}/${type.reverse}`, value: Math.floor(random() * 9 + 1) * 100 });
    }
    r -= groupSize(name);
    groupCounts[name] = (groupCounts[name] ?? 0) + 1;
  }

  // 剩余节点为孤立点（保点数与原数据集一致的产物），标注便于在画面上辨认。
  for (let i = p; i < nodeCount; i += 1) nodes[i].label = `孤立点`;

  return { nodes, links, stats: { groupCounts, isolated: nodeCount - p } };
}

const SPECS = [
  { nodeCount: 50, edgeCount: 100 },
  { nodeCount: 1000, edgeCount: 2000 },
  { nodeCount: 10000, edgeCount: 20000 },
  { nodeCount: 50000, edgeCount: 100000 }
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { nodeCount, edgeCount } of SPECS) {
  const { nodes, links, stats } = generate(nodeCount, edgeCount);
  if (nodes.length !== nodeCount || links.length !== edgeCount) {
    throw new Error(`数量不符：nodes=${nodes.length}/${nodeCount} links=${links.length}/${edgeCount}`);
  }
  const file = join(OUT_DIR, `data-curve-${nodeCount}-${edgeCount}.json`);
  writeFileSync(file, JSON.stringify({ nodes, links }));
  console.log(`${file}: ${nodeCount} 点 ${edgeCount} 边，孤立点 ${stats.isolated}，组分布 =`, stats.groupCounts);
}
