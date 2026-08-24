/* app/resor/page.js — DIRECTION C
 *
 * Migrated 2026-08-24. Beyond colour: scoped to the active owner (the query had no
 * user_id, so with revisor access it listed two people's trips together), the read
 * error is surfaced, and the table became rows that survive a phone.
 *
 * The standing explanation of why the page exists moved into the empty state. Once
 * there are trips on screen the page explains itself, and a permanent banner above
 * real data is just something to scroll past.
 */

import Link from "next/link";
import { serverClient } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { money, num, dateISO } from "@/lib/format";

export const metadata = { title: "Affärsresor" };
export const dynamic = "force-dynamic";

const STATUS = {
  planned:   { label: "Planerad",  tone: "bg-raised text-ink-3" },
  ongoing:   { label: "Pågår",     tone: "bg-warn-bg text-warn" },
  completed: { label: "Genomförd", tone: "bg-good-bg text-good" },
  cancelled: { label: "Inställd",  tone: "bg-raised text-ink-3" },
};

export default async function TripsPage() {
  const sb = await serverClient();
  const ownerId = await getActiveOwnerId();

  const { data: trips, error } = await sb
    .from("studio_business_trips")
    .select("*, studio_clients(name)")
    .eq("user_id", ownerId)
    .order("start_date", { ascending: false });

  if (error) console.error("[resor]", error.message);
  const list = trips || [];

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-medium tracking-[-0.015em]">Affärsresor</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {list.length === 0 ? "Inga resor ännu" : `${num(list.length)} ${list.length === 1 ? "resa" : "resor"}`}
          </p>
        </div>
        <Link href="/resor/new"
          className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
          Ny resa
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          Kunde inte hämta resorna.
        </p>
      )}

      {list.length === 0 ? (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-2">Inga registrerade resor ännu.</p>
            <p className="mx-auto mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-ink-3">
              Skatteverket kan begära underlag för en avdragen resa i upp till sex år.
              Här samlas allt per resa — vart, när, varför, med vem och vilka kvitton —
              så att svaret finns färdigt om frågan kommer.
            </p>
            <Link href="/resor/new"
              className="mt-4 inline-block rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
              Logga din första resa
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col">
            {list.map((t) => {
              const s = STATUS[t.status] || { label: t.status, tone: "bg-raised text-ink-3" };
              const cost = t.actual_cost != null
                ? money(t.actual_cost, { decimals: 0, currency: t.currency || "SEK" })
                : null;
              const span = t.end_date && t.end_date !== t.start_date
                ? `${dateISO(t.start_date)} → ${dateISO(t.end_date)}`
                : dateISO(t.start_date);
              return (
                <Link key={t.id} href={`/resor/${t.id}`}
                  className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border py-3 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-ink">{t.title}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
                      {[t.destination, t.studio_clients?.name].filter(Boolean).join(" · ") || "Ingen destination angiven"}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${s.tone}`}>
                        {s.label}
                      </span>
                      <span className="font-mono text-[11px] text-ink-3">{span}</span>
                      {t.country_code && t.country_code !== "SE" && (
                        <span className="font-mono text-[11px] text-ink-3">{t.country_code}</span>
                      )}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-mono text-[14px] font-medium" lang="sv-SE"
                        aria-label={cost?.spoken}>
                    {cost ? cost.text : <span className="text-ink-3">—</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        En resa håller ihop syfte, kontakter, kvitton och körjournal. Revisionsspåret
        går att exportera om Skatteverket frågar.
      </p>
    </div>
  );
}
