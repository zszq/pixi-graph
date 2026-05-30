import { Container, Rectangle, Texture, type Renderer } from 'pixi.js';

/**
 * Caches generated textures by a string key so repeated node/edge styles share
 * a single GPU texture. Textures are rendered at 2x renderer resolution for
 * crisp output when zoomed in.
 */
export class TextureCache {
  private readonly renderer: Renderer;
  private readonly textures = new Map<string, Texture>();

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
    for (const key of Array.from(this.textures.keys())) {
      this.delete(key);
    }
  }

  destroy(): void {
    this.clear();
  }
}
