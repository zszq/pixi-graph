import { IRenderer } from '@pixi/core';
import { Container } from '@pixi/display';
import { Texture } from '@pixi/core';
import { Rectangle } from '@pixi/core';
import { MSAA_QUALITY } from '@pixi/core';

export class TextureCache {
  renderer: IRenderer;

  private textures = new Map<string, Texture>();

  constructor(renderer: IRenderer) {
    this.renderer = renderer;
  }

  get(key: string, defaultCallback: () => Container): Texture {
    let texture = this.textures.get(key)!;
    if (!texture) {
      const container = defaultCallback();
      const region = container.getLocalBounds(undefined, true);
      const roundedRegion = new Rectangle(Math.floor(region.x), Math.floor(region.y), Math.ceil(region.width), Math.ceil(region.height));
      texture = this.renderer.generateTexture(container, {
        region: roundedRegion,
        resolution: this.renderer.resolution,
        multisample: MSAA_QUALITY.LOW
      });
      this.textures.set(key, texture);
    }
    return texture;
  }

  getOnly(key: string) {
    return this.textures.get(key);
  }

  set(key: string, texture: Texture) {
    this.textures.set(key, texture);
  }

  has(key: string) {
    let texture = this.textures.get(key);
    return texture ? true : false;
  }

  delete(key: string) {
    const texture = this.textures.get(key);
    if (!texture) {
      return;
    }

    texture.destroy();
    this.textures.delete(key);
  }

  clear() {
    Array.from(this.textures.keys()).forEach(key => {
      this.delete(key);
    });
  }

  destroy() {
    this.clear();
  }
}
