import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("[Brain] Supabase URL present:", !!supabaseUrl, supabaseUrl ? supabaseUrl.substring(0, 30) + "..." : "MISSING");
console.log("[Brain] Supabase key present:", !!supabaseAnonKey, supabaseAnonKey ? "key length=" + supabaseAnonKey.length : "MISSING");

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

export async function getSessionUser() {
  // Use getUser() instead of getSession() -- getSession() can hang with stale tokens
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.log("[Brain] getSessionUser error:", error.message);
    return null;
  }
  return user || null;
}

export async function getUserRole(userId) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role, workspace_id")
    .eq("user_id", userId);
  if (!data || data.length === 0) return null;
  return data[0];
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}
