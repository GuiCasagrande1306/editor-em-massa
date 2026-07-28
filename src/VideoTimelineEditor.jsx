import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Clapperboard,
  Upload,
  Play,
  Pause,
  Plus,
  Trash2,
  Type,
  Sticker,
  Scissors,
  Download,
  Search,
  Wand2,
  X,
  Layers,
  Film,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Editor de Vídeos Interativo (timeline) — MVP profissional
// - Player + overlay em Canvas (legendas word-by-word) e GIFs em DOM (animados)
// - Timeline de 3 faixas: Vídeo/Cortes · Legendas · GIFs/Overlays
// - Painel lateral: estilo de legenda + busca/adição de GIFs
// - Exporta o EDL (Edit Decision List) em JSON para o backend renderizar
//
// Stubs marcados: transcrição por IA (Whisper/Groq) e render final (FFmpeg/
// Remotion no servidor). O EDL é o contrato entre este editor e o backend.
// ---------------------------------------------------------------------------

const FONTS = [
  { id: "Impact, sans-serif", label: "Impact" },
  { id: "'Arial Black', system-ui, sans-serif", label: "Arial Black" },
  { id: "Georgia, serif", label: "Georgia" },
  { id: "system-ui, sans-serif", label: "System" },
];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const fmt = (s) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export default function VideoTimelineEditor() {
  const [video, setVideo] = useState(null); // {file,url,duration,w,h,name}
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [words, setWords] = useState([]); // {id,text,start,end}
  const [overlays, setOverlays] = useState([]); // {id,url,start,end,x,y,w}
  const [cuts, setCuts] = useState([]); // segmentos MANTIDOS {id,start,end}
  const [silenceDb, setSilenceDb] = useState(-30); // limiar de silêncio
  const [minSilence, setMinSilence] = useState(0.4); // duração mín. do silêncio (s)
  const [cutBusy, setCutBusy] = useState(false);
  const [cutMsg, setCutMsg] = useState("");

  const [style, setStyle] = useState({
    fontFamily: FONTS[0].id,
    fontSize: 54,
    textColor: "#ffffff",
    highlightColor: "#ffe000",
    strokeColor: "#000000",
    strokeWidth: 6,
    position: "bottom", // top | center | bottom
    uppercase: true,
  });

  const [panel, setPanel] = useState("subs"); // subs | gifs
  const [sentence, setSentence] = useState("");
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState([]);
  const [gifUrl, setGifUrl] = useState("");
  const [gifMsg, setGifMsg] = useState("");
  const [showEdl, setShowEdl] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const rafRef = useRef(0);
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);

  const giphyKey = import.meta.env.VITE_GIPHY_KEY;

  // ------------------------------------------------------------------ upload
  const loadVideo = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file);
    setVideo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url, duration: 0, w: 0, h: 0, name: file.name };
    });
    setWords([]);
    setOverlays([]);
    setCuts([]);
    setCurrentTime(0);
  };

  const onMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    setVideo((prev) => (prev ? { ...prev, duration: v.duration, w: v.videoWidth, h: v.videoHeight } : prev));
    // segmento mantido inicial = vídeo inteiro
    setCuts([{ id: uid(), start: 0, end: v.duration }]);
  };

  // ------------------------------------------------------------- playback
  const tick = useCallback(() => {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    } else {
      v.pause();
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    }
  };

  const seek = (t) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clamp(t, 0, video?.duration || 0);
    setCurrentTime(v.currentTime);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ----------------------------------------------- legenda ativa + canvas
  const activeWord = useMemo(
    () => words.find((w) => currentTime >= w.start && currentTime < w.end) || null,
    [words, currentTime]
  );

  const activeOverlays = useMemo(
    () => overlays.filter((o) => currentTime >= o.start && currentTime <= o.end),
    [overlays, currentTime]
  );

  // Desenha a legenda (word-by-word, com contorno) no canvas overlay.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!activeWord) return;

    const text = style.uppercase ? activeWord.text.toUpperCase() : activeWord.text;
    ctx.font = `900 ${style.fontSize}px ${style.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const x = canvas.width / 2;
    const y =
      style.position === "top"
        ? canvas.height * 0.15
        : style.position === "center"
        ? canvas.height * 0.5
        : canvas.height * 0.82;
    if (style.strokeWidth > 0) {
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = style.highlightColor;
    ctx.fillText(text, x, y);
  }, [activeWord, style]);

  // ------------------------------------------------------ legendas: ações
  const addWord = () => {
    const start = currentTime;
    setWords((prev) =>
      [...prev, { id: uid(), text: "palavra", start, end: Math.min(start + 0.4, video?.duration || start + 0.4) }].sort(
        (a, b) => a.start - b.start
      )
    );
  };

  const updateWord = (id, patch) =>
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const removeWord = (id) => setWords((prev) => prev.filter((w) => w.id !== id));

  // Distribui uma frase digitada em palavras ao longo da duração (ou do tempo
  // atual até o fim). Substitui a transcrição por IA num fluxo manual/demo.
  const wordsFromSentence = () => {
    const tokens = sentence.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || !video?.duration) return;
    const t0 = currentTime;
    const span = Math.max(0.3, video.duration - t0);
    const per = span / tokens.length;
    const next = tokens.map((tok, i) => ({
      id: uid(),
      text: tok,
      start: +(t0 + i * per).toFixed(2),
      end: +(t0 + (i + 1) * per).toFixed(2),
    }));
    setWords((prev) => [...prev, ...next].sort((a, b) => a.start - b.start));
    setSentence("");
  };

  // ------------------------------------------------------ GIFs / overlays
  const addOverlay = (url) => {
    if (!url) return;
    const start = currentTime;
    setOverlays((prev) => [
      ...prev,
      { id: uid(), url, start, end: Math.min(start + 2, video?.duration || start + 2), x: 60, y: 15, w: 30 },
    ]);
  };
  const updateOverlay = (id, patch) =>
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const removeOverlay = (id) => setOverlays((prev) => prev.filter((o) => o.id !== id));

  // Auto-cut: decodifica o áudio (WebAudio) e monta os segmentos MANTIDOS,
  // removendo silêncios abaixo de `silenceDb` por mais de `minSilence`.
  const detectSilences = async () => {
    if (!video?.file) return;
    setCutBusy(true);
    setCutMsg("Analisando áudio…");
    try {
      const buf = await video.file.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const audio = await ac.decodeAudioData(buf.slice(0));
      ac.close();
      const data = audio.getChannelData(0);
      const sr = audio.sampleRate;
      const win = Math.max(1, Math.floor(sr * 0.02)); // janelas de 20ms
      const winDur = win / sr;
      const thr = Math.pow(10, silenceDb / 20); // dBFS -> amplitude RMS
      const loud = [];
      for (let i = 0; i < data.length; i += win) {
        let sum = 0;
        const end = Math.min(i + win, data.length);
        for (let j = i; j < end; j++) sum += data[j] * data[j];
        loud.push(Math.sqrt(sum / (end - i)) >= thr);
      }
      // intervalos de silêncio contínuo >= minSilence
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
      // mantidos = complemento, com 50ms de folga ao redor da fala
      const pad = 0.05;
      const dur = audio.duration;
      const kept = [];
      let cursor = 0;
      for (const [s, e] of silences) {
        const remStart = s + pad;
        const remEnd = e - pad;
        if (remEnd - remStart <= 0.05) continue;
        if (remStart > cursor) kept.push({ id: uid(), start: +cursor.toFixed(3), end: +remStart.toFixed(3) });
        cursor = remEnd;
      }
      if (cursor < dur) kept.push({ id: uid(), start: +cursor.toFixed(3), end: +dur.toFixed(3) });
      const finalKept = kept.length ? kept : [{ id: uid(), start: 0, end: dur }];
      setCuts(finalKept);
      const keptDur = finalKept.reduce((a, c) => a + (c.end - c.start), 0);
      setCutMsg(`${finalKept.length} trecho(s) · ${(dur - keptDur).toFixed(1)}s removidos`);
    } catch (err) {
      setCutMsg("Não consegui decodificar o áudio deste vídeo. " + (err?.message || ""));
    } finally {
      setCutBusy(false);
    }
  };

  const searchGifs = async () => {
    if (!gifQuery.trim()) return;
    if (!giphyKey) {
      setGifMsg("Defina VITE_GIPHY_KEY para buscar. Por enquanto, cole a URL de um GIF abaixo.");
      return;
    }
    setGifMsg("Buscando…");
    try {
      const r = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(
          gifQuery
        )}&limit=12&rating=pg`
      );
      const json = await r.json();
      setGifResults((json.data || []).map((g) => g.images?.fixed_width_small?.url || g.images?.original?.url));
      setGifMsg("");
    } catch {
      setGifMsg("Falha na busca. Verifique a chave/rede.");
    }
  };

  // -------------------------------------------- drag do overlay no preview
  const onOverlayPointerDown = (e, o) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stageRef.current.getBoundingClientRect();
    dragRef.current = { id: o.id, px: e.clientX, py: e.clientY, ox: o.x, oy: o.y, rect };
  };
  const onOverlayPointerMove = (e, o) => {
    const d = dragRef.current;
    if (!d || d.id !== o.id) return;
    const dx = ((e.clientX - d.px) / d.rect.width) * 100;
    const dy = ((e.clientY - d.py) / d.rect.height) * 100;
    updateOverlay(o.id, { x: clamp(d.ox + dx, 0, 100 - o.w), y: clamp(d.oy + dy, 0, 95) });
  };
  const onOverlayPointerUp = () => {
    dragRef.current = null;
  };

  // ---------------------------------------------------------- EDL (JSON)
  const edl = useMemo(
    () => ({
      video_url: video?.name || "video_original.mp4",
      duration: video?.duration || 0,
      resolution: video ? { w: video.w, h: video.h } : null,
      cuts: cuts.map(({ start, end }) => ({ start: +start.toFixed(3), end: +end.toFixed(3) })),
      subtitle_style: {
        font: style.fontFamily,
        size: style.fontSize,
        color: style.textColor,
        highlight: style.highlightColor,
        stroke: { color: style.strokeColor, width: style.strokeWidth },
        position: style.position,
        uppercase: style.uppercase,
      },
      subtitles: words.map(({ text, start, end }) => ({
        word: style.uppercase ? text.toUpperCase() : text,
        start: +start.toFixed(3),
        end: +end.toFixed(3),
      })),
      overlays: overlays.map(({ url, start, end, x, y, w }) => ({
        gif_url: url,
        start: +start.toFixed(3),
        end: +end.toFixed(3),
        x,
        y,
        w,
      })),
    }),
    [video, cuts, words, overlays, style]
  );

  const downloadEdl = () => {
    const blob = new Blob([JSON.stringify(edl, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `edl-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const dur = video?.duration || 0;
  const pct = (t) => (dur ? `${(t / dur) * 100}%` : "0%");

  // ============================================================== render
  if (!video) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center">
              <Clapperboard size={18} className="text-slate-950" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none uppercase tracking-wider">Editor Timeline</h1>
              <p className="text-xs text-slate-400">Legendas word-by-word · GIFs · gera o EDL para render</p>
            </div>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              loadVideo(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-slate-600 p-12 rounded-2xl text-center bg-slate-900/40 cursor-pointer transition"
          >
            <Upload size={32} className="mx-auto mb-3 text-emerald-400" />
            <p className="font-medium">Arraste um vídeo aqui ou clique</p>
            <p className="text-xs text-slate-500 mt-1">MP4, MOV, WebM</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => loadVideo(e.target.files?.[0])}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* ---------------- Coluna principal: player + timeline -------- */}
        <main className="space-y-3 order-2 lg:order-1">
          {/* Preview stage */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
            <div
              ref={stageRef}
              className="relative mx-auto bg-black rounded-lg overflow-hidden select-none"
              style={{ maxWidth: 640, aspectRatio: video.w && video.h ? `${video.w}/${video.h}` : "16/9" }}
            >
              <video
                ref={videoRef}
                src={video.url}
                onLoadedMetadata={onMeta}
                onEnded={() => setPlaying(false)}
                className="w-full h-full object-contain"
                playsInline
              />
              {/* overlay de legendas (canvas) */}
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
              {/* overlays de GIF (DOM, arrastáveis) */}
              {activeOverlays.map((o) => (
                <img
                  key={o.id}
                  src={o.url}
                  alt="overlay"
                  onPointerDown={(e) => onOverlayPointerDown(e, o)}
                  onPointerMove={(e) => onOverlayPointerMove(e, o)}
                  onPointerUp={onOverlayPointerUp}
                  className="absolute cursor-move touch-none"
                  style={{ left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%` }}
                  draggable={false}
                />
              ))}
            </div>

            {/* transport */}
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 grid place-items-center"
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {fmt(currentTime)} / {fmt(dur)}
              </span>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={0.01}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <button
                onClick={downloadEdl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold"
              >
                <Download size={14} /> Gerar EDL
              </button>
              <button
                onClick={() => setShowEdl(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium"
              >
                Ver JSON
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <Layers size={14} className="text-emerald-400" /> Timeline
            </div>

            {/* Auto-cut por silêncio (WebAudio) */}
            <div className="flex flex-wrap items-center gap-3 mb-3 p-2 rounded-lg bg-slate-800/40 border border-slate-800">
              <button
                onClick={detectSilences}
                disabled={cutBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-semibold"
              >
                <Scissors size={13} /> {cutBusy ? "Analisando…" : "Auto-cut (silêncios)"}
              </button>
              <label className="flex items-center gap-1 text-[11px] text-slate-400">
                Limiar
                <input
                  type="range"
                  min={-60}
                  max={-10}
                  value={silenceDb}
                  onChange={(e) => setSilenceDb(Number(e.target.value))}
                  className="accent-emerald-500 w-20"
                />
                <span className="font-mono text-slate-300 w-10">{silenceDb}dB</span>
              </label>
              <label className="flex items-center gap-1 text-[11px] text-slate-400">
                Mín.
                <input
                  type="range"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={minSilence}
                  onChange={(e) => setMinSilence(Number(e.target.value))}
                  className="accent-emerald-500 w-16"
                />
                <span className="font-mono text-slate-300 w-8">{minSilence}s</span>
              </label>
              {cutMsg && <span className="text-[11px] text-emerald-300">{cutMsg}</span>}
            </div>

            {/* régua clicável (seek) */}
            <div
              className="relative h-5 rounded bg-slate-800/60 mb-1 cursor-pointer"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - r.left) / r.width) * dur);
              }}
            >
              <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-400" style={{ left: pct(currentTime) }} />
            </div>

            {/* Faixa: Vídeo / Cortes */}
            <TrackRow icon={Scissors} label="Vídeo / Cortes">
              {cuts.map((c) => (
                <div
                  key={c.id}
                  className="absolute top-1 bottom-1 rounded bg-emerald-500/30 border border-emerald-500/60"
                  style={{ left: pct(c.start), width: pct(c.end - c.start) }}
                  title={`${fmt(c.start)}–${fmt(c.end)}`}
                />
              ))}
            </TrackRow>

            {/* Faixa: Legendas */}
            <TrackRow icon={Type} label="Legendas">
              {words.map((w) => (
                <div
                  key={w.id}
                  className={`absolute top-1 bottom-1 rounded px-1 text-[9px] leading-4 overflow-hidden whitespace-nowrap ${
                    activeWord?.id === w.id ? "bg-amber-400 text-slate-950" : "bg-slate-700 text-slate-200"
                  }`}
                  style={{ left: pct(w.start), width: `calc(${pct(w.end - w.start)} - 1px)` }}
                  onClick={() => seek(w.start)}
                  title={w.text}
                >
                  {w.text}
                </div>
              ))}
            </TrackRow>

            {/* Faixa: GIFs / Overlays */}
            <TrackRow icon={Sticker} label="GIFs / Overlays">
              {overlays.map((o) => (
                <div
                  key={o.id}
                  className="absolute top-1 bottom-1 rounded bg-fuchsia-500/40 border border-fuchsia-400/60"
                  style={{ left: pct(o.start), width: pct(o.end - o.start) }}
                  onClick={() => seek(o.start)}
                  title={o.url}
                />
              ))}
            </TrackRow>
          </div>
        </main>

        {/* ---------------- Painel lateral --------------------------- */}
        <aside className="order-1 lg:order-2 space-y-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-800/60 p-0.5">
            {[
              { id: "subs", label: "Legendas", icon: Type },
              { id: "gifs", label: "GIFs", icon: Sticker },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setPanel(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  panel === t.id ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {panel === "subs" && (
            <div className="space-y-3">
              {/* transcrição / geração */}
              <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Wand2 size={13} className="text-emerald-400" /> Gerar legendas
                </p>
                <textarea
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  placeholder="Cole a fala/transcrição — vira legenda word-by-word a partir do tempo atual"
                  rows={3}
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs focus:border-emerald-500 outline-none resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={wordsFromSentence}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold"
                  >
                    Distribuir no tempo
                  </button>
                  <button
                    onClick={addWord}
                    className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1"
                  >
                    <Plus size={13} /> palavra
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  🔌 Transcrição automática (Whisper/Groq) pluga aqui: o endpoint retorna palavras com
                  start/end em ms e popula esta faixa.
                </p>
              </div>

              {/* estilo */}
              <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3 space-y-2">
                <p className="text-xs font-semibold">Estilo (Hormozi)</p>
                <label className="text-[11px] text-slate-400 block">Fonte</label>
                <select
                  value={style.fontFamily}
                  onChange={(e) => setStyle((s) => ({ ...s, fontFamily: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs"
                >
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] text-slate-400 block">Tamanho: {style.fontSize}px</label>
                <input
                  type="range"
                  min={20}
                  max={120}
                  value={style.fontSize}
                  onChange={(e) => setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                  className="w-full accent-emerald-500"
                />
                <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                  <label className="flex flex-col gap-1">
                    Destaque
                    <input
                      type="color"
                      value={style.highlightColor}
                      onChange={(e) => setStyle((s) => ({ ...s, highlightColor: e.target.value }))}
                      className="w-full h-7 rounded bg-transparent cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Texto
                    <input
                      type="color"
                      value={style.textColor}
                      onChange={(e) => setStyle((s) => ({ ...s, textColor: e.target.value }))}
                      className="w-full h-7 rounded bg-transparent cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Contorno
                    <input
                      type="color"
                      value={style.strokeColor}
                      onChange={(e) => setStyle((s) => ({ ...s, strokeColor: e.target.value }))}
                      className="w-full h-7 rounded bg-transparent cursor-pointer"
                    />
                  </label>
                </div>
                <label className="text-[11px] text-slate-400 block">Contorno: {style.strokeWidth}px</label>
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={style.strokeWidth}
                  onChange={(e) => setStyle((s) => ({ ...s, strokeWidth: Number(e.target.value) }))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {["top", "center", "bottom"].map((p) => (
                      <button
                        key={p}
                        onClick={() => setStyle((s) => ({ ...s, position: p }))}
                        className={`px-2 py-1 rounded text-[10px] ${
                          style.position === p ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={style.uppercase}
                      onChange={(e) => setStyle((s) => ({ ...s, uppercase: e.target.checked }))}
                      className="accent-emerald-500"
                    />
                    MAIÚSCULAS
                  </label>
                </div>
              </div>

              {/* lista de palavras */}
              {words.length > 0 && (
                <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3 max-h-64 overflow-y-auto space-y-1">
                  {words.map((w) => (
                    <div key={w.id} className="flex items-center gap-1">
                      <input
                        value={w.text}
                        onChange={(e) => updateWord(w.id, { text: e.target.value })}
                        className="flex-1 min-w-0 px-1.5 py-1 rounded bg-slate-800 border border-slate-700 text-[11px]"
                      />
                      <input
                        type="number"
                        step={0.1}
                        value={w.start}
                        onChange={(e) => updateWord(w.id, { start: Number(e.target.value) })}
                        className="w-14 px-1 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono"
                      />
                      <input
                        type="number"
                        step={0.1}
                        value={w.end}
                        onChange={(e) => updateWord(w.id, { end: Number(e.target.value) })}
                        className="w-14 px-1 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono"
                      />
                      <button onClick={() => removeWord(w.id)} className="text-slate-500 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {panel === "gifs" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3 space-y-2">
                <div className="flex gap-1">
                  <input
                    value={gifQuery}
                    onChange={(e) => setGifQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchGifs()}
                    placeholder="Buscar GIF (Giphy)…"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs focus:border-emerald-500 outline-none"
                  />
                  <button onClick={searchGifs} className="px-2.5 rounded-lg bg-emerald-500 text-slate-950">
                    <Search size={14} />
                  </button>
                </div>
                {gifMsg && <p className="text-[10px] text-amber-300">{gifMsg}</p>}
                {gifResults.length > 0 && (
                  <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto">
                    {gifResults.map((u, i) => (
                      <img
                        key={i}
                        src={u}
                        alt="gif"
                        onClick={() => addOverlay(u)}
                        className="w-full h-16 object-cover rounded cursor-pointer hover:ring-2 ring-emerald-400"
                      />
                    ))}
                  </div>
                )}
                <div className="flex gap-1 pt-1 border-t border-slate-800">
                  <input
                    value={gifUrl}
                    onChange={(e) => setGifUrl(e.target.value)}
                    placeholder="…ou cole a URL de um GIF/PNG"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs focus:border-emerald-500 outline-none"
                  />
                  <button
                    onClick={() => {
                      addOverlay(gifUrl.trim());
                      setGifUrl("");
                    }}
                    className="px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Clique num GIF pra adicioná-lo no tempo atual. No preview, arraste pra posicionar.
                </p>
              </div>

              {overlays.length > 0 && (
                <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3 space-y-2 max-h-64 overflow-y-auto">
                  {overlays.map((o) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <img src={o.url} alt="" className="w-8 h-8 object-cover rounded" />
                      <div className="flex-1 grid grid-cols-2 gap-1">
                        <input
                          type="number"
                          step={0.1}
                          value={o.start}
                          onChange={(e) => updateOverlay(o.id, { start: Number(e.target.value) })}
                          className="px-1 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono"
                        />
                        <input
                          type="number"
                          step={0.1}
                          value={o.end}
                          onChange={(e) => updateOverlay(o.id, { end: Number(e.target.value) })}
                          className="px-1 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono"
                        />
                      </div>
                      <button onClick={() => removeOverlay(o.id)} className="text-slate-500 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              if (video) URL.revokeObjectURL(video.url);
              setVideo(null);
            }}
            className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 flex items-center justify-center gap-1.5"
          >
            <Film size={13} /> Trocar vídeo
          </button>
        </aside>
      </div>

      {/* Modal EDL */}
      {showEdl && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 backdrop-blur-sm p-4"
          onClick={() => setShowEdl(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm flex items-center gap-2">
                <Download size={15} className="text-emerald-400" /> EDL (receita p/ o render)
              </span>
              <button onClick={() => setShowEdl(false)} className="hover:bg-slate-800 rounded p-1">
                <X size={16} />
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-slate-950 rounded-lg p-3 max-h-[60vh] overflow-auto text-emerald-200">
              {JSON.stringify(edl, null, 2)}
            </pre>
            <button
              onClick={downloadEdl}
              className="w-full mt-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold"
            >
              Baixar edl.json
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Linha de faixa da timeline (posicionamento absoluto dos blocos por tempo).
function TrackRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-24 shrink-0 flex items-center gap-1.5 text-[10px] text-slate-400">
        <Icon size={12} className="text-emerald-400" /> {label}
      </span>
      <div className="relative flex-1 h-8 rounded bg-slate-800/40 border border-slate-800">{children}</div>
    </div>
  );
}
