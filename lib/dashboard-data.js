/* lib/dashboard-data.js — one server-side read for the whole dashboard.
 *
 * Runs in a Server Component. RLS keeps every query inside this user's rows, so
 * nothing here filters by user_id by hand.
 *
 * Everything the dashboard shows comes from this one call — no client fetching, no
 * waterfalls, no loading spinners inside tiles.
 */

import "server-only";
import { ore } from "./kronor.js";
import { requireUser } from "@/lib/supabase-server";
import { computeMoms, vatQuarter } from "@/lib/moms";
import { getActiveOwnerId } from "@/lib/access";

export const VENTURES = [
  { key: "turquino",        name: "Turquino Studios", color: "var(--s1)" },
  { key: "the_next_cigar",  name: "The Next Cigar",   color: "var(--s2)" },
  { key: "zamacharters",    name: "Zamacharters",     color: "var(--s3)" },
];

const MONTHS = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
/* Was a local copy that added Number.EPSILON — see lib/kronor.js for why that
   silently stopped working above ~2 kr. */
const r2 = ore;

export async function getDashboard({ year = new Date().getUTCFullYear(), today = new Date() } = {}) {
  const { sb, user } = await requireUser();
  /* See the note in lib/moms-period.js — an unfiltered query merges owners. */
  const ownerId = await getActiveOwnerId();
  const q = vatQuarter(today);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [settingsRes, invoicesRes, receiptsRes] = await Promise.all([
    sb.from("studio_settings").select("*").eq("user_id", ownerId).maybeSingle(),

    // Kontantmetoden: the year's activity is what was PAID in the year.
    sb.from("studio_invoices")
      .select("invoice_number, status, subtotal, vat_amount, total, total_sek, vat_sek, currency, fx_rate, fx_source, fx_date, issue_date, due_date, paid_at, venture, reverse_charge, vat_exempt_note, vat_breakdown, studio_clients(name, country_code)")
      .eq("user_id", ownerId)
      .or(`and(paid_at.gte.${yearStart},paid_at.lte.${yearEnd}),status.neq.paid`)
      .order("issue_date", { ascending: false })
      .limit(500),

    sb.from("studio_receipts")
      .select("vendor, receipt_date, vat_amount, total, total_sek, vat_sek, currency, fx_rate, fx_source, fx_date, category, venture, vat_treatment, is_business, is_deductible, business_share")
      .eq("user_id", ownerId)
      .gte("receipt_date", yearStart).lte("receipt_date", yearEnd)
      .order("receipt_date", { ascending: false })
      .limit(1000),
  ]);

  /* Surface errors instead of silently rendering zeros. A blocked read and an empty
     table look identical downstream, which is exactly how a broken dashboard ends up
     looking merely empty. */
  for (const [name, res] of [["studio_settings", settingsRes], ["studio_invoices", invoicesRes], ["studio_receipts", receiptsRes]]) {
    if (res.error) {
      console.error(`[dashboard] ${name} query failed:`, res.error.message, res.error.details || "", res.error.hint || "");
    }
  }

  const settings = settingsRes.data;
  const invoices = invoicesRes.data;
  const receipts = receiptsRes.data;

  console.log(`[dashboard] receipts=${receipts?.length ?? "null"} invoices=${invoices?.length ?? "null"} settings=${settings ? "yes" : "null"}`);

  const inv = (invoices || []).map((i) => ({ ...i, buyer_country: i.studio_clients?.country_code || "SE" }));
  const rec = receipts || [];

  /* ── Monthly series, per venture, kontantmetoden ─────────────────────── */
  const blank = () => MONTHS.map(() => 0);
  const revenue = {}, costs = {};
  for (const v of VENTURES) { revenue[v.key] = blank(); costs[v.key] = blank(); }
  revenue.other = blank(); costs.other = blank();

  const bucket = (o, key, dateStr, amount) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (d.getUTCFullYear() !== year) return;
    const k = o[key] ? key : "other";
    o[k][d.getUTCMonth()] = r2(o[k][d.getUTCMonth()] + amount);
  };

  for (const i of inv) {
    if (!i.paid_at) continue;
    const net = i.currency === "SEK" ? Number(i.subtotal || 0)
      : (i.total_sek != null ? Number(i.total_sek) - Number(i.vat_sek || 0) : null);
    if (net === null) continue; // unconverted — surfaced separately, never estimated
    bucket(revenue, i.venture, i.paid_at, net);
  }
  for (const c of rec) {
    if (c.is_business === false) continue;
    const tot = c.currency === "SEK" ? Number(c.total || 0) : (c.total_sek != null ? Number(c.total_sek) : null);
    if (tot === null) continue;
    bucket(costs, c.venture, c.receipt_date, tot);
  }

  /* ── Current VAT period ──────────────────────────────────────────────── */
  const periodInv = inv.filter((i) => i.paid_at && i.paid_at >= q.start && i.paid_at <= q.end);
  const periodRec = rec.filter((c) => c.receipt_date >= q.start && c.receipt_date <= q.end);
  const moms = computeMoms({ invoices: periodInv, receipts: periodRec, period: q });

  /* ── Tiles ───────────────────────────────────────────────────────────── */
  const unpaid = inv
    .filter((i) => !["paid", "draft", "cancelled"].includes(i.status))
    .reduce((a, i) => a + (i.currency === "SEK" ? Number(i.total || 0) : Number(i.total_sek || 0)), 0);

  const overdue = inv.filter(
    (i) => !["paid", "draft", "cancelled"].includes(i.status) && i.due_date < todayISO(today)
  ).length;

  const needsConversion = [...inv, ...rec].filter(
    (x) => x.currency && x.currency !== "SEK" && x.total_sek == null
  ).length;

  const untagged = [...inv, ...rec].filter((x) => !x.venture).length;
  const untreated = rec.filter((x) => !x.vat_treatment).length;

  return {
    user: { email: user.email },
    settings: settings || null,
    year,
    months: MONTHS,
    quarter: q,
    moms,
    series: { revenue, costs },
    tiles: {
      revenueYtd: r2(sumAll(revenue)),
      costsYtd: r2(sumAll(costs)),
      unpaid: r2(unpaid),
      overdue,
    },
    flags: { needsConversion, untagged, untreated },
    receipts: rec.slice(0, 8),
  };
}

function sumAll(o) {
  return Object.values(o).reduce((a, arr) => a + arr.reduce((x, y) => x + y, 0), 0);
}
function todayISO(d) { return d.toISOString().slice(0, 10); }
