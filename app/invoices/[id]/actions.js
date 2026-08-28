"use client";

/* app/invoices/[id]/actions.js
 *
 * WHAT CHANGED AND WHY
 *
 * 1. BETALDATUMET VAR ALLTID IDAG.
 *    markPaid() skrev `paid_at: new Date().toISOString()`. Under kontantmetoden
 *    är betaldatumet inte administration — det avgör vilket momskvartal intäkten
 *    hamnar i, och vilket år den beskattas. En faktura som betalades i juni men
 *    bokas i september flyttar momsen från Q2 till Q3 och gör två deklarationer
 *    fel samtidigt. Datumet frågas nu efter, med dagens som förslag.
 *
 * 2. DEN VIKTIGASTE KNAPPEN I APPEN SÅG UT SOM "TILLBAKA".
 *    Att pengar kommit in är det som skapar intäkt, fyller ruta 05 och 10, och
 *    ändrar skatteberäkningen. Knappen var grå, sekundär och låg mellan "PDF"
 *    och "Tillbaka". Nu är den primär, och den säger vad som händer.
 *
 * Sändning ligger fortfarande bara i ComplianceGate. Här finns PDF:en och
 * registreringen av att betalningen kommit.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { money, dateISO } from "@/lib/format";

export default function InvoiceActions({ invoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(null);
  const [oppen, setOppen] = useState(false);
  const [datum, setDatum] = useState(dateISO(new Date()));

  const kanBetalas = invoice.status !== "paid" && invoice.status !== "draft" && invoice.status !== "cancelled";

  async function markPaid() {
    if (!datum) { setErr("Ange vilket datum betalningen kom."); return; }
    setBusy("paid"); setErr(null);
    try {
      const sb = browserClient();
      const { data, error } = await sb
        .from("studio_invoices")
        /* Middag lokal tid: datumet ska tolkas som den dag användaren valde,
           oavsett tidszon. Midnatt UTC blir gårdagen i Sverige på sommaren. */
        .update({ status: "paid", paid_at: `${datum}T12:00:00+02:00` })
        .eq("id", invoice.id)
        .select("id")
        .maybeSingle();
      // Never swallow a Supabase {data, error} — it does not throw.
      if (error) { setErr(error.message); return; }
      if (!data) { setErr("Fakturan kunde inte uppdateras."); return; }
      setOppen(false);
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  const btn =
    "rounded-[var(--radius-ctl)] border border-border-firm px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink disabled:opacity-50";
  const primar =
    "rounded-[var(--radius-ctl)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50";

  const belopp = money(Number(invoice.total || 0), {
    decimals: 2, currency: invoice.currency || "SEK",
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className={btn} href={`/api/invoices/pdf?id=${invoice.id}`} target="_blank" rel="noreferrer">
        PDF
      </a>

      {kanBetalas && !oppen && (
        <button className={primar} onClick={() => { setOppen(true); setErr(null); }}>
          Betalningen har kommit
        </button>
      )}

      {kanBetalas && oppen && (
        <div className="w-full rounded-[var(--radius-card)] border border-border bg-raised p-3.5">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Bokför <strong className="text-ink">{belopp.text}</strong> som betald.
            Datumet avgör vilket momskvartal intäkten hamnar i — ange den dag pengarna
            kom in på kontot, inte dagens datum om de skiljer sig.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="micro-label">Betaldatum</span>
              <input
                type="date"
                value={datum}
                max={dateISO(new Date())}
                onChange={(e) => setDatum(e.target.value)}
                className="rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2 text-[16px] text-ink"
              />
            </label>
            <button className={primar} onClick={markPaid} disabled={busy === "paid"}>
              {busy === "paid" ? "Bokför…" : "Bokför betalningen"}
            </button>
            <button className={btn} onClick={() => { setOppen(false); setErr(null); }} disabled={busy === "paid"}>
              Avbryt
            </button>
          </div>
        </div>
      )}

      {invoice.status === "paid" && invoice.paid_at && (
        <span className="rounded-[var(--radius-ctl)] bg-good-bg px-3 py-2 font-mono text-[12px] font-medium text-good">
          betald {String(invoice.paid_at).slice(0, 10)}
        </span>
      )}

      {err && (
        <span className="w-full rounded-[var(--radius-ctl)] bg-crit-bg px-3 py-2 text-[12.5px] text-ink-2">
          Kunde inte bokföra betalningen. {err}
        </span>
      )}
    </div>
  );
}
