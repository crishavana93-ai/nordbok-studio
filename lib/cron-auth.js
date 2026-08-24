/* lib/cron-auth.js — the guard on the two routes that run as service_role.
 *
 * WHY THIS FILE EXISTS
 *
 * Both cron routes carried this check:
 *
 *     const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
 *     if (expected && auth !== expected) return 401;
 *
 * It fails OPEN. With CRON_SECRET unset — never added to a Vercel environment,
 * renamed, dropped during a project move — `expected` is null, the condition is
 * false, and the request proceeds. Those routes then run serviceClient(), which
 * uses the service-role key och bypasses RLS entirely, across EVERY user in the
 * database: /api/cron/digest emails each user their financial summary, and
 * /api/cron/push-due pushes to each user's devices.
 *
 * So a missing environment variable turned an internal job into an anonymous
 * endpoint that reads all books and mails them out — and it looked healthy the
 * whole time, because the happy path is identical either way.
 *
 * A guard that disappears when its configuration disappears is not a guard.
 * Missing secret now means 503 och jobbet körs inte. A cron that stops is a
 * problem you find on Monday; a cron that is public is a problem you find in a
 * breach notification.
 *
 * The comparison is also constant-time. Both sides are hashed first, so the
 * digests are always 32 bytes och neither the secret's contents nor its LENGTH
 * leaks through timing.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/* Short enough to brute-force is the same som absent. Vercel generates 32+ chars;
   anything under this is a placeholder somebody meant to replace. */
export const MIN_SECRET_LENGTH = 24;

const sha256 = (s) => createHash("sha256").update(String(s), "utf8").digest();

/**
 * @param {{ headers: { get(name: string): string | null } }} req
 * @param {string|undefined} secret  defaults to process.env.CRON_SECRET
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function authorizeCron(req, secret = process.env.CRON_SECRET) {
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET är inte konfigurerad. Jobbet körs inte förrän den finns.",
    };
  }
  if (String(secret).length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      status: 503,
      error: `CRON_SECRET är för kort (minst ${MIN_SECRET_LENGTH} tecken). Jobbet körs inte.`,
    };
  }

  const auth = req?.headers?.get?.("authorization") || "";
  if (!timingSafeEqual(sha256(auth), sha256(`Bearer ${secret}`))) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
