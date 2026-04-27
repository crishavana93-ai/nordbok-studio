"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserClient } from "@/lib/supabase";

export default function TripActions({ trip }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function setStatus(status) {
    setBusy(status);
    const sb = browserClient();
    await sb.from("studio_business_trips").update({ status, updated_at: new Date().toISOString() }).eq("id", trip.id);
    router.refresh();
    setBusy("");
  }

  async function del() {
    if (!confirm(`Ta bort resan "${trip.title}"? Detta tar inte bort kopplade kvitton/körjournal/dokument.`)) return;
    const sb = browserClient();
    await sb.from("studio_business_trips").delete().eq("id", trip.id);
    router.push("/resor");
    router.refresh();
  }

  return (
    <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
      {trip.status !== "ongoing" && trip.status !== "completed" && (
        <button className="btn btn-ghost btn-sm" onClick={() => setStatus("ongoing")} disabled={busy === "ongoing"}>Pågår</button>
      )}
      {trip.status !== "completed" && (
        <button className="btn btn-sm" onClick={() => setStatus("completed")} disabled={busy === "completed"}>Markera klar</button>
      )}
      <button className="btn btn-ghost btn-sm" onClick={del}>Ta bort</button>
    </div>
  );
}

/** Inline list of unlinked items the user can attach to the trip in one tap. */
function AttachList({ trip, kind, items }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const tableMap = {
    receipts:  { table: "studio_receipts",  label: (r) => `${r.receipt_date} · ${r.vendor} · ${Number(r.total).toFixed(2)} ${r.currency || "SEK"}` },
    mileage:   { table: "studio_trips",     label: (m) => `${m.trip_date} · ${m.from_address} → ${m.to_address} · ${m.km} km` },
    documents: { table: "studio_documents", label: (d) => `${d.issued_date || ""} · ${d.title}` },
  };
  const { table, label } = tableMap[kind];

  async function attach(itemId) {
    setBusy(true);
    const sb = browserClient();
    await sb.from(table).update({ business_trip_id: trip.id }).eq("id", itemId);
    router.refresh();
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 9, fontSize: 13 }}>
          <div>{label(it)}</div>
          <button className="btn btn-sm" onClick={() => attach(it.id)} disabled={busy}>+ Koppla</button>
        </div>
      ))}
    </div>
  );
}
TripActions.AttachList = AttachList;
