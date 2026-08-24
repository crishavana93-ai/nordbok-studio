"use client";

/* components/invoices/Kreditera.jsx
 *
 * The only lawful way to change a sent invoice.
 *
 * Once sent_at is set, migration 010's trigger refuses every UPDATE that touches the
 * document itself, and refuses DELETE outright. That is the correct behaviour and it
 * would be cruel without this button: an accounting tool that can issue an invoice but
 * not correct one has handed you a problem, not a solution.
 *
 * The reason field is REQUIRED and not decorative. Under the mervardesskattelag an
 * andringsfaktura must state what changed alongside its reference to the original.
 * The database refuses a blank one, so validating here is a courtesy, not the control.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";

const PRESETS = [
  "Fel säljare angiven på fakturan.",
  "Fel belopp.",
  "Fel kund.",
  "Tjänsten levererades aldrig.",
  "Fakturan utfärdades av misstag.",
];

export default function Kreditera({ invoiceNumber }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    if (!reason.trim()) { setErr("Ange vad som ändrats."); return; }
    setBusy(true); setErr("");
    try {
      const sb = browserClient();
      const { data, error } = await sb.rpc("skapa_andringsfaktura", {
        p_invoice_id: window.location.pathname.split("/").pop(),
        p_reason: reason.trim(),
      });
      /* Supabase returns {data, error}; it does not throw. Never assume success. */
      if (error) { setErr(error.message); return; }
      router.push(`/invoices/${data}`);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-ctl)] border border-border-firm px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink"
      >
        Kreditera
      </button>
    );
  }

  return (
    <div className="w-full rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">
        Kreditera faktura {invoiceNumber}
      </h2>
      <p className="mt-1 mb-3.5 text-[12.5px] leading-relaxed text-ink-3">
        Det här skapar en ändringsfaktura — ett eget dokument med eget nummer som
        hänvisar till {invoiceNumber} och nollar den. Originalet ändras aldrig; det är
        därför bokföringen håller.
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p} type="button" onClick={() => setReason(p)}
            className={`rounded-[var(--radius-ctl)] border px-2.5 py-1 text-[12px] transition-colors ${
              reason === p ? "border-ink bg-raised text-ink" : "border-border text-ink-2 hover:text-ink"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="micro-label">Vad har ändrats? *</span>
        <textarea
          rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Skrivs ut på ändringsfakturan."
          className="w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink"
        />
      </label>

      {err && (
        <p className="mt-3 rounded-[var(--radius-ctl)] bg-crit-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">{err}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        <button onClick={create} disabled={busy || !reason.trim()}
          className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
          {busy ? "Skapar…" : "Skapa ändringsfaktura"}
        </button>
        <button onClick={() => { setOpen(false); setErr(""); }} disabled={busy}
          className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-2.5 text-[14px] font-medium text-ink-2">
          Avbryt
        </button>
      </div>
    </div>
  );
}
