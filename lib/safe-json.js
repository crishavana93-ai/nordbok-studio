/* lib/safe-json.js — read a fetch() response without exploding on an error page.
 *
 * THE BUG THIS REPLACES
 * Every client in the app did `const j = await res.json()`. When a route times out or
 * throws, Next returns an HTML error page — and res.json() then throws a SyntaxError.
 * The catch block printed e.message, so the entire explanation the user got for a
 * failed invoice was:
 *
 *   Unexpected token '<', "<!DOCTYPE"... is not valid JSON
 *
 * which describes the parser's disappointment rather than anything that happened.
 */

/**
 * @returns {Promise<{ok: boolean, status: number, data: object, error: string|null}>}
 *   Never throws. `error` carries a sentence a Swedish user can act on.
 */
export async function safeJson(res) {
  const status = res?.status ?? 0;

  let text = "";
  try { text = await res.text(); } catch { /* body already consumed or connection died */ }

  if (text) {
    try {
      const data = JSON.parse(text);
      return { ok: res.ok, status, data, error: res.ok ? null : (data?.error || nameIt(status)) };
    } catch { /* not JSON — fall through */ }
  }

  /* Not JSON. Say what the status actually means rather than quoting the parser. */
  return { ok: false, status, data: {}, error: nameIt(status, text) };
}

function nameIt(status, body = "") {
  if (status === 0)   return "Ingen kontakt med servern. Är du online?";
  if (status === 401) return "Din session har gått ut. Logga in igen.";
  if (status === 403) return "Du har inte behörighet till det här.";
  if (status === 404) return "Adressen finns inte längre.";
  if (status === 413) return "Filen är för stor.";
  if (status === 429) return "För många försök. Vänta en stund och prova igen.";
  if (status === 504 || status === 408) return "Servern hann inte svara. Ingenting sparades — prova igen.";
  if (status >= 500)  return "Något gick fel på servern. Ingenting sparades — prova igen om en stund.";
  if (/<!DOCTYPE|<html/i.test(body)) return "Servern svarade med en felsida i stället för data.";
  return `Oväntat svar från servern (${status}).`;
}

/** fetch + safeJson in one call, with network failure folded into the same shape. */
export async function postJson(url, body, init = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      body: JSON.stringify(body),
      ...init,
    });
    return await safeJson(res);
  } catch (e) {
    return {
      ok: false, status: 0, data: {},
      error: e?.name === "AbortError" ? "Avbrutet." : "Ingen kontakt med servern. Är du online?",
    };
  }
}
