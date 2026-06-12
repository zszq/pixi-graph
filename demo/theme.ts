// 主题切换：默认深色「星图」，可选亮色「晨雾」。
// 页面 UI 的颜色靠 CSS 变量即可瞬时切换，但图侧的节点/边颜色会烘焙进纹理缓存、
// 实例也没有热更样式的公开 API，故与渲染分辨率一样走
// 「URL 参数 + 重载页面重建实例」的方式，保证两套主题各自干净完整。
export type ThemeName = 'dark' | 'light';

/** 从 URL ?theme= 解析主题；缺省或非法值落回深色。 */
export function resolveTheme(): ThemeName {
  return new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';
}

/** 绑定控制台的主题切换按钮：高亮当前态，点击后带 ?theme= 参数重载页面。 */
export function bindThemeToggle() {
  const btn = document.getElementById('toggle-theme') as HTMLButtonElement;
  const light = resolveTheme() === 'light';
  btn.classList.toggle('on', light);
  const state = btn.querySelector('.state');
  if (state) state.textContent = light ? 'ON' : 'OFF';
  btn.addEventListener('click', () => {
    // 深色是缺省态，回到深色时直接删参数，保持 URL 干净
    const url = new URL(location.href);
    if (light) url.searchParams.delete('theme');
    else url.searchParams.set('theme', 'light');
    location.href = url.toString();
  });
}
