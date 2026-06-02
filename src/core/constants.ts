import { TextType } from '../utils/text';
import type { GraphStyleDefinition } from '../style/style';

/** Extra world padding (px) around the graph bounding box when fitting the view. */
export const WORLD_PADDING = 100;

/** Max press duration (ms) on empty canvas still counted as a click (vs a drag). */
export const VIEWPORT_CLICK_VALID_TIME = 200;

/**
 * Zoom thresholds defining the level-of-detail buckets. `findIndex(zoom <= step)`
 * yields a `zoomStep` 0..5; renderers reveal more detail as the step increases.
 */
export const ZOOM_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, Infinity];

/**
 * 性能优化④｜标签层按缩放档位整层开关 (tag: perf-v5-restore-lod)
 * ⚠️ PERF-CRITICAL（性能关键·改值必须同步改对应渲染阈值）：标签（节点/边）开始出现的最低 zoomStep。
 * 低于此档位时标签按 LOD 全部隐藏，此时把整个标签层 renderable 置 false，让 PIXI 渲染组直接跳过其下
 * 数万个标签容器的指令重建遍历（优化④），并据此判定是否懒烘焙标签纹理（优化⑤）。
 * **必须与 renderers/{node,edge}Label.ts 中文本出现的阈值（updateXxxLabelVisibility 的 zoomStep>=2）
 * 保持一致**，否则会出现“整层已关但单个标签以为要显示”之类的撕裂。
 */
export const LABEL_ZOOM_STEP = 2;

export const DEFAULT_STYLE: GraphStyleDefinition = {
  node: {
    size: 20,
    color: '#000',
    alpha: 1,
    border: {
      width: 2,
      color: '#ffffff'
    },
    icon: {
      type: TextType.TEXT,
      content: 'node_icon_content',
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: '400',
      align: 'left',
      color: '#ffffff',
      stroke: 'black',
      strokeThickness: 0
    },
    label: {
      type: TextType.TEXT,
      content: 'node_label_content',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: '400',
      align: 'left',
      color: '#333333',
      stroke: 'black',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4
    }
  },
  edge: {
    width: 1,
    color: '#cccccc',
    alpha: 1,
    selefLoop: {
      radius: 30,
      cross: 10
    },
    gap: 15,
    arrow: {
      show: true,
      size: 15
    },
    label: {
      type: TextType.TEXT,
      content: 'edge_label_content',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: '400',
      align: 'left',
      color: '#333333',
      stroke: 'black',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4,
      parallel: true
    }
  }
};
