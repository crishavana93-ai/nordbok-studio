/* app/invoices/page.js — DIRECTION A · KONTOR
 *
 * Question 2 of the four this app exists to answer: did I get paid?
 * So the hero is what is owed to me, and the list is ranked by how late it is —
 * not by invoice number, which is an accident of when I happened to write them.
 */

import Link from "next/link";
import { serverClient } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { money, num, dateISO, daysPhrase } from "@/lib/format";

export const metadata = { title: "Fakturor" };
export const dynamic = "force-dynamic";

const STATUS = {
  draft:           { label: "Utkast",        tone: "muted" },
  sent:            { label: "Skickad",       tone: "info" },
  partially_paid:  { label: "Delbetald",     tone: "warn" },
  paid:            { label: "Betald",        tone: "good" },
  overdue:         { label: "Förfallen",     tone: "crit" },
  cancelled:       { label: "Makulerad",     tone: "muted" },
};

const TONE = {
  good:  "bg-good-bg text-good",
  warn:  "bg-warn-bg text-warn",
  crit:  "bg-crit-bg text-crit",
  info:  "bg-raised text-ink-2",
  muted: "bg-raised text-ink-3",
};

const OPEN = new Set(["sent", "partially_paid", "overdue"]);

export default async function Invoices() {
  const sb = await serverClient();
  const ownerId = await getActiveOwnerId();
  const { data: invoices, error } = await sb
    .from("studio_invoices")
    .select("id, invoice_number, status, total, total_sek, issue_date, due_date, currency, client_id, studio_clients(name)")
    .eq("user_id", ownerId)
    .order("issue_date", { ascending: false });

  if (error) console.error("[invoices]", error.message);

  const list = invoices || [];
  const today = dateISO(new Date());

  /* Rank by lateness, not by number. The most overdue invoice is the one you need
     to see first; everything else can wait its turn. */
  const ranked = [...list].sort((a, b) => {
    const lateA = OPEN.has(a.status) && a.due_date < today;
    const lateB = OPEN.has(b.status) && b.due_date < today;
    if (lateA !== lateB) return lateA ? -1 : 1;
    if (lateA && lateB) return a.due_date < b.due_date ? -1 : 1;
    const openA = OPEN.has(a.status), openB = OPEN.has(b.status);
    if (openA !== openB) return openA ? -1 : 1;
    return a.issue_date < b.issue_date ? 1 : -1;
  });

  const outstanding = list
    .filter((i) => OPEN.has(i.status))
    .reduce((s, i) => s + Number(i.total_sek ?? (i.currency === "SEK" ? i.total : 0) ?? 0), 0);
  const overdueCount = list.filter((i) => OPEN.has(i.status) && i.due_date < today).length;
  const owed = money(outstanding, { decimals: 0 });

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <h1 className="sr-only">Fakturor</h1>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="micro-label">Utestående</span>
            <div className="mt-1.5 flex flex-wrap items-baseline">
              <span className="hero-figure" lang="sv-SE" aria-label={owed.spoken}>
                {owed.text.replace(/ kr$/, "")}
              </span>
              <span className="hero-unit">kr</span>
            </div>
            <p className="mt-2 text-[14.5px] text-ink-2">
              {overdueCount > 0
                ? `varav ${num(overdueCount)} ${overdueCount === 1 ? "faktura är" : "fakturor är"} förfallna`
                : list.length === 0 ? "inga fakturor ännu" : "inget är förfallet"}
            </p>
          </div>
          <Link
            href="/invoices/new"
            className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink"
          >
            Ny faktura
          </Link>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-[15.5px] font-medium tracking-[-0.01em]">Alla fakturor</h2>

        {ranked.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[14px] text-ink-2">Inga fakturor ännu.</p>
            <p className="mx-auto mt-1.5 max-w-[40ch] text-[13px] leading-relaxed text-ink-3">
              Fakturanumret tilldelas först när fakturan skickas, så serien aldrig får luckor.
            </p>
            <Link
              href="/invoices/new"
              className="mt-4 inline-block rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink"
            >
              Skapa din första faktura
            </Link>
          </div>
        ) : (
          <div className="flex flex-col">
            {ranked.map((i) => {
              const late = OPEN.has(i.status) && i.due_date < today;
              const s = late ? STATUS.overdue : (STATUS[i.status] || { label: i.status, tone: "muted" });
              const amount = money(i.total, { decimals: 0, currency: i.currency || "SEK" });
              const daysLate = late
                ? Math.round((new Date(today) - new Date(i.due_date)) / 86400000)
                : null;
              return (
                <Link
                  key={i.id}
                  href={`/invoices/${i.id}`}
                  className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-ink">
                      {i.studio_clients?.name || "Ingen kund vald"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11.5px] text-ink-3">
                      {i.invoice_number ? `#${i.invoice_number}` : "utkast"} · {dateISO(i.issue_date)}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${TONE[s.tone]}`}>
                        {s.label}
                      </span>
                      {late && (
                        <span className="font-mono text-[11px] text-crit">{daysPhrase(-daysLate)}</span>
                      )}
                      {!late && OPEN.has(i.status) && (
                        <span className="font-mono text-[11px] text-ink-3">förfaller {dateISO(i.due_date)}</span>
                      )}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-mono text-[14px] font-medium" lang="sv-SE" aria-label={amount.spoken}>
                    {amount.text}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Listan är sorterad efter hur sen betalningen är, inte efter fakturanummer.
        Utestående räknas i kronor; fakturor i annan valuta räknas med sin SEK-kurs
        när det finns en.
      </p>
    </div>
  );
}
