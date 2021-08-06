import deepmerge from 'deepmerge';
import { BaseNodeAttributes, BaseEdgeAttributes } from '../attributes';
import { TextType } from './text';

export interface GraphStyle {
  node: {
    size: number;
    color: string;
    shape: string
    border: {
      width: number;
      color: string;
    };
    icon: {
      content: string;
      type: TextType;
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      color: string;
    };
    label: {
      content: string;
      type: TextType;
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      color: string;
      backgroundColor: string;
      padding: number;
    };
  };
  edge: {
    width: number;
    color: string;
    selefLoop: {
      radius: number,
      cross: number
    },
    gap: number,
    bilateralKey: string,
    arrow: {
      show: boolean,
      size: number
    },
    label: {
      type: TextType.TEXT,
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: string,
      content: '',
      color: '#333333',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4
    }
  };
}

export type NodeStyle = GraphStyle['node'];
export type EdgeStyle = GraphStyle['edge'];

export type StyleDefinition<Style, Attributes> =
  ((attributes: Attributes) => Style) |
  {[Key in keyof Style]?: StyleDefinition<Style[Key], Attributes>} |
  Style;

export type NodeStyleDefinition<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes> = StyleDefinition<NodeStyle, NodeAttributes>;
export type EdgeStyleDefinition<EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> = StyleDefinition<EdgeStyle, EdgeAttributes>;

export interface GraphStyleDefinition<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  node?: NodeStyleDefinition<NodeAttributes>;
  edge?: EdgeStyleDefinition<EdgeAttributes>;
}

export function resolveStyleDefinition<Style, Attributes>(styleDefinition: StyleDefinition<Style, Attributes>, attributes: Attributes): Style {
  let style: Style;
  if (styleDefinition instanceof Function) {
    style = styleDefinition(attributes);
  } else if (typeof styleDefinition === 'object' && styleDefinition !== null) {
    style = Object.fromEntries(
      Object.entries(styleDefinition).map(([key, styleDefinition]) => {
        return [key, resolveStyleDefinition(styleDefinition, attributes)];
      })
    ) as Style;
  } else {
    style = styleDefinition;
  }
  return style;
}

export function resolveStyleDefinitions<Style, Attributes>(styleDefinitions: (StyleDefinition<Style, Attributes> | undefined)[], attributes: Attributes): Style {
  const styles = styleDefinitions.filter(x => !!x).map(styleDefinition => resolveStyleDefinition(styleDefinition!, attributes));
  const style = deepmerge.all<Style>(styles);
  return style;
}