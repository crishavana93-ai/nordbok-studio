"use client";

/* app/invoices/[id]/actions.js
 *
 * WHAT CHANGED AND WHY
 * This component used to own a `send()` of its own: it POSTed straight to
 * /api/invoices/send and reported whatever came back through `alert()`. That made
 * ComplianceGate decorative — the gate sat on the page while the button beside it
 * walked around. It also threw away the structured 422 (defective, cannot send) and
 * 409 (legal but worth checking) responses the route goes to the trouble of
 * returning, collapsing both into one modal that says "Misslyckades".
 *
 * Sending now lives in exactly one place: ComplianceGate. This component keeps only
 * the two actions that carry no compliance question — fetch the PDF, and record that
 * money arrived.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";

export default function InvoiceActions({ invoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(null);

  async function markPaid() {
    setBusy("paid"); setErr(null);
    try {
      const sb = browserClient();
      const { error } = await sb
        .from("studio_invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", invoice.id);
      // Never swallow a Supabase {data, error} — it does not throw.
      if (error) { setErr(error.message); return; }
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  const btn =
    "rounded-[var(--radius-ctl)] border border-border-firm px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className={btn} href={`/api/invoices/pdf?id=${invoice.id}`} target="_blank" rel="noreferrer">
        PDF
      </a>
      {invoice.status !== "paid" && invoice.status !== "draft" && (
        <button className={btn} onClick={markPaid} disabled={busy === "paid"}>
          {busy === "paid" ? "Sparar…" : "Markera betald"}
        </button>
      )}
      {err && (
        <span className="w-full rounded-[var(--radius-ctl)] bg-crit-bg px-3 py-2 text-[12.5px] text-ink-2">
          Kunde inte markera som betald. {err}
        </span>
      )}
    </div>
  );
}
