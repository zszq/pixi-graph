import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Graphics } from '@pixi/graphics';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { NodeStyle } from '../utils/style';
import { textToPixi } from '../utils/text';
import { TextureCache } from '../texture-cache';
import { arrayComplement } from '../utils/tools'

const DELIMITER = '::';
const WHITE = 0xffffff;

const NODE_ATTACH = 'NODE_ATTACH';
const NODE_ATTACH_TEXT = 'NODE_ATTACH_TEXT';

export function updateNodeAttachGroup(nodeAttachGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache) {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
  let group = nodeStyle.attach.group;
  let childrens = nodeAttachGfx.children;
  let oldGroup: number[] = [];

  childrens.forEach(sprite => {
    let nodeAttach = sprite.name && sprite.name.slice(0, -2);
    if (nodeAttach === NODE_ATTACH) {
      let name = sprite.name && sprite.name.slice(-1);
      oldGroup.push(Number(name));
    }
  })
  let diffGroup = arrayComplement(group, oldGroup);
  
  if (diffGroup.length > 0) {
    nodeAttachGfx.removeChildren(0);

    group.forEach((g, i) => {
      const nodeAttachTextTextureKey = [`${NODE_ATTACH_TEXT}_${g}`, nodeStyle.attach.text.fontFamily, nodeStyle.attach.text.fontSize, nodeStyle.attach.text.fontWeight].join(DELIMITER);
      const nodeAttachTextTexture = textureCache.get(nodeAttachTextTextureKey, () => {
        const text = textToPixi(nodeStyle.attach.text.type, g, {
          fontFamily: nodeStyle.attach.text.fontFamily,
          fontSize: nodeStyle.attach.text.fontSize,
          fontWeight: nodeStyle.attach.text.fontWeight
        });
        return text;
      });

      const nodeAttachTextureKey = [NODE_ATTACH, nodeStyle.attach.size].join(DELIMITER);
      const nodeCircleTexture = textureCache.get(nodeAttachTextureKey, () => {
        const graphics = new Graphics();
        graphics.beginFill(WHITE);
        if (nodeStyle.attach.shape === 'circle') {
          graphics.drawCircle(0, 0, nodeStyle.attach.size);
        }
        if (nodeStyle.attach.shape === 'rect') {
          graphics.drawRoundedRect(0, 0, nodeStyle.attach.size, nodeStyle.attach.size, 3);
        }
        return graphics;
      });

      // nodeAttachGfx -> nodeAttach
      const nodeAttach = new Sprite();
      nodeAttach.name = `${NODE_ATTACH}_${g}`;
      nodeAttach.anchor.set(0.5);
      nodeAttach.texture = nodeCircleTexture;
      nodeAttach.x = setAttachItemX(group, i, nodeStyle.attach.size, nodeStyle.attach.colGap);
      nodeAttach.y = setAttachItemY(nodeOuterSize, group, i, nodeStyle.attach.size, nodeStyle.attach.crevice, nodeStyle.attach.rowGap);
      [nodeAttach.tint, nodeAttach.alpha] = colorToPixi(nodeStyle.attach.colors[g]);
      nodeAttachGfx.addChild(nodeAttach);

      // nodeAttachGfx -> nodeAttachText
      const nodeAttachText = new Sprite();
      nodeAttachText.name = `${NODE_ATTACH_TEXT}_${g}`;
      nodeAttachText.anchor.set(0.5);
      nodeAttachText.texture = nodeAttachTextTexture;
      nodeAttachText.x = setAttachItemX(group, i, nodeStyle.attach.size, nodeStyle.attach.colGap);
      nodeAttachText.y = setAttachItemY(nodeOuterSize, group, i, nodeStyle.attach.size, nodeStyle.attach.crevice, nodeStyle.attach.rowGap);
      [nodeAttachText.tint, nodeAttachText.alpha] = colorToPixi(nodeStyle.attach.text.color);
      nodeAttachGfx.addChild(nodeAttachText);
    })
  }

  // 设置x坐标
  function setAttachItemX(group: any, i: number, size: number, colGap: number): number {
    let x = 0;
    let len = 0;
    if (group.length > 5) { // 两行
      len = (size + colGap) * 5 - colGap; // -colGap为减去最后一个间隔
    } else { // 一行
      len = (size + colGap) * group.length - colGap; // -colGap为减去最后一个间隔
    }
    if (i >= 5) { // 两行
      x = (size + colGap) * (i - 5) - (len / 2) + (size / 2); // (size / 2)图形的一半才是坐标点
    } else { // 一行
      x = (size + colGap) * i - (len / 2) + (size / 2);
    }
    return x;
  }
  // 设置y坐标
  function setAttachItemY(nodeOuterSize: number, group: any, i: number, size: number, crevice: number, rowGap: number): number {
    let y = 0;
    if (group.length > 5 && i < 5) { // 两行
      y = -nodeOuterSize - size / 2 - crevice - size - rowGap;
    } else { // 一行
      y = -nodeOuterSize - size / 2 - crevice;
    }
    return y;
  }
}

export function updateNodeAttachVisibility(nodeAttachGfx: Container, zoomStep: number) {
  let childrens = nodeAttachGfx.children;
  childrens.forEach(sprite => {
    sprite.visible = sprite.visible && zoomStep >= 2;
  })
}
