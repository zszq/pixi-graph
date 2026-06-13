import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';

// ESM 构建（npm 包唯一发布产物）：外部化需要与使用方共享的运行时——
// pixi.js / pixi-viewport 由使用方打包器去重，避免两份 PIXI 导致 instanceof / 全局单例错乱；
// eventemitter3 同样外部化，因为 pixi.js 自身依赖它，使用方依赖树里必然存在，外部化是零成本去重。
// color-rgba 打进产物：pixi 不依赖它、体积小且属实现细节，使用方无需安装。
// 自包含 UMD 由 vite.config.umd.ts 按需构建（npm run build:umd），不进 npm 包。
// `npm run dev` serves the root index.html demo with full HMR
// against `src/` (imported through the `pixi-graph` alias).
export default defineConfig({
  resolve: {
    alias: {
      'pixi-graph': resolve(__dirname, 'src/index.ts')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PixiGraph',
      formats: ['es'],
      fileName: () => 'pixi-graph.js'
    },
    rollupOptions: {
      external: ['pixi.js', 'pixi-viewport', 'graphology', 'graphology-types', 'eventemitter3']
    }
  },
  plugins: [
    dts({
      include: ['src'],
      rollupTypes: true
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts']
  }
});
