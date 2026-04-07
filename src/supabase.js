import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing — auth will not work. See .env.example");
}

// Strip error fragments before Supabase client init -- Supabase tries to parse
// the hash on createClient and can throw on malformed/error tokens
try {
  const h = window.location.hash || "";
  if (h.includes("error=") || h.includes("error_code=")) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
} catch (e) { /* ignore */ }

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
