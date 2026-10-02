/* app/hem/page.jsx — the home screen. The app talks first.
 *
 * Three sentences about where you stand, ONE thing to do today, three small
 * tiles, and a place to ask. No chart, no venture filter, no banner. The
 * dashboard with its chart and tiles still exists at /dashboard ("Siffror")
 * for when you want to look at the numbers rather than be told about them.
 *
 * Server component: one read through getDashboard plus the bank lines and
 * the brief rules. Nothing fetched on the client, so it is complete or absent.
 */

import Link from "next/link";
import { getDashboard } from "@/lib/dashboard-data";
import { requireUser } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { buildAdvice } from "@/lib/brief";
import { laget, vendorName } from "@/lib/laget";
import { quartersOf, computeMoms } from "@/lib/moms";
import { withinPeriod } from "@/lib/tid.js";
import { money, dateProse } from "@/lib/format";
import AskBox from "./AskBox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hem" };

export default async function HemPage() {
  const data = await getDashboard();
  const { sb } = await requireUser();
  const ownerId = await getActiveOwnerId();
  const today = new Date();
  const yearStart = `${data.year}-01-01`;

  const [{ data: bankTx }, { data: tasks }, { data: invoices }] = await Promise.all([
    sb.from("studio_bank_tx").select("tx_date,description,amount,currency,matched_receipt,matched_invoice,imported_at,category")
      .eq("user_id", ownerId).gte("tx_date", yearStart),
    sb.from("studio_tasks").select("title,due_at,status,priority").eq("user_id", ownerId).eq("status", "open"),
    sb.from("studio_invoices").select("status,total,due_date").eq("user_id", ownerId),
  ]);

  const unmatchedOut = (bankTx || [])
    .filter((t) => Number(t.amount) < 0 && !t.matched_receipt && !t.matched_invoice)
    .sort((a, b) => Number(a.amount) - Number(b.amount));

  const advice = buildAdvice({ today, bankTx: bankTx || [], receipts: data.receipts, invoices: invoices || [], tasks: tasks || [], settings: data.settings });
  const first = advice[0] || null;

  /* The quarter that is actually DUE, not the one we are standing in. From
     1 October to 12 November the answer is Q3, and getDashboard's quarter is Q4. */
  const iso = today.toISOString().slice(0, 10);
  const due = [...quartersOf(data.year - 1), ...quartersOf(data.year)]
    .filter((q) => q.end < iso && q.deadline >= iso).pop();
  let quarter = data.quarter, moms = data.moms;
  if (due) {
    const { data: inv } = await sb.from("studio_invoices")
      .select("invoice_number, status, subtotal, vat_amount, total, total_sek, vat_sek, currency, fx_rate, paid_at, reverse_charge, vat_exempt_note, vat_breakdown, venture, studio_clients(name, country_code)")
      .eq("user_id", ownerId).not("paid_at", "is", null);
    const { data: rec } = await sb.from("studio_receipts")
      .select("vendor, receipt_date, vat_amount, total, total_sek, vat_sek, currency, fx_rate, category, venture, vat_treatment, is_business, is_deductible, business_share")
      .eq("user_id", ownerId).gte("receipt_date", due.start).lte("receipt_date", due.end);
    const periodInv = (inv || []).filter((i) => withinPeriod(i.paid_at, due.start, due.end))
      .map((i) => ({ ...i, buyer_country: i.studio_clients?.country_code || "SE" }));
    moms = computeMoms({ invoices: periodInv, receipts: rec || [], period: due });
    quarter = { ...due, daysLeft: Math.ceil((new Date(due.deadline + "T00:00:00Z") - today) / 86400000) };
  }
  const r49 = Number(moms.rutor.r49 || 0);

  const sentences = laget({
    resultat: data.resultat, skatt: data.skatt, kvar: data.kvar, moms, quarter,
    unmatchedOut, overdueInvoices: data.tiles.overdue, year: data.year,
  });

  const name = data.settings?.business_name || "din verksamhet";
  const questions = [
    unmatchedOut[0] ? `Kan jag dra av ${vendorName(unmatchedOut[0]).slice(0, 28)}?` : "Vad kan jag dra av?",
    "Hur mycket skatt blir det i år?",
    "Vad gör jag med momsen?",
  ];

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="micro-label">{dateProse(today)} · {name}</span>
        <Link href="/dashboard" className="text-[12.5px] text-ink-3 underline underline-offset-2">Siffror</Link>
      </div>

      {/* Läget */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-brand">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
          Läget just nu
        </div>
        <p className="text-[18px] font-medium leading-[1.45]">{sentences[0]}{sentences[1] ? ` ${sentences[1]}` : ""}</p>
        {sentences.slice(2).map((t, i) => (
          <p key={i} className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{t}</p>
        ))}
        {data.resultat.oraknade > 0 && (
          <p className="mt-2.5 text-[12.5px] text-warn">{data.resultat.oraknade} poster i utländsk valuta är inte omräknade och saknas i siffrorna ovan.</p>
        )}
      </section>

      {/* Gör i dag */}
      {first && (
        <section className="flex flex-col gap-1.5">
          <span className="micro-label">Gör i dag</span>
          <Link href={first.href}
            className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3.5 no-underline hover:border-border-firm">
            <span className={`grid size-9 shrink-0 place-items-center rounded-[9px] text-[15px] font-semibold ${first.sev === "atgarda" ? "bg-brand text-brand-ink" : "bg-raised text-ink-2"}`}>1</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14.5px] font-medium text-ink">{first.title}</span>
              <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-3">{first.detail}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="shrink-0 text-ink-3" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
          {advice.length > 1 && (
            <Link href="/brief" className="px-1 text-[12.5px] text-ink-3 underline underline-offset-2">
              {advice.length - 1} till i veckobrevet
            </Link>
          )}
        </section>
      )}

      {/* Pengarna */}
      <section className="flex flex-col gap-1.5">
        <span className="micro-label">Pengarna</span>
        <div className="grid grid-cols-3 gap-2">
          <Tile href="/dashboard" label="Dina" value={data.kvar} tone={data.kvar < 0 ? "crit" : "brand"} note="kr efter skatt" />
          <Tile href="/moms" label="Moms" value={Math.abs(r49)} tone={r49 < 0 ? "good" : undefined}
            note={`kr ${r49 < 0 ? "tillbaka" : "att betala"} · ${quarter.label}`} />
          <Tile href="/finansiering" label="Skatt" value={data.skatt.total} note="kr att sätta av" />
        </div>
      </section>

      {/* Fråga mig */}
      <section className="flex flex-col gap-2">
        <span className="micro-label">Fråga mig</span>
        <div className="flex flex-wrap gap-2">
          {questions.map((q) => (
            <Link key={q} href={`/assistant?q=${encodeURIComponent(q)}`}
              className="rounded-full border border-border-firm bg-surface px-3.5 py-2 text-[13px] text-ink no-underline hover:bg-raised">
              {q}
            </Link>
          ))}
        </div>
        <AskBox />
      </section>
    </div>
  );
}

function Tile({ href, label, value, note, tone }) {
  const m = money(Math.round(value), { decimals: 0 });
  const color = tone === "good" ? "text-good" : tone === "crit" ? "text-crit" : tone === "brand" ? "text-brand" : "text-ink";
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-3 no-underline hover:border-border-firm">
      <span className="micro-label">{label}</span>
      <span className={`tnum text-[18px] font-medium leading-none ${color}`} lang="sv-SE" aria-label={m.spoken}>
        {m.text.replace(/\s?kr$/, "")}
      </span>
      <span className="text-[11px] leading-snug text-ink-3">{note}</span>
    </Link>
  );
}
