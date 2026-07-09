import { TextType } from '../utils/text';
import type { GraphStyleDefinition } from '../style/style';

/** 适配视图时，图包围盒四周额外留出的世界坐标内边距（px）。 */
export const WORLD_PADDING = 100;

/** 在空白画布上按压的最大时长（ms），不超过则仍算点击（而非拖拽）。 */
export const VIEWPORT_CLICK_VALID_TIME = 200;

/**
 * 定义细节层级（LOD）分桶的缩放阈值。`findIndex(zoom <= step)` 得到 0..5 的 `zoomStep`；
 * 档位越高，渲染器展示的细节越多。
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

/**
 * 默认配色取低饱和靛蓝主色系（参考 Linear 品牌色 #5E6AD2 一类的内敛蓝紫）：
 * 纯黑节点在浅色页面上过于生硬，靛蓝填充 + 白描边在任意浅色宿主背景上
 * 都有足够对比，且重叠节点之间能靠白边互相分离。
 * 边用带蓝调的灰（而非纯灰），与节点同色系、视觉上退居其次而不显脏。
 */
export const DEFAULT_STYLE: GraphStyleDefinition = {
  node: {
    size: 20,
    color: '#5e6ad2',
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
      color: '#374151',
      // 描边默认作浅色晕光（halo）：深色文字配深色描边没有意义，调大 thickness 即可在密集图上衬出文字
      stroke: '#ffffff',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4
    }
  },
  edge: {
    width: 1,
    color: '#a9b4ce',
    alpha: 1,
    selefLoop: {
      radius: 30,
      cross: 10
    },
    gap: 15,
    // 默认关闭：保持既有"平行边直线侧移"行为不变，使用方显式开启后平行边才画曲线。
    curve: {
      enabled: false,
      curvature: 0.15,
      segments: 12
    },
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
      // 边标签是次级信息，比节点标签再淡一档，避免与节点标签争夺注意力
      color: '#6b7280',
      stroke: '#ffffff',
      strokeThickness: 0,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4,
      parallel: true
    }
  }
};
