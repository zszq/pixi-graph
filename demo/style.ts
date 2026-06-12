// 图的样式定义（普通态 + hover 态）。
import { TextType, type GraphStyleDefinition } from 'pixi-graph';
import type { EdgeAttrs, NodeAttrs } from './types';

// 深色「星图」配色，与页面 UI（index.html 的 CSS 变量）同一套设计语言：
// 深墨蓝底 --paper 上，节点用发光感的浅蓝紫 --accent，边退成半透明的蛛网细线。
// 高亮色取蓝紫的互补暖色（金琥珀），深底上像点亮一盏灯，一眼可辨。
const BG = '#0b0f1d'; // = --paper
const NODE_COLOR = '#7c8cf8'; // = --accent，深底上的发光主色
const NODE_BORDER = BG; // 描边用底色：重叠节点间形成「镂空」分离，比白边在深底上干净得多
const EDGE_COLOR = '#4a5572'; // 低明度蓝灰，再叠半透明 alpha，密集处呈现星图的蛛网质感
const EDGE_ALPHA = 0.55;
const INK = '#e8ebf4'; // = --ink
const INK_DIM = '#9aa3bc'; // = --ink-dim
const COLOR_HOVER = '#ffb224';

export const style: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
  node: {
    size: () => 15,
    color: () => NODE_COLOR,
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
      color: INK,
      // 描边用底色晕光，把文字从蛛网线里衬出来
      stroke: BG,
      strokeThickness: 2,
      padding: 2
    }
  },
  edge: {
    width: () => 1,
    color: () => EDGE_COLOR,
    alpha: EDGE_ALPHA,
    arrow: { show: true, size: edge => (Math.log((edge.value ?? 0) + 1) + 2) * 2 },
    label: {
      content: edge => edge.label ?? edge.target ?? '',
      type: TextType.TEXT,
      fontSize: 12,
      fontWeight: '500',
      // 边标签是次级信息，用淡墨色与节点标签拉开层次
      color: INK_DIM,
      stroke: BG,
      strokeThickness: 2,
      padding: 2,
      parallel: true
    }
  }
};

export const hoverStyle: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
  node: { border: { color: COLOR_HOVER }, label: { color: INK, backgroundColor: 'rgba(11, 15, 29, 0.85)' } },
  edge: { color: COLOR_HOVER, alpha: 1, label: { backgroundColor: 'rgba(11, 15, 29, 0.85)' } }
};
