# pixi-graph high-performance architecture

## Functional inventory

Public surface preserved from the current customized v2 API:

- async construction: `PixiGraph.create(options)`, `new PixiGraph(options).ready`.
- Graphology-backed rendering: nodes require `x`/`y`; graph mutations stay live.
- styling: default/base/hover style definitions; static, partial, and functional values at any nesting level.
- rendering features: nodes, borders, icons, node labels, edges, self-loops, parallel edge offsets, arrows, edge labels, alpha, zoom LOD, culling, extract.
- interaction events: node/edge pointer events, click/double-click/right-click, node move start/move/end, viewport click/right-click.
- viewport controls: pan, pinch, wheel, clamp zoom, `zoomIn`, `zoomOut`, `resetView`.
- visibility/render toggles: node/edge visibility, edges/labels renderability, per-node edge renderability.
- high-performance mode: hide edges/labels during heavy pan/zoom/drag.
- selection: viewport auto-select and DOM overlay select; lazy and precise edge selection.
- watermarks: create/remove/clear.
- lifecycle: destroy all listeners, textures, PIXI objects.

## Measured starting point

- `perf/drag-bounds-cache` creates large graphs faster.
- `refactor/vite-pixi-v8` has smaller bundle and much better `data-star-1-5000` mutation behavior because node updates do not eagerly recompute all incident edge styles.
- Both versions are mostly render-bound for pan/zoom on 10k+ datasets.

## Architecture decisions

### Data/index layer

Keep Graphology as the primary adjacency/source-target index. A separate render-side adjacency mirror was tested, but on the 50k/100k graph it increased create time and memory more than it helped hot-path queries, so it was removed.

### Style layer

Alternatives considered:

1. Resolve and deep-merge default/base/hover on every mutation.
   - Simple, but allocates heavily.
2. Compile style definitions once into resolver functions and cache by attribute object identity + hover state.
   - Fast for common Graphology mutations where attribute object identity is stable between renders; invalidates naturally when object changes.

Chosen: option 2. Preserve style semantics while avoiding repeated recursive resolution for unchanged objects.

### Mutation layer

Alternatives considered for node position updates:

1. Cache branch behavior: update node, then if geometry changed update all connected edges immediately.
   - Correct but slow for high-degree nodes.
2. V8 behavior: update node only; skip incident edge updates until drag end in some cases.
   - Fast during mutation but can leave stale edges for programmatic updates.
3. Batched dirty scheduler: update node immediately, mark incident edges dirty, flush once per animation frame; during high-performance drag skip edge flush until end.
   - Keeps correctness for programmatic updates and avoids repeated edge work in bursts.

Chosen: option 3.

### Render layer

Keep existing PIXI object model and cached texture baking because it was faster to create large graphs than the monolithic v8 branch. Optimize around it rather than replacing with Graphics-per-edge or Mesh batching for this iteration.

Alternatives considered:

- `Graphics` for edges: flexible but slower to update/allocate at high count.
- sprite line/arrows/textures: current approach, proven faster in create benchmark.
- custom Mesh batch: likely fastest for uniform lines but would regress labels, hit testing, self-loops, arrows, and public events in a large rewrite.

Chosen: sprite/texture model plus better indexing, caching, and batched dirty updates.

## New core components

- `SpatialNodeIndex`: uniform-grid visible-node index for high-mode camera movement, inspired by large-graph engines that avoid scanning every display object on every frame.
- static style branch cache inside `style.ts`: avoids repeatedly resolving pure object style definitions.
- `EdgeUpdateScheduler`: tracks high-degree dirty edges and defers expensive edge geometry refresh until consistency boundaries.
- high-mode interaction layers: hide edges, node labels, and node detail sprites during camera interaction; restore lazily after idle or immediately for `uncull`/`extract`.

