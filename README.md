# pixi-graph

[![](https://img.shields.io/npm/dm/pixi-graph)](https://www.npmjs.com/package/pixi-graph)
[![](https://img.shields.io/david/zakjan/pixi-graph)](https://www.npmjs.com/package/pixi-graph)
[![](https://img.shields.io/bundlephobia/min/pixi-graph)](https://www.npmjs.com/package/pixi-graph)

基于 [PIXI.js](https://www.pixijs.com/) 和 [Graphology](https://graphology.github.io/) 的图可视化库。

> ⚠️ 本仓库是 [`zakjan/pixi-graph`](https://github.com/zakjan/pixi-graph) 的深度定制分支，在上游基础上新增了水印、框选、箭头/边标签、高性能模式、空格拖拽、双击等特性，API 与上游已有较大差异。仍处于演进中，后续可能引入破坏性变更，请自行评估风险后使用。

[在线演示](https://zakjan.github.io/pixi-graph/)

<img src="demo/screenshot@2x.jpg" alt="Screenshot" width="640" height="320">

> **v2** 基于 **PIXI.js v8**，以 ESM 形式发布（同时提供 UMD 包）。`pixi.js`、`pixi-viewport`、`graphology` 是 peer/运行时依赖，由你的打包器统一去重。由于渲染器是异步初始化的，请使用 `PixiGraph.create()` 工厂方法来构造。

## 安装

```
npm install pixi-graph pixi.js pixi-viewport graphology
```

## 使用

### 基础

```ts
import Graph from 'graphology';
import { PixiGraph } from 'pixi-graph';

const graph = new Graph();
// 向 Graphology 图中填充数据
// 把布局坐标写入节点的 `x`、`y` 属性

const pixiGraph = await PixiGraph.create({
  container: document.getElementById('graph'),
  graph,
  style,
  hoverStyle
});
```

`PixiGraph.create(options)` 会在 WebGL/WebGPU 渲染器就绪后 resolve。（`new PixiGraph(options)` 也可用，并暴露一个 `ready` Promise。）

### 布局

本质上，图布局就是一个 `nodes => positions` 的函数。因此可以使用任意其他库的布局。单独运行布局，再把坐标写入节点的 `x`、`y` 属性即可。

[graphology-layout-forceatlas2](https://github.com/graphology/graphology-layout-forceatlas2) 示例：

```ts
const graph = new graphology.Graph();
// 向 Graphology 图中填充数据

graph.forEachNode(node => {
  graph.setNodeAttribute(node, 'x', Math.random());
  graph.setNodeAttribute(node, 'y', Math.random());
});
forceAtlas2.assign(graph, { iterations: 300, settings: { ...forceAtlas2.inferSettings(graph), scalingRatio: 80 }});

const pixiGraph = await PixiGraph.create({ ..., graph });
```

### 样式

```ts
const style = {
  node: {
    color: '#000000',
  },
  edge: {
    color: '#000000',
  },
};

const pixiGraph = await PixiGraph.create({ ..., style });
```

#### 颜色

颜色通过 [color-rgba](https://github.com/colorjs/color-rgba) 解析。支持以下 CSS 颜色字符串：具名颜色、hex、简写 hex、RGB、RGBA、HSL、HSLA。

#### Web 字体

在创建 PixiGraph 之前，用 [FontFaceObserver](https://github.com/bramstein/fontfaceobserver) 预加载字体。

[Material Icons](https://google.github.io/material-design-icons/) 示例：

```html
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
```

```ts
const style = {
  node: {
    icon: {
      content: 'person',
      fontFamily: 'Material Icons',
    },
  },
};

await new FontFaceObserver('Material Icons').load();

const pixiGraph = await PixiGraph.create({ ..., style });
```

#### 位图字体

将位图字体注册为外部资源。

```ts
const style = {
  node: {
    label: {
      content: node => node.id,
      type: TextType.BITMAP_TEXT,
      fontFamily: 'HelveticaRegular',
    },
  },
};

const resources = [
  { name: 'HelveticaRegular', url: 'https://gist.githubusercontent.com/zakjan/b61c0a26d297edf0c09a066712680f37/raw/8cdda3c21ba3668c3dd022efac6d7f740c9f1e18/HelveticaRegular.fnt' },
];

const pixiGraph = await PixiGraph.create({ ..., style, resources });
```

#### 悬停样式

节点/边被悬停时，hover 样式中的值会覆盖基础样式中的值。

```ts
const style = {
  node: {
    color: '#000000',
  },
  edge: {
    color: '#000000',
  },
};
const hoverStyle = {
  node: {
    color: '#ff0000',
  },
  edge: {
    color: '#ff0000',
  },
};

const pixiGraph = await PixiGraph.create({ ..., style, hoverStyle });
```

⚠️ 随着其他状态的实现，此处可能变化

## API

```ts
export interface GraphOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  container: HTMLElement;
  graph: Graphology.AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  spaceDrag?: boolean;
  dragOffset?: boolean;
  highPerformance?: { nodeNumber: number; edgeNumber: number };
  minScale?: number;
  maxScale?: number;
  resources?: any[];
}

export class PixiGraph<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  static create(options: GraphOptions): Promise<PixiGraph>;
  constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>);
  readonly ready: Promise<this>;
}
```

- `container` - 用作容器的 HTML 元素
- `graph` - [Graphology](https://graphology.github.io/) 图
- `style` - 样式定义
- `hoverStyle` - 悬停状态的附加样式定义
  - ⚠️ 随着其他状态的实现，此处可能变化
- `spaceDrag` - 仅在按住空格时平移（让普通拖拽可用于框选）
- `dragOffset` - 拖拽时保持光标与节点的偏移，而非吸附到节点中心
- `highPerformance` - 节点/边数量超过阈值时，交互期间隐藏边/标签以提升性能
- `minScale` / `maxScale` - 最小/最大缩放比例（默认 `0.1` / `2`）
- `resources` - 外部资源定义（目前仅用于外部位图字体）

### 样式定义

`GraphStyle` 接口表示已解析的样式，所有值都是必填的。

`GraphStyleDefinition` 接口允许在任意 key 上使用函数或省略值。函数会被解析，省略的值回退到上一层定义或默认值。

```ts
export interface GraphStyle {
  node: {
    size: number;
    color: string;
    border: {
      width: number;
      color: string;
    };
    icon: {
      content: string;
      type: TextType;
      fontFamily: string;
      fontSize: number;
      color: string;
    };
    label: {
      content: string;
      type: TextType;
      fontFamily: string;
      fontSize: number;
      color: string;
      backgroundColor: string;
      padding: number;
    };
  };
  edge: {
    width: number;
    color: string;
  };
}

export type NodeStyle = GraphStyle['node'];
export type EdgeStyle = GraphStyle['edge'];

export type StyleDefinition<Style, Attributes> =
  ((attributes: Attributes) => Style) |
  {[Key in keyof Style]?: StyleDefinition<Style[Key], Attributes>} |
  Style;

export interface GraphStyleDefinition<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  node?: StyleDefinition<NodeStyle, NodeAttributes>;
  edge?: StyleDefinition<EdgeStyle, EdgeAttributes>;
}
```

这允许在任意样式层级使用静态样式或数据驱动样式。每个函数只解析一次。

```ts
const style = {
  node: {
    color: '#000000',
  },
};
```

或

```ts
const style = {
  node: {
    color: node => colors[node.group % colors.length],
  },
};
```

或

```ts
const style = {
  node: node => {
    const color = colors[node.group % colors.length];
    return { color };
  },
};
```

### 事件

节点事件：

- nodeClick
- nodeDbclick
- nodeRightclick
- nodeMousemove
- nodeMouseover
- nodeMouseout
- nodeMousedown
- nodeMouseup
- nodeMoveStart / nodeMove / nodeMoveEnd

```ts
pixiGraph.on('nodeClick', (event, nodeKey) => ...);
```

边事件：

- edgeClick
- edgeDbclick
- edgeRightclick
- edgeMousemove
- edgeMouseover
- edgeMouseout
- edgeMousedown
- edgeMouseup

```ts
pixiGraph.on('edgeClick', (event, edgeKey) => ...);
```

视口事件：`viewportClick`、`viewportRightClick`。

## 开发

使用 [Vite](https://vitejs.dev/)（开发服务器 + 库构建）和 [Vitest](https://vitest.dev/) 构建。

```
npm run dev        # 在 localhost:5173 启动演示，带热模块替换（HMR）
npm run build      # 类型检查 + 构建 dist/（ESM + UMD + .d.ts）
npm test           # 运行单元测试
npm run test:watch # 监听模式
npm run lint       # eslint + prettier 检查
npm run format     # prettier 写回
```

演示页（`demo/main.ts`）通过 `pixi-graph` 别名直接引用 `src/` 源码，因此改动源码会经 HMR 立即生效，无需先构建。

### 大图 benchmark

启动开发服务器后访问：

```
http://localhost:5173/?bench=1&data=data-50000-100000
```

`bench=1` 会在 demo 完成加载后自动输出一份 `pixiGraphBenchmark` 报告到控制台和 `window.pixiGraphBenchmark`，覆盖下载/建图/布局/`PixiGraph.create`、框选命中、单节点位置更新、缩放和 uncull 等阶段。它**不会**自动执行 `extract()`，避免 benchmark 本身触发额外的大图离屏渲染。可用 `data=` 切换 `demo/data/*.json` 数据集；不传 `data` 时默认使用 `data-50000-100000`。


源码组织结构：`PixiGraph.ts`（编排核心）· `elements/`（PixiNode / PixiEdge 包装类）· `renderers/`（无状态绘制函数）· `textures/`（纹理缓存）· `style/`（样式解析）· `features/`（框选、水印）· `core/`（常量与类型）· `utils/`（颜色、文本、节流等工具）。

## 赞助

<a href="https://reflect.app/"><img src="https://reflect.app/static/icons/icon-bare.svg" alt="Reflect" width="48" height="48"></a>
