// 样式系统（what）：定义最终样式的完整结构 GraphStyle（node/edge 各项的具体值），以及"样式定义"
// GraphStyleDefinition——它允许在样式树的任意层级写成 函数 / 部分对象 / 完整值。
// 这样设计：数据驱动样式。使用方可写 `color: node => colors[node.group]`，让每个元素按自身
// 属性算出样式；解析时（resolveStyleDefinitions）在 DEFAULT_STYLE 之上深度合并 base 与 hover 态，
// 得到该元素的最终样式。函数可出现在任意层级，故需递归解析。
import type { BaseNodeAttributes, BaseEdgeAttributes } from '../types/attributes';
import type { TextType, TextStyle } from '../utils/text';

export interface GraphStyle {
  node: {
    size: number;
    color: string;
    alpha: number;
    border: {
      width: number;
      color: string;
    };
    icon: {
      content: string;
      type: TextType;
      fontFamily: string;
      fontSize: number;
      fontWeight: TextStyle['fontWeight'];
      align: TextStyle['align'];
      color: string;
      stroke: string;
      strokeThickness: number;
    };
    label: {
      content: string;
      type: TextType;
      fontFamily: string;
      fontSize: number;
      fontWeight: TextStyle['fontWeight'];
      align: TextStyle['align'];
      color: string; // 填充色
      stroke: string;
      strokeThickness: number;
      backgroundColor: string;
      padding: number;
    };
  };
  edge: {
    width: number;
    color: string;
    alpha: number;
    selefLoop: {
      radius: number;
      cross: number;
    };
    gap: number;
    // 平行边曲线：两点间有 ≥2 条边时把这组边画成扇形散开的二次贝塞尔曲线，
    // 借曲度区分同向多重边（直线侧移方案下同向多条边会完全重叠）。
    curve: {
      enabled: boolean;
      // 曲度 = 相邻两条平行弧的弧顶间距 / 两节点圆心距（弦长比例）。
      // 用比例而非固定像素：节点离得越远弧越弯得开，视觉比例恒定。
      curvature: number;
      // 批量边模式下曲线用折线近似的段数；段数越高越平滑、粒子越多。普通模式画真贝塞尔，不受此影响。
      segments: number;
    };
    arrow: {
      show: boolean;
      size: number;
    };
    label: {
      type: TextType;
      fontFamily: string;
      fontSize: number;
      fontWeight: TextStyle['fontWeight'];
      align: TextStyle['align'];
      content: string;
      color: string; // 填充色
      stroke: string;
      strokeThickness: number;
      backgroundColor: string;
      padding: number;
      parallel: boolean;
    };
  };
}

export type NodeStyle = GraphStyle['node'];
export type EdgeStyle = GraphStyle['edge'];

export type StyleDefinition<Style, Attributes> = ((attributes: Attributes) => Style) | { [Key in keyof Style]?: StyleDefinition<Style[Key], Attributes> } | Style;

export type NodeStyleDefinition<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes> = StyleDefinition<NodeStyle, NodeAttributes>;
export type EdgeStyleDefinition<EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> = StyleDefinition<EdgeStyle, EdgeAttributes>;

export interface GraphStyleDefinition<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  node?: NodeStyleDefinition<NodeAttributes>;
  edge?: EdgeStyleDefinition<EdgeAttributes>;
}

// 静态样式定义（整棵子树都没有函数）的解析结果缓存。why：同一份 style 配置对象会被成千上万个
// 元素反复解析；若其中不含函数，结果与元素属性无关，可按定义对象身份缓存复用，省去重复深拷贝。
// 用 WeakMap，定义对象被回收时缓存自动释放。
const resolvedStaticStyleCache = new WeakMap<object, unknown>();

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const key in value as Record<string, unknown>) {
    if (containsFunction((value as Record<string, unknown>)[key])) return true;
  }
  return false;
}

