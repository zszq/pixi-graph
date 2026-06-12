// 渲染分辨率切换：对比 GraphOptions.resolution 在不同取值下的清晰度与性能。
// resolution 在 PixiGraph 初始化时即固定，无法热切换，故与数据集一样走
// 「URL 参数 + 重载页面重建实例」的方式，保证两次渲染环境干净可比。
const OPTIONS = [
  { key: '', label: '默认 max(dpr, 2)' },
  { key: 'dpr', label: `设备 dpr (${window.devicePixelRatio})` },
  { key: '1', label: '1×' },
  { key: '1.5', label: '1.5×' },
  { key: '2', label: '2×' }
];

// 限制在 0.5~4：过低没有意义，过高在 4K 屏上会撑爆填充率/显存。
function parseResolution(raw: string): number | undefined {
  if (raw === 'dpr') return window.devicePixelRatio || 1;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0.5 && value <= 4 ? value : undefined;
}

/** 从 URL ?resolution= 解析渲染分辨率；缺省或非法时返回 undefined（走库默认值）。 */
export function resolveResolution(): number | undefined {
  const raw = new URLSearchParams(location.search).get('resolution');
  if (raw === null || raw === '') return undefined;
  return parseResolution(raw);
}

/** 在数据集面板下方注入分辨率切换按钮，点击后带 ?resolution= 参数重载页面。 */
export function renderResolutionButtons() {
  const panel = document.getElementById('datasets')!;
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = '渲染分辨率';
  panel.appendChild(title);

  // 非法参数与缺省同样落在「默认」档，让高亮与实际生效值一致。
  const raw = new URLSearchParams(location.search).get('resolution') ?? '';
  const activeKey = raw !== '' && parseResolution(raw) !== undefined ? raw : '';

  OPTIONS.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = key === '' ? '不传 resolution，使用库默认 max(devicePixelRatio, 2)' : `PixiGraph.create({ resolution: ${parseResolution(key)} })`;
    if (key === activeKey) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const url = new URL(location.href);
      if (key === '') url.searchParams.delete('resolution');
      else url.searchParams.set('resolution', key);
      location.href = url.toString();
    });
    panel.appendChild(btn);
  });
}
