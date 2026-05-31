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
      color: string; // fill
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
      color: string; // fill
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

const resolvedStaticStyleCache = new WeakMap<object, unknown>();

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const key in value as Record<string, unknown>) {
    if (containsFunction((value as Record<string, unknown>)[key])) return true;
  }
  return false;
}

/** Recursively resolve a (possibly function/partial) style definition against an element's attributes. */
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
 * Resolve defaults → base → state into a final style object.
 * The style definition can be partial or functional at any nesting level, so we resolve first,
 * then merge only the concrete values we care about.
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
