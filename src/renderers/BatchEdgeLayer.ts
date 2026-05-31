import { Container, Graphics, Particle, ParticleContainer, Texture, type Renderer } from 'pixi.js';
import type { AbstractGraph } from 'graphology-types';
import { DEFAULT_STYLE } from '../core/constants';
import type { BaseEdgeAttributes, BaseNodeAttributes } from '../types/attributes';
import type { EdgeStyle, GraphStyleDefinition, NodeStyle } from '../style/style';
import { resolveStyleDefinitions } from '../style/style';
import { colorToPixi } from '../utils/color';
import type { PixiEdge } from '../elements/PixiEdge';
import type { PixiNode } from '../elements/PixiNode';

interface EdgeParticlePair {
  line: Particle;
  arrow: Particle | undefined;
}

/**
 * Large-graph edge layer backed by two ParticleContainers. It follows the
 * sigma/G6-style split: interaction/labels stay on normal objects, while the
 * dense visible edge strokes are collapsed into GPU-friendly contiguous
 * particle buffers.
 */
export class BatchEdgeLayer<
  NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes,
  EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes
> extends Container {
  private readonly graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  private readonly style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  private readonly nodes: Map<string, PixiNode>;
  private readonly edges: Map<string, PixiEdge>;
  private readonly edgeParticles = new Map<string, EdgeParticlePair>();
  private dirty = true;
  private readonly lineLayer = new ParticleContainer({
    texture: Texture.WHITE,
    dynamicProperties: { position: false, rotation: false, vertex: false, uvs: false, color: false },
    roundPixels: true
  });
  private readonly arrowLayer = new ParticleContainer({
    dynamicProperties: { position: false, rotation: false, vertex: false, uvs: false, color: false },
    roundPixels: true
  });
  private arrowTexture: Texture | undefined;

  constructor(options: {
    graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
    style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
    nodes: Map<string, PixiNode>;
    edges: Map<string, PixiEdge>;
  }) {
    super();
    this.graph = options.graph;
    this.style = options.style;
    this.nodes = options.nodes;
    this.edges = options.edges;
    this.eventMode = 'none';
    this.addChild(this.lineLayer, this.arrowLayer);
  }

  markDirty(): void {
    this.dirty = true;
  }

  setZoomStep(zoomStep: number): void {
    const renderable = zoomStep >= 1;
    this.lineLayer.renderable = renderable;
    this.arrowLayer.renderable = renderable;
  }

  rebuild(renderer: Renderer, visibleBounds?: { x: number; y: number; width: number; height: number }): void {
    if (!this.dirty) return;
    const cullBounds = visibleBounds ? padBounds(visibleBounds, 128) : undefined;
    const lines = this.lineLayer.particleChildren as Particle[];
    const arrows = this.arrowLayer.particleChildren as Particle[];
    lines.length = 0;
    arrows.length = 0;
    this.edgeParticles.clear();

    this.graph.forEachEdge((edgeKey, edgeAttributes, sourceKey, targetKey, sourceAttributes, targetAttributes) => {
      const edge = this.edges.get(edgeKey);
      const sourceNode = this.nodes.get(sourceKey);
      const targetNode = this.nodes.get(targetKey);
      if (!edge || !sourceNode || !targetNode || edge.isSelfLoop || edge.hovered || !edge.isVisible()) return;

      if (cullBounds && !segmentIntersectsRect(sourceAttributes, targetAttributes, cullBounds)) return;

      const edgeStyle = edge.edgeStyle ?? resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, undefined], edgeAttributes);
      const geometry = computeEdgeGeometry(
        { x: sourceAttributes.x, y: sourceAttributes.y },
        { x: targetAttributes.x, y: targetAttributes.y },
        edgeStyle,
        sourceNode.nodeStyle,
        targetNode.nodeStyle,
        edge.isBilateral
      );
      if (geometry.lineLength <= 0 || edgeStyle.width <= 0) return;

      const [tint, colorAlpha] = colorToPixi(edgeStyle.color);
      const alpha = colorAlpha * edgeStyle.alpha;
      const line = new Particle({
        texture: Texture.WHITE,
        x: geometry.lineX,
        y: geometry.lineY,
        scaleX: edgeStyle.width,
        scaleY: geometry.lineLength,
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: geometry.lineRotation,
        tint,
        alpha
      });
      lines.push(line);

      let arrow: Particle | undefined;
      if (edgeStyle.arrow.show && edgeStyle.arrow.size > 0) {
        const texture = this.getArrowTexture(renderer, edgeStyle.arrow.size);
        arrow = new Particle({
          texture,
          x: geometry.arrowX,
          y: geometry.arrowY,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: geometry.arrowRotation,
          tint,
          alpha
        });
        arrows.push(arrow);
      }
      this.edgeParticles.set(edgeKey, { line, arrow });
    });

    this.lineLayer.update();
    this.arrowLayer.update();
    this.dirty = false;
  }

  updateEdge(edgeKey: string): void {
    const pair = this.edgeParticles.get(edgeKey);
    if (!pair) return;
    const edge = this.edges.get(edgeKey);
    if (!edge || !this.graph.hasEdge(edgeKey)) {
      this.dirty = true;
      return;
    }
    const sourceKey = this.graph.source(edgeKey);
    const targetKey = this.graph.target(edgeKey);
    const sourceNode = this.nodes.get(sourceKey);
    const targetNode = this.nodes.get(targetKey);
    if (!sourceNode || !targetNode || edge.isSelfLoop || edge.hovered || !edge.isVisible()) {
      this.dirty = true;
      return;
    }
    const edgeStyle = edge.edgeStyle ?? resolveStyleDefinitions([DEFAULT_STYLE.edge, this.style.edge, undefined], this.graph.getEdgeAttributes(edgeKey));
    const geometry = computeEdgeGeometry(
      this.graph.getNodeAttributes(sourceKey),
      this.graph.getNodeAttributes(targetKey),
      edgeStyle,
      sourceNode.nodeStyle,
      targetNode.nodeStyle,
      edge.isBilateral
    );

    pair.line.x = geometry.lineX;
    pair.line.y = geometry.lineY;
    pair.line.scaleX = edgeStyle.width;
    pair.line.scaleY = geometry.lineLength;
    pair.line.rotation = geometry.lineRotation;
    if (pair.arrow) {
      pair.arrow.x = geometry.arrowX;
      pair.arrow.y = geometry.arrowY;
      pair.arrow.rotation = geometry.arrowRotation;
    }
    this.lineLayer.update();
    this.arrowLayer.update();
  }

  private getArrowTexture(renderer: Renderer, size: number): Texture {
    if (this.arrowTexture) return this.arrowTexture;
    const arrowSize = Math.ceil(size % 2 === 0 ? size : size + 1);
    const graphics = new Graphics().poly([-arrowSize / 2, arrowSize, arrowSize / 2, arrowSize, 0, 0]).fill(0xffffff);
    this.arrowTexture = renderer.generateTexture({ target: graphics });
    graphics.destroy();
    return this.arrowTexture;
  }
}

