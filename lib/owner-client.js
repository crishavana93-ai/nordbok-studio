"use client";

/* lib/owner-client.js — the active owner, on the client.
 *
 * The cookie is deliberately not httpOnly so a Client Component can read which books
 * are being shown without a round trip. It is a DISPLAY hint only: the server
 * validates it in app/api/owner/route.js before writing it, and RLS is what actually
 * decides which rows exist. Never treat this value as permission.
 */

export const OWNER_COOKIE = "nordbok_owner";

export function readActiveOwnerId(fallbackUserId = null) {
  if (typeof document === "undefined") return fallbackUserId;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(OWNER_COOKIE + "="));
  const val = hit ? decodeURIComponent(hit.slice(OWNER_COOKIE.length + 1)) : null;
  return val || fallbackUserId;
}
