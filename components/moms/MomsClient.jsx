"use client";

/* components/moms/MomsClient.jsx — DIRECTION A · KONTOR
 *
 * The momsdeklaration, box by box, in the order Skatteverket's form asks for them.
 *
 * THE LAWS THIS SCREEN OBEYS (see NORDBOK_DESIGN_SPEC)
 *
 * 01  ONE HERO, BOUND TO TOUCH. Ruta 49 is the hero and nothing competes with it.
 *     It is bound to the period switch: change the quarter and the figure rolls
 *     rather than swapping, so you perceive the change instead of re-reading it.
 * 02  COLOUR ENCODES DIRECTION. --good only ever means money coming back. The
 *     buttons use --brand, which carries no financial meaning.
 * 03  TABULAR NUMERALS ON EVERY KRONA, via lib/format.js. Nothing on this screen
 *     formats its own numbers, and every amount ships a spoken string — a screen
 *     reader otherwise reads "45 804" as "45" then "804".
 * 04  EVERY FIGURE LINKS TO ITS EVIDENCE. Each ruta row opens to show the exact
 *     lines feeding it. A figure you cannot open is a figure you cannot defend.
 * 05  TWO SEVERITIES, LABELLED WITH VERBS. ÅTGÄRDA blocks; GRANSKA advises.
 *     Fortnox's vocabulary, and the two words tell you whether you are stuck.
 *
 * Rounding is stated, not hidden. Skatteverket's boxes take whole kronor; the
 * receipts are exact to the öre. Both are shown when they differ, because a
 * figure you cannot reconcile to its source is a figure you cannot defend.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NumberFlow from "@number-flow/react";
import { money, num, dateISO, dateProse, daysPhrase, pct } from "@/lib/format";

/* The form's own grouping. Boxes that are always shown carry `always`. */
const GROUPS = [
  {
    title: "Momspliktig försäljning",
    rows: [
      ["05", "Momspliktig försäljning som inte ingår i ruta 06, 07 eller 08", true],
      ["06", "Momspliktiga uttag"],
      ["07", "Beskattningsunderlag vid vinstmarginalbeskattning"],
      ["08", "Hyresinkomster vid frivillig skattskyldighet"],
    ],
  },
  {
    title: "Utgående moms på försäljningen",
    rows: [["10", "25 %", true], ["11", "12 %"], ["12", "6 %"]],
  },
  {
    title: "Inköp där du är betalningsskyldig",
    rows: [
      ["20", "Varor från annat EU-land"],
      ["21", "Tjänster från annat EU-land enligt huvudregeln"],
      ["22", "Tjänster från land utanför EU"],
      ["23", "Varor i Sverige, köparen är betalningsskyldig"],
      ["24", "Övriga tjänster, köparen är betalningsskyldig"],
    ],
  },
  {
    title: "Utgående moms på inköpen",
    rows: [["30", "25 %"], ["31", "12 %"], ["32", "6 %"]],
  },
  {
    title: "Försäljning undantagen från moms",
    rows: [
      ["39", "Försäljning av tjänster till annat EU-land enligt huvudregeln"],
      ["40", "Övrig försäljning av tjänster omsatta utomlands"],
      ["42", "Övrig försäljning m.m."],
    ],
  },
  { title: "Ingående moms", rows: [["48", "Ingående moms att dra av", true]] },
];

/* ── Primitives ───────────────────────────────────────────────────────────── */

/** Every amount on this screen goes through here. Never render a raw number. */
function Kr({ value, decimals = 0, className = "", unit = false }) {
  const m = money(value, { decimals });
  return (
    <span className={`tnum ${className}`} lang="sv-SE" aria-label={m.spoken}>
      {m.missing ? m.text : unit ? m.text : m.text.replace(/ kr$/, "")}
    </span>
  );
}