function computeEdgeGeometry(
  sourceNodePosition: { x: number; y: number },
  targetNodePosition: { x: number; y: number },
  edgeStyle: EdgeStyle,
  sourceNodeStyle: NodeStyle,
  targetNodeStyle: NodeStyle,
  isBilateral: boolean
): {
  lineX: number;
  lineY: number;
  lineRotation: number;
  lineLength: number;
  arrowX: number;
  arrowY: number;
  arrowRotation: number;
} {
  const radian = Math.atan2(targetNodePosition.y - sourceNodePosition.y, targetNodePosition.x - sourceNodePosition.x);
  const rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
  const stLength = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
  const arrowHeight = edgeStyle.arrow.show ? (Math.sqrt(3) / 2) * edgeStyle.arrow.size : 0;
  const lineLength = Math.max(0, stLength - arrowHeight - targetNodeStyle.size - sourceNodeStyle.size - targetNodeStyle.border.width - sourceNodeStyle.border.width);
  const lineLengthHalf = lineLength / 2 + targetNodeStyle.size + arrowHeight + targetNodeStyle.border.width;

  const centerPosition = {
    x: targetNodePosition.x + Math.sin(rotation) * lineLengthHalf,
    y: targetNodePosition.y - Math.cos(rotation) * lineLengthHalf
  };
  if (isBilateral) {
    centerPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    centerPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
  }

  const arrowRadius = targetNodeStyle.size + targetNodeStyle.border.width + (Math.sqrt(3) / 4) * edgeStyle.arrow.size;
  const arrowPosition = { x: targetNodePosition.x - Math.cos(radian) * arrowRadius, y: targetNodePosition.y - Math.sin(radian) * arrowRadius };
  if (isBilateral) {
    arrowPosition.x -= Math.cos(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
    arrowPosition.y -= Math.sin(rotation) * (edgeStyle.gap / 2 + edgeStyle.width);
  }

  return {
    lineX: centerPosition.x,
    lineY: centerPosition.y,
    lineRotation: rotation,
    lineLength,
    arrowX: arrowPosition.x,
    arrowY: arrowPosition.y,
    arrowRotation: radian + Math.PI / 2
  };
}

function padBounds(bounds: { x: number; y: number; width: number; height: number }, padding: number) {
  return {
    left: bounds.x - padding,
    right: bounds.x + bounds.width + padding,
    top: bounds.y - padding,
    bottom: bounds.y + bounds.height + padding
  };
}

function pointInRect(point: { x: number; y: number }, rect: { left: number; right: number; top: number; bottom: number }): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < Number.EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): boolean {
  return b.x <= Math.max(a.x, c.x) && b.x >= Math.min(a.x, c.x) && b.y <= Math.max(a.y, c.y) && b.y >= Math.min(a.y, c.y);
}

function segmentsIntersect(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a1, b1, a2)) return true;
  if (o2 === 0 && pointOnSegment(a1, b2, a2)) return true;
  if (o3 === 0 && pointOnSegment(b1, a1, b2)) return true;
  if (o4 === 0 && pointOnSegment(b1, a2, b2)) return true;
  return false;
}

function segmentIntersectsRect(a: { x: number; y: number }, b: { x: number; y: number }, rect: { left: number; right: number; top: number; bottom: number }): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;

  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomRight = { x: rect.right, y: rect.bottom };
  const bottomLeft = { x: rect.left, y: rect.bottom };

  return (
    segmentsIntersect(a, b, topLeft, topRight) ||
    segmentsIntersect(a, b, topRight, bottomRight) ||
    segmentsIntersect(a, b, bottomRight, bottomLeft) ||
    segmentsIntersect(a, b, bottomLeft, topLeft)
  );
}
