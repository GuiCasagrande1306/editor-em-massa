// Vercel Serverless Function (Edge) — transcrição com word-level timestamps.
// Recebe multipart/form-data com o campo "file" (áudio/vídeo curto), encaminha
// para o Whisper da Groq e devolve { text, words: [{word,start,end}] }.
//
// Config na Vercel: Settings → Environment Variables
//   GROQ_API_KEY        (obrigatória) — sua chave da Groq (NUNCA no client)
//   GROQ_WHISPER_MODEL  (opcional)    — default "whisper-large-v3"
//
// Limite: Edge Functions têm ~4MB de corpo no plano Hobby. Para vídeos maiores,
// extraia o áudio no client (FFmpeg WASM) antes de enviar.
export const config = { runtime: "edge" };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return json(
      {
        error: "not_configured",
        message: "Defina GROQ_API_KEY nas variáveis de ambiente da Vercel para ativar a transcrição.",
      },
      503
    );
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "bad_request", message: "Envie multipart/form-data com o campo 'file'." }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "no_file", message: "Campo 'file' (áudio/vídeo) ausente." }, 400);
  }
  const language = form.get("language"); // opcional (ex.: "pt")

  const model = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3";
  const gForm = new FormData();
  gForm.append("file", file, file.name || "audio");
  gForm.append("model", model);
  gForm.append("response_format", "verbose_json");
  gForm.append("timestamp_granularities[]", "word");
  if (language) gForm.append("language", String(language));

  let gRes;
  try {
    gRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: gForm,
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", detail: String(e) }, 502);
  }

  if (!gRes.ok) {
    const detail = await gRes.text().catch(() => "");
    return json({ error: "groq_error", status: gRes.status, detail: detail.slice(0, 500) }, 502);
  }

  const data = await gRes.json();

  // Normaliza para { text, words:[{word,start,end}] }. Se a Groq não devolver
  // "words", distribui as palavras de cada segmento uniformemente (fallback).
  let words = [];
  if (Array.isArray(data.words) && data.words.length) {
    words = data.words.map((w) => ({ word: w.word ?? w.text ?? "", start: w.start, end: w.end }));
  } else if (Array.isArray(data.segments)) {
    for (const seg of data.segments) {
      const toks = String(seg.text || "").trim().split(/\s+/).filter(Boolean);
      const span = seg.end - seg.start || 0.001;
      const per = span / Math.max(1, toks.length);
      toks.forEach((t, i) =>
        words.push({
          word: t,
          start: +(seg.start + i * per).toFixed(3),
          end: +(seg.start + (i + 1) * per).toFixed(3),
        })
      );
    }
  }

  return json({ text: data.text || "", words, model });
}
