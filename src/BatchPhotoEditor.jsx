import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  Contrast,
  Sun,
  Droplet,
  Palette,
  Wind,
  RotateCcw,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Crop,
  Type,
  Package,
  Loader2,
  Camera,
  Zap,
  Aperture,
  Sliders,
  X,
  ShoppingBag,
  Smile,
  Film,
  Moon,
  Star,
  Save,
} from "lucide-react";
import { PRESETS, getCanvasFilterString } from "./presets";
import { fetchPresets, savePreset, deletePreset } from "./presetsStore";

/**
 * BatchPhotoEditor
 * ----------------
 * Editor de fotos em massa 100% client-side.
 * Os presets e a função getCanvasFilterString vêm de ./presets.js — modelo
 * CSS-nativo (100% = neutro) usado de ponta a ponta (sliders, preview e export).
 */

// Mapa string -> componente Lucide (os presets guardam o ícone como string).
const ICON_MAP = {
  RotateCcw,
  ShoppingBag,
  Camera,
  Sun,
  Zap,
  Smile,
  Film,
  Aperture,
  Star,
};

// Estado neutro = settings do preset "original".
const DEFAULT_SETTINGS = { ...PRESETS[0].settings };

// Definição dos sliders manuais (chave = campo em settings, escala CSS-nativa).
const SLIDERS = [
  { key: "brightness", label: "Brilho", icon: Sun, min: 0, max: 200, step: 1, unit: "%" },
  { key: "contrast", label: "Contraste", icon: Contrast, min: 0, max: 200, step: 1, unit: "%" },
  { key: "saturate", label: "Saturação", icon: Droplet, min: 0, max: 200, step: 1, unit: "%" },
  { key: "sepia", label: "Sépia", icon: Camera, min: 0, max: 100, step: 1, unit: "%" },
  { key: "hueRotate", label: "Matiz / Hue", icon: Palette, min: 0, max: 360, step: 1, unit: "°" },
  { key: "grayscale", label: "Preto & Branco", icon: Moon, min: 0, max: 100, step: 1, unit: "%" },
  { key: "blur", label: "Desfoque", icon: Wind, min: 0, max: 10, step: 0.1, unit: "px" },
];

const WATERMARK_POSITIONS = [
  { id: "top-left", label: "Sup. Esq." },
  { id: "top-right", label: "Sup. Dir." },
  { id: "center", label: "Centro" },
  { id: "bottom-left", label: "Inf. Esq." },
  { id: "bottom-right", label: "Inf. Dir." },
];

const OUTPUT_FORMATS = [
  { id: "image/jpeg", label: "JPG", ext: "jpg", supportsQuality: true },
  { id: "image/png", label: "PNG", ext: "png", supportsQuality: false },
  { id: "image/webp", label: "WebP", ext: "webp", supportsQuality: true },
];

// Carrega JSZip sob demanda.
// Carrega o JSZip do pacote bundlado (import dinâmico = code-splitting sob demanda).
// Antes vinha por <script> de CDN, mas o COEP require-corp (necessário pro FFmpeg)
// bloqueia recursos cross-origin — então importamos localmente.
let jszipPromise = null;
function loadJSZip() {
  if (!jszipPromise) jszipPromise = import("jszip").then((m) => m.default);
  return jszipPromise;
}

// Gera o ZIP em stream, entregando um chunk por vez (com backpressure) em vez
// de materializar o arquivo inteiro na RAM. `compression: "STORE"` = sem
// recompressão: as fotos já saem comprimidas do toBlob, então o DEFLATE só
// gastaria CPU/RAM sem reduzir tamanho.
// `onChunk(chunk)` pode ser async (ex.: escrever no disco); `onProgress(pct)`
// recebe 0..100. Resolve quando o stream termina.
function streamZip(zip, onChunk, onProgress) {
  return new Promise((resolve, reject) => {
    const stream = zip.generateInternalStream({
      type: "uint8array",
      streamFiles: true,
      compression: "STORE",
    });
    let lastYield = performance.now();
    stream
      .on("data", (chunk, meta) => {
        stream.pause(); // segura o fluxo até o chunk atual ser consumido
        Promise.resolve(onChunk(chunk))
          .then(() => {
            if (onProgress) onProgress(meta.percent);
            // Retomar via .then() (microtask) NÃO deixa o navegador pintar, o
            // que congela a UI durante a compactação. A cada ~30ms cedemos um
            // macrotask (setTimeout 0) para o browser repintar a barra (~30fps);
            // nos chunks intermediários retomamos direto para não perder throughput.
            const now = performance.now();
            if (now - lastYield > 30) {
              lastYield = now;
              setTimeout(() => stream.resume(), 0);
            } else {
              stream.resume();
            }
          })
          .catch(reject);
      })
      .on("error", reject)
      .on("end", resolve);
    stream.resume();
  });
}

