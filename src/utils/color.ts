import rgba from 'color-rgba';

// 颜色解析缓存。why：colorToPixi 在样式刷新/批量边重建等热路径被大量调用，而颜色串种类有限；
// 缓存解析结果避免重复跑 color-rgba。上限 256 + 删最旧键，防止用函数生成大量唯一色时无限增长。
const COLOR_CACHE_LIMIT = 256;
const colorCache = new Map<string, [tint: number, alpha: number]>();

/**
 * 把任意 CSS 颜色字符串（命名色、hex、rgb(a)、hsl(a)）解析为 PIXI 的 tint 数值
 * 与 alpha 值，可直接赋给 `sprite.tint` / `sprite.alpha`。
 */
export function colorToPixi(color: string): [tint: number, alpha: number] {
  const cached = colorCache.get(color);
  if (cached) return cached;

  const rgbaColor = rgba(color);
  if (!rgbaColor || rgbaColor.length < 3) {
    throw new Error(`Invalid color ${color}`);
  }
  const [r = 0, g = 0, b = 0, alpha = 1] = rgbaColor;
  const tint = (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b);
  const value: [number, number] = [tint, alpha];

  if (colorCache.size >= COLOR_CACHE_LIMIT) {
    const oldestKey = colorCache.keys().next().value;
    if (oldestKey !== undefined) colorCache.delete(oldestKey);
  }
  colorCache.set(color, value);
  return value;
}
