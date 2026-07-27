import { createClient } from "@supabase/supabase-js";

// As variáveis vêm do .env (prefixo VITE_ é obrigatório para o Vite expor no client).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Se as envs não estiverem setadas, a app continua funcionando só com localStorage.
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
