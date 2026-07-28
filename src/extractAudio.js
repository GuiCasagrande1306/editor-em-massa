// Extrai a faixa de áudio de um vídeo como WAV 16kHz mono usando só a Web Audio
// API — sem dependências e sem carregar o FFmpeg de 32MB. 16kHz mono é o formato
// ideal pro Whisper e ~32KB/s (≈2MB/min), uma fração do vídeo original, evitando
// o limite de 4MB (erro 413) das funções da Vercel.

const TARGET_SR = 16000;

export async function extractAudioFromVideo(file) {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Web Audio API indisponível");
  const ac = new AC();
  let decoded;
  try {
    decoded = await ac.decodeAudioData(buf.slice(0));
  } finally {
    ac.close();
  }

  // mixdown para mono
  const chs = decoded.numberOfChannels;
  const len = decoded.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < chs; c++) {
    const d = decoded.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / chs;
  }

  const resampled = await resampleTo(mono, decoded.sampleRate, TARGET_SR);
  return new Blob([encodeWav(resampled, TARGET_SR)], { type: "audio/wav" });
}

async function resampleTo(mono, srcSr, dstSr) {
  if (srcSr === dstSr) return mono;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return mono; // sem resample: segue com o sample rate original
  const frames = Math.max(1, Math.ceil((mono.length * dstSr) / srcSr));
  const oac = new OAC(1, frames, dstSr);
  const srcBuf = oac.createBuffer(1, mono.length, srcSr);
  srcBuf.copyToChannel(mono, 0);
  const node = oac.createBufferSource();
  node.buffer = srcBuf;
  node.connect(oac.destination);
  node.start();
  const rendered = await oac.startRendering();
  return rendered.getChannelData(0);
}

function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (16-bit mono)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buffer;
}
