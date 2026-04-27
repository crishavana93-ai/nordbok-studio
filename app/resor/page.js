import Link from "next/link";
import { serverClient } from "@/lib/supabase-server";
import { fmtMoney, fmtDate } from "@/lib/currency";

export const metadata = { title: "Affärsresor" };
export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const sb = await serverClient();
  const { data: trips } = await sb
    .from("studio_business_trips")
    .select("*, studio_clients(name)")
    .order("start_date", { ascending: false });

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="h1">Affärsresor</h1>
          <div className="muted">Skatteverkets revisionsspår — per resa: syfte, kontakter, kvitton, körjournal, dokument.</div>
        </div>
        <Link className="btn" href="/resor/new">+ Ny resa</Link>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 14 }}>
        <strong>Varför finns denna sida?</strong> Skatteverket kan begära dokumentation upp till 6 år senare. Här samlar du allt på ett ställe per resa: <em>vart, när, varför, med vem, vilka kvitton</em> — och du kan exportera revisionsspåret som PDF om du blir granskad.
      </div>

      <div className="card" style={{ padding: 0 }}>
        {!trips || trips.length === 0 ? (
          <div className="empty">
            <div style={{ marginBottom: 12 }}>Inga registrerade resor ännu.</div>
            <Link className="btn" href="/resor/new">Logga din första resa</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Titel</th><th>Destination</th><th>Datum</th><th>Status</th><th className="num">Kostnad</th></tr></thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Titel"><Link href={`/resor/${t.id}`}><strong>{t.title}</strong></Link>{t.purpose && <div className="muted" style={{ fontSize: 12 }}>{t.purpose.slice(0, 80)}{t.purpose.length > 80 ? "…" : ""}</div>}</td>
                    <td data-label="Destination">{t.destination || "—"}{t.country_code && t.country_code !== "SE" ? ` (${t.country_code})` : ""}</td>
                    <td data-label="Datum">{fmtDate(t.start_date)}{t.end_date && t.end_date !== t.start_date ? ` → ${fmtDate(t.end_date)}` : ""}</td>
                    <td data-label="Status"><span className={`badge badge-${t.status === "completed" ? "paid" : t.status === "ongoing" ? "sent" : "draft"}`}>{t.status}</span></td>
                    <td data-label="Kostnad" className="num">{t.actual_cost != null ? fmtMoney(t.actual_cost, t.currency || "SEK", { fractionDigits: 0 }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
