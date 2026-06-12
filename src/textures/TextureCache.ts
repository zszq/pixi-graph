import { Assets, Container, Graphics, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { textToPixi, type TextStyle, type TextType } from '../utils/text';

/**
 * 纹理缓存（what）：按字符串 key 缓存"渲染一次得到的 Texture"，让外观相同的节点/边/标签复用同
 * 一张 GPU 纹理，再以 Sprite/Particle 绘制。纹理以渲染器 2× 分辨率生成，放大时仍清晰。
 *
 * why：成千上万个节点若各自用 Graphics 实时绘制，CPU/GPU 都扛不住；"先烘焙成纹理、再批量贴图"
 * 是本库高性能的基础。**关键约定**：调用方拼 key 时必须囊括每一个影响外观的样式属性（尺寸、
 * 颜色、描边宽度、字体、文本内容、图片 URL 等），否则会错误复用到过期纹理（如改了颜色却命中旧
 * 缓存）。文本/图片各唯一时纹理无法复用，是大图创建的主要成本——见 PixiNode 的标签懒加载。
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

  // 异步纹理（如需先下载图片再烘焙）。维护 pending：同一 key 的多个节点会几乎同时请求，
  // 用 in-flight Promise 去重，避免同一张图片被并发下载/烘焙多次。
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
