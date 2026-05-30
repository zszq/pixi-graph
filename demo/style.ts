// 图的样式定义（普通态 + hover 态）。
import { TextType, type GraphStyleDefinition } from 'pixi-graph';
import type { EdgeAttrs, NodeAttrs } from './types';

const NODE_COLOR = '#C6CCF5';
const COLOR_SELECTED = '#ff7f0e';

export const style: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
  node: {
    size: () => 15,
    color: () => NODE_COLOR,
    border: { width: 2, color: '#4A5FE2' },
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
      color: '#000',
      stroke: '#fff',
      strokeThickness: 2,
      padding: 2
    }
  },
  edge: {
    width: () => 1,
    color: () => '#999',
    arrow: { show: true, size: edge => (Math.log((edge.value ?? 0) + 1) + 2) * 2 },
    label: {
      content: edge => edge.label ?? edge.target ?? '',
      type: TextType.TEXT,
      fontSize: 12,
      fontWeight: '500',
      color: '#000',
      stroke: '#fff',
      strokeThickness: 2,
      padding: 2,
      parallel: true
    }
  }
};

export const hoverStyle: GraphStyleDefinition<NodeAttrs, EdgeAttrs> = {
  node: { border: { color: COLOR_SELECTED }, label: { backgroundColor: 'rgba(255, 255, 255, 0.6)' } },
  edge: { color: COLOR_SELECTED, label: { backgroundColor: 'rgba(255, 255, 255, 0.6)' } }
};
