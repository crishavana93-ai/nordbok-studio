/* lib/report-error.js — the one place an error goes to be recorded.
 *
 * Before this existed the app had ten console.error calls and nothing else. On Vercel
 * those land in a log stream nobody watches and that expires. If /api/invoices/send
 * started failing tonight, the first signal would have been a customer asking where
 * their invoice went.
 *
 * THREE RULES
 *
 * 1. IT NEVER THROWS. A reporter that can fail turns one bug into two, and the second
 *    one lands inside a catch block where nothing is left to catch it.
 * 2. IT NEVER BLOCKS. Fire and forget on the client. The user is already having a bad
 *    time; do not make them wait for the paperwork.
 * 3. IT NEVER CARRIES MORE THAN IT NEEDS. Context in this app means personnummer,
 *    client names and amounts. Pass a small hand-assembled object -- never a row,
 *    never a request body. redact() below is the backstop, not the plan.
 */

const MAX_CONTEXT_BYTES = 2000;
const MAX_STACK_CHARS = 4000;

/* Keys whose values are never worth the risk, whatever the call site intended. */
const FORBIDDEN = /pass|secret|token|key|authorization|cookie|personnummer|pnr|iban|bankgiro|plusgiro|vat_number|org_nr|email/i;

function redact(value, depth = 0) {
  if (value == null) return value;
  if (depth > 3) return "[djupt]";
  if (typeof value === "string") return value.length > 300 ? value.slice(0, 300) + "…" : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = FORBIDDEN.test(k) ? "[redigerad]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function trimToBytes(obj, limit) {
  try {
    let json = JSON.stringify(obj);
    if (json.length <= limit) return obj;
    /* Too big: keep the keys, drop the values, say so. */
    return { _trunkerad: true, nycklar: Object.keys(obj || {}).slice(0, 30) };
  } catch {
    return { _oserialiserbar: true };
  }
}

/**
 * @param {Error|string} err
 * @param {{ scope: string, context?: object, level?: "error"|"warn", sb?: object, userId?: string|null, url?: string }} opts
 */
export async function reportError(err, opts = {}) {
  const scope = opts.scope || "okand";
  const message = (err?.message || String(err) || "okänt fel").slice(0, 1000);
  const stack = typeof err?.stack === "string" ? err.stack.slice(0, MAX_STACK_CHARS) : null;

  /* Always leave a trace where a developer will look, even if the write fails. */
  try { console.error(`[${scope}]`, message, opts.context ?? ""); } catch { /* ignore */ }

  const row = {
    scope,
    message,
    stack,
    level: opts.level === "warn" ? "warn" : "error",
    context: trimToBytes(redact(opts.context), MAX_CONTEXT_BYTES),
    url: opts.url || (typeof window !== "undefined" ? window.location?.pathname : null),
  };

  try {
    let sb = opts.sb;
    if (!sb) {
      if (typeof window === "undefined") return; // server callers must pass their client
      const { browserClient } = await import("@/lib/supabase");
      sb = browserClient();
    }
    let userId = opts.userId;
    if (userId === undefined && typeof window !== "undefined") {
      const { data } = await sb.auth.getUser();
      userId = data?.user?.id ?? null;
    }
    /* Result deliberately unchecked — see rule 1. There is nowhere left to report a
       failure to report, and retrying would risk a loop. */
    await sb.from("studio_error_log").insert({ ...row, user_id: userId ?? null });
  } catch {
    /* Swallowed on purpose. */
  }
}

/** Fire-and-forget wrapper for call sites that must not await. */
export function reportErrorAsync(err, opts) {
  try { void reportError(err, opts); } catch { /* ignore */ }
}
