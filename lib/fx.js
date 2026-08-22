/* lib/fx.js — Foreign-currency → SEK conversion for VAT and bookkeeping.
 *
 * WHY THIS EXISTS
 * Webflow bills USD. Anthropic and Zoho bill EUR. Swedish VAT must be reported in SEK.
 * Skatteverket accepts either the Riksbank daily rate or the ECB daily rate, applied
 * consistently. Under kontantmetoden (bokslutsmetoden) the rate that governs is the one
 * for the date the MONEY MOVED, not the invoice date.
 *
 * THE RULE THIS MODULE ENFORCES
 * A rate is never guessed. Every conversion returns the rate, its source and the exact
 * date it came from, and the caller is expected to persist all three alongside the
 * transaction. If no rate can be established, this throws. It does not fall back to a
 * plausible number — a silently wrong rate is worse than a failed import, because it
 * ends up on a tax return you can't defend.
 *
 * PROVIDERS
 *   ecb       — no API key, open. Default.
 *   riksbank  — requires a free account at developer.api.riksbank.se; set
 *               RIKSBANK_API_KEY to enable. Series IDs look like SEKEURPMI, SEKUSDPMI.
 *
 * Source: Skatteverket, "Omräkning av valuta under löpande år" — spot rate from
 * Riksbanken or ECB, consistently applied.
 */

const ECB_BASE = "https://data-api.ecb.europa.eu/service/data/EXR";
const MAX_LOOKBACK_DAYS = 10; // weekends, Swedish holidays, ECB non-publication days
const DEFAULT_PROVIDER = process.env.FX_PROVIDER || "ecb";

export class FxError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "FxError";
    this.meta = meta;
  }
}

const iso = (d) => (typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));

function shiftDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ── ECB ────────────────────────────────────────────────────────────────────
 * The ECB publishes everything against EUR: series D.<CUR>.EUR.SP00.A gives
 * units of <CUR> per 1 EUR. So:
 *     SEK per EUR = D.SEK.EUR.SP00.A
 *     SEK per USD = (SEK per EUR) / (USD per EUR)
 * Rates are published on TARGET business days only, hence the look-back window.
 */
async function ecbSeries(currency, fromDate, toDate) {
  const url = `${ECB_BASE}/D.${currency}.EUR.SP00.A?startPeriod=${fromDate}&endPeriod=${toDate}&format=csvdata`;
  const res = await fetch(url, { headers: { Accept: "text/csv" } });
  if (!res.ok) throw new FxError(`ECB request failed (${res.status}) for ${currency}`, { url, status: res.status });

  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const iTime = header.indexOf("TIME_PERIOD");
  const iVal = header.indexOf("OBS_VALUE");
  if (iTime === -1 || iVal === -1) {
    throw new FxError("ECB response shape changed — TIME_PERIOD/OBS_VALUE not found", { header });
  }

  return lines
    .slice(1)
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .map((cols) => ({ date: cols[iTime], value: Number(cols[iVal]) }))
    .filter((r) => r.date && Number.isFinite(r.value))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}

/** Most recent observation on or before `date`. */
function pickOnOrBefore(rows, date) {
  return rows.find((r) => r.date <= date) || null;
}

async function ecbSekPerUnit(currency, date) {
  const from = shiftDays(date, -MAX_LOOKBACK_DAYS);

  if (currency === "EUR") {
    const row = pickOnOrBefore(await ecbSeries("SEK", from, date), date);
    if (!row) throw new FxError(`No ECB SEK/EUR observation within ${MAX_LOOKBACK_DAYS} days of ${date}`, { date });
    return { rate: row.value, rateDate: row.date };
  }

  const [sekRows, curRows] = await Promise.all([ecbSeries("SEK", from, date), ecbSeries(currency, from, date)]);
  const sek = pickOnOrBefore(sekRows, date);
  const cur = pickOnOrBefore(curRows, date);
  if (!sek || !cur) {
    throw new FxError(`No ECB observation for ${currency} within ${MAX_LOOKBACK_DAYS} days of ${date}`, { date, currency });
  }
  if (!cur.value) throw new FxError(`ECB returned a zero rate for ${currency} on ${cur.date}`, { currency });

  // Use the same publication date for both legs, else the cross-rate is inconsistent.
  const day = sek.date < cur.date ? sek.date : cur.date;
  const sekSame = pickOnOrBefore(sekRows, day);
  const curSame = pickOnOrBefore(curRows, day);
  if (!sekSame || !curSame || !curSame.value) {
    throw new FxError(`Could not align ECB legs for ${currency} on ${day}`, { currency, day });
  }

  return { rate: sekSame.value / curSame.value, rateDate: day };
}

