import React, { useState, useRef, useMemo } from "react";
import {
  Layers,
  Upload,
  Film,
  Scissors,
  Type,
  Sticker,
  Volume2,
  Palette,
  Play,
  Download,
  Trash2,
  CheckCircle2,
  Loader2,
  Clock,
  AlertTriangle,
  X,
} from "lucide-react";
import { detectKeptSegments } from "./audioSilence";

// ---------------------------------------------------------------------------
// Batch Video Pipeline — envia 50–100 vídeos e aplica automações em lote.
// O frontend orquestra a fila e gera o payload JSON por vídeo; o processamento
// pesado (transcrição, render) é do backend. O AUTO-CUT roda de verdade aqui
// (WebAudio) para já entregar os pontos de corte reais no payload.
// ---------------------------------------------------------------------------

const STATUS = {
  waiting: { label: "Aguardando", icon: Clock, cls: "text-slate-400 bg-slate-800" },
  audio: { label: "Analisando áudio", icon: Loader2, cls: "text-sky-300 bg-sky-500/15", spin: true },
  cutting: { label: "Cortando silêncios", icon: Scissors, cls: "text-amber-300 bg-amber-500/15" },
  overlays: { label: "Legendas / GIFs", icon: Sticker, cls: "text-fuchsia-300 bg-fuchsia-500/15", spin: true },
  rendering: { label: "Renderizando", icon: Loader2, cls: "text-sky-300 bg-sky-500/15", spin: true },
  done: { label: "Pronto", icon: CheckCircle2, cls: "text-emerald-300 bg-emerald-500/15" },
  error: { label: "Erro", icon: AlertTriangle, cls: "text-red-300 bg-red-500/15" },
};

// Estilos de legenda (mesmo modelo do EDL do Editor Timeline).
const SUBTITLE_STYLES = {
  hormozi: {
    label: "Hormozi Yellow",
    font: "Impact, sans-serif",
    color: "#ffffff",
    highlight: "#ffe000",
    stroke: { color: "#000000", width: 6 },
    position: "bottom",
    uppercase: true,
  },
  neon: {
    label: "Neon Cyber",
    font: "'Arial Black', sans-serif",
    color: "#00fff0",
    highlight: "#ff00e5",
    stroke: { color: "#0a0a2a", width: 5 },
    position: "bottom",
    uppercase: true,
  },
  clean: {
    label: "Clean White",
    font: "system-ui, sans-serif",
    color: "#ffffff",
    highlight: "#ffffff",
    stroke: { color: "#000000", width: 2 },
    position: "bottom",
    uppercase: false,
  },
};

// Presets de cor -> filtro FFmpeg (eq/hue/contrast).
const COLOR_PRESETS = {
  none: { label: "Nenhum", ffmpeg: null },
  soft: { label: "Retrato Suave", ffmpeg: "eq=brightness=0.03:saturation=1.05,gblur=sigma=0.3" },
  vibrant: { label: "VIBRANT", ffmpeg: "eq=contrast=1.15:saturation=1.45" },
  bw: { label: "Drama B&W", ffmpeg: "hue=s=0,eq=contrast=1.5" },
};

