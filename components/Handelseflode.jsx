/* components/Handelseflode.jsx — Server Component.
 *
 * Hemskärmen svarade på "hur står det till" men aldrig på "vad har hänt".
 * Det här är tidslinjen: fakturor, betalningar, kvitton, resor och lämnade
 * momsdeklarationer i den ordning de inträffade.
 *
 * Grupperat per månad, med av och an för månaden i rubriken. Bokföring räknas i
 * perioder, och en ström som rinner förbi periodgränserna döljer det enda som
 * egentligen ska summeras.
 *
 * Färgen betyder pengar in eller pengar ut. Ingenting annat.
 */

import Link from "next/link";
import { requireUser } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { byggFlode } from "@/lib/handelser";
import { money } from "@/lib/format";

const ETIKETT = {
  betalning: "Betalning",
  faktura: "Faktura",
  utkast: "Utkast",
  kvitto: "Kvitto",
  resa: "Resa",
  moms: "Moms",
};

export default async function Handelseflode({ max = 40 }) {
  let flode;
  try {
    const { sb } = await requireUser();
    const ownerId = await getActiveOwnerId();

    const [f, k, r, m] = await Promise.all([
      sb.from("studio_invoices")
        .select("id, invoice_number, status, issue_date, due_date, paid_at, total, total_sek, currency, fx_rate, studio_clients(name)")
        .eq("user_id", ownerId).order("issue_date", { ascending: false }).limit(60),
      sb.from("studio_receipts")
        .select("id, vendor, receipt_date, category, total, total_sek, currency, fx_rate, is_business")
        .eq("user_id", ownerId).order("receipt_date", { ascending: false }).limit(60),
      sb.from("studio_trips")
        .select("id, trip_date, purpose, from_address, to_address, deduction, is_business")
        .eq("user_id", ownerId).order("trip_date", { ascending: false }).limit(40),
      sb.from("studio_moms_perioder")
        .select("period_key, lamnad_at, belopp")
        .eq("user_id", ownerId).order("lamnad_at", { ascending: false }).limit(12),
    ]);

    flode = byggFlode({
      fakturor: (f.data || []).map((x) => ({ ...x, client_name: x.studio_clients?.name })),
      kvitton: k.data || [],
      resor: r.data || [],
      momsPerioder: m.data || [],
      idag: new Date().toISOString().slice(0, 10),
      max,
    });
  } catch {
    /* En saknad tabell får inte ta ner översikten. */
    return null;
  }

  if (!flode.grupper.length) {
    return (
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Händelser</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          Här samlas allt som händer i verksamheten — skickade fakturor, betalningar som
          kommit in, kvitton, resor och lämnade momsdeklarationer. Ingenting ännu.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Händelser</h2>
        {flode.obetalda > 0 && (
          <span className="text-[12.5px] text-ink-2">
            {flode.obetalda} faktura{flode.obetalda === 1 ? "" : "or"} väntar på betalning
          </span>
        )}
      </div>

      {flode.grupper.map((g) => (
        <div key={g.nyckel} className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1.5">
            <span className="micro-label">{g.etikett}</span>
            <span className="tnum font-mono text-[11.5px] text-ink-3">
              {g.in > 0 && <span className="text-good">+{money(g.in, { decimals: 0 }).text}</span>}
              {g.in > 0 && g.ut > 0 && " · "}
              {g.ut > 0 && <>−{money(g.ut, { decimals: 0 }).text}</>}
            </span>
          </div>

          <ol className="flex flex-col">
            {g.poster.map((p, i) => {
              const rad = (
                <span className="grid w-full grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-2.5">
                  <span className="tnum font-mono text-[11px] text-ink-3">{p.datum.slice(8, 10)}</span>

                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] text-ink">{p.rubrik}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-3">
                        {ETIKETT[p.typ] || p.typ}
                      </span>
                      {p.under && <span className="truncate text-[12px] text-ink-2">{p.under}</span>}
                      {p.obetald && (
                        <span className="rounded bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-medium text-warn">
                          obetald{p.forfaller ? ` · förfaller ${p.forfaller}` : ""}
                        </span>
                      )}
                      {p.privat && (
                        <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-3">privat</span>
                      )}
                    </span>
                  </span>

                  <span
                    className={`tnum shrink-0 font-mono text-[13px] font-medium ${
                      p.riktning === "in" ? "text-good" : p.riktning === "ut" ? "text-ink" : "text-ink-3"
                    }`}
                  >
                    {p.belopp == null
                      ? "—"
                      : `${p.riktning === "in" ? "+" : p.riktning === "ut" ? "−" : ""}${
                          money(Math.abs(p.belopp), { decimals: 0 }).text
                        }`}
                  </span>
                </span>
              );

              return (
                <li key={`${p.typ}-${p.datum}-${i}`} className="border-b border-border last:border-b-0">
                  {p.lank ? (
                    <Link href={p.lank} className="flex hover:bg-raised">{rad}</Link>
                  ) : (
                    <span className="flex">{rad}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      {flode.fler && (
        <p className="mt-3 text-[12px] text-ink-3">
          Visar de {max} senaste händelserna av {flode.antal}.
        </p>
      )}
    </section>
  );
}
