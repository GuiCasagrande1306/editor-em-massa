// Detecção de silêncio via WebAudio: decodifica o áudio de um arquivo de vídeo,
// mede o RMS em janelas de 20ms e devolve os segmentos MANTIDOS (o complemento
// dos silêncios abaixo de `silenceDb` que durem mais que `minSilence`).
export async function detectKeptSegments(file, { silenceDb = -30, minSilence = 0.3 } = {}) {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const audio = await ac.decodeAudioData(buf.slice(0));
  ac.close();

  const data = audio.getChannelData(0);
  const sr = audio.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.02));
  const winDur = win / sr;
  const thr = Math.pow(10, silenceDb / 20);

  const loud = [];
  for (let i = 0; i < data.length; i += win) {
    let sum = 0;
    const end = Math.min(i + win, data.length);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    loud.push(Math.sqrt(sum / (end - i)) >= thr);
  }

  const silences = [];
  let i = 0;
  while (i < loud.length) {
    if (!loud[i]) {
      let j = i;
      while (j < loud.length && !loud[j]) j++;
      if ((j - i) * winDur >= minSilence) silences.push([i * winDur, j * winDur]);
      i = j;
    } else i++;
  }

  const pad = 0.05;
  const dur = audio.duration;
  const kept = [];
  let cursor = 0;
  for (const [s, e] of silences) {
    const rs = s + pad;
    const re = e - pad;
    if (re - rs <= 0.05) continue;
    if (rs > cursor) kept.push({ start: +cursor.toFixed(3), end: +rs.toFixed(3) });
    cursor = re;
  }
  if (cursor < dur) kept.push({ start: +cursor.toFixed(3), end: +dur.toFixed(3) });

  return { duration: dur, cuts: kept.length ? kept : [{ start: 0, end: dur }] };
}
