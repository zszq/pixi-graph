import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Texture } from '@pixi/core';
import { Text } from '@pixi/text';

interface WatermarkOption {
  type: string,
  content: string,
  cover: boolean,
  position: {x: number, y: number},
  rotation: number,
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: any;
    color: string;
  },
}

export function makeWatermark(containerWidth: number, containerHeight: number, option: WatermarkOption) {
  // console.log('makeWatermark', option);
  const watermark = new Container();
  if (option.type === 'IMAGE') {
    const imageSprite = makeImageWatermark(option);
    if (option.cover) {
      const imageSprites = coverScreen(containerWidth, containerHeight, imageSprite, option);
      watermark.addChild(...imageSprites);
    } else {
      watermark.addChild(imageSprite);
    }
  } else if (option.type === 'TEXT') {
    const textSprite = makeTextWatermark(option);
    if (option.cover) {
      const textSprites = coverScreen(containerWidth, containerHeight, textSprite, option);
      watermark.addChild(...textSprites);
    } else {
      watermark.addChild(textSprite);
    }
  }
  
  return watermark;
}

function makeImageWatermark(option: WatermarkOption) {
  const watermarkTexture = Texture.from(option.content);
  const watermarkSprite = new Sprite(watermarkTexture);
  watermarkSprite.anchor.set(0.5);
  watermarkSprite.rotation = option.rotation;
  // cover为true时均匀铺满全屏，position无效
  if (!option.cover) {
    watermarkSprite.x = option.position.x;
    watermarkSprite.y = option.position.y;
  }
  return watermarkSprite;
}

function makeTextWatermark(option: WatermarkOption) {
  const styleDefault = {
    fontFamily: 'Arial',
    fontSize: 26,
    fontWeight: 'normal',
    color: 'black',
  }
  option.style = Object.assign(styleDefault, option.style);
  const watermarkText = new Text(option.content, {
    fontFamily: option.style.fontFamily ,
    fontSize: option.style.fontSize,
    fontWeight: option.style.fontWeight,
    fill: option.style.color,
  });
  watermarkText.anchor.set(0.5);
  watermarkText.rotation = option.rotation;
  // cover为true时均匀铺满全屏，position无效
  if (!option.cover) {
    watermarkText.x = option.position.x;
    watermarkText.y = option.position.y;
  }
  return watermarkText;
}

function coverScreen(containerWidth: number, containerHeight: number, sprite: Sprite, option: WatermarkOption) {
  let spriteWidth = sprite.width;
  let spriteHeight = sprite.height;
  let texture = sprite.texture;
  let sprites = [];
  // TODO:必须读取精灵的宽高之后精灵的纹理才能使用？？？
  for (let i = 0; i < 9; i++) {
    const sprite = new Sprite(texture);
    // sprite.anchor.set(0.5);
    let x = containerWidth/3 * (i % 3) + (containerWidth/3) / 2;
    let y = containerHeight/3 * Math.floor(i/3) + (containerHeight/3) / 2;
    sprite.rotation = option.rotation;
    // cover为true时均匀铺满全屏，position无效
    if (!option.cover) {
      sprite.x = option.position.x;
      sprite.y = option.position.y;
    }
    // sprite.x = x;
    // sprite.y = y;
    sprite.x = x - spriteWidth / 2;
    sprite.y = y - spriteHeight / 2;
    sprites.push(sprite);
  }
  
  return sprites;
}
