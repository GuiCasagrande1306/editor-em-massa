import React, { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import {
  Film,
  Upload,
  Download,
  Loader2,
  X,
  Video as VideoIcon,
  Monitor,
  Smartphone,
  Square,
} from "lucide-react";

// Presets de proporção -> filtro de vídeo do FFmpeg (scale + pad centralizado).
const RATIOS = [
  {
    id: "16:9",
    label: "Horizontal",
    sub: "16:9 · Widescreen",
    icon: Monitor,
    filter:
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
  },
  {
    id: "9:16",
    label: "Vertical / Reels",
    sub: "9:16 · TikTok/Stories",
    icon: Smartphone,
    filter:
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
  },
  {
    id: "1:1",
    label: "Quadrado",
    sub: "1:1 · Feed",
    icon: Square,
    filter:
      "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2",
  },
];

// Core do FFmpeg servido do próprio domínio (copiado para public/ffmpeg no
// dev/build por scripts/copy-ffmpeg-core.mjs). Precisa ser o build ESM: o
// worker do @ffmpeg/ffmpeg é `type: module` e importa o core via import().
const FFMPEG_BASE = "/ffmpeg";

export default function BatchVideoEditor() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [videos, setVideos] = useState([]);
  const [ratio, setRatio] = useState("9:16");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");

  const ffmpegRef = useRef(new FFmpeg());
  const fileInputRef = useRef(null);

  // Carrega o núcleo do FFmpeg (WASM ~32MB) uma vez, quando o módulo monta.
  useEffect(() => {
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on("progress", ({ progress: p }) => {
      setProgress(Math.max(0, Math.min(100, Math.round(p * 100))));
    });
    (async () => {
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        });
        setLoaded(true);
      } catch (err) {
        setLoadError(err?.message || "Falha ao carregar o FFmpeg");
      }
    })();
    return () => {
      // libera as URLs de preview ao desmontar
      setVideos((prev) => {
        prev.forEach((v) => URL.revokeObjectURL(v.url));
        return prev;
      });
    };
  }, []);

  const addFiles = (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("video/"));
    const novos = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setVideos((prev) => [...prev, ...novos]);
  };

  const removeVideo = (id) => {
    setVideos((prev) => {
      const alvo = prev.find((v) => v.id === id);
      if (alvo) URL.revokeObjectURL(alvo.url);
      return prev.filter((v) => v.id !== id);
    });
  };

  const processBatch = async () => {
    if (!loaded || !videos.length) return;
    const ffmpeg = ffmpegRef.current;
    const filter = RATIOS.find((r) => r.id === ratio)?.filter;
    setProcessing(true);
    try {
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        setPhase(`Processando ${i + 1}/${videos.length} — ${v.name}`);
        setProgress(0);
        const inputName = `in_${i}.mp4`;
        const outputName = `out_${i}.mp4`;

        await ffmpeg.writeFile(inputName, await fetchFile(v.file));
        await ffmpeg.exec([
          "-i",
          inputName,
          "-vf",
          filter,
          "-preset",
          "ultrafast",
          "-c:a",
          "copy",
          outputName,
        ]);
        const data = await ffmpeg.readFile(outputName);
        const blob = new Blob([data.buffer], { type: "video/mp4" });

        // limpa a memória do WASM entre os arquivos
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

        // download
        const base = v.name.replace(/\.[^.]+$/, "");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${base}-${ratio.replace(":", "x")}.mp4`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);

        // pequeno respiro entre downloads (evita o navegador bloquear vários)
        await new Promise((r) => setTimeout(r, 400));
      }
      setPhase("Concluído!");
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert("Erro ao processar vídeo: " + (err?.message || err));
    } finally {
      setProcessing(false);
      setTimeout(() => setPhase(""), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center">
            <Film size={18} className="text-slate-950" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none uppercase tracking-wider">
              Vídeo em Massa
            </h1>
            <p className="text-xs text-slate-400">
              Converte proporção (Reels/Feed/Widescreen) · 100% no navegador
            </p>
          </div>
        </div>

        {/* Estado do motor FFmpeg */}
        {loadError ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
            Não foi possível carregar o motor de vídeo: {loadError}
          </div>
        ) : !loaded ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 text-sm">
            <Loader2 size={18} className="animate-spin text-emerald-400" />
            Carregando o motor de vídeo (FFmpeg WASM, ~32&nbsp;MB)… só na primeira vez.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Upload */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-slate-600 p-8 rounded-xl text-center bg-slate-900/40 cursor-pointer transition"
            >
              <Upload size={28} className="mx-auto mb-2 text-emerald-400" />
              <p className="text-sm font-medium">Arraste vídeos aqui ou clique</p>
              <p className="text-xs text-slate-500 mt-1">MP4, MOV, WebM</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*"
                hidden
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* Opções + ação */}
            {videos.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl space-y-4">
                <h3 className="text-sm font-semibold">Proporção de saída</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {RATIOS.map((r) => {
                    const Icon = r.icon;
                    const active = ratio === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setRatio(r.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition border ${
                          active
                            ? "bg-emerald-500/15 border-emerald-500 text-emerald-300"
                            : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600 text-slate-300"
                        }`}
                      >
                        <Icon size={16} className="shrink-0" />
                        <span>
                          <span className="block text-xs font-semibold leading-tight">
                            {r.label}
                          </span>
                          <span className="block text-[10px] text-slate-500">{r.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={processBatch}
                  disabled={processing}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-lg transition flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Processando… {progress}%
                    </>
                  ) : (
                    <>
                      <Download size={18} /> Processar e baixar todos ({videos.length})
                    </>
                  )}
                </button>

                {processing && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="truncate pr-2">{phase}</span>
                      <span className="font-mono text-emerald-300">{progress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-200"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Lista de vídeos */}
            {videos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {videos.map((v) => (
                  <div
                    key={v.id}
                    className="relative bg-slate-900/40 p-3 rounded-lg border border-slate-800"
                  >
                    <button
                      onClick={() => removeVideo(v.id)}
                      disabled={processing}
                      className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-slate-950/80 grid place-items-center hover:bg-red-500 transition disabled:opacity-40"
                    >
                      <X size={13} />
                    </button>
                    <video
                      src={v.url}
                      controls
                      className="w-full h-36 object-cover rounded mb-2 bg-black"
                    />
                    <p className="text-xs text-slate-400 truncate">{v.name}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-600 py-12">
                <VideoIcon size={44} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhum vídeo carregado</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