/** 针对元素属性，递归解析（可能是函数/部分对象的）样式定义。 */
export function resolveStyleDefinition<Style, Attributes>(styleDefinition: StyleDefinition<Style, Attributes>, attributes: Attributes): Style {
  let style: Style;
  if (styleDefinition instanceof Function) {
    style = styleDefinition(attributes);
  } else if (typeof styleDefinition === 'object' && styleDefinition !== null) {
    if (Array.isArray(styleDefinition)) {
      style = styleDefinition as Style;
    } else {
      const objectDefinition = styleDefinition as Record<string, StyleDefinition<unknown, Attributes>>;
      if (!containsFunction(objectDefinition)) {
        const cached = resolvedStaticStyleCache.get(objectDefinition as object);
        if (cached) return cached as Style;
      }
      const resolved: Record<string, unknown> = {};
      for (const key in objectDefinition) {
        resolved[key] = resolveStyleDefinition(objectDefinition[key], attributes);
      }
      style = resolved as Style;
      if (!containsFunction(objectDefinition)) resolvedStaticStyleCache.set(objectDefinition as object, style);
    }
  } else {
    style = styleDefinition;
  }
  return style;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeStyleValues<Style>(base: Style, next: Style): Style {
  if (isPlainObject(base) && isPlainObject(next)) {
    const merged: Record<string, unknown> = { ...base };
    for (const key in next) {
      const nextValue = next[key];
      // 只对普通对象做递归合并；数组/原始值直接覆盖，避免 deepmerge 的额外分配和数组拼接语义。
      merged[key] = key in merged ? mergeStyleValues(merged[key] as never, nextValue as never) : nextValue;
    }
    return merged as Style;
  }
  return next;
}

/**
 * 把 默认 → 基础 → 状态 三层解析合并为最终样式对象。
 * 样式定义在任意嵌套层级都可能是部分对象或函数，故先解析，再只合并我们关心的具体值。
 */
export function resolveStyleDefinitions<Style, Attributes>(styleDefinitions: (StyleDefinition<Style, Attributes> | undefined)[], attributes: Attributes): Style {
  const styles = styleDefinitions.filter((x): x is StyleDefinition<Style, Attributes> => !!x).map(styleDefinition => resolveStyleDefinition(styleDefinition, attributes));
  if (styles.length === 0) return {} as Style;
  let merged = styles[0];
  for (let i = 1; i < styles.length; i++) {
    merged = mergeStyleValues(merged, styles[i]);
  }
  return merged;
}

export function sameNodeStyle(a: NodeStyle | undefined, b: NodeStyle): boolean {
  return (
    !!a &&
    a.size === b.size &&
    a.color === b.color &&
    a.alpha === b.alpha &&
    a.border.width === b.border.width &&
    a.border.color === b.border.color &&
    a.icon.content === b.icon.content &&
    a.icon.type === b.icon.type &&
    a.icon.fontFamily === b.icon.fontFamily &&
    a.icon.fontSize === b.icon.fontSize &&
    a.icon.fontWeight === b.icon.fontWeight &&
    a.icon.align === b.icon.align &&
    a.icon.color === b.icon.color &&
    a.icon.stroke === b.icon.stroke &&
    a.icon.strokeThickness === b.icon.strokeThickness &&
    a.label.content === b.label.content &&
    a.label.type === b.label.type &&
    a.label.fontFamily === b.label.fontFamily &&
    a.label.fontSize === b.label.fontSize &&
    a.label.fontWeight === b.label.fontWeight &&
    a.label.align === b.label.align &&
    a.label.color === b.label.color &&
    a.label.stroke === b.label.stroke &&
    a.label.strokeThickness === b.label.strokeThickness &&
    a.label.backgroundColor === b.label.backgroundColor &&
    a.label.padding === b.label.padding
  );
}

export function sameEdgeStyle(a: EdgeStyle | undefined, b: EdgeStyle): boolean {
  return (
    !!a &&
    a.width === b.width &&
    a.color === b.color &&
    a.alpha === b.alpha &&
    a.selefLoop.radius === b.selefLoop.radius &&
    a.selefLoop.cross === b.selefLoop.cross &&
    a.gap === b.gap &&
    a.curve.enabled === b.curve.enabled &&
    a.curve.curvature === b.curve.curvature &&
    a.curve.segments === b.curve.segments &&
    a.arrow.show === b.arrow.show &&
    a.arrow.size === b.arrow.size &&
    a.label.content === b.label.content &&
    a.label.type === b.label.type &&
    a.label.fontFamily === b.label.fontFamily &&
    a.label.fontSize === b.label.fontSize &&
    a.label.fontWeight === b.label.fontWeight &&
    a.label.align === b.label.align &&
    a.label.color === b.label.color &&
    a.label.stroke === b.label.stroke &&
    a.label.strokeThickness === b.label.strokeThickness &&
    a.label.backgroundColor === b.label.backgroundColor &&
    a.label.padding === b.label.padding &&
    a.label.parallel === b.label.parallel
  );
}
