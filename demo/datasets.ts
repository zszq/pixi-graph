// 不同规模的测试数据集，对应右上角切换按钮。
export const DATASETS = [
  { key: 'data-50-100', label: '50点100边' },
  { key: 'data-1000-2000', label: '1000点2000边' },
  { key: 'data-10000-20000', label: '10000点20000边' },
  { key: 'data-50000-100000', label: '50000点100000边' },
  { key: 'data-50000-100000-noicon', label: '50000点100000边(无图)' },
  { key: 'data-star-1-5000', label: '星形1中心5000边' }
];

// 从 URL ?data= 读取数据集，缺省用指定值；非法值回退到默认数据集。
export function resolveActiveKey(defaultKey = DATASETS[0].key): string {
  const requested = new URLSearchParams(location.search).get('data');
  return DATASETS.some(d => d.key === requested) ? requested! : defaultKey;
}

// 渲染数据集切换按钮，点击后带 ?data= 参数重载页面（切换数据需重建实例，重载最稳妥）。
export function renderDatasetButtons(activeKey: string) {
  const panel = document.getElementById('datasets')!;
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = '测试数据';
  panel.appendChild(title);
  DATASETS.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (key === activeKey) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('data', key);
      location.href = url.toString();
    });
    panel.appendChild(btn);
  });
}
