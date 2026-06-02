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
 * 标签（节点/边）开始出现的最低 zoomStep。低于此档位时标签按 LOD 全部隐藏，此时把整个
 * 标签层 renderable 置 false，可让 PIXI 渲染组直接跳过其下数万个标签容器的指令重建遍历。
 * 必须与 renderers/*Label.ts 中文本出现的阈值（zoomStep>=2）保持一致。
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