// Desenha uma imagem num canvas aplicando settings, resize e marca d'água.
// `target` permite reutilizar o MESMO canvas em toda a exportação em lote
// (economia de RAM); sem ele, cria um canvas novo (usado no preview/single).
function renderToCanvas(img, settings, resize, watermark, target) {
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  const maxW = resize.enabled && resize.maxWidth ? Number(resize.maxWidth) : Infinity;
  const maxH = resize.enabled && resize.maxHeight ? Number(resize.maxHeight) : Infinity;
  if (maxW < Infinity || maxH < Infinity) {
    const ratio = Math.min(maxW / w, maxH / h, 1);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = target || document.createElement("canvas");
  // Reatribuir width/height também limpa o canvas reutilizado.
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.filter = getCanvasFilterString(settings);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = "none";

  if (watermark.enabled && watermark.text) {
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

  return canvas;
}

export default function BatchPhotoEditor() {
  const [images, setImages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [activePreset, setActivePreset] = useState("original");
  const [customPresets, setCustomPresets] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [showBefore, setShowBefore] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState("");

  const [resize, setResize] = useState({ enabled: false, maxWidth: 1920, maxHeight: 1920 });
  const [watermark, setWatermark] = useState({
    enabled: false,
    text: "© Elo Marketing",
    position: "bottom-right",
    color: "#ffffff",
    size: 30,
    opacity: 80,
  });
  const [output, setOutput] = useState({ format: "image/jpeg", quality: 90 });

  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const selectedImage = useMemo(
    () => images.find((i) => i.id === selectedId) || null,
    [images, selectedId]
  );

  // ---------------- Upload ----------------
  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setImages((prev) => [...prev, { id, name: file.name, url, imgEl: img }]);
      };
      img.src = url;
    });
  }, []);

  useEffect(() => {
    if (images.length && (!selectedId || !images.some((i) => i.id === selectedId))) {
      setSelectedId(images[0].id);
    }
    if (!images.length) setSelectedId(null);
  }, [images, selectedId]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeImage = (id) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
  };

  // ---------------- Presets & sliders ----------------
  const applyPreset = (preset) => {
    setSettings({ ...preset.settings });
    setActivePreset(preset.id);
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setActivePreset("custom");
  };

  // Carrega os presets do usuário (Supabase quando configurado; senão localStorage).
  useEffect(() => {
    fetchPresets().then(setCustomPresets).catch(() => {});
  }, []);

  const saveCurrentPreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const preset = {
      id: `custom-${Date.now()}`,
      name,
      category: "Meus",
      description: "Preset criado por você",
      icon: "Star",
      custom: true,
      settings: { ...settings },
    };
    // Atualiza a UI de imediato e sincroniza com a nuvem em segundo plano.
    setCustomPresets((prev) => [...prev, preset]);
    setActivePreset(preset.id);
    setNewPresetName("");
    setShowSaveModal(false);
    savePreset(preset);
  };

  const deleteCustomPreset = (id) => {
    setCustomPresets((prev) => prev.filter((p) => p.id !== id));
    if (activePreset === id) setActivePreset("custom");
    deletePreset(id);
  };

  // ---------------- Preview render ----------------
  useEffect(() => {
    if (!selectedImage || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const activeSettings = showBefore ? DEFAULT_SETTINGS : settings;
    const rendered = renderToCanvas(
      selectedImage.imgEl,
      activeSettings,
      resize,
      showBefore ? { ...watermark, enabled: false } : watermark
    );
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rendered, 0, 0);
  }, [selectedImage, settings, showBefore, resize, watermark]);

  // ---------------- Exportação ----------------
  // Fase 1 (renderizar os filtros/resize de cada imagem) ocupa 0–85% da barra;
  // fase 2 (compactar o ZIP) ocupa 85–100%, alimentada pelo onUpdate do JSZip.
  const RENDER_WEIGHT = 85;

  const processAndDownload = async () => {
    if (!images.length) return;

    const zipName = `fotos-editadas-${Date.now()}.zip`;

    // Se o navegador suportar a File System Access API, abrimos o destino no
    // disco JÁ (dentro do gesto do clique) para depois gravar o ZIP em stream,
    // com memória constante — não segura o arquivo inteiro na RAM.
    let fileHandle = null;
    if (typeof window.showSaveFilePicker === "function") {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: zipName,
          types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
        });
      } catch (err) {
        if (err?.name === "AbortError") return; // usuário cancelou o salvar
        fileHandle = null; // qualquer outro erro: cai no fallback em memória
      }
    }

    setProcessing(true);
    setProgress(0);
    setProgressPhase(`Aplicando filtros (0/${images.length})`);
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const fmt = OUTPUT_FORMATS.find((f) => f.id === output.format);
      // Qualidade selecionada (100% => 1.0). PNG é lossless (ignora quality).
      const quality = fmt.supportsQuality ? output.quality / 100 : undefined;

      // UM único canvas reutilizado por todas as imagens (economia de RAM).
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        // Renderiza na resolução NATIVA (resize só entra se o usuário ativou).
        renderToCanvas(image.imgEl, settings, resize, watermark, canvas);
        // eslint-disable-next-line no-await-in-loop
        let blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, output.format, quality)
        );
        const base = image.name.replace(/\.[^.]+$/, "");
        zip.file(`${base}-editado.${fmt.ext}`, blob);
        blob = null; // solta a referência para o GC

        // Limpa o canvas antes da próxima imagem.
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const done = i + 1;
        setProgress(Math.round((done / images.length) * RENDER_WEIGHT));
        setProgressPhase(`Aplicando filtros (${done}/${images.length})`);
        // Respiro para o GC a cada 10 imagens (20ms); nas demais, só cede o
        // thread (0ms) para o React repintar a barra.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, done % 10 === 0 ? 20 : 0));
      }

      // Encolhe o canvas para liberar o buffer da última imagem.
      canvas.width = 0;
      canvas.height = 0;

      setProgressPhase(fileHandle ? "Gravando ZIP no disco…" : "Montando ZIP…");
      const onProgress = (pct) =>
        setProgress(RENDER_WEIGHT + Math.round((pct / 100) * (100 - RENDER_WEIGHT)));

      if (fileHandle) {
        // Streaming direto para o disco: cada chunk vai para o arquivo.
        const writable = await fileHandle.createWritable();
        try {
          await streamZip(zip, (chunk) => writable.write(chunk), onProgress);
        } finally {
          await writable.close();
        }
      } else {
        // Fallback: monta um Blob a partir dos chunks (sem o buffer duplo do
        // generateAsync) e dispara o download tradicional.
        const chunks = [];
        await streamZip(zip, (chunk) => chunks.push(chunk), onProgress);
        const content = new Blob(chunks, { type: "application/zip" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = zipName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }

      setProgress(100);
      setProgressPhase("Concluído!");
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert("Erro ao processar: " + err.message);
    } finally {
      setProcessing(false);
      setProgress(0);
      setProgressPhase("");
    }
  };

  const downloadSingle = async () => {
    if (!selectedImage) return;
    const fmt = OUTPUT_FORMATS.find((f) => f.id === output.format);
    const quality = fmt.supportsQuality ? output.quality / 100 : undefined;
    const canvas = renderToCanvas(selectedImage.imgEl, settings, resize, watermark);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, output.format, quality));
    const base = selectedImage.name.replace(/\.[^.]+$/, "");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${base}-editado.${fmt.ext}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const SliderControl = ({ icon: Icon, label, value, min, max, step = 1, unit = "", onChange }) => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <Icon size={15} className="text-emerald-400" />
          {label}
        </span>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-emerald-500 cursor-pointer"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-12 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center">
              <Sparkles size={18} className="text-slate-950" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none uppercase tracking-wider">
                Editor em Massa
              </h1>
              <p className="text-xs text-slate-400">Edição de fotos em massa · 100% no navegador</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400 hidden sm:block">
              {images.length} {images.length === 1 ? "imagem" : "imagens"}
            </span>
            <button
              onClick={processAndDownload}
              disabled={!images.length || processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {processing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {progress}%
                </>
              ) : (
                <>
                  <Package size={16} /> Baixar ZIP
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] gap-4">
        {/* Coluna esquerda: galeria */}
        <aside className="space-y-4 order-2 lg:order-1">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
              isDragging
                ? "border-emerald-400 bg-emerald-500/10"
                : "border-slate-700 hover:border-slate-600 bg-slate-900/40"
            }`}
          >
            <Upload size={28} className="mx-auto mb-2 text-emerald-400" />
            <p className="text-sm font-medium">Arraste imagens aqui</p>
            <p className="text-xs text-slate-500 mt-1">ou clique · JPG, PNG, WebP</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <ImageIcon size={13} /> Galeria
              </span>
              {images.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 size={12} /> Limpar
                </button>
              )}
            </div>
            {images.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-6">Nenhuma imagem carregada</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
                {images.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedId(img.id)}
                    className={`relative group aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition ${
                      selectedId === img.id ? "border-emerald-400" : "border-transparent hover:border-slate-600"
                    }`}
                  >
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(img.id);
                      }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-950/80 grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Coluna central: preview */}
        <main className="order-1 lg:order-2 space-y-4">
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-4 min-h-[420px] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Eye size={15} className="text-emerald-400" />
                Pré-visualização
              </span>
              {selectedImage && (
                <div className="flex items-center gap-2">
                  <button
                    onMouseDown={() => setShowBefore(true)}
                    onMouseUp={() => setShowBefore(false)}
                    onMouseLeave={() => setShowBefore(false)}
                    onTouchStart={() => setShowBefore(true)}
                    onTouchEnd={() => setShowBefore(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition select-none"
                  >
                    {showBefore ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showBefore ? "Antes" : "Segurar: Antes"}
                  </button>
                  <button
                    onClick={downloadSingle}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
                  >
                    <Download size={13} /> Esta
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 grid place-items-center bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:24px_24px] rounded-lg overflow-hidden relative">
              {selectedImage ? (
                <canvas ref={previewCanvasRef} className="max-w-full max-h-[60vh] object-contain" />
              ) : (
                <div className="text-center text-slate-600 py-20">
                  <ImageIcon size={48} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Selecione ou carregue uma imagem</p>
                </div>
              )}
              {showBefore && selectedImage && (
                <span className="absolute top-3 left-3 px-2 py-1 rounded bg-slate-950/80 text-xs font-semibold text-amber-300">
                  ORIGINAL
                </span>
              )}
            </div>
            {selectedImage && (
              <p className="text-xs text-slate-500 mt-2 truncate">
                {selectedImage.name} · {selectedImage.imgEl.naturalWidth}×
                {selectedImage.imgEl.naturalHeight}px
              </p>
            )}
          </div>

          {/* Presets */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-4">
            <span className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-emerald-400" /> Presets de cor
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[...PRESETS, ...customPresets].map((p) => {
                const Icon = ICON_MAP[p.icon] || Sparkles;
                const active = activePreset === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    title={p.description}
                    className={`relative group flex flex-col gap-1 px-3 py-2.5 rounded-lg text-left transition border cursor-pointer ${
                      active
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300"
                        : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600 text-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2 pr-4">
                      <Icon size={15} className="shrink-0" />
                      <span className="text-xs font-semibold leading-tight">{p.name}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {p.category}
                    </span>
                    {p.custom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCustomPreset(p.id);
                        }}
                        title="Excluir preset"
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-slate-950/70 grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* Coluna direita: controles */}
        <aside className="order-3 space-y-4">
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Sliders size={15} className="text-emerald-400" /> Ajustes globais
              </span>
              <button
                onClick={() => applyPreset(PRESETS[0])}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            {SLIDERS.map((s) => (
              <SliderControl
                key={s.key}
                icon={s.icon}
                label={s.label}
                value={settings[s.key]}
                min={s.min}
                max={s.max}
                step={s.step}
                unit={s.unit}
                onChange={(v) => updateSetting(s.key, v)}
              />
            ))}
            <button
              onClick={() => setShowSaveModal(true)}
              className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-medium transition"
            >
              <Save size={15} /> Salvar config. atual como preset
            </button>
          </div>

          {/* Redimensionar */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-4">
            <label className="flex items-center justify-between mb-3 cursor-pointer">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Crop size={15} className="text-emerald-400" /> Redimensionar
              </span>
              <input
                type="checkbox"
                checked={resize.enabled}
                onChange={(e) => setResize((r) => ({ ...r, enabled: e.target.checked }))}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
            {resize.enabled && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400">Largura máx.</label>
                  <input
                    type="number"
                    value={resize.maxWidth}
                    onChange={(e) => setResize((r) => ({ ...r, maxWidth: e.target.value }))}
                    className="w-full mt-1 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Altura máx.</label>
                  <input
                    type="number"
                    value={resize.maxHeight}
                    onChange={(e) => setResize((r) => ({ ...r, maxHeight: e.target.value }))}
                    className="w-full mt-1 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Marca d'água */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-4">
            <label className="flex items-center justify-between mb-3 cursor-pointer">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Type size={15} className="text-emerald-400" /> Marca d'água
              </span>
              <input
                type="checkbox"
                checked={watermark.enabled}
                onChange={(e) => setWatermark((w) => ({ ...w, enabled: e.target.checked }))}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
            {watermark.enabled && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={watermark.text}
                  onChange={(e) => setWatermark((w) => ({ ...w, text: e.target.value }))}
                  placeholder="Texto da marca d'água"
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:border-emerald-500 outline-none"
                />
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Posição</label>
                  <div className="grid grid-cols-3 gap-1">
                    {WATERMARK_POSITIONS.map((pos) => (
                      <button
                        key={pos.id}
                        onClick={() => setWatermark((w) => ({ ...w, position: pos.id }))}
                        className={`px-1 py-1.5 rounded text-[11px] transition ${
                          watermark.position === pos.id
                            ? "bg-emerald-500 text-slate-950 font-semibold"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Cor</label>
                    <input
                      type="color"
                      value={watermark.color}
                      onChange={(e) => setWatermark((w) => ({ ...w, color: e.target.value }))}
                      className="w-8 h-8 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400">Tamanho: {watermark.size}</label>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={watermark.size}
                      onChange={(e) => setWatermark((w) => ({ ...w, size: Number(e.target.value) }))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Opacidade: {watermark.opacity}%</label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={watermark.opacity}
                    onChange={(e) => setWatermark((w) => ({ ...w, opacity: Number(e.target.value) }))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Exportação */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-4">
            <span className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Download size={15} className="text-emerald-400" /> Exportação
            </span>
            <div className="grid grid-cols-3 gap-1 mb-3">
              {OUTPUT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOutput((o) => ({ ...o, format: f.id }))}
                  className={`py-1.5 rounded text-xs font-semibold transition ${
                    output.format === f.id
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {OUTPUT_FORMATS.find((f) => f.id === output.format)?.supportsQuality && (
              <div>
                <label className="text-xs text-slate-400">Qualidade: {output.quality}%</label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={output.quality}
                  onChange={(e) => setOutput((o) => ({ ...o, quality: Number(e.target.value) }))}
                  className="w-full accent-emerald-500"
                />
              </div>
            )}
            <button
              onClick={processAndDownload}
              disabled={!images.length || processing}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {processing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Processando {progress}%
                </>
              ) : (
                <>
                  <Package size={16} /> Processar & Baixar ({images.length})
                </>
              )}
            </button>

            {processing && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>{progressPhase}</span>
                  <span className="font-mono text-emerald-300">{progress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-200 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Modal: salvar preset customizado */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 backdrop-blur-sm p-4"
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold flex items-center gap-2">
                <Star size={16} className="text-emerald-400" /> Novo preset
              </span>
              <button
                onClick={() => setShowSaveModal(false)}
                className="w-7 h-7 rounded-lg grid place-items-center hover:bg-slate-800 transition"
              >
                <X size={16} />
              </button>
            </div>
            <label className="text-xs text-slate-400">Nome do preset</label>
            <input
              autoFocus
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrentPreset();
                if (e.key === "Escape") setShowSaveModal(false);
              }}
              placeholder="Ex.: Meu look quente"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:border-emerald-500 outline-none"
            />
            <p className="text-[11px] text-slate-500 mt-2">
              Salva os valores atuais dos sliders. Fica guardado no navegador (localStorage).
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={saveCurrentPreset}
                disabled={!newPresetName.trim()}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
