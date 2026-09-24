/* app/brief/page.jsx — the weekly brief, in the app.
 *
 * Same source as the Monday email (lib/digest.js → lib/brief.js), so the page and
 * the mail can never disagree. Server component: one read, no spinners.
 */

import Link from "next/link";
import { requireUser } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { buildDigest } from "@/lib/digest";
import { money, week } from "@/lib/format";
import SendBriefButton from "./SendBriefButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Veckobrev" };

export default async function BriefPage() {
  const { sb, user } = await requireUser();
  const ownerId = await getActiveOwnerId();
  const today = new Date();
  const yearStart = `${today.getFullYear()}-01-01`;

  const [{ data: settings }, { data: invoices }, { data: receipts }, { data: trips }, { data: tasks }, { data: bankTx }] = await Promise.all([
    sb.from("studio_settings").select("*").eq("user_id", ownerId).maybeSingle(),
    sb.from("studio_invoices").select("invoice_number,status,total,vat_amount,subtotal,issue_date,due_date,paid_at,currency,total_sek,studio_clients(name)").eq("user_id", ownerId).gte("issue_date", yearStart),
    sb.from("studio_receipts").select("total,vat_amount,receipt_date,is_business,is_deductible,status,currency,total_sek,vat_sek").eq("user_id", ownerId).gte("receipt_date", yearStart),
    sb.from("studio_trips").select("km,deduction,trip_date,is_business").eq("user_id", ownerId).gte("trip_date", yearStart),
    sb.from("studio_tasks").select("title,due_at,status,priority").eq("user_id", ownerId).eq("status", "open"),
    sb.from("studio_bank_tx").select("tx_date,description,amount,currency,matched_receipt,matched_invoice,imported_at").eq("user_id", ownerId).gte("tx_date", yearStart),
  ]);

  const { advice, summary } = buildDigest({
    user: { email: user.email }, settings,
    invoices: invoices || [], receipts: receipts || [], trips: trips || [], tasks: tasks || [], bankTx: bankTx || [],
  });

  const tiles = [
    ["Inbetalt i år", summary.sumPaid],
    ["Utestående", summary.sumOpen],
    ["Avdragsgilla kostnader", summary.sumExpenses],
    ["Beräknad skatt (tak)", summary.tax],
  ];

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <div>
        <h1 className="text-[21px] font-medium tracking-[-0.015em]">Veckobrev</h1>
        <p className="mt-1 text-[13px] text-ink-2">{week(today)} · samma innehåll som mejlet på måndagar</p>
      </div>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Att göra den här veckan</h2>
        {advice.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-ink-2">Inget som kräver dig just nu.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {advice.map((a, i) => (
              <li key={i}>
                <Link href={a.href}
                  className={`block rounded-[var(--radius-ctl)] border px-3.5 py-3 no-underline ${a.sev === "atgarda" ? "border-crit/35 bg-crit-bg" : "border-border bg-raised"}`}>
                  <span className={`font-mono text-[10.5px] tracking-[0.06em] ${a.sev === "atgarda" ? "text-crit" : "text-ink-3"}`}>
                    {a.sev === "atgarda" ? "ÅTGÄRDA" : "GRANSKA"}
                  </span>
                  <span className="mt-0.5 block text-[14px] font-medium text-ink">{a.title}</span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-2">{a.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2.5">
        {tiles.map(([label, v]) => {
          const m = money(v, { decimals: 0 });
          return (
            <div key={label} className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-raised p-3.5">
              <span className="micro-label">{label}</span>
              <span className="tnum text-[20px] font-medium leading-none" lang="sv-SE" aria-label={m.spoken}>{m.text}</span>
            </div>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-3 px-1">
        <SendBriefButton />
        <Link href="/assistant" className="text-[13px] text-ink-2 underline underline-offset-2">Fråga assistenten om något här</Link>
      </div>
      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Mejlet går ut måndag morgon om veckosammanfattning är på i Inställningar.
        Skatten är ett tak: jobbskatteavdraget är inte medräknat.
      </p>
    </div>
  );
}
