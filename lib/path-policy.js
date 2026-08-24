/* lib/path-policy.js — which requests the middleware may redirect.
 *
 * Kept free of any next/server import so it can be unit-tested in plain Node.
 * The reasoning behind it lives in lib/middleware-supabase.js.
 *
 *   "public"       — no session needed
 *   "self-guarded" — /api/*: the route handler decides; never redirect
 *   "protected"    — a page; no session means go and log in
 */
export function pathPolicy(path) {
  const p = String(path || "");
  if (p === "/api/auth" || p.startsWith("/api/auth/")) return "public";
  if (p === "/api" || p.startsWith("/api/")) return "self-guarded";
  if (p === "/" || p === "/login" || p.startsWith("/login/")) return "public";
  return "protected";
}
