import { Container, Sprite, Texture, Text } from 'pixi.js';
import type { FontWeight } from '../../utils/text';

export interface WatermarkOption {
  type: 'TEXT' | 'IMAGE' | string;
  content: string;
  cover: boolean;
  row: number;
  column: number;
  position: { x: number; y: number };
  rotation: number;
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: FontWeight;
    color: string;
  };
}

/** Build a watermark container, optionally tiled to cover the whole viewport. */
export function makeWatermark(containerWidth: number, containerHeight: number, option: WatermarkOption): Container {
  const watermark = new Container();

  let makeTile: (() => Container) | undefined;
  if (option.type === 'IMAGE' && option.content) {
    makeTile = () => makeImageWatermark(option);
  } else if (option.type === 'TEXT') {
    makeTile = () => makeTextWatermark(option);
  }
  if (!makeTile) return watermark;

  if (option.cover) {
    watermark.addChild(...coverScreen(containerWidth, containerHeight, option, makeTile));
  } else {
    const tile = makeTile();
    tile.x = option.position.x;
    tile.y = option.position.y;
    watermark.addChild(tile);
  }

  return watermark;
}

function makeImageWatermark(option: WatermarkOption): Sprite {
  const sprite = new Sprite(Texture.from(option.content));
  sprite.anchor.set(0.5);
  sprite.rotation = option.rotation;
  return sprite;
}

function makeTextWatermark(option: WatermarkOption): Text {
  const style = option.style ?? ({} as WatermarkOption['style']);
  const text = new Text({
    text: option.content,
    style: {
      fontFamily: style.fontFamily ?? 'Arial',
      fontSize: style.fontSize ?? 26,
      fontWeight: style.fontWeight ?? 'normal',
      fill: style.color ?? 'black'
    }
  });
  text.anchor.set(0.5);
  text.rotation = option.rotation;
  return text;
}

function coverScreen(containerWidth: number, containerHeight: number, option: WatermarkOption, makeTile: () => Container): Container[] {
  const row = option.row || 5;
  const column = option.column || 6;
  const tiles: Container[] = [];

  for (let i = 0; i < row; i++) {
    for (let j = 0; j < column; j++) {
      const tile = makeTile();
      tile.x = (containerWidth / column) * j + containerWidth / column / 2;
      tile.y = (containerHeight / row) * i + containerHeight / row / 2;
      tiles.push(tile);
    }
  }

  return tiles;
}
