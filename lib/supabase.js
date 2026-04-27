/* Browser-safe Supabase helpers. Only this module may be imported by
   "use client" components and any module that's also imported by them.
   Server-only helpers live in `lib/supabase-server.js`. */
import { createBrowserClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  // Don't throw at import-time so the build doesn't fail in CI without real envs.
  console.warn("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function browserClient() {
  return createBrowserClient(URL, ANON);
}
