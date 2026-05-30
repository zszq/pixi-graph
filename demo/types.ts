// demo 用的原始数据与图属性类型。

// 数据文件 (demo/data/*.json) 的原始结构。
export interface RawData {
  nodes: { id: string; label?: string; icon?: string }[];
  links: { source: string; target: string; label?: string; value?: number }[];
}

export type NodeAttrs = { x: number; y: number; id: string; label?: string; icon?: string };
export type EdgeAttrs = { source: string; target: string; label?: string; value?: number };