function Severity({ level, title, children }) {
  const crit = level === "crit";
  return (
    <section
      className={`rounded-[var(--radius-card)] border p-4 ${
        crit ? "border-crit/35 bg-crit-bg" : "border-warn/35 bg-warn-bg"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${
            crit ? "text-crit" : "text-warn"
          }`}
        >
          {crit ? "Åtgärda" : "Granska"}
        </span>
        <h2 className={`text-[13.5px] font-medium ${crit ? "text-crit" : "text-warn"}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Meta({ label, children }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="micro-label">{label}</span>
      <span className="font-mono text-[12.5px] text-ink-2">{children}</span>
    </span>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────────── */

export default function MomsClient({ data }) {
  const router = useRouter();
  const params = useSearchParams();
  const [showCopy, setShowCopy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [openRuta, setOpenRuta] = useState(null);

  const { period, quarters, rutor, warnings, unconverted, fileReady, counts, lines, filed } = data;
  const refund = rutor.r49 < 0;
  const urgency = period.daysLeft <= 3 ? "crit" : period.daysLeft <= 14 ? "warn" : "good";

  /* Law 04 — the evidence behind each box, indexed once. */
  const allLines = [...(lines.sales || []), ...(lines.purchases || []), ...(lines.input || [])];
  const evidence = allLines.reduce((acc, l) => {
    const k = String(l.ruta);
    (acc[k] = acc[k] || []).push(l);
    return acc;
  }, {});

  function pick(key) {
    const p = new URLSearchParams(params);
    p.set("period", key);
    router.push(`/moms?${p}`);
  }

  const visible = (n, always) => always || Number(rutor[`r${n}`] || 0) !== 0 || showAll;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Period. The hero is bound to this control. ── */}
      <div
        className="flex gap-0.5 overflow-x-auto rounded-[var(--radius-ctl)] border border-border bg-raised p-[3px]"
        data-scroll-x
        role="group"
        aria-label="Redovisningsperiod"
      >
        {quarters.map((q) => (
          <button
            key={q.key}
            onClick={() => pick(q.key)}
            aria-pressed={q.key === period.key}
            className={`whitespace-nowrap rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              q.key === period.key ? "bg-surface text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* ── Hero — ruta 49, and nothing competes with it ── */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="micro-label">Ruta 49 · {period.label}</span>
          {filed && (
            <span className="rounded bg-good-bg px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-good">
              Inlämnad
            </span>
          )}
          {!fileReady && (
            <span className="rounded bg-crit-bg px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-crit">
              Åtgärda
            </span>
          )}
        </div>

        <div className={`flex flex-wrap items-baseline ${refund ? "text-good" : "text-ink"}`}>
          <span className="hero-figure" lang="sv-SE" aria-hidden="true">
            <NumberFlow
              value={Math.abs(Math.round(rutor.r49))}
              locales="sv-SE"
              format={{ maximumFractionDigits: 0 }}
            />
          </span>
          <span className="hero-unit">kr</span>
          <span className="sr-only">{money(Math.abs(Math.round(rutor.r49)), { decimals: 0 }).spoken}</span>
        </div>
        <p className="mt-2 text-[14.5px] text-ink-2">{refund ? "att få tillbaka" : "att betala"}</p>

        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-border pt-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${
              urgency === "crit"
                ? "bg-crit-bg text-crit"
                : urgency === "warn"
                ? "bg-warn-bg text-warn"
                : "bg-good-bg text-good"
            }`}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {filed ? "Inlämnad" : daysPhrase(period.daysLeft)}
          </span>
          <Meta label="Period">
            {dateISO(period.start)} – {dateISO(period.end)}
          </Meta>
          <Meta label="Senast">{dateISO(period.deadline)}</Meta>
          <Meta label="Underlag">
            {num(counts.invoices)} fakturor · {num(counts.receipts)} kvitton
          </Meta>
        </div>
      </section>

      {/* ── Law 05 — Åtgärda blocks ── */}
      {!fileReady && (
        <Severity level="crit" title="Inte klar att lämna in">
          <p className="mb-2.5 text-[13px] leading-relaxed text-ink-2">
            {num(unconverted.length)} {unconverted.length === 1 ? "post" : "poster"} i utländsk valuta
            saknar SEK-omräkning. Siffrorna nedan är därför för låga — de posterna är inte medräknade.
          </p>
          <ul className="flex flex-col gap-1 font-mono text-[11.5px] text-ink-2">
            {unconverted.slice(0, 6).map((u, i) => (
              <li key={i}>
                {u.ref} · {dateISO(u.date)} · {u.amount} {u.currency}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 font-mono text-[11.5px] text-ink-3">node scripts/backfill-fx.mjs --write</p>
        </Severity>
      )}

      {/* ── Law 05 — Granska advises ── */}
      {warnings.length > 0 && (
        <Severity level="warn" title="Kontrollera innan du lämnar in">
          <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
            {warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </Severity>
      )}

      {/* ── Ruta för ruta. Ruled rows; every figure opens. ── */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Ruta för ruta</h2>
          <button
            onClick={() => setShowAll((s) => !s)}
            className="rounded-[var(--radius-ctl)] border border-border-firm px-2.5 py-1 font-mono text-[11.5px] font-medium text-ink-2 hover:text-ink"
          >
            {showAll ? "Dölj tomma" : "Visa alla rutor"}
          </button>
        </div>

        {GROUPS.map((g) => {
          const rows = g.rows.filter(([n, , always]) => visible(n, always));
          if (!rows.length) return null;
          return (
            <div key={g.title} className="mb-5 last:mb-0">
              <h3 className="micro-label mb-1">{g.title}</h3>
              {rows.map(([n, text]) => {
                const exact = Number(rutor[`r${n}`] || 0);
                const rounded = Math.round(exact);
                const ev = evidence[n] || [];
                const open = openRuta === n;
                return (
                  <div key={n} className="border-b border-border last:border-b-0">
                    <button
                      onClick={() => setOpenRuta(open ? null : n)}
                      aria-expanded={open}
                      disabled={!ev.length}
                      className="grid w-full grid-cols-[30px_1fr_auto] items-baseline gap-2.5 py-2.5 text-left disabled:cursor-default"
                    >
                      <span className="font-mono text-[11.5px] text-ink-3">{n}</span>
                      <span className="text-[13px] leading-snug text-ink-2">
                        {text}
                        {ev.length > 0 && (
                          <span className="ml-1.5 font-mono text-[10.5px] text-ink-3">
                            {open ? "▾" : "▸"} {num(ev.length)}
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <Kr value={rounded} className="block font-mono text-[13.5px] font-medium" />
                        {Math.abs(exact - rounded) > 0.004 && (
                          <Kr value={exact} decimals={2} className="block font-mono text-[10.5px] text-ink-3" />
                        )}
                      </span>
                    </button>

                    {open && ev.length > 0 && (
                      <ul className="mb-2.5 flex flex-col gap-1.5 rounded-[var(--radius-ctl)] bg-raised p-3">
                        {ev.map((l, i) => (
                          <li key={i} className="grid grid-cols-[76px_1fr_auto] items-baseline gap-2.5">
                            <span className="font-mono text-[11px] text-ink-3">{dateISO(l.date)}</span>
                            <span className="truncate text-[12.5px] text-ink-2">{l.ref}</span>
                            <Kr value={l.vat ?? l.net ?? 0} decimals={2} className="font-mono text-[12px]" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="mt-1 grid grid-cols-[30px_1fr_auto] items-center gap-2.5 border-t-2 border-ink pt-3">
          <span className="font-mono text-[11.5px] text-ink-3">49</span>
          <span className="text-[13.5px] font-medium text-ink">
            {refund ? "Moms att få tillbaka" : "Moms att betala"}
          </span>
          <Kr
            value={Math.abs(Math.round(rutor.r49))}
            unit
            className={`font-mono text-[17px] font-medium ${refund ? "text-good" : "text-ink"}`}
          />
        </div>
      </section>

      {/* ── Skriv in hos Skatteverket ── */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Skriv in hos Skatteverket</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Endast rutor med belopp, i formulärets ordning.</p>
          </div>
          <button
            onClick={() => setShowCopy((s) => !s)}
            disabled={!fileReady}
            className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-ink disabled:opacity-40"
          >
            {showCopy ? "Dölj" : "Visa"}
          </button>
        </div>

        {!fileReady && (
          <p className="mt-2.5 text-[12.5px] text-ink-3">
            Låst tills omräkningen är gjord — annars skriver du in siffror som är för låga.
          </p>
        )}

        {showCopy && fileReady && (
          <>
            <div className="mt-3.5 rounded-[var(--radius-ctl)] border border-border bg-raised p-3.5">
              {GROUPS.flatMap((g) => g.rows)
                .filter(([n]) => Math.round(Number(rutor[`r${n}`] || 0)) !== 0)
                .map(([n]) => (
                  <div
                    key={n}
                    className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
                  >
                    <span className="font-mono text-[12px] text-ink-3">Ruta {n}</span>
                    <Kr value={Math.round(rutor[`r${n}`])} className="font-mono text-[14px] font-medium" />
                  </div>
                ))}
              <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-2">
                <span className="font-mono text-[12px] font-medium">Ruta 49</span>
                <span className="tnum font-mono text-[15px] font-semibold">
                  {rutor.r49 < 0 ? "−" : ""}
                  {num(Math.abs(Math.round(rutor.r49)))}
                </span>
              </div>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              Kontrollera även de två frågorna överst i formuläret om handel med andra länder.
              Rutorna 20–24 ovan avgör svaret.
            </p>
          </>
        )}
      </section>

      {/* ── Underlag ── */}
      {allLines.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-1 text-[15.5px] font-medium tracking-[-0.01em]">Underlag</h2>
          <p className="mb-3 text-[12.5px] text-ink-3">
            Varje siffra ovan kommer härifrån. {num(allLines.length)} poster i {period.label}.
          </p>
          <div data-scroll-x>
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr>
                  <th className="micro-label border-b border-border px-2 py-1.5 text-left">Datum</th>
                  <th className="micro-label border-b border-border px-2 py-1.5 text-left">Post</th>
                  <th className="micro-label border-b border-border px-2 py-1.5 text-right">Ruta</th>
                  <th className="micro-label border-b border-border px-2 py-1.5 text-right">Belopp</th>
                </tr>
              </thead>
              <tbody>
                {allLines
                  .slice()
                  .sort((a, b) => (a.date < b.date ? -1 : 1))
                  .map((l, i) => (
                    <tr key={i}>
                      <td className="border-b border-border px-2 py-2 font-mono text-[12px] text-ink-3">
                        {dateISO(l.date)}
                      </td>
                      <td className="border-b border-border px-2 py-2 text-[13px]">{l.ref}</td>
                      <td className="tnum border-b border-border px-2 py-2 text-right font-mono text-[12px] text-ink-3">
                        {l.ruta}
                      </td>
                      <td className="border-b border-border px-2 py-2 text-right">
                        <Kr value={l.vat ?? l.net ?? 0} decimals={2} className="font-mono text-[13px]" />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Beloppen i rutorna är avrundade till hela kronor, så som Skatteverket tar emot dem.
        Där avrundningen skiljer sig från underlaget visas båda. Perioden redovisas enligt
        kontantmetoden, med deklaration senast {dateProse(period.deadline)}.
      </p>
    </div>
  );
}
