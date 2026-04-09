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

if (window.trackStage) window.trackStage('supabase-module-loaded');

let supabase;
try {
  if (window.trackStage) window.trackStage('supabase-createClient-start');
  supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
  if (window.trackStage) window.trackStage('supabase-createClient-done');
} catch (e) {
  console.error("Supabase createClient failed, clearing auth storage and retrying:", e);
  if (window.trackStage) window.trackStage('supabase-createClient-FAILED: ' + (e.message || '').substring(0, 100));
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.includes("supabase") || k.includes("sb-")) localStorage.removeItem(k);
    });
  } catch (clearErr) { localStorage.clear(); }
  supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
  if (window.trackStage) window.trackStage('supabase-createClient-retry-done');
}

export { supabase };
