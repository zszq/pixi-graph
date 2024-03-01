import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import nodePolyfills from 'rollup-plugin-polyfill-node';
import typescript from "@rollup/plugin-typescript";
import terser from '@rollup/plugin-terser';
import dts from "rollup-plugin-dts";
import { visualizer } from "rollup-plugin-visualizer";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";

const isDev = process.env.ENV === "development" ? true : false;

const bundle = (format, filename, options = {}) => ({
  input: "src/index.ts",
  output: {
    file: filename,
    format: format,
    name: "PixiGraph",
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    nodePolyfills(),
    commonjs(),
    typescript(),
    ...(options.minimize ? [terser()] : []),
    ...(options.stats
      ? [visualizer({ filename: filename + ".stats.html" })]
      : []),
    ...(isDev
      ? [
          serve({
            // open: true,
            // openPage: '/demo/',
            contentBase: [""],
            // host: '127.0.0.1',
            // port: 10001,
          }),
        ]
      : []),
    ...(isDev ? [livereload({ watch: "dist" })] : []),
  ],
});

const generate_dts = () => {
  return isDev
    ? []
    : [
        {
          input: "src/index.ts",
          output: { file: "dist/pixi-graph.d.ts", format: "es" },
          plugins: [dts()],
        },
      ];
};

const name = isDev ? "dist/pixi-graph.umd.js" : "dist/pixi-graph.umd.min.js";

export default [
  // bundle('cjs', 'dist/pixi-graph.cjs.js'),
  // bundle('es', 'dist/pixi-graph.esm.js'),
  bundle("umd", name, {
    stats: !isDev,
    minimize: !isDev,
  }),
  ...generate_dts(),
];
