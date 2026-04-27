"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";

export default function InvoiceActions({ invoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function send() {
    setBusy("send");
    try {
      const r = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Misslyckades");
      router.refresh();
    } catch (e) { alert(e.message); }
    finally { setBusy(""); }
  }

  async function markPaid() {
    setBusy("paid");
    const sb = browserClient();
    await sb.from("studio_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoice.id);
    router.refresh();
    setBusy("");
  }

  return (
    <>
      <a className="btn btn-ghost btn-sm" href={`/api/invoices/pdf?id=${invoice.id}`} target="_blank" rel="noreferrer">PDF</a>
      {invoice.status !== "paid" && (
        <button className="btn btn-ghost btn-sm" onClick={markPaid} disabled={busy === "paid"}>{busy === "paid" ? "..." : "Markera betald"}</button>
      )}
      {invoice.status === "draft" && (
        <button className="btn btn-sm" onClick={send} disabled={busy === "send"}>{busy === "send" ? "Skickar..." : "Skicka via e-post"}</button>
      )}
    </>
  );
}
