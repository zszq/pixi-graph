// 图的样式定义（普通态 + hover 态），随 ?theme= 在两套色板间选择。
import { TextType, type GraphStyleDefinition } from 'pixi-graph';
import { resolveTheme } from './theme';
import type { EdgeAttrs, NodeAttrs } from './types';

// 两套色板与页面 UI（index.html 的 CSS 变量）同一套设计语言，键值一一对应：
// - dark 深色「星图」：深墨蓝底 --paper 上，节点用发光感的浅蓝紫 --accent，
//   边退成半透明蛛网细线；高亮取蓝紫的互补暖色（金琥珀），深底上像点亮一盏灯。
// - light 亮色「晨雾」：纸白底缺少深底的发光衬托，节点色须更深更饱和才有重量，
//   故取深一档的靛蓝；高亮琥珀同理压暗，否则在白底上会糊成一片。
const PALETTES = {
  dark: {
    bg: '#0b0f1d', // = --paper
    node: '#7c8cf8', // = --accent
    edge: '#4a5572', // 低明度蓝灰，再叠半透明 alpha，密集处呈现星图的蛛网质感
    edgeAlpha: 0.55,
    ink: '#e8ebf4', // = --ink
    inkDim: '#9aa3bc', // = --ink-dim
    hover: '#ffb224',
    hoverLabelBg: 'rgba(11, 15, 29, 0.85)'
  },
  light: {
    bg: '#f3f5fa',
    node: '#5468e7',
    edge: '#a9b2c8',
    edgeAlpha: 0.6,
    ink: '#1c2333',
    inkDim: '#5b6478',
    hover: '#e8930c',
    hoverLabelBg: 'rgba(255, 255, 255, 0.88)'
  }
} as const;

const palette = PALETTES[resolveTheme()];
// 描边用底色：重叠节点间形成「镂空」分离，比对比色描边在两种底色上都干净得多
const NODE_BORDER = palette.bg;

export const style: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
  node: {
    size: () => 15,
    color: () => palette.node,
    border: { width: 2, color: NODE_BORDER },
    icon: {
      type: node => (node.icon ? TextType.IMAGE : TextType.TEXT),
      content: node => node.icon ?? '',
      fontFamily: 'iconfont',
      fontSize: () => 50,
      color: '#ffffff'
    },
    label: {
      content: node => node.label ?? node.id,
      type: TextType.TEXT,
      align: 'center',
      fontSize: 12,
      color: palette.ink,
      // 描边用底色晕光，把文字从蛛网线里衬出来
      stroke: palette.bg,
      strokeThickness: 2,
      padding: 2
    }
  },
  edge: {
    width: () => 1,
    color: () => palette.edge,
    alpha: palette.edgeAlpha,
    arrow: { show: true, size: edge => (Math.log((edge.value ?? 0) + 1) + 2) * 2 },
    // 平行边曲线：两点间 ≥2 条边时扇形展开成弧线（buildGraph 里注入了 2/3/4 条的平行边样本供验证）
    curve: { enabled: true, curvature: 0.15 },
    label: {
      content: edge => edge.label ?? edge.target ?? '',
      type: TextType.TEXT,
      fontSize: 12,
      fontWeight: '500',
      // 边标签是次级信息，用淡墨色与节点标签拉开层次
      color: palette.inkDim,
      stroke: palette.bg,
      strokeThickness: 2,
      padding: 2,
      parallel: true
    }
  }
};

export const hoverStyle: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
  node: { border: { color: palette.hover }, label: { color: palette.ink, backgroundColor: palette.hoverLabelBg } },
  edge: { color: palette.hover, alpha: 1, label: { backgroundColor: palette.hoverLabelBg } }
};