/* ── Riksbank (optional) ───────────────────────────────────────────────────
 * Requires a free account at developer.api.riksbank.se. Series IDs follow the
 * pattern SEK<CUR>PMI (e.g. SEKEURPMI, SEKUSDPMI). Left deliberately narrow:
 * it throws unless a key is present, so nothing silently degrades.
 */
async function riksbankSekPerUnit(currency, date) {
  const key = process.env.RIKSBANK_API_KEY;
  if (!key) throw new FxError("RIKSBANK_API_KEY is not set — cannot use the riksbank provider", { currency });

  const series = `SEK${currency}PMI`;
  const from = shiftDays(date, -MAX_LOOKBACK_DAYS);
  const url = `https://api.riksbank.se/swea/v1/Observations/${series}/${from}/${date}`;
  const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" } });
  if (!res.ok) throw new FxError(`Riksbank request failed (${res.status}) for ${series}`, { url, status: res.status });

  const rows = (await res.json())
    .map((o) => ({ date: String(o.date || o.dt || "").slice(0, 10), value: Number(o.value ?? o.val) }))
    .filter((r) => r.date && Number.isFinite(r.value))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const row = pickOnOrBefore(rows, date);
  if (!row) throw new FxError(`No Riksbank observation for ${series} near ${date}`, { series, date });
  return { rate: row.value, rateDate: row.date };
}

/* ── Public API ────────────────────────────────────────────────────────────── */

/**
 * SEK per 1 unit of `currency` on `date`.
 * Reads through a `fx_rates` cache when a Supabase client is supplied.
 *
 * @returns {Promise<{rate:number, source:string, rateDate:string, currency:string, date:string}>}
 * @throws  {FxError} when no defensible rate can be established. Never returns a guess.
 */
export async function getSekRate({ currency, date, sb = null, provider = DEFAULT_PROVIDER }) {
  const cur = String(currency || "SEK").toUpperCase();
  const day = iso(date);

  if (cur === "SEK") return { rate: 1, source: "identity", rateDate: day, currency: cur, date: day };

  if (sb) {
    const { data } = await sb
      .from("fx_rates")
      .select("rate, source, rate_date")
      .eq("currency", cur)
      .eq("date", day)
      .maybeSingle();
    if (data?.rate) {
      return { rate: Number(data.rate), source: data.source, rateDate: data.rate_date, currency: cur, date: day };
    }
  }

  const fetched = provider === "riksbank" ? await riksbankSekPerUnit(cur, day) : await ecbSekPerUnit(cur, day);
  const result = { rate: fetched.rate, source: provider, rateDate: fetched.rateDate, currency: cur, date: day };

  if (sb) {
    await sb
      .from("fx_rates")
      .upsert(
        { currency: cur, date: day, rate: result.rate, source: result.source, rate_date: result.rateDate },
        { onConflict: "currency,date" }
      );
  }

  return result;
}

/**
 * Convert an amount to SEK, rounded to öre.
 * Returns the rate and its provenance so the caller can persist them on the row —
 * that stored provenance is what makes the figure defensible to Skatteverket later.
 */
export async function toSek({ amount, currency, date, sb = null, provider = DEFAULT_PROVIDER }) {
  const r = await getSekRate({ currency, date, sb, provider });
  const amountSek = Math.round(Number(amount) * r.rate * 100) / 100;
  return { amountSek, rate: r.rate, source: r.source, rateDate: r.rateDate, currency: r.currency, date: r.date };
}

/** Human-readable provenance for an invoice footer or an audit note. */
export function rateNote({ rate, source, rateDate, currency }) {
  const label = source === "ecb" ? "ECB" : source === "riksbank" ? "Riksbanken" : source;
  return `1 ${currency} = ${rate.toFixed(4)} SEK (${label}, ${rateDate})`;
}
