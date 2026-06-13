# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库中工作时提供指引。

## 这是什么

一个图可视化库，通过 [PIXI.js](https://www.pixijs.com/) **v8** 把 [Graphology](https://graphology.github.io/) 图渲染到 WebGL/WebGPU 画布上。它是 `zakjan/pixi-graph` 的深度定制分支——大多数非平凡代码都带有中文注释，并在上游基础上新增了水印、框选、箭头/边标签、高性能模式、空格拖拽、双击等特性。当对意图有疑问时，**以代码中的中文注释为准**。

当前版本为 **v2**：基于 PIXI.js v8，以 ESM 形式发布（同时提供 UMD 包）。`pixi.js`、`pixi-viewport`、`graphology` 是 peer/运行时依赖，交由使用方的打包器去重。

## 命令

```bash
npm run dev        # Vite 开发服务器，默认 http://localhost:5173，带 HMR；服务根目录的 index.html 演示
npm run build      # tsc --noEmit 类型检查 + Vite 库构建，输出 dist/（ESM + .d.ts，npm 发布物）
npm run build:umd  # 按需构建自包含 UMD 到 dist-umd/，手工拷贝给无打包器项目，不进 npm 包
npm test           # vitest run，跑单元测试（一次性）
npm run test:watch # vitest 监听模式
npm run lint       # eslint + prettier --check
npm run format     # prettier --write
npm run typecheck  # tsc --noEmit
```

**demo 直连源码**：`demo/main.ts` 从 `pixi-graph` 引入，`vite.config.ts` 把该名称别名指向 `src/index.ts`。因此 `npm run dev` 时改源码会经 HMR 立即反映到演示页，**无需先 `build`**。`dist/` 仅供外部使用者，且被 gitignore。

构建产物分两类：**npm 发布物** `dist/`——`pixi-graph.js`（ESM，`pixi.js`/`pixi-viewport`/`eventemitter3` 外部化，`color-rgba` 内联）与 `index.d.ts`（由 `vite-plugin-dts` 汇总生成）；**按需产物** `dist-umd/pixi-graph.umd.min.js`（`npm run build:umd`，自包含 UMD，全局名 `PixiGraph`，全部运行时依赖打入并降级到 ES2017，供 webpack 4 等无现代打包器的项目手工拷贝使用，不随 npm 分发）。`graphology` 仅类型引用，两种产物都不打包。两个输出目录均被 gitignore。

## 架构

入口是 `src/index.ts`，仅重新导出 `PixiGraph` 与各类型。核心逻辑集中在 `src/PixiGraph.ts`（约 840 行）的 `PixiGraph` 类。

**异步初始化**：PIXI v8 的渲染器是异步初始化的。请用工厂方法 `await PixiGraph.create(options)` 构造；直接 `new PixiGraph(options)` 也可以，此时通过实例上的 `ready: Promise<this>` 等待绘制完成。在 `ready` resolve 之前 `viewport`、纹理缓存等字段尚未就绪（代码中用 `!` 断言）。

**渲染管线（三层）：**
1. `src/PixiGraph.ts` — 持有 PIXI `Application`、`pixi-viewport` 的 `Viewport`（平移/缩放）以及 PIXI 自带的 `Culler`（剔除）。它订阅 Graphology 的图变更事件（`nodeAdded`、`edgeDropped`、`attributesUpdated` 等——见 `onGraph*Bound` 处理器），让画布与数据模型保持同步；并维护 `nodeKeyToNodeObject` / `edgeKeyToEdgeObject` 两张从图 key 到渲染对象的 Map。
2. `src/elements/PixiNode.ts`、`src/elements/PixiEdge.ts` — 每个元素的包装类。各自持有显示用的 `Container`，把 PIXI 指针事件重新发射为带类型的事件，再由 `PixiGraph` 转发为 `nodeClick`、`edgeMouseover` 等。
3. `src/renderers/*` — 无状态的绘制函数（`node.ts`、`nodeLabel.ts`、`edge.ts`、`edgeArrow.ts`、`edgeLabel.ts`）。均为纯函数 `createX` / `updateXStyle` / `updateXVisibility`，作用在传入的 `Container` 上，自身不持有状态。

**显示层**是按 z 序加入 viewport 的独立 `Container`：`edgeLayer`、`edgeLabelLayer`、`nodeLabelLayer`、`nodeLayer`。`watermarkLayer` 加在 `app.stage` 的索引 0（位于 viewport 之后，故不随平移/缩放变化）。

**纹理缓存**（`src/textures/TextureCache.ts`）：节点/标签先渲染一次到缓存的 `Texture`（key 为 `::` 分隔的样式属性串），再以 `Sprite` 绘制。纹理以渲染器 2× 分辨率生成以保证清晰。改动节点/边外观时，cache key 必须包含每一个视觉属性，否则会复用到过期纹理。

**样式解析**（`src/style/style.ts`）：`GraphStyleDefinition` 允许在样式树的**任意层级**使用函数、部分对象或完整值。`resolveStyleDefinitions` 会针对元素属性递归解析函数，并在 `DEFAULT_STYLE`（定义于 `src/core/constants.ts`）之上深度合并。数据驱动样式即通过传入形如 `color: node => colors[node.group]` 的函数实现。

**细节层级（LOD）与性能：** `updateGraphVisibility()` 在 viewport `frame-end`、且标记为 dirty 时运行。它把 `viewport.scaled` 映射进离散的 `zoomStep` 桶（阈值见 `core/constants.ts` 的 `ZOOM_STEPS`），切换元素/标签可见性，再剔除屏幕外的子节点。可选的 `highPerformance: { nodeNumber, edgeNumber }` 在超过阈值时触发 `high` 模式——拖拽/缩放/吸附期间隐藏边与节点标签，交互结束后恢复。

**`src/features/`** 存放从核心类拆出的自包含特性：
- `selection/` — 框选。`BoxSelectViewport`（在 viewport 内绘制选择矩形）与 `BoxSelectDom`（DOM 层覆盖框选），命中判定在 `selectionGeometry.ts`（`selectInRectangle`，返回 `SelectionResult`）。通过 `pixiGraph.choose` 暴露。
- `watermark/` — `makeWatermark` 构建平铺的文字/图片水印 `Container`，由 `PixiGraph` 上的水印相关方法驱动。

`src/utils/` — `color.ts`（`color-rgba` → PIXI 颜色/透明度，`colorToPixi`）、`text.ts`（`TextType.TEXT` vs `BITMAP_TEXT`，webfont/位图字体处理）、`throttle.ts`、`validate.ts`（`isInteger` 等）。

`src/core/` — `constants.ts`（`DEFAULT_STYLE`、`WORLD_PADDING`、`ZOOM_STEPS` 等常量）、`types.ts`（`GraphOptions`、`PixiGraphEvents`、`HighPerformanceThreshold`）。`src/types/attributes.ts` 定义 `BaseNodeAttributes` / `BaseEdgeAttributes`。

## 本仓库特有约定

- **PIXI v8 从 `pixi.js` 主包统一导入**（如 `import { Application, Container, Graphics, Culler } from 'pixi.js'`），不再使用 v7 时代的 `@pixi/*` 子包，也不再需要 `import '@pixi/events'` 之类的副作用导入。新增导入请遵循此约定。
- 节点圆形/边使用 PIXI 核心的 `Graphics`（v8 已内置抗锯齿），不再使用 `@pixi/graphics-smooth` 的 `SmoothGraphics`。
- 事件处理器在字段初始化时一次性预绑定（`onXBound = this.onX.bind(this)`），以便既能 `on` 又能 `off`；`destroy()` 必须注销它添加过的每一个监听（viewport、graph、document、ResizeObserver）——保持增删对称。
- `GraphOptions` 在上游基础上扩展了 `spaceDrag`、`dragOffset`、`highPerformance`、`minScale`、`maxScale`（默认 `minScale=0.1`、`maxScale=2`）。
- TypeScript 为 `strict`；打包/产物由 Vite（底层 Rollup）处理，无需手动配置 polyfill。
- 测试用 Vitest，环境 `jsdom`，测试文件以 `*.test.ts` 与源码同目录放置（如 `style/style.test.ts`、`utils/color.test.ts`、`features/selection/selectionGeometry.test.ts`）。
