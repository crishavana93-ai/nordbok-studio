"use client";

/* The checklist shown under a bank line that looks like a freight/forwarder payment.
   See lib/frakt.js for why the invoice item cannot be ticked by hand. */

import { useState } from "react";
import { ITEMS, readState, writeState } from "@/lib/frakt";

export default function FraktChecklist({ tx, sb, onSaved }) {
  const init = readState(tx.category);
  const [kind, setKind] = useState(init.kind);
  const [done, setDone] = useState(init.done);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hasDoc = !!(tx.matched_receipt || tx.matched_invoice);

  async function save(k, d) {
    setBusy(true); setErr("");
    const { error } = await sb.from("studio_bank_tx").update({ category: writeState(k, d) }).eq("id", tx.id).select("id").maybeSingle();
    if (error) setErr(`Kunde inte spara: ${error.message}`); else onSaved?.();
    setBusy(false);
  }
  const pick = (k) => { setKind(k); save(k, done); };
  const toggle = (key) => {
    const d = new Set(done); d.has(key) ? d.delete(key) : d.add(key);
    setDone(d); save(kind, d);
  };

  const items = kind ? ITEMS[kind] : [];
  const klara = items.filter((it) => (it.auto ? hasDoc : done.has(it.key))).length;

  return (
    <span className="mt-2 block rounded-[var(--radius-ctl)] border border-border bg-raised p-3">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink">
          Frakt/speditör — underlag {kind ? `${klara}/${items.length}` : ""}
        </span>
        <span className="flex rounded-[var(--radius-ctl)] border border-border bg-surface p-0.5 text-[12px]">
          {[["tjanst", "Tjänst"], ["varor", "Varor"]].map(([k, l]) => (
            <button key={k} type="button" disabled={busy} onClick={() => pick(k)}
              className={`rounded px-2.5 py-1 ${kind === k ? "border border-border bg-raised font-medium text-ink" : "border border-transparent text-ink-3"}`}>
              {l}
            </button>
          ))}
        </span>
      </span>
      {!kind && (
        <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-2">
          Betalade du för en tjänst, eller flyttar de varor åt dig? Det avgör vilka underlag som krävs.
        </span>
      )}
      {kind && (
        <span className="mt-2 flex flex-col gap-1.5">
          {items.map((it) => {
            const ok = it.auto ? hasDoc : done.has(it.key);
            return (
              <label key={it.key} className="flex items-start gap-2 text-[12.5px] leading-snug">
                <input type="checkbox" checked={ok} disabled={it.auto || busy}
                  onChange={() => toggle(it.key)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
                <span className="min-w-0">
                  <span className={ok ? "text-ink-3 line-through" : "text-ink"}>{it.label}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {it.auto && !ok ? "Ladda upp fakturan under Kvitton och koppla den till raden ovan. " : ""}{it.why}
                  </span>
                </span>
              </label>
            );
          })}
        </span>
      )}
      {err && <span role="alert" className="mt-1.5 block text-[12px] text-crit">{err}</span>}
    </span>
  );
}
