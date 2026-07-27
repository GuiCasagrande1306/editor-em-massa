import { useState } from "react";
import { ImageIcon, Film } from "lucide-react";
import BatchPhotoEditor from "./BatchPhotoEditor.jsx";
import BatchVideoEditor from "./BatchVideoEditor.jsx";

export default function App() {
  const [tab, setTab] = useState("photos");
  // O editor de vídeo só é montado após a 1ª visita à aba (evita baixar o
  // FFmpeg de ~32MB para quem usa só fotos). Depois de montado, fica montado
  // com display:none para não recarregar o motor ao trocar de aba.
  const [videoMounted, setVideoMounted] = useState(false);

  const openTab = (id) => {
    if (id === "videos") setVideoMounted(true);
    setTab(id);
  };

  const TabButton = ({ id, icon: Icon, children }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => openTab(id)}
        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
          active ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-100"
        }`}
      >
        <Icon size={16} />
        {children}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Barra de abas (fica no topo; o header interno de cada editor gruda logo abaixo) */}
      <nav className="sticky top-0 z-30 flex justify-center gap-2 py-2 bg-slate-900/80 backdrop-blur border-b border-slate-800">
        <TabButton id="photos" icon={ImageIcon}>
          Editor de Fotos
        </TabButton>
        <TabButton id="videos" icon={Film}>
          Editor de Vídeos
        </TabButton>
      </nav>

      <div style={{ display: tab === "photos" ? "block" : "none" }}>
        <BatchPhotoEditor />
      </div>
      {videoMounted && (
        <div style={{ display: tab === "videos" ? "block" : "none" }}>
          <BatchVideoEditor />
        </div>
      )}
    </div>
  );
}
