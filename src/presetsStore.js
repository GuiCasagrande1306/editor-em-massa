import { supabase, isSupabaseConfigured } from "./supabaseClient";

// Cache local (também é o storage principal quando o Supabase não está configurado).
const LS_KEY = "bps-custom-presets";
// Identificador anônimo por navegador — sem login, é o que "isola" os presets.
const DEVICE_KEY = "bps-device-id";

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `dev-${Date.now()}-${Math.random()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* modo privado / cota cheia */
  }
}

// Conversões linha do banco <-> objeto de preset usado pela UI.
const rowToPreset = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category || "Meus",
  description: r.description || "Preset criado por você",
  icon: r.icon || "Star",
  custom: true,
  settings: r.settings,
});

const presetToRow = (p) => ({
  id: p.id,
  device_id: getDeviceId(),
  name: p.name,
  category: p.category,
  description: p.description,
  icon: p.icon,
  settings: p.settings,
});

// Busca os presets do usuário. Usa o Supabase quando configurado; senão, localStorage.
// Em qualquer erro de rede, cai no cache local para não quebrar a app.
export async function fetchPresets() {
  if (!isSupabaseConfigured) return readLocal();
  const { data, error } = await supabase
    .from("custom_presets")
    .select("*")
    .eq("device_id", getDeviceId())
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[presets] Supabase indisponível, usando cache local:", error.message);
    return readLocal();
  }
  const list = data.map(rowToPreset);
  writeLocal(list); // mantém o cache em dia
  return list;
}

// Salva um preset (otimista: grava no cache já; sincroniza com o Supabase em seguida).
export async function savePreset(preset) {
  writeLocal([...readLocal(), preset]);
  if (isSupabaseConfigured) {
    const { error } = await supabase.from("custom_presets").insert(presetToRow(preset));
    if (error) console.warn("[presets] Falha ao salvar no Supabase:", error.message);
  }
  return preset;
}

// Exclui um preset (cache + Supabase).
export async function deletePreset(id) {
  writeLocal(readLocal().filter((p) => p.id !== id));
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from("custom_presets")
      .delete()
      .eq("id", id)
      .eq("device_id", getDeviceId());
    if (error) console.warn("[presets] Falha ao excluir no Supabase:", error.message);
  }
}
