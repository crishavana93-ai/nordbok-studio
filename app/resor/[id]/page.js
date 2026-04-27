import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase-server";
import { fmtMoney, fmtDate } from "@/lib/currency";
import TripActions from "./actions";

export const dynamic = "force-dynamic";

export default async function TripView({ params }) {
  const { id } = await params;
  const sb = await serverClient();
  const { data: trip } = await sb.from("studio_business_trips").select("*, studio_clients(name, email)").eq("id", id).maybeSingle();
  if (!trip) return notFound();

  // Auto-suggest items in the date range that aren't already linked
  const [{ data: linkedReceipts }, { data: candidateReceipts }, { data: linkedMileage }, { data: candidateMileage }, { data: linkedDocs }, { data: candidateDocs }] = await Promise.all([
    sb.from("studio_receipts").select("*").eq("business_trip_id", trip.id).order("receipt_date"),
    sb.from("studio_receipts").select("*").is("business_trip_id", null).gte("receipt_date", trip.start_date).lte("receipt_date", trip.end_date).order("receipt_date"),
    sb.from("studio_trips").select("*").eq("business_trip_id", trip.id).order("trip_date"),
    sb.from("studio_trips").select("*").is("business_trip_id", null).gte("trip_date", trip.start_date).lte("trip_date", trip.end_date).order("trip_date"),
    sb.from("studio_documents").select("*").eq("business_trip_id", trip.id).order("issued_date"),
    sb.from("studio_documents").select("*").is("business_trip_id", null).gte("issued_date", trip.start_date).lte("issued_date", trip.end_date).order("issued_date"),
  ]);

  const ccy = trip.currency || "SEK";
  const totalReceipts = (linkedReceipts || []).reduce((a, r) => a + Number(r.total || 0), 0);
  const totalMileage = (linkedMileage || []).reduce((a, m) => a + Number(m.deduction || 0), 0);

  return (
    <>
      <div className="spread" style={{ marginBottom: 14 }}>
        <div>
          <Link href="/resor" className="muted" style={{ fontSize: 13 }}>← Alla resor</Link>
          <h1 className="h1" style={{ marginTop: 4 }}>{trip.title}</h1>
          <div className="muted">
            {trip.destination || "—"}{trip.country_code && ` (${trip.country_code})`} · {fmtDate(trip.start_date)}{trip.end_date && trip.end_date !== trip.start_date ? ` → ${fmtDate(trip.end_date)}` : ""}
            {" · "}<span className={`badge badge-${trip.status === "completed" ? "paid" : trip.status === "ongoing" ? "sent" : "draft"}`}>{trip.status}</span>
          </div>
        </div>
        <TripActions trip={trip} />
      </div>

      {/* ─── Skatteverket audit-trail block — this is what they ask for ─── */}
      <div className="card" style={{ marginBottom: 14, background: "var(--accent-soft)" }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Skatteverket-revisionsspår</h2>
        <div className="grid-2">
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: ".05em" }}>Syfte</div>
            <div style={{ fontWeight: 600, marginTop: 4, whiteSpace: "pre-wrap" }}>{trip.purpose || "—"}</div>
            {trip.conference && <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Konferens: {trip.conference}</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: ".05em" }}>Kontakter / deltagare</div>
            {Array.isArray(trip.contacts) && trip.contacts.length > 0 ? (
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {trip.contacts.map((c, i) => (
                  <li key={i}><strong>{c.name}</strong>{c.company ? ` — ${c.company}` : ""}{c.role ? ` (${c.role})` : ""}</li>
                ))}
              </ul>
            ) : <div className="muted">Inga kontakter loggade.</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: ".05em" }}>Färdmedel</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{trip.travel_mode || "—"}{trip.vehicle_reg && ` · ${trip.vehicle_reg}`}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: ".05em" }}>Måltider</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{trip.uses_traktamente ? "Traktamente schablon" : "Faktiska kvitton"}</div>
          </div>
          {trip.private_days > 0 && (
            <div style={{ gridColumn: "1/-1" }}>
              <div className="alert alert-info" style={{ marginTop: 6, marginBottom: 0 }}>
                <strong>{trip.private_days} privata dagar</strong> — fördela hotell/flyg proportionellt vid avdrag.
              </div>
            </div>
          )}
        </div>
        {trip.notes && (
          <div style={{ marginTop: 12, padding: 10, background: "var(--bg-card)", borderRadius: 9, fontSize: 13 }}>
            <strong>Anteckningar:</strong> {trip.notes}
          </div>
        )}
      </div>

      {/* ─── Summary numbers ─── */}
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-label">Kvitton</div><div className="stat-value">{(linkedReceipts || []).length}</div><div className="stat-delta">{fmtMoney(totalReceipts, ccy, { fractionDigits: 0 })}</div></div>
        <div className="stat"><div className="stat-label">Körjournal</div><div className="stat-value">{(linkedMileage || []).length} resor</div><div className="stat-delta">Avdrag {fmtMoney(totalMileage, "SEK", { fractionDigits: 0 })}</div></div>
        <div className="stat"><div className="stat-label">Dokument</div><div className="stat-value">{(linkedDocs || []).length}</div><div className="stat-delta">Boarding pass, hotellfaktura, etc.</div></div>
      </div>

      {/* ─── Linked receipts ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Kvitton kopplade till resan</h2>
        {(linkedReceipts || []).length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Inga kvitton kopplade ännu.</div>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Datum</th><th>Leverantör</th><th>Kategori</th><th className="num">Belopp</th></tr></thead>
              <tbody>
                {linkedReceipts.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Datum">{fmtDate(r.receipt_date)}</td>
                    <td data-label="Leverantör">{r.vendor}</td>
                    <td data-label="Kategori" className="muted">{r.category} <span style={{ fontSize: 11 }}>({r.bas_account})</span></td>
                    <td data-label="Belopp" className="num">{fmtMoney(r.total, r.currency || "SEK", { fractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(candidateReceipts || []).length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, padding: "6px 0" }}>
              {candidateReceipts.length} kvitton hittades i resans datumintervall — koppla?
            </summary>
            <div style={{ marginTop: 8 }}>
              <TripActions.AttachList trip={trip} kind="receipts" items={candidateReceipts} />
            </div>
          </details>
        )}
      </div>

      {/* ─── Linked mileage ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Körjournal kopplad till resan</h2>
        {(linkedMileage || []).length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Inga körjournal-resor kopplade ännu.</div>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Datum</th><th>Resa</th><th className="num">Km</th><th className="num">Avdrag</th></tr></thead>
              <tbody>
                {linkedMileage.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Datum">{fmtDate(m.trip_date)}</td>
                    <td data-label="Resa">{m.from_address} → {m.to_address}</td>
                    <td data-label="Km" className="num">{m.km}</td>
                    <td data-label="Avdrag" className="num">{fmtMoney(m.deduction, "SEK", { fractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(candidateMileage || []).length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{candidateMileage.length} körjournal-resor matchar datum — koppla?</summary>
            <div style={{ marginTop: 8 }}><TripActions.AttachList trip={trip} kind="mileage" items={candidateMileage} /></div>
          </details>
        )}
      </div>

      {/* ─── Linked documents ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Dokument (boarding pass, hotellfaktura, mässbiljett)</h2>
        {(linkedDocs || []).length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Inga dokument kopplade. Ladda upp i <Link href="/documents" style={{ textDecoration: "underline" }}>Arkiv</Link> och koppla hit, eller använd knappen nedan.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {linkedDocs.map((d) => (
              <li key={d.id}><strong>{d.title}</strong> <span className="muted" style={{ fontSize: 12 }}>· {d.doc_type}</span></li>
            ))}
          </ul>
        )}
        {(candidateDocs || []).length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{candidateDocs.length} dokument matchar datum — koppla?</summary>
            <div style={{ marginTop: 8 }}><TripActions.AttachList trip={trip} kind="documents" items={candidateDocs} /></div>
          </details>
        )}
      </div>

      {/* ─── Doc-checklist (what Skatteverket asks for) ─── */}
      <div className="card">
        <h2 className="h2" style={{ marginTop: 0 }}>Dokumentationschecklist</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 14 }}>
          <li>{trip.purpose ? "✅" : "⬜"} Syfte loggat (varför reste du?)</li>
          <li>{(trip.contacts || []).length > 0 ? "✅" : "⬜"} Kontakter/deltagare loggade</li>
          <li>{(linkedReceipts || []).length > 0 ? "✅" : "⬜"} Minst ett kvitto kopplat (flyg, hotell, taxi...)</li>
          <li>{(trip.travel_mode === "car" || trip.travel_mode === "mixed") ? ((linkedMileage || []).length > 0 ? "✅" : "⬜ Körjournal-resa kopplad") : "—"} {trip.travel_mode === "car" || trip.travel_mode === "mixed" ? "Körjournal kopplad (om du körde)" : "Inte tillämpligt"}</li>
          <li>{(linkedDocs || []).length > 0 ? "✅" : "⬜"} Boarding pass / hotellfaktura / mässbiljett uppladdat</li>
          <li>{trip.notes || trip.conference ? "✅" : "⬜"} Anteckningar eller konferensnamn (rekommenderat)</li>
        </ul>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Skatteverket kan begära dessa upp till 6 år efter inkomståret. Allt sparas automatiskt 7 år.
        </div>
      </div>
    </>
  );
}
