import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing — auth will not work. See .env.example");
}

// Strip error fragments before Supabase client init
try {
  const h = window.location.hash || "";
  if (h.includes("error=") || h.includes("error_code=")) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
} catch (e) { /* ignore */ }

// Create client with crash protection -- if localStorage has a corrupted token,
// clear it and retry rather than crashing the entire app
let supabase;
try {
  supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
} catch (e) {
  console.error("Supabase createClient failed, clearing auth storage and retrying:", e);
  // Clear all Supabase-related localStorage keys
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.includes("supabase") || k.includes("sb-")) localStorage.removeItem(k);
    });
  } catch (clearErr) { localStorage.clear(); }
  // Retry
  supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
}

export { supabase };