const SFX_WHOOSH = "https://cdn.example.com/sfx/whoosh.mp3"; // placeholder p/ o backend

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export default function BatchVideoPipeline() {
  const [videos, setVideos] = useState([]); // {id,file,name,size,status,cuts,duration,error}
  const [rules, setRules] = useState({
    autoCut: true,
    minSilence: 0.3,
    subtitleStyle: "hormozi",
    autoGifs: false,
    sfx: false,
    colorPreset: "vibrant",
  });
  const [processing, setProcessing] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMsg, setRenderMsg] = useState("");
  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(null);
  const progCtx = useRef({ done: 0, total: 1 });

  const addFiles = (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("video/"));
    setVideos((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: uid(),
        file,
        name: file.name,
        size: file.size,
        status: "waiting",
        cuts: null,
        duration: 0,
        error: null,
      })),
    ]);
  };

  const removeVideo = (id) => setVideos((prev) => prev.filter((v) => v.id !== id));
  const clearAll = () => setVideos([]);

  const setStatus = (id, patch) =>
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const counts = useMemo(() => {
    const c = { total: videos.length, done: 0 };
    videos.forEach((v) => v.status === "done" && c.done++);
    return c;
  }, [videos]);

  // ------------------------------------------------------------- pipeline
  const runBatch = async () => {
    if (!videos.length || processing) return;
    setProcessing(true);
    // reprocessa todos (reseta status)
    setVideos((prev) => prev.map((v) => ({ ...v, status: "waiting", cuts: null, error: null })));
    // pega a lista atual dos ids na ordem
    const list = videos.map((v) => v.id);
    for (const id of list) {
      const v = videosRef.current.find((x) => x.id === id);
      if (!v) continue;
      try {
        setStatus(id, { status: "audio" });
        let cuts = null;
        let duration = 0;
        if (rules.autoCut) {
          // eslint-disable-next-line no-await-in-loop
          const res = await detectKeptSegments(v.file, {
            silenceDb: -30,
            minSilence: rules.minSilence,
          }).catch(() => null);
          if (res) {
            cuts = res.cuts;
            duration = res.duration;
          }
        }
        setStatus(id, { status: "cutting", cuts, duration });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 120)); // cede o thread p/ pintar
        setStatus(id, { status: "overlays" });
        // legendas/GIFs/SFX são diretivas do payload (o backend executa)
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 120));
        setStatus(id, { status: "done" });
      } catch (err) {
        setStatus(id, { status: "error", error: String(err?.message || err) });
      }
    }
    setProcessing(false);
  };

  // Mantém uma referência mutável do estado para o loop assíncrono.
  const videosRef = useRef(videos);
  videosRef.current = videos;

  // ---------------------------------------------------- payload p/ backend
  const generateBatchPayload = () => {
    const style = SUBTITLE_STYLES[rules.subtitleStyle];
    const color = COLOR_PRESETS[rules.colorPreset];
    return {
      preset: {
        auto_cut: rules.autoCut ? { min_silence: rules.minSilence, threshold_db: -30 } : null,
        subtitle_style: { id: rules.subtitleStyle, ...style },
        auto_gifs: rules.autoGifs ? { source: "giphy|tenor", strategy: "keyword_from_transcript" } : null,
        sfx: rules.sfx ? { on: "overlay_enter", whoosh_url: SFX_WHOOSH } : null,
        color_preset: { id: rules.colorPreset, ffmpeg: color.ffmpeg },
      },
      videos: videos.map((v) => ({
        id: v.id,
        file: v.name,
        size: v.size,
        duration: v.duration || null,
        cuts: v.cuts || [], // pontos de corte reais (auto-cut)
        subtitles: { source: "whisper", auto: true, style: rules.subtitleStyle },
        overlays: rules.autoGifs
          ? { auto: true, source: "giphy|tenor", strategy: "keyword_from_transcript" }
          : [],
        sfx: rules.sfx ? [{ type: "whoosh", url: SFX_WHOOSH, on: "overlay_enter" }] : [],
        color_filter: color.ffmpeg, // string FFmpeg (eq/hue/contrast)
      })),
    };
  };

  const downloadPayload = () => {
    const blob = new Blob([JSON.stringify(generateBatchPayload(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `batch-payload-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ------------------------------------ render real (FFmpeg WASM) + ZIP
  // Carrega o core do FFmpeg (self-hosted em /ffmpeg) uma vez.
  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    setRenderMsg("Carregando motor FFmpeg (~32MB, só na 1ª vez)…");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("progress", ({ progress }) => {
      const { done, total } = progCtx.current;
      const p = Math.max(0, Math.min(1, progress || 0));
      setRenderProgress(Math.round(((done + p) / total) * 100));
    });
    await ff.load({
      coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
      wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
    });
    ffmpegRef.current = ff;
    return ff;
  };

  // Monta os argumentos: aplica cortes (trim+concat dos trechos mantidos) e o
  // filtro de cor. Se não houver cortes reais, só aplica cor / transcodifica.
  const buildArgs = (inName, outName, cuts, colorFilter) => {
    const segs = cuts && cuts.length ? cuts : null;
    const needCut = segs && (segs.length > 1 || (segs[0] && segs[0].start > 0.05));
    if (needCut) {
      const parts = [];
      let labels = "";
      segs.forEach((s, i) => {
        parts.push(`[0:v]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[v${i}]`);
        parts.push(`[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`);
        labels += `[v${i}][a${i}]`;
      });
      let fc = parts.join(";") + `;${labels}concat=n=${segs.length}:v=1:a=1[vc][ac]`;
      let vlabel = "[vc]";
      if (colorFilter) {
        fc += `;[vc]${colorFilter}[vf]`;
        vlabel = "[vf]";
      }
      return [
        "-i", inName, "-filter_complex", fc, "-map", vlabel, "-map", "[ac]",
        "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", outName,
      ];
    }
    if (colorFilter) {
      return ["-i", inName, "-vf", colorFilter, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", outName];
    }
    return ["-i", inName, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", outName];
  };

  const renderAndDownload = async () => {
    if (!videos.length || rendering || processing) return;
    setRendering(true);
    setRenderProgress(0);
    try {
      const ffmpeg = await loadFFmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const colorFilter = COLOR_PRESETS[rules.colorPreset].ffmpeg;
      const total = videos.length;
      let done = 0;
      let okCount = 0;

      // reseta status
      setVideos((prev) => prev.map((v) => ({ ...v, status: "waiting" })));

      for (const v of videosRef.current) {
        progCtx.current = { done, total };
        setRenderMsg(`Renderizando vídeo ${done + 1}/${total} — ${v.name}`);
        try {
          // cortes (roda o auto-cut se ainda não tiver)
          let cuts = v.cuts;
          if (rules.autoCut && !cuts) {
            setStatus(v.id, { status: "audio" });
            // eslint-disable-next-line no-await-in-loop
            const res = await detectKeptSegments(v.file, {
              silenceDb: -30,
              minSilence: rules.minSilence,
            }).catch(() => null);
            cuts = res?.cuts || null;
            setStatus(v.id, { cuts, duration: res?.duration || 0 });
          }
          setStatus(v.id, { status: "rendering" });
          const inName = "in.mp4";
          const outName = "out.mp4";
          // eslint-disable-next-line no-await-in-loop
          await ffmpeg.writeFile(inName, await fetchFile(v.file));
          // eslint-disable-next-line no-await-in-loop
          await ffmpeg.exec(buildArgs(inName, outName, rules.autoCut ? cuts : null, colorFilter));
          // eslint-disable-next-line no-await-in-loop
          const data = await ffmpeg.readFile(outName);
          const blob = new Blob([data.buffer], { type: "video/mp4" });
          const base = v.name.replace(/\.[^.]+$/, "");
          zip.file(`${base}-editado.mp4`, blob);
          // eslint-disable-next-line no-await-in-loop
          await ffmpeg.deleteFile(inName).catch(() => {});
          // eslint-disable-next-line no-await-in-loop
          await ffmpeg.deleteFile(outName).catch(() => {});
          setStatus(v.id, { status: "done" });
          okCount++;
        } catch (err) {
          setStatus(v.id, { status: "error", error: String(err?.message || err) });
        }
        done++;
        setRenderProgress(Math.round((done / total) * 100));
      }

      if (!okCount) {
        setRenderMsg("Nenhum vídeo renderizado (veja os cards com erro).");
        return;
      }

      setRenderMsg("Compactando ZIP…");
      const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "videos_editados_em_lote.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      setRenderMsg(`Concluído ✓ (${okCount}/${total} no ZIP)`);
    } catch (err) {
      setRenderMsg("Erro: " + (err?.message || err));
    } finally {
      setRendering(false);
    }
  };

  // ------------------------------------------------------------- ui bits
  const Rule = ({ checked, onChange, icon: Icon, title, children }) => (
    <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-emerald-500 w-4 h-4"
        />
        <Icon size={15} className="text-emerald-400" />
        <span className="text-sm font-semibold">{title}</span>
      </label>
      {checked && children && <div className="mt-2 pl-6">{children}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* ------------------------ Fila em lote ------------------------ */}
        <main className="order-2 lg:order-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center">
              <Layers size={18} className="text-slate-950" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none uppercase tracking-wider">Batch Pipeline</h1>
              <p className="text-xs text-slate-400">Automação em lote de dezenas de vídeos curtos</p>
            </div>
          </div>

          {/* dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-slate-600 p-6 rounded-xl text-center bg-slate-900/40 cursor-pointer transition"
          >
            <Upload size={26} className="mx-auto mb-2 text-emerald-400" />
            <p className="text-sm font-medium">Arraste 50–100 vídeos aqui ou clique</p>
            <p className="text-xs text-slate-500 mt-1">MP4, MOV, WebM</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              hidden
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {/* barra de resumo */}
          {videos.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {counts.done}/{counts.total} prontos
              </span>
              <button onClick={clearAll} className="text-red-400 hover:text-red-300 flex items-center gap-1">
                <Trash2 size={12} /> Limpar fila
              </button>
            </div>
          )}

          {/* grid de cards */}
          {videos.length === 0 ? (
            <div className="text-center text-slate-600 py-16">
              <Film size={44} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum vídeo na fila</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[65vh] overflow-y-auto pr-1">
              {videos.map((v) => {
                const st = STATUS[v.status];
                const Icon = st.icon;
                return (
                  <div key={v.id} className="relative rounded-lg bg-slate-900/40 border border-slate-800 p-2.5">
                    <button
                      onClick={() => removeVideo(v.id)}
                      disabled={processing}
                      className="absolute top-1.5 right-1.5 text-slate-600 hover:text-red-400 disabled:opacity-40"
                    >
                      <X size={13} />
                    </button>
                    <div className="w-full aspect-video rounded bg-slate-800 grid place-items-center mb-2">
                      <Film size={20} className="text-slate-600" />
                    </div>
                    <p className="text-[11px] font-medium truncate" title={v.name}>
                      {v.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {fmtSize(v.size)}
                      {v.cuts ? ` · ${v.cuts.length} cortes` : ""}
                    </p>
                    <span
                      className={`mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${st.cls}`}
                    >
                      <Icon size={11} className={st.spin ? "animate-spin" : ""} />
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* --------------------- Regras de automação ------------------- */}
        <aside className="order-1 lg:order-2 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Palette size={15} className="text-emerald-400" /> Preset de lote
          </div>

          <Rule
            checked={rules.autoCut}
            onChange={(v) => setRules((r) => ({ ...r, autoCut: v }))}
            icon={Scissors}
            title="Auto-Cut (remover silêncios)"
          >
            <label className="text-[11px] text-slate-400 flex items-center gap-2">
              Pausas maiores que
              <input
                type="number"
                step={0.1}
                min={0.1}
                value={rules.minSilence}
                onChange={(e) => setRules((r) => ({ ...r, minSilence: Number(e.target.value) }))}
                className="w-16 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono"
              />
              s
            </label>
          </Rule>

          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
            <span className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Type size={15} className="text-emerald-400" /> Estilo de legenda
            </span>
            <div className="grid grid-cols-1 gap-1">
              {Object.entries(SUBTITLE_STYLES).map(([id, s]) => (
                <button
                  key={id}
                  onClick={() => setRules((r) => ({ ...r, subtitleStyle: id }))}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition border ${
                    rules.subtitleStyle === id
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-300"
                      : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600 text-slate-300"
                  }`}
                >
                  {s.label}
                  <span
                    className="px-1.5 rounded text-[10px] font-black"
                    style={{
                      fontFamily: s.font,
                      color: s.highlight,
                      WebkitTextStroke: `0.5px ${s.stroke.color}`,
                    }}
                  >
                    Aa
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Rule
            checked={rules.autoGifs}
            onChange={(v) => setRules((r) => ({ ...r, autoGifs: v }))}
            icon={Sticker}
            title="Inserir GIFs automáticos"
          >
            <p className="text-[10px] text-slate-500">
              Mapeia palavras-chave da transcrição → GIFs do Giphy/Tenor (backend).
            </p>
          </Rule>

          <Rule
            checked={rules.sfx}
            onChange={(v) => setRules((r) => ({ ...r, sfx: v }))}
            icon={Volume2}
            title="Efeitos sonoros (SFX)"
          >
            <p className="text-[10px] text-slate-500">Som de "whoosh" ao surgir cada elemento visual.</p>
          </Rule>

          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
            <span className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Palette size={15} className="text-emerald-400" /> Preset de cor
            </span>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(COLOR_PRESETS).map(([id, c]) => (
                <button
                  key={id}
                  onClick={() => setRules((r) => ({ ...r, colorPreset: id }))}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition border ${
                    rules.colorPreset === id
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-300"
                      : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600 text-slate-300"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* ação principal: render real + ZIP */}
          <button
            onClick={renderAndDownload}
            disabled={!videos.length || rendering || processing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {rendering ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Renderizando… {renderProgress}%
              </>
            ) : (
              <>
                <Download size={16} /> Renderizar e Baixar Todos (ZIP)
              </>
            )}
          </button>

          {rendering && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span className="truncate pr-2">{renderMsg}</span>
                <span className="font-mono text-emerald-300">{renderProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-200"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
            </div>
          )}
          {!rendering && renderMsg && <p className="text-[11px] text-emerald-300">{renderMsg}</p>}

          <p className="text-[10px] text-slate-500 leading-relaxed">
            O render aplica <b>cortes (auto-cut)</b> e o <b>preset de cor</b> em cada vídeo (FFmpeg no
            navegador). Legendas/GIFs/SFX ficam na receita JSON (queimá-los precisa da transcrição por
            vídeo — no backend ou como próximo passo).
          </p>

          {/* secundárias: análise + payload */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={runBatch}
              disabled={!videos.length || processing || rendering}
              className="flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium disabled:opacity-40"
            >
              {processing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Analisar
            </button>
            <button
              onClick={() => setShowPayload(true)}
              disabled={!videos.length}
              className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium disabled:opacity-40"
            >
              Payload
            </button>
            <button
              onClick={downloadPayload}
              disabled={!videos.length}
              className="flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium disabled:opacity-40"
            >
              <Download size={12} /> JSON
            </button>
          </div>
        </aside>
      </div>

      {/* Modal payload */}
      {showPayload && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 backdrop-blur-sm p-4"
          onClick={() => setShowPayload(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm flex items-center gap-2">
                <Download size={15} className="text-emerald-400" /> Payload do lote (p/ backend)
              </span>
              <button onClick={() => setShowPayload(false)} className="hover:bg-slate-800 rounded p-1">
                <X size={16} />
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-slate-950 rounded-lg p-3 max-h-[60vh] overflow-auto text-emerald-200">
              {JSON.stringify(generateBatchPayload(), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
