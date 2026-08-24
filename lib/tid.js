/* lib/tid.js — period boundaries that mean what a Swedish accountant means.
 *
 * THE BUG THIS EXISTS TO KILL
 * `paid_at` is a timestamptz. The period filters compared it against a bare date
 * string: .gte("paid_at", "2026-01-01").lte("paid_at", "2026-03-31"). PostgREST casts
 * that bound to 2026-03-31 00:00:00+00 — MIDNIGHT — so anything paid during the last
 * day of a quarter failed both comparisons:
 *
 *   Paid 2026-03-31 14:32 Stockholm  →  stored 2026-03-31T12:32:00Z
 *     >= '2026-01-01'  true
 *     <= '2026-03-31'  false   ← out of Q1
 *     >= '2026-04-01'  false   ← out of Q2
 *
 * Four days of revenue a year, declared in no period at all. The mirror case is
 * worse: paid just after midnight on 1 April, Stockholm time, is 2026-03-31T22:30Z
 * and lands in Q1 — putting Q2 revenue in the Q1 return and making both wrong.
 *
 * THE FIX IS A HALF-OPEN INTERVAL IN THE RIGHT ZONE
 * [start of the period, start of the NEXT period) — expressed as the UTC instants of
 * Stockholm midnight. Half-open is what makes the boundary unambiguous: every instant
 * belongs to exactly one period, with no gap and no overlap.
 *
 * WHY NOT JUST APPEND "T23:59:59"
 * Because Sweden is +01:00 in winter and +02:00 in summer, and every VAT quarter
 * boundary except one falls on a different side of that switch. A hardcoded offset is
 * right for two quarters a year and wrong for the other two.
 *
 * `receipt_date` is a plain `date` column and needs none of this — comparing a date to
 * a date string is exact. Only timestamptz columns go through here.
 */

const ZONE = "Europe/Stockholm";

/** Minutes Stockholm is ahead of UTC at a given instant (+60 winter, +120 summer). */
function offsetMinutes(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asIfUTC - instant.getTime()) / 60000;
}

/**
 * The UTC instant at which a given calendar day begins in Stockholm.
 * @param {string} isoDate "YYYY-MM-DD"
 * @returns {string} ISO instant, e.g. "2026-03-31T22:00:00.000Z"
 */
export function dayStartUTC(isoDate) {
  const naive = new Date(`${isoDate}T00:00:00Z`);
  /* Two passes: the first offset is read at the wrong instant when the guess lands on
     the far side of a DST change, so re-read it at the corrected instant and settle. */
  let guess = new Date(naive.getTime() - offsetMinutes(naive) * 60000);
  guess = new Date(naive.getTime() - offsetMinutes(guess) * 60000);
  return guess.toISOString();
}

/** The day after `isoDate`, as a "YYYY-MM-DD" string. Calendar arithmetic only. */
export function nextDay(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Half-open bounds for a period given inclusive calendar dates.
 * @returns {{from: string, toExclusive: string}} UTC instants for a timestamptz filter.
 */
export function periodBoundsUTC(startDate, endDate) {
  return { from: dayStartUTC(startDate), toExclusive: dayStartUTC(nextDay(endDate)) };
}

/** Does a stored timestamptz fall inside the period? Mirrors the SQL filter exactly. */
export function withinPeriod(timestamptz, startDate, endDate) {
  if (!timestamptz) return false;
  const { from, toExclusive } = periodBoundsUTC(startDate, endDate);
  const t = new Date(timestamptz).getTime();
  return t >= new Date(from).getTime() && t < new Date(toExclusive).getTime();
}
