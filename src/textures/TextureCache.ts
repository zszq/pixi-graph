import { Assets, Container, Graphics, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { textToPixi, type TextStyle, type TextType } from '../utils/text';

/**
 * Caches generated textures by a string key so repeated node/edge styles share
 * a single GPU texture. Textures are rendered at 2x renderer resolution for
 * crisp output when zoomed in.
 */
export class TextureCache {
  private readonly renderer: Renderer;
  private readonly textures = new Map<string, Texture>();
  private readonly pending = new Map<string, Promise<Texture>>();

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  get(key: string, create: () => Container, explicitFrame?: Rectangle): Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      const container = create();
      // 显式 frame 用于固定裁剪区域（如圆形图标，避免 cover 缩放后长边溢出撑大纹理）；
      // 缺省时按内容包围盒取整。
      let frame = explicitFrame;
      if (!frame) {
        const region = container.getLocalBounds();
        frame = new Rectangle(Math.floor(region.x), Math.floor(region.y), Math.ceil(region.width), Math.ceil(region.height));
      }
      texture = this.renderer.generateTexture({
        target: container,
        frame,
        resolution: this.renderer.resolution * 2,
        antialias: true
      });
      container.destroy({ children: true });
      this.textures.set(key, texture);
    }
    return texture;
  }

  getOnly(key: string): Texture | undefined {
    return this.textures.get(key);
  }

  getText(key: string, type: TextType, content: string, style: TextStyle): Texture {
    return this.get(key, () => textToPixi(type, content, style));
  }

  loadCircularImage(key: string, url: string, radius: number): Promise<Texture> {
    const cached = this.textures.get(key);
    if (cached) return Promise.resolve(cached);
    return this.getAsync(
      key,
      async () => {
        const raw = await Assets.load<Texture>(url);
        const diameter = radius * 2;
        const container = new Container();
        const sprite = new Sprite(raw);
        sprite.anchor.set(0.5);
        const minSide = Math.min(raw.width, raw.height) || diameter;
        sprite.scale.set(diameter / minSide);
        const mask = new Graphics();
        mask.circle(0, 0, radius).fill(0xffffff);
        sprite.mask = mask;
        container.addChild(sprite, mask);
        return container;
      },
      new Rectangle(-radius, -radius, radius * 2, radius * 2)
    );
  }

  getAsync(key: string, create: () => Promise<Container>, explicitFrame?: Rectangle): Promise<Texture> {
    const texture = this.textures.get(key);
    if (texture) return Promise.resolve(texture);

    const pending = this.pending.get(key);
    if (pending) return pending;

    const promise = create()
      .then(container => this.get(key, () => container, explicitFrame))
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  set(key: string, texture: Texture): void {
    this.textures.set(key, texture);
  }

  has(key: string): boolean {
    return this.textures.has(key);
  }

  delete(key: string): void {
    const texture = this.textures.get(key);
    if (!texture) return;
    texture.destroy(true);
    this.textures.delete(key);
  }

  clear(): void {
    this.pending.clear();
    for (const key of Array.from(this.textures.keys())) {
      this.delete(key);
    }
  }

  destroy(): void {
    this.clear();
  }
}
