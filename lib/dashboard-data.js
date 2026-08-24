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
import { periodBoundsUTC, withinPeriod } from "@/lib/tid.js";

/* TRUNCATION.
 * These queries were .limit(500) and .limit(1000), and the hero figures were summed
 * from whatever came back. Past the ceiling the dashboard understated revenue and
 * costs by an unknown amount, with nothing on screen saying so — and in an accounting
 * app a number that is quietly wrong is worse than an error message.
 *
 * We now ask for one MORE row than we will use. If it arrives we know the set was
 * capped, drop the extra, and hand the caller a `truncated` flag so the screen can say
 * "visar 500 av fler — summan är ofullständig" instead of printing a total. */
const INVOICE_LIMIT = 500;
const RECEIPT_LIMIT = 1000;

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
  /* Same boundary problem as the VAT period: paid_at is a timestamptz, so the year
     must be a half-open interval anchored to Stockholm midnight, not a date string. */
  const yearBounds = periodBoundsUTC(yearStart, yearEnd);

  const [settingsRes, invoicesRes, clientCountRes, receiptsRes] = await Promise.all([
    sb.from("studio_settings").select("*").eq("user_id", ownerId).maybeSingle(),

    // Kontantmetoden: the year's activity is what was PAID in the year.
    sb.from("studio_invoices")
      .select("invoice_number, status, subtotal, vat_amount, total, total_sek, vat_sek, currency, fx_rate, fx_source, fx_date, issue_date, due_date, paid_at, venture, reverse_charge, vat_exempt_note, vat_breakdown, studio_clients(name, country_code)")
      .eq("user_id", ownerId)
      .or(`and(paid_at.gte.${yearBounds.from},paid_at.lt.${yearBounds.toExclusive}),status.neq.paid`)
      .order("issue_date", { ascending: false })
      .limit(INVOICE_LIMIT + 1),   // +1 is the tripwire — see TRUNCATION below

    /* Count only — the checklist needs to know IF a customer exists, not who. */
    sb.from("studio_clients").select("id", { count: "exact", head: true })
      .eq("user_id", ownerId).eq("archived", false),

    sb.from("studio_receipts")
      .select("vendor, receipt_date, vat_amount, total, total_sek, vat_sek, currency, fx_rate, fx_source, fx_date, category, venture, vat_treatment, is_business, is_deductible, business_share")
      .eq("user_id", ownerId)
      .gte("receipt_date", yearStart).lte("receipt_date", yearEnd)
      .order("receipt_date", { ascending: false })
      .limit(RECEIPT_LIMIT + 1),
  ]);

  /* Surface errors instead of silently rendering zeros. A blocked read and an empty
     table look identical downstream, which is exactly how a broken dashboard ends up
     looking merely empty. */
  for (const [name, res] of [["studio_settings", settingsRes], ["studio_invoices", invoicesRes], ["studio_clients", clientCountRes], ["studio_receipts", receiptsRes]]) {
    if (res.error) {
      console.error(`[dashboard] ${name} query failed:`, res.error.message, res.error.details || "", res.error.hint || "");
    }
  }

  const settings = settingsRes.data;
  const invoices = invoicesRes.data;
  const receipts = receiptsRes.data;

  console.log(`[dashboard] receipts=${receipts?.length ?? "null"} invoices=${invoices?.length ?? "null"} settings=${settings ? "yes" : "null"}`);

  /* Did we hit the ceiling? Trim the tripwire row before anything sums these. */
  const truncated = {
    invoices: (invoices || []).length > INVOICE_LIMIT,
    receipts: (receipts || []).length > RECEIPT_LIMIT,
  };
  truncated.any = truncated.invoices || truncated.receipts;

  const inv = (invoices || []).slice(0, INVOICE_LIMIT)
    .map((i) => ({ ...i, buyer_country: i.studio_clients?.country_code || "SE" }));
  const rec = (receipts || []).slice(0, RECEIPT_LIMIT);

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
  /* String comparison on an ISO timestamp against a date had the identical off-by-a-day
     failure as the SQL filter, so the dashboard and the moms screen disagreed about
     which quarter a payment belonged to. One helper now answers for both. */
  const periodInv = inv.filter((i) => withinPeriod(i.paid_at, q.start, q.end));
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

  /* ── Kom igång ─────────────────────────────────────────────────────────
   * Derived from the data itself, never from a "hasOnboarded" flag — a stored flag
   * drifts the moment someone changes something, and then the checklist is lying.
   *
   * The terminal condition is deliberately ONE-WAY: once an invoice has actually been
   * sent, setup is finished forever. Sent invoices are immutable (migration 010), so
   * that fact can never regress — which is what stops the checklist reappearing months
   * later because a customer was archived.
   */
  const hasSentInvoice = inv.some((i) => i.paid_at || i.invoice_number);
  const clientCount = clientCountRes.count ?? 0;

  const setup = hasSentInvoice ? null : {
    steps: [
      {
        key: "name", done: Boolean(settings?.business_name),
        title: "Namnge verksamheten",
        why: "Namnet högst upp på fakturan. Måste vara registrerat hos Bolagsverket — annars ditt eget för- och efternamn.",
        href: "/settings",
      },
      {
        key: "tax", done: Boolean(settings?.personnummer || settings?.org_nr),
        title: "Fyll i skatteuppgifterna",
        why: "Personnumret är din skatteidentitet. Momsregistreringsnumret räknas fram från det, och utan det kan kunden inte dra av momsen.",
        href: "/settings",
      },
      {
        key: "pay", done: Boolean(settings?.bankgiro || settings?.plusgiro || settings?.iban),
        title: "Lägg in ett betalsätt",
        why: "Bankgiro, plusgiro eller IBAN. Utan det stoppas fakturan innan den skickas.",
        href: "/settings",
      },
      {
        key: "client", done: clientCount > 0,
        title: "Lägg till din första kund",
        why: "Namn och adress krävs enligt mervärdesskattelagen innan en faktura kan skickas.",
        href: "/clients",
      },
      {
        key: "invoice", done: false,
        title: "Skicka din första faktura",
        why: "Numret tilldelas vid utskicket, så serien aldrig får luckor.",
        href: "/invoices/new",
      },
    ],
  };
  if (setup) {
    setup.done = setup.steps.filter((s2) => s2.done).length;
    setup.total = setup.steps.length;
    /* The first unfinished step is the one to point at. */
    setup.next = setup.steps.find((s2) => !s2.done) || null;
  }

  return {
    truncated,
    setup,
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
