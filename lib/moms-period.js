/* lib/moms-period.js — everything the Moms screen needs, for any period.
 *
 * Server-only. One read, one computation, no client fetching.
 *
 * The important behaviour: it fetches by the date MONEY MOVED (`paid_at` on invoices,
 * `receipt_date` on receipts), because the user is on kontantmetoden. Fetching by
 * issue_date would silently shift revenue between quarters — the kind of bug that
 * produces two returns that are each internally consistent and jointly wrong.
 */

import "server-only";
import { requireUser } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { computeMoms, quartersOf, vatQuarter } from "@/lib/moms";
import { periodBoundsUTC } from "@/lib/tid.js";

export async function getMomsPeriod({ key } = {}) {
  const { sb } = await requireUser();
  /* Whose books. Without this an accountant with access to two sets would get both
     merged into one return — two people's VAT summed, and nothing on screen saying so. */
  const ownerId = await getActiveOwnerId();

  const now = new Date();
  const year = key ? Number(key.slice(0, 4)) : now.getUTCFullYear();
  const all = quartersOf(year);
  const period = all.find((q) => q.key === key) || vatQuarter(now);

  /* receipt_date is a plain `date` column and compares exactly against a date string —
     it needs no conversion. Only the timestamptz goes through periodBoundsUTC. */
  const bounds = periodBoundsUTC(period.start, period.end);

  const [{ data: settings }, invRes, recRes] = await Promise.all([
    sb.from("studio_settings").select("*").eq("user_id", ownerId).maybeSingle(),
    sb.from("studio_invoices")
      .select("invoice_number, status, subtotal, vat_amount, total, total_sek, vat_sek, currency, fx_rate, paid_at, reverse_charge, vat_exempt_note, vat_breakdown, venture, studio_clients(name, country_code)")
      .eq("user_id", ownerId)
      /* Half-open, in Stockholm time. paid_at is a timestamptz; comparing it to the
         bare date "2026-03-31" meant midnight, so everything paid during the last day
         of a quarter fell out of that quarter AND out of the next one. See lib/tid.js. */
      .gte("paid_at", bounds.from).lt("paid_at", bounds.toExclusive),
    sb.from("studio_receipts")
      .select("vendor, receipt_date, vat_amount, total, total_sek, vat_sek, currency, fx_rate, fx_source, fx_date, category, venture, vat_treatment, is_business, is_deductible, business_share, locked_at")
      .eq("user_id", ownerId)
      .gte("receipt_date", period.start).lte("receipt_date", period.end),
  ]);

  for (const [name, res] of [["studio_invoices", invRes], ["studio_receipts", recRes]]) {
    if (res.error) console.error(`[moms] ${name}:`, res.error.message);
  }

  const invoices = (invRes.data || []).map((i) => ({
    ...i,
    buyer_country: i.studio_clients?.country_code || "SE",
  }));
  const receipts = recRes.data || [];

  const result = computeMoms({ invoices, receipts, period });

  /* Lämnad eller inte är ett faktum i studio_moms_perioder, inte något som
     härleds ur kvittona. Raden som stod här läste r.locked_at — en kolumn som
     aldrig funnits på studio_receipts — så filed var alltid false och ingen
     påminnelse kunde bygga på den. Se migration 015. */
  const { data: lamnadRad } = await sb
    .from("studio_moms_perioder")
    .select("period_key, lamnad_at, belopp")
    .eq("user_id", ownerId)
    .eq("period_key", period.key)
    .maybeSingle();
  const locked = !!lamnadRad;

  return {
    period,
    year,
    quarters: all,
    settings: settings || null,
    ...result,
    counts: { invoices: invoices.length, receipts: receipts.length },
    filed: locked,
    lamnad_at: lamnadRad?.lamnad_at || null,
    lamnat_belopp: lamnadRad?.belopp ?? null,
    registeredFrom: settings?.vat_registered_from || null,
    deregisteredFrom: settings?.vat_dereg_from || null,
  };
}
