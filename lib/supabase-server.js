import "server-only";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ─── Server client for app-router (Server Components / Route Handlers) ─── */
export async function serverClient() {
  const cookieStore = await cookies();
  return createSSRClient(URL, ANON, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(list) {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
      },
    },
  });
}

/* ─── Service-role client (server-only; bypasses RLS — use with care) ─── */
export function serviceClient() {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* ─── Helper: require an authenticated user in a route handler ─── */
export async function requireUser() {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return { user, sb };
}
