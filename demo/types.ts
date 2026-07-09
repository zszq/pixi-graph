// demo 用的原始数据与图属性类型。

// 数据文件 (demo/data/*.json) 的原始结构。
export interface RawData {
  // fixedLayout：节点自带 x/y 坐标且按原样使用，不随机化、不跑力导向布局。
  // 用于精心排布的验证数据集（如曲线用例网格），布局会破坏用例的可读排列。
  fixedLayout?: boolean;
  nodes: { id: string; label?: string; icon?: string; x?: number; y?: number }[];
  links: { source: string; target: string; label?: string; value?: number }[];
}

export type NodeAttrs = { x: number; y: number; id: string; label?: string; icon?: string };
export type EdgeAttrs = { source: string; target: string; label?: string; value?: number };
