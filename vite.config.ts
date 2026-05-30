import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';

// Runtime dependencies are kept external so consumers dedupe them with their
// own bundler. `npm run dev` serves the root index.html demo with full HMR
// against `src/` (imported through the `pixi-graph` alias).
export default defineConfig({
  resolve: {
    alias: {
      'pixi-graph': resolve(__dirname, 'src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PixiGraph',
      formats: ['es', 'umd'],
      fileName: format => (format === 'es' ? 'pixi-graph.js' : 'pixi-graph.umd.cjs'),
    },
    rollupOptions: {
      external: ['pixi.js', 'pixi-viewport', 'graphology', 'graphology-types', 'color-rgba', 'deepmerge', 'eventemitter3'],
      output: {
        globals: {
          'pixi.js': 'PIXI',
          'pixi-viewport': 'pixi_viewport',
          graphology: 'graphology',
          'color-rgba': 'colorRgba',
          deepmerge: 'deepmerge',
          eventemitter3: 'EventEmitter3',
        },
      },
    },
  },
  plugins: [
    dts({
      include: ['src'],
      rollupTypes: true,
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
