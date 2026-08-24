/* lib/kronor.js — money arithmetic. One authority, öre-exact.
 *
 * WHAT WAS WRONG WITH THE FOUR COPIES THIS REPLACES
 * lib/moms.js, lib/dashboard-data.js, lib/invoice-compliance.js and
 * scripts/backfill-fx.mjs each carried:
 *
 *   Math.round((Number(n) + Number.EPSILON) * 100) / 100
 *
 * Number.EPSILON is an ABSOLUTE quantity (2.22e-16). Above about 2 it is smaller than
 * half a ULP, so adding it changes nothing and the guard silently stops working —
 * exactly in the range where invoice amounts live.
 *
 *   8.54 kr @ 25 %  → exact 2.135 → that helper gives 2.13, correct is 2.14
 *   50.66 × 0.75    → exact 37.995 → gives 37.99, correct is 38.00
 *
 * Every one of those is an öre lost from ruta 48 or added to an invoice line.
 *
 * THE FIX
 * toFixed() rounds in DECIMAL, not binary, so it collapses the representation error
 * before Math.round sees it. Scale to öre, snap at a precision far below anything
 * money cares about, then round.
 *
 * IMPORTED WITH AN EXPLICIT .js EXTENSION
 * webpack resolves extensionless relative imports; plain Node ESM does not, and
 * `npm test` runs under plain Node so the tests exercise the real modules rather than
 * copies. Keep the extension on every import of this file.
 *
 * WHY NOT INTEGER ÖRE THROUGHOUT
 * That is the real answer and it remains the right long-term refactor — every amount
 * an integer, formatted only at the edge. It touches every table and every component,
 * so it is not this change. This makes the arithmetic correct today.
 */

/** Round to whole öre, half away from zero — the convention Swedish invoicing uses. */
export function ore(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const scaled = Number((v * 100).toFixed(6));
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / 100;
}

/** Round to whole kronor — what Skatteverket's momsdeklaration accepts. */
export function krona(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const snapped = Number(v.toFixed(6));
  return snapped < 0 ? -Math.round(-snapped) : Math.round(snapped);
}

/** Sum with öre rounding applied once at the end, not per addition. */
export function sumOre(values) {
  return ore(values.reduce((a, v) => a + (Number(v) || 0), 0));
}

/** VAT on a net amount at a percentage rate. */
export function momsOf(net, ratePercent) {
  return ore(Number(net) * (Number(ratePercent) / 100));
}
