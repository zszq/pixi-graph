// 右下角控件：缩放、水印开关、导出 PNG。
import type { PixiGraph } from 'pixi-graph';
import type { EdgeAttrs, NodeAttrs } from './types';

export function bindControls(pixiGraph: PixiGraph<NodeAttrs, EdgeAttrs>) {
  document.getElementById('zoom-in')!.addEventListener('click', () => pixiGraph.zoomIn());
  document.getElementById('zoom-out')!.addEventListener('click', () => pixiGraph.zoomOut());

  let watermarkName: string | undefined;
  document.getElementById('watermark')!.addEventListener('click', () => {
    if (watermarkName) {
      pixiGraph.clearWatermark();
      watermarkName = undefined;
    } else {
      watermarkName = pixiGraph.createWatermark({
        type: 'TEXT',
        content: 'pixi-graph',
        cover: true,
        row: 5,
        column: 6,
        position: { x: 0, y: 0 },
        rotation: -Math.PI / 8,
        style: { fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal', color: 'rgba(0,0,0,0.12)' }
      });
    }
  });

  document.getElementById('extract')!.addEventListener('click', async () => {
    const dataUrl = await pixiGraph.extract();
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'pixi-graph.png';
    link.click();
  });
}
