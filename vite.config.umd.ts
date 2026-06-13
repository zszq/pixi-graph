import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// 自包含 UMD 构建（npm run build:umd，按需执行）：把 pixi.js / pixi-viewport /
// eventemitter3 / color-rgba 全部打进单文件，供无现代打包器的老项目（如 vue-cli 4 /
// webpack 4）直接 require 或 <script> 引入——产物手工拷贝给消费方，**不进 npm 包**
// （package.json 的 files 只含 dist/），避免给 npm 使用方塞入数 MB 的死重。
// graphology 不在此列——库只用它的类型，graph 实例由使用方构造后传入，运行时零依赖。
export default defineConfig({
  build: {
    // 独立输出目录，与 npm 发布物 dist/ 物理隔离，杜绝先 build:umd 再 publish 时混入
    outDir: 'dist-umd',
    emptyOutDir: true,
    sourcemap: true,
    // 降到 es2017 是为了 webpack 4（acorn 6）能解析产物：它读不了 ?. / ?? 等
    // ES2020 语法，而 pixi v8 源码里大量使用，必须由 esbuild 在打包时降级
    target: 'es2017',
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PixiGraph',
      formats: ['umd'],
      fileName: () => 'pixi-graph.umd.min.js'
    },
    rollupOptions: {
      external: ['graphology', 'graphology-types']
    }
  }
});
