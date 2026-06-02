// 库的公共入口（what）：只重新导出对外的类、函数与类型，是使用方唯一应 import 的模块。
// why 收窄出口：内部实现（控制器、渲染器、纹理缓存等）保持私有，便于重构而不破坏外部 API。
export { PixiGraph } from './PixiGraph';
export type { GraphOptions, PixiGraphEvents, HighPerformanceThreshold } from './core/types';

export { TextType } from './utils/text';
export type { TextStyle, FontWeight, TextAlign } from './utils/text';

export type { GraphStyle, NodeStyle, EdgeStyle, StyleDefinition, NodeStyleDefinition, EdgeStyleDefinition, GraphStyleDefinition } from './style/style';

export type { BaseAttributes, BaseNodeAttributes, BaseEdgeAttributes } from './types/attributes';

export type { WatermarkOption } from './features/watermark/watermark';
export type { SelectionResult } from './features/selection';
export { selectInRectangle } from './features/selection';
