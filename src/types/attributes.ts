import type { Attributes } from 'graphology-types';

// 图元素属性的基础类型约束。why 节点强制带 x/y：本库不内置布局算法，节点坐标须由使用方（布局库
// 或自定义）写入图属性，渲染与 resetView/边几何都直接读取它；边无强制字段，样式按需自取。
export type BaseAttributes = Attributes;
export type BaseNodeAttributes = BaseAttributes & { x: number; y: number };
export type BaseEdgeAttributes = BaseAttributes;
