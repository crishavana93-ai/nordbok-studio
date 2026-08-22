"use client";

/* components/dashboard/MonthlyChart.jsx
 *
 * REBUILT FOR PHONES. What the screenshots showed and what changed:
 *
 *  1. The panel was wider than the screen — the whole page scrolled sideways.
 *     Fixed with a min-width:0 wrapper; a flex/grid child defaults to min-width:auto
 *     and refuses to shrink below its content, which is what pushed the layout out.
 *  2. With no data the axis read 0,1,2,3,4 — meaningless numbers for money. There is
 *     now a real empty state instead of a chart of nothing.
 *  3. The tooltip stuck open on touch and covered the plot. It now dismisses on
 *     touch-end and on any tap outside.
 *  4. Six months of labels collided on a 390px screen. Every other label on narrow
 *     viewports.
 */

import { useMemo, useState, useRef, useEffect, useId } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { num, money } from "@/lib/format";

/* Numbers come from lib/format.js — nothing in this app formats its own.
 * `short` is the axis form: thousands collapsed so the tick labels do not collide. */
const kr = { format: (v) => num(v) };
const short = (v) => (Math.abs(v) >= 1000 ? `${num(v / 1000)}k` : num(v));

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  return (
    <div className="max-w-[220px] rounded-lg border border-border-firm bg-surface px-3 py-2.5">
      <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-ink-3">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mt-0.5 flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
            <span className="size-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="truncate">{p.name}</span>
          </span>
          <span className="tnum shrink-0 font-mono font-medium text-ink">{kr.format(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border pt-1.5 text-xs">
          <span className="text-ink-2">Totalt</span>
          <span className="tnum font-mono font-medium text-ink" lang="sv-SE" aria-label={money(total, { decimals: 0 }).spoken}>{money(total, { decimals: 0 }).text}</span>
        </div>
      )}
    </div>
  );
}

function Empty({ mode }) {
  const copy = {
    rev: ["Inga intäkter bokförda", "Skapa din första faktura så ritas kurvan här."],
    cost: ["Inga kostnader bokförda", "Lägg till kvitton så räknar vi ut din avdragsgilla moms."],
    net: ["Inget att visa ännu", "Netto beräknas när det finns både intäkter och kostnader."],
  }[mode];

  return (
    <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 text-center">
      <svg viewBox="0 0 24 24" className="size-7 stroke-ink-3" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 15l4-5 4 3 5-7" />
      </svg>
      <p className="text-[13.5px] font-medium text-ink-2">{copy[0]}</p>
      <p className="max-w-[240px] text-xs text-ink-3">{copy[1]}</p>
    </div>
  );
}

export default function MonthlyChart({ months, series, mode, ventures }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [showTable, setShowTable] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const holdRef = useRef(null);
  const tableId = useId();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 560px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // A tooltip left open on touch covers the plot. Dismiss on tap outside.
  useEffect(() => {
    const away = (e) => {
      if (holdRef.current && !holdRef.current.contains(e.target)) {
        holdRef.current.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      }
    };
    document.addEventListener("touchstart", away, { passive: true });
    return () => document.removeEventListener("touchstart", away);
  }, []);

  const visible = ventures.filter((v) => !hidden.has(v.key));
  const netto = mode === "net";

  const data = useMemo(
    () =>
      months.map((m, i) => {
        const row = { month: m };
        for (const v of ventures) {
          row[v.key] = netto
            ? (series.revenue[v.key]?.[i] || 0) - (series.costs[v.key]?.[i] || 0)
            : series[mode === "cost" ? "costs" : "revenue"][v.key]?.[i] || 0;
        }
        return row;
      }),
    [months, series, mode, ventures, netto]
  );

  const hasData = data.some((row) => ventures.some((v) => row[v.key] !== 0));

  function toggle(key) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next.size === ventures.length ? prev : next;
    });
  }

  const axis = { stroke: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)" };
  const tickInterval = narrow ? 1 : 0; // every other month on a phone

  return (
    // min-w-0 is load-bearing: without it this grid/flex child refuses to shrink
    // below its content and pushes the whole page sideways.
    <div className="min-w-0">
      {!hasData ? (
        <Empty mode={mode} />
      ) : (
        <div ref={holdRef} className="h-[210px] w-full min-w-0 touch-pan-y sm:h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            {netto ? (
              <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} interval={tickInterval} {...axis} />
                <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={44} {...axis} />
                <ReferenceLine y={0} stroke="var(--border-firm)" />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ink-3)", strokeDasharray: "3 3" }} />
                {visible.map((v) => (
                  <Line key={v.key} type="monotone" dataKey={v.key} name={v.name}
                    stroke={v.color} strokeWidth={2} dot={false}
                    activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--surface)" }}
                    isAnimationActive={false} />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} interval={tickInterval} {...axis} />
                <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={44} {...axis} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ink-3)", strokeDasharray: "3 3" }} />
                {visible.map((v) => (
                  <Area key={v.key} type="monotone" dataKey={v.key} name={v.name} stackId="1"
                    stroke="var(--surface)" strokeWidth={2}
                    fill={v.color} fillOpacity={0.9}
                    activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--surface)", fill: v.color }}
                    isAnimationActive={false} />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {ventures.length > 1 && hasData && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2">
          {ventures.map((v) => (
            <button key={v.key} onClick={() => toggle(v.key)} aria-pressed={!hidden.has(v.key)}
              className="flex min-h-0 items-center gap-1.5 rounded py-1 text-xs text-ink-2 transition-opacity aria-[pressed=false]:opacity-40">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: v.color }} />
              <span className="truncate">{v.name}</span>
            </button>
          ))}
        </div>
      )}

      {hasData && (
        <>
          <button onClick={() => setShowTable((s) => !s)} aria-expanded={showTable} aria-controls={tableId}
            className="mt-3 rounded-md border border-border-firm px-3 py-1.5 font-mono text-[11.5px] font-medium text-ink-2">
            {showTable ? "Dölj tabell" : "Visa tabell"}
          </button>

          {showTable && (
            <div id={tableId} data-scroll-x className="mt-3">
              <table className="w-full min-w-[380px] border-collapse">
                <thead>
                  <tr>
                    <th className="micro-label border-b border-border px-2 py-1.5 text-left">Mån</th>
                    {visible.map((v) => (
                      <th key={v.key} className="micro-label border-b border-border px-2 py-1.5 text-right">{v.name}</th>
                    ))}
                    <th className="micro-label border-b border-border px-2 py-1.5 text-right">Totalt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.month}>
                      <td className="border-b border-border px-2 py-2 text-[13px]">{row.month}</td>
                      {visible.map((v) => (
                        <td key={v.key} className="tnum border-b border-border px-2 py-2 text-right font-mono text-[13px]">
                          {kr.format(row[v.key])}
                        </td>
                      ))}
                      <td className="tnum border-b border-border px-2 py-2 text-right font-mono text-[13px] font-medium">
                        {kr.format(visible.reduce((a, v) => a + row[v.key], 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
