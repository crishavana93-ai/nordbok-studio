import Link from "next/link";
import { serverClient } from "@/lib/supabase-server";
import { fmtMoney } from "@/lib/currency";

export const metadata = { title: "Fakturor" };
export const dynamic = "force-dynamic";

export default async function Invoices() {
  const sb = await serverClient();
  const { data: invoices } = await sb
    .from("studio_invoices")
    .select("id, invoice_number, status, total, issue_date, due_date, currency, client_id, studio_clients(name)")
    .order("issue_date", { ascending: false });

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Fakturor</h1>
        <Link className="btn" href="/invoices/new">+ Ny faktura</Link>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {!invoices || invoices.length === 0 ? (
          <div className="empty">
            <div style={{ marginBottom: 12 }}>Inga fakturor ännu.</div>
            <Link className="btn" href="/invoices/new">Skapa din första faktura</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Nr</th><th>Kund</th><th>Datum</th><th>Förfaller</th><th>Status</th><th className="num">Belopp</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Nr"><Link href={`/invoices/${i.id}`}>#{i.invoice_number}</Link></td>
                    <td data-label="Kund">{i.studio_clients?.name || "—"}</td>
                    <td data-label="Datum">{i.issue_date}</td>
                    <td data-label="Förfaller">{i.due_date}</td>
                    <td data-label="Status"><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                    <td data-label="Belopp" className="num">{fmtMoney(i.total, i.currency || "SEK", { fractionDigits: 0 })}</td>
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
