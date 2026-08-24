"use client";

import Link from "next/link";

/* components/dashboard/DashboardClient.jsx — DIRECTION A · KONTOR
 *
 * LAW 08 — sparse on the surface. Hero, three tiles, one chart, and a queue that is
 * absent entirely when there is nothing to do. Nothing else earns a place here. If
 * you want to add something, it belongs one tap down.
 *
 * LAW 01 — the hero is bound to touch: tapping it opens the box-by-box sheet, and
 * every figure ROLLS to its new value when you switch venture. You should see the
 * change happen rather than find a different number where the old one was.
 *
 * LAW 02 — the tiles carry no colour. They used to have a series-coloured bar along
 * the bottom, which is decoration wearing the data palette. --s1/--s2/--s3 belong to
 * the chart, where they identify a venture; --good and --crit belong to money
 * direction. A tile is neither.
 *
 * NumberFlow renders its own digits and emits U+00A0 between thousands rather than
 * lib/format.js's U+202F. That is a one-pixel divergence and the motion is worth it;
 * the spoken string beside each figure still comes from format.js, so what a screen
 * reader hears is exactly right.
 */

import { useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import MonthlyChart from "./MonthlyChart";
import MomsSheet from "./MomsSheet";
import { money, num, dateISO, daysPhrase } from "@/lib/format";

const MODES = [
  { key: "rev", label: "Intäkter", title: "Intäkter per månad" },
  { key: "cost", label: "Kostnader", title: "Kostnader per månad" },
  { key: "net", label: "Netto", title: "Netto per månad" },
];

function Seg({ items, value, onChange, size = "md", label }) {
  return (
    <div role="group" aria-label={label}
      className="flex gap-0.5 overflow-x-auto rounded-[var(--radius-ctl)] border border-border bg-raised p-[3px] [scrollbar-width:none]">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          aria-pressed={value === it.key}
          className={`whitespace-nowrap rounded-[5px] px-2.5 py-1 font-medium transition-colors
            ${size === "sm" ? "text-[11.5px]" : "text-[12.5px]"}
            ${value === it.key ? "bg-surface text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, note, attn }) {
  const m = money(value, { decimals: 0 });
  return (
    <div className="flex min-h-[108px] flex-col gap-1.5 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <span className="micro-label">{label}</span>
      <span className="tnum text-[25px] font-medium tracking-[-0.02em]" lang="sv-SE" aria-hidden="true">
        <NumberFlow value={value} locales="sv-SE" format={{ maximumFractionDigits: 0 }} suffix=" kr" />
      </span>
      <span className="sr-only">{m.spoken}</span>
      <span className={`mt-auto text-[12.5px] ${attn ? "text-warn" : "text-ink-3"}`}>{note}</span>
    </div>
  );
}

export default function DashboardClient({ data, ventures }) {
  const [venture, setVenture] = useState("all");
  const [mode, setMode] = useState("rev");
  const [sheet, setSheet] = useState(false);

  const shown = venture === "all" ? ventures : ventures.filter((v) => v.key === venture);

  const totals = useMemo(() => {
    const keys = shown.map((v) => v.key);
    const sum = (o) => keys.reduce((a, k) => a + (o[k] || []).reduce((x, y) => x + y, 0), 0);
    return { revenue: sum(data.series.revenue), costs: sum(data.series.costs) };
  }, [data.series, shown]);

  const q = data.quarter;
  const r49 = data.moms.rutor.r49;
  const refund = r49 < 0;
  const urgency = q.daysLeft <= 3 ? "crit" : q.daysLeft <= 14 ? "warn" : "good";
  const heroSpoken = money(Math.abs(Math.round(r49)), { decimals: 0 }).spoken;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3">

      {/* Venture filter. The moms figure is deliberately NOT filtered — there is one
          return for the whole firma, and pretending otherwise would be a lie. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Seg
          label="Verksamhet"
          value={venture}
          onChange={setVenture}
          items={[{ key: "all", label: "Alla" }, ...ventures.map((v) => ({ key: v.key, label: v.name }))]}
        />
        {venture !== "all" && (
          <span className="font-mono text-[10.5px] text-ink-3">
            En momsdeklaration för hela verksamheten
          </span>
        )}
      </div>

      {/* HERO — tap to open the box-by-box breakdown */}
      <MomsSheet open={sheet} onOpenChange={setSheet} moms={data.moms} quarter={q}>
        <button
          className="w-full rounded-[var(--radius-card)] border border-border bg-surface p-5 text-left
                     transition-colors hover:border-border-firm sm:p-7"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="micro-label">Moms · {q.label}</span>
            {!data.moms.fileReady && (
              <span className="rounded bg-crit-bg px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-crit">
                Åtgärda
              </span>
            )}
          </div>

          <div className={`flex flex-wrap items-baseline ${refund ? "text-good" : "text-ink"}`}>
            <span className="hero-figure" lang="sv-SE" aria-hidden="true">
              <NumberFlow value={Math.abs(Math.round(r49))} locales="sv-SE" format={{ maximumFractionDigits: 0 }} />
            </span>
            <span className="hero-unit">kr</span>
            <span className="sr-only">{heroSpoken}</span>
          </div>
          <p className="mt-2 text-[14.5px] text-ink-2">
            {refund ? "att få tillbaka" : "att betala"} · tryck för ruta för ruta
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-border pt-4">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium
              ${urgency === "crit" ? "bg-crit-bg text-crit" : urgency === "warn" ? "bg-warn-bg text-warn" : "bg-good-bg text-good"}`}>
              <span className="size-1.5 rounded-full bg-current" />
              {daysPhrase(q.daysLeft)}
            </span>
            <Meta label="Period">{dateISO(q.start)} – {dateISO(q.end)}</Meta>
            <Meta label="Senast">{dateISO(q.deadline)}</Meta>
            <Meta label="Metod">Kontantmetoden</Meta>
          </div>
        </button>
      </MomsSheet>

      {/* THREE TILES. Not four. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Tile
          label={`Intäkter ${data.year}`} value={totals.revenue}
          attn={totals.revenue === 0}
          note={totals.revenue === 0 ? "Ingen faktura betald ännu" : "Betalt, kontantmetoden"}
        />
        <Tile
          label={`Kostnader ${data.year}`} value={totals.costs}
          attn={data.flags.needsConversion > 0}
          note={data.flags.needsConversion > 0
            ? `${num(data.flags.needsConversion)} poster väntar på omräkning`
            : "Alla poster omräknade"}
        />
        <Tile
          label="Obetalda fakturor" value={data.tiles.unpaid}
          attn={data.tiles.overdue > 0}
          note={data.tiles.overdue > 0 ? `${num(data.tiles.overdue)} förfallna` : "Inga utestående"}
        />
      </div>

      {/* ONE CHART */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">
            {MODES.find((m) => m.key === mode).title}
          </h2>
          <Seg label="Vy" size="sm" value={mode} onChange={setMode} items={MODES} />
        </div>
        <p className="mb-3.5 text-[12.5px] text-ink-3">
          {data.year}, kronor. Endast poster med känt SEK-belopp.
        </p>
        <MonthlyChart months={data.months} series={data.series} mode={mode} ventures={shown} />
      </section>

      {/* Law 05 — the queue, with verbs. Gone entirely when there is nothing to do. */}
      {/* ── Kom igång ────────────────────────────────────────────────────────
          A checklist that teaches by doing and then deletes itself. It sits ABOVE the
          figures because until the first invoice is out those figures are all zero,
          and a screen of zeros with no explanation is the worst first impression this
          app can make.

          It is derived from the data, never from a stored "onboarded" flag — and it
          stops for good once an invoice has actually been sent, which is a fact that
          cannot regress because sent invoices are immutable. */}
      {data.setup && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Kom igång</h2>
            <span className="font-mono text-[11.5px] text-ink-3">
              {num(data.setup.done)} av {num(data.setup.total)} klart
            </span>
          </div>

          <div className="mt-3 flex gap-1" role="img"
               aria-label={`${data.setup.done} av ${data.setup.total} steg klara`}>
            {data.setup.steps.map((s) => (
              <span key={s.key}
                className={`h-1 flex-1 rounded-full ${s.done ? "bg-brand" : "bg-raised"}`} />
            ))}
          </div>

          <ol className="mt-4 flex flex-col">
            {data.setup.steps.map((s) => {
              const isNext = data.setup.next?.key === s.key;
              return (
                <li key={s.key} className="border-b border-border py-3 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true"
                      className={`mt-[1px] grid size-5 shrink-0 place-items-center rounded-full font-mono text-[11px] ${
                        s.done ? "bg-good-bg text-good" : isNext ? "bg-brand text-brand-ink" : "bg-raised text-ink-3"
                      }`}>
                      {s.done ? "✓" : "·"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[14px] ${s.done ? "text-ink-3 line-through" : "font-medium text-ink"}`}>
                        {s.title}
                      </p>
                      {/* The reason is only shown for the step you are on. Five
                          paragraphs at once is a wall; one is a prompt. */}
                      {isNext && (
                        <>
                          <p className="mt-1 max-w-[54ch] text-[12.5px] leading-relaxed text-ink-2">{s.why}</p>
                          <Link href={s.href}
                            className="mt-2.5 inline-block rounded-[var(--radius-ctl)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-ink">
                            {s.title}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* TRUNCATION.
          The hero figures are summed from the rows that came back. Past the query
          ceiling that set is incomplete, and a total that is wrong by an unknown
          amount must not be presented as a total. Said loudly, above the softer
          "behöver din uppmärksamhet" list, because this one invalidates numbers the
          user has already read further up the page. */}
      {data.truncated?.any && (
        <section className="rounded-[var(--radius-card)] border border-crit/40 bg-crit-bg p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-crit">Ofullständigt</span>
            <h2 className="text-[13.5px] font-medium text-crit">Siffrorna ovan är inte hela året</h2>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {data.truncated.invoices && data.truncated.receipts
              ? "Både fakturorna och kvittona är fler än vad översikten hämtar."
              : data.truncated.invoices
              ? "Du har fler fakturor i år än vad översikten hämtar."
              : "Du har fler kvitton i år än vad översikten hämtar."}{" "}
            Intäkter, kostnader och momsrutorna på den här sidan räknar därför bara en
            del av året.{" "}
            <strong className="font-medium text-ink">Momssidan hämtar en period i taget
            och är fullständig</strong> — använd den när du deklarerar.
          </p>
        </section>
      )}

      {(data.flags.untagged > 0 || data.flags.untreated > 0) && (
        <section className="rounded-[var(--radius-card)] border border-warn/35 bg-warn-bg p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-warn">Granska</span>
            <h2 className="text-[13.5px] font-medium text-warn">Behöver din uppmärksamhet</h2>
          </div>
          <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink-2">
            {data.flags.untreated > 0 && (
              <li>· {num(data.flags.untreated)} kvitton saknar momsbehandling och räknas inte med i ruta 48.</li>
            )}
            {data.flags.untagged > 0 && (
              <li>· {num(data.flags.untagged)} poster saknar verksamhet och syns bara under ”Alla”.</li>
            )}
          </ul>
        </section>
      )}
    </div>
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
