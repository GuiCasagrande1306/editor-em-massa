// Worker de exportação: recebe um ImageBitmap (transferido, zero-copy), aplica
// filtros + resize + marca d'água num OffscreenCanvas e codifica o Blob final
// FORA do main thread. Assim o encode de fotos gigantes (5328×4000) não bloqueia
// a UI — a barra de progresso continua a 60fps.
import { targetSize, paint } from "./renderShared";

self.onmessage = async (e) => {
  const { id, bitmap, settings, resize, watermark, type, quality } = e.data;
  try {
    const { w, h } = targetSize(bitmap.width, bitmap.height, resize);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    paint(ctx, bitmap, w, h, settings, watermark);
    const blob = await canvas.convertToBlob(
      quality != null ? { type, quality } : { type }
    );
    if (bitmap.close) bitmap.close(); // libera o bitmap na hora
    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
