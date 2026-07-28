import { getCanvasFilterString } from "./presets";

// Calcula o tamanho de saída aplicando o resize opcional (mantém proporção;
// nunca amplia). Sem resize.enabled, devolve a resolução nativa.
export function targetSize(natW, natH, resize) {
  let w = natW;
  let h = natH;
  const maxW = resize?.enabled && resize.maxWidth ? Number(resize.maxWidth) : Infinity;
  const maxH = resize?.enabled && resize.maxHeight ? Number(resize.maxHeight) : Infinity;
  if (maxW < Infinity || maxH < Infinity) {
    const ratio = Math.min(maxW / w, maxH / h, 1);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  return { w, h };
}

// Aplica filtro + desenha a fonte + a marca d'água num contexto 2D. Funciona
// tanto num CanvasRenderingContext2D (main thread) quanto num
// OffscreenCanvasRenderingContext2D (worker). `source` pode ser
// HTMLImageElement, ImageBitmap, etc. `w`/`h` são as dimensões do canvas.
export function paint(ctx, source, w, h, settings, watermark) {
  ctx.filter = getCanvasFilterString(settings);
  ctx.drawImage(source, 0, 0, w, h);
  ctx.filter = "none";

  if (watermark?.enabled && watermark.text) {
    const fontSize = Math.max(8, (watermark.size / 100) * Math.min(w, h) * 0.15);
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = watermark.color;
    ctx.globalAlpha = watermark.opacity / 100;
    ctx.textBaseline = "middle";
    const pad = fontSize * 0.6;
    const tw = ctx.measureText(watermark.text).width;
    let x = pad;
    let y = pad + fontSize / 2;
    switch (watermark.position) {
      case "top-left":
        x = pad;
        y = pad + fontSize / 2;
        break;
      case "top-right":
        x = w - tw - pad;
        y = pad + fontSize / 2;
        break;
      case "center":
        x = (w - tw) / 2;
        y = h / 2;
        break;
      case "bottom-left":
        x = pad;
        y = h - pad - fontSize / 2;
        break;
      case "bottom-right":
        x = w - tw - pad;
        y = h - pad - fontSize / 2;
        break;
      default:
        break;
    }
    ctx.fillText(watermark.text, x, y);
    ctx.globalAlpha = 1;
  }
}
