"use client";

/* app/resor/[id]/actions.js — DIRECTION C
 *
 * Migrated 2026-08-24. Every write here discarded its { error }: setStatus, del and
 * attach all fired and refreshed regardless of the result, so a blocked update looked
 * identical to a successful one until the page was reloaded. That matters most on
 * `attach`, which moves a verifikation onto a trip — a silent failure there leaves a
 * receipt unattached while the screen implies it is filed.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { money, dateISO, num } from "@/lib/format";
import { reportErrorAsync } from "@/lib/report-error";

const btn = "rounded-[var(--radius-ctl)] border border-border-firm px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink disabled:opacity-40";

export default function TripActions({ trip }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function setStatus(status) {
    setBusy(status); setErr("");
    const sb = browserClient();
    const { error } = await sb.from("studio_business_trips")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", trip.id);
    if (error) { setErr(error.message); reportErrorAsync(error, { scope: "ui/resor-status" }); }
    else router.refresh();
    setBusy("");
  }

  async function del() {
    if (!confirm(`Ta bort resan ”${trip.title}”? Kopplade kvitton, körjournalresor och dokument tas inte bort — de blir bara frikopplade.`)) return;
    setBusy("del"); setErr("");
    const sb = browserClient();
    const { error } = await sb.from("studio_business_trips").delete().eq("id", trip.id);
    if (error) {
      setErr(error.message);
      reportErrorAsync(error, { scope: "ui/resor-delete" });
      setBusy("");
      return;
    }
    router.push("/resor");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {trip.status !== "ongoing" && trip.status !== "completed" && (
          <button className={btn} onClick={() => setStatus("ongoing")} disabled={Boolean(busy)}>
            {busy === "ongoing" ? "…" : "Pågår"}
          </button>
        )}
        {trip.status !== "completed" && (
          <button className={btn} onClick={() => setStatus("completed")} disabled={Boolean(busy)}>
            {busy === "completed" ? "…" : "Markera klar"}
          </button>
        )}
        <button className={`${btn} hover:text-crit`} onClick={del} disabled={Boolean(busy)}>
          {busy === "del" ? "…" : "Ta bort"}
        </button>
      </div>
      {err && (
        <p role="alert" className="max-w-[36ch] rounded-[var(--radius-ctl)] bg-crit-bg px-3 py-2 text-right text-[12px] leading-relaxed text-ink-2">
          {err}
        </p>
      )}
    </div>
  );
}

/** Unlinked items the user can attach to the trip in one tap. */
function AttachList({ trip, kind, items }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const MAP = {
    receipts: {
      table: "studio_receipts",
      primary: (r) => r.vendor,
      meta: (r) => `${dateISO(r.receipt_date)}${r.category ? ` · ${r.category}` : ""}`,
      amount: (r) => money(r.total, { decimals: 2, currency: r.currency || "SEK" }).text,
    },
    mileage: {
      table: "studio_trips",
      primary: (m) => `${m.from_address} → ${m.to_address}`,
      meta: (m) => `${dateISO(m.trip_date)} · ${num(m.km)} km`,
      amount: (m) => money(m.deduction, { decimals: 0 }).text,
    },
    documents: {
      table: "studio_documents",
      primary: (d) => d.title,
      meta: (d) => `${d.issued_date ? dateISO(d.issued_date) : ""}${d.doc_type ? ` · ${d.doc_type}` : ""}`,
      amount: () => null,
    },
  };
  const { table, primary, meta, amount } = MAP[kind];

  async function attach(itemId) {
    setBusy(true); setErr("");
    const sb = browserClient();
    const { error } = await sb.from(table).update({ business_trip_id: trip.id }).eq("id", itemId);
    if (error) { setErr(error.message); reportErrorAsync(error, { scope: `ui/resor-attach-${kind}` }); }
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {err && (
        <p role="alert" className="rounded-[var(--radius-ctl)] bg-crit-bg px-3 py-2 text-[12px] leading-relaxed text-ink-2">{err}</p>
      )}
      {items.map((it) => (
        <div key={it.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-ctl)] bg-raised px-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-ink">{primary(it)}</span>
            <span className="font-mono text-[11px] text-ink-3">{meta(it)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {amount(it) && <span className="tnum font-mono text-[12.5px] text-ink-2">{amount(it)}</span>}
            <button onClick={() => attach(it.id)} disabled={busy}
              className="rounded-[var(--radius-ctl)] border border-border-firm bg-surface px-2.5 py-1 text-[12px] font-medium text-ink disabled:opacity-40">
              Koppla
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
TripActions.AttachList = AttachList;
