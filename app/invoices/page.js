import Link from "next/link";
import { serverClient } from "@/lib/supabase-server";

export const metadata = { title: "Fakturor" };
export const dynamic = "force-dynamic";

const fmt = (n) => new Intl.NumberFormat("sv-SE").format(Math.round(Number(n) || 0));

export default async function Invoices() {
  const sb = await serverClient();
  const { data: invoices } = await sb
    .from("studio_invoices")
    .select("id, invoice_number, status, total, issue_date, due_date, client_id, studio_clients(name)")
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
            <div style={{ marginBottom: 8 }}>Inga fakturor ännu.</div>
            <Link className="btn" href="/invoices/new">Skapa din första faktura</Link>
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>Nr</th><th>Kund</th><th>Datum</th><th>Förfaller</th><th>Status</th><th className="num">Belopp</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/invoices/${i.id}`}>#{i.invoice_number}</Link></td>
                  <td>{i.studio_clients?.name || "—"}</td>
                  <td>{i.issue_date}</td>
                  <td>{i.due_date}</td>
                  <td><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                  <td className="num">{fmt(i.total)} kr</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
