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

// 水印特性（what）：构建一个文字或图片水印 Container。cover=true 时按 row×column 平铺铺满画布，
// 否则只在 position 处放单个。由 PixiGraph 加到 stage 的水印层（不随平移缩放移动，见 GraphLayers）。
// why 做成纯构建函数：无状态、易测试；平铺/单点、文字/图片的分支都收敛在这里，调用方只管增删容器。
/** 构建水印容器，可选平铺以覆盖整个视口。 */
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

// 平铺铺满：把画布按 row×column 等分网格，每格中心放一个水印贴片。why 用网格中心而非左上角：
// 让水印分布均匀、边缘留白对称，覆盖更自然。
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
