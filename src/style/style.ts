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

/** Recursively resolve a (possibly function/partial) style definition against an element's attributes. */
export function resolveStyleDefinition<Style, Attributes>(styleDefinition: StyleDefinition<Style, Attributes>, attributes: Attributes): Style {
  let style: Style;
  if (styleDefinition instanceof Function) {
    style = styleDefinition(attributes);
  } else if (typeof styleDefinition === 'object' && styleDefinition !== null) {
    if (Array.isArray(styleDefinition)) {
      style = styleDefinition as Style;
    } else {
      const resolved: Record<string, unknown> = {};
      for (const key in styleDefinition) {
        resolved[key] = resolveStyleDefinition((styleDefinition as Record<string, StyleDefinition<unknown, Attributes>>)[key], attributes);
      }
      style = resolved as Style;
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
      merged[key] = key in merged ? mergeStyleValues(merged[key] as never, nextValue as never) : nextValue;
    }
    return merged as Style;
  }
  return next;
}

/** Resolve a chain of style definitions (defaults → base → state) and deep-merge them into a full style. */
export function resolveStyleDefinitions<Style, Attributes>(styleDefinitions: (StyleDefinition<Style, Attributes> | undefined)[], attributes: Attributes): Style {
  const styles = styleDefinitions.filter((x): x is StyleDefinition<Style, Attributes> => !!x).map(styleDefinition => resolveStyleDefinition(styleDefinition, attributes));
  if (styles.length === 0) return {} as Style;
  let merged = styles[0];
  for (let i = 1; i < styles.length; i++) {
    merged = mergeStyleValues(merged, styles[i]);
  }
  return merged;
}
