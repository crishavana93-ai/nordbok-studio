/* lib/format.js — the single authority for how a number, a date or a time is
 * rendered anywhere in Nordbok Studio.
 *
 * WHY THIS FILE EXISTS
 * Every screen was formatting its own numbers with a local `Intl.NumberFormat`.
 * That is how you end up with "kr 1,234.50" on one screen and "1 234,50 kr" on
 * the next, and it is how the accessibility half never gets done at all.
 * Route every displayed number through here. No exceptions.
 *
 * THE SWEDISH RULES (Språkrådet / Språkkonsulterna / CLDR sv-SE)
 *   Amount in a field or table   1 234,50 kr      — "kr" AFTER, with a space
 *   Amount in running prose      1 234 kronor     — spell it out, never "kr"
 *   Thousands separator          U+202F narrow no-break space. Never a comma.
 *   Decimal separator            comma, always
 *   Percent                      25 %             — space before the sign
 *   Date, tabular                2026-08-12       — ISO 8601 is the Swedish norm
 *   Date, prose                  12 augusti 2026  — lowercase month, no ordinals
 *   Time                         23.59            — full stop, not a colon
 *   Missing value                – visually, "Ej tillgängligt" to a screen reader
 *
 * THE ACCESSIBILITY HALF (DNB Eufemia's NumberFormat, which documents this best)
 * A screen reader reads "45 804" as "45" then "804". Every amount therefore ships
 * a SEPARATE spoken string with the group separators stripped. Use `money()` and
 * spread its result onto the element:
 *
 *     const m = money(1234.5);
 *     <span className="tnum" lang="sv-SE" aria-label={m.spoken}>{m.text}</span>
 *
 * There is no `kr` variant that omits the aria-label. If you find yourself
 * wanting one, you want `money().text` and you should say so explicitly.
 */

/** Narrow no-break space — CLDR sv-SE's group separator. */
export const NNBSP = " ";
/** Real minus, not a hyphen. Intl already emits this for sv-SE; we keep it explicit. */
export const MINUS = "−";

const MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

/* Node and browsers disagree about which space ICU emits for sv-SE groups
 * (U+00A0 in some versions, U+202F in others). Normalise every space-like
 * character to the one we actually want. */
function normaliseSpaces(s) {
  return s.replace(/[    ]/g, NNBSP);
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return NaN;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** The one true missing value. Visually an en dash; spoken as words. */
export const NA = Object.freeze({ text: "–", spoken: "Ej tillgängligt", missing: true });

/**
 * Format a plain number, Swedish. No currency.
 * @param {number|string} value
 * @param {{decimals?: number}} [opts] decimals defaults to 0
 */
export function num(value, opts = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return NA.text;
  const d = opts.decimals ?? 0;
  return normaliseSpaces(
    new Intl.NumberFormat("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
  );
}

/**
 * Money, for a field, a table cell or anywhere digits line up.
 * Returns BOTH the visible string and the string a screen reader should hear.
 * @param {number|string} value
 * @param {{decimals?: number, currency?: string, signed?: boolean}} [opts]
 *        decimals defaults to 2 · currency defaults to "kr" · signed forces a + on positives
 * @returns {{text: string, spoken: string, missing?: boolean, negative: boolean}}
 */
export function money(value, opts = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return { ...NA, negative: false };

  const decimals = opts.decimals ?? 2;
  const unit = opts.currency ?? "kr";
  const negative = n < 0;

  let body = num(Math.abs(n), { decimals });
  const sign = negative ? MINUS : opts.signed ? "+" : "";
  const text = `${sign}${body} ${unit}`;

  return { text, spoken: spoken(n, { decimals, unit }), negative };
}

/**
 * What a screen reader should hear. Group separators are stripped so the number
 * is read as one quantity rather than as its parts, and öre are named.
 */
export function spoken(value, opts = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return NA.spoken;

  const decimals = opts.decimals ?? 2;
  const unit = opts.unit ?? "kr";
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const frac = Math.round((abs - whole) * Math.pow(10, decimals));

  const words = unit === "kr" ? { one: "krona", many: "kronor", sub: "öre" } : { one: unit, many: unit, sub: "" };
  const head = `${whole} ${whole === 1 ? words.one : words.many}`;
  const tail = decimals > 0 && frac > 0 && words.sub ? ` och ${frac} ${words.sub}` : "";
  return `${n < 0 ? "minus " : ""}${head}${tail}`;
}

/**
 * Money in running prose: "1 234 kronor". Never "kr" — Språkkonsulterna are
 * explicit that abbreviations belong in fields, not in sentences.
 */
export function moneyProse(value, opts = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return NA.spoken.toLowerCase();
  const decimals = opts.decimals ?? 0;
  const abs = num(Math.abs(n), { decimals });
  const word = Math.abs(n) === 1 && decimals === 0 ? "krona" : "kronor";
  return `${n < 0 ? MINUS : ""}${abs} ${word}`;
}

/** "25 %" — the space before the sign is required in Swedish. */
export function pct(value, opts = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return NA.text;
  return `${num(n, { decimals: opts.decimals ?? 0 })} %`;
}

function asDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** "2026-08-12" — ISO 8601, the Swedish norm. Use in tables and anywhere exact. */
export function dateISO(d) {
  const dt = asDate(d);
  if (!dt) return NA.text;
  const p = (x) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** "12 augusti 2026" — lowercase month, no ordinals. Use in sentences. */
export function dateProse(d, opts = {}) {
  const dt = asDate(d);
  if (!dt) return NA.spoken.toLowerCase();
  const base = `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
  return opts.year === false ? base : `${base} ${dt.getFullYear()}`;
}

/** "23.59" — Swedish uses a full stop. A colon would read as a foreign convention,
 *  and 18,30 is money while 18.30 is a time. */
export function time(d) {
  const dt = asDate(d);
  if (!dt) return NA.text;
  const p = (x) => String(x).padStart(2, "0");
  return `${p(dt.getHours())}.${p(dt.getMinutes())}`;
}

/** ISO week number. Swedes navigate by "vecka 32" — it is ordinary UI vocabulary. */
export function isoWeek(d) {
  const dt = asDate(d);
  if (!dt) return null;
  const t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

/** "vecka 32" */
export function week(d) {
  const w = isoWeek(d);
  return w === null ? NA.text : `vecka ${w}`;
}

/**
 * Relative day count, written the way a person would say it.
 * Positive = in the future. Used for deadlines.
 */
export function daysPhrase(days) {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n)) return NA.text;
  if (n === 0) return "sista dagen";
  if (n === 1) return "1 dag kvar";
  if (n > 1) return `${num(n)} dagar kvar`;
  if (n === -1) return "1 dag försenad";
  return `${num(Math.abs(n))} dagar försenad`;
}
