import Link from "next/link";
import { serverClient } from "@/lib/supabase-server";
import { estimateTax, mileageDeduction } from "@/lib/swedish-tax";
import QuickActions from "@/components/QuickActions";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const fmt = (n) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

async function getStats(sb, userId) {
  // Year-to-date aggregates
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [{ data: invoices }, { data: receipts }, { data: trips }] = await Promise.all([
    sb.from("studio_invoices").select("status, total, vat_amount, subtotal, paid_at, issue_date").gte("issue_date", yearStart),
    sb.from("studio_receipts").select("total, vat_amount, receipt_date, is_business, is_deductible, status").gte("receipt_date", yearStart),
    sb.from("studio_trips").select("km, deduction, trip_date, is_business").gte("trip_date", yearStart),
  ]);

  const sumPaid = (invoices || []).filter((i) => i.status === "paid").reduce((a, i) => a + Number(i.total || 0), 0);
  const sumOpen = (invoices || []).filter((i) => i.status === "sent" || i.status === "overdue").reduce((a, i) => a + Number(i.total || 0), 0);
  const sumExpenses = (receipts || []).filter((r) => r.is_business && r.is_deductible).reduce((a, r) => a + Number(r.total || 0), 0);
  const vatOut = (invoices || []).reduce((a, i) => a + Number(i.vat_amount || 0), 0);
  const vatIn = (receipts || []).reduce((a, r) => a + Number(r.vat_amount || 0), 0);
  const tripDed = (trips || []).filter((t) => t.is_business).reduce((a, t) => a + Number(t.deduction || mileageDeduction(t.km)), 0);
  const revenue = (invoices || []).reduce((a, i) => a + Number(i.subtotal || 0), 0);
  const profit = revenue - sumExpenses - tripDed;
  const tax = estimateTax(Math.max(0, profit));
  return {
    sumPaid, sumOpen, sumExpenses, vatOut, vatIn, tripDed, revenue, profit, tax,
    invCount: (invoices || []).length,
    recCount: (receipts || []).length,
    tripCount: (trips || []).length,
    pendingReview: (receipts || []).filter((r) => r.status === "review").length,
  };
}

async function getRecent(sb) {
  const [{ data: invoices }, { data: receipts }] = await Promise.all([
    sb.from("studio_invoices").select("id, invoice_number, status, total, issue_date, due_date").order("issue_date", { ascending: false }).limit(5),
    sb.from("studio_receipts").select("id, vendor, total, receipt_date, status, category").order("receipt_date", { ascending: false }).limit(5),
  ]);
  return { invoices: invoices || [], receipts: receipts || [] };
}

export default async function Dashboard() {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  const stats = await getStats(sb, user.id);
  const recent = await getRecent(sb);

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="h1">God morgon{user?.email ? "" : ""}</h1>
          <div className="muted">Översikt {new Date().getFullYear()}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" href="/invoices/new">+ Ny faktura</Link>
          <Link className="btn btn-ghost" href="/receipts">+ Scanna kvitto</Link>
          <Link className="btn btn-ghost" href="/mileage">+ Logga resa</Link>
        </div>
      </div>

      {/* ─── KPI cards ─── */}
      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat label="Inbetalt YTD"      value={`${fmt(stats.sumPaid)} kr`}    delta={`${stats.invCount} fakturor`} />
        <Stat label="Utestående"        value={`${fmt(stats.sumOpen)} kr`}    delta="Skickade & förfallna" />
        <Stat label="Avdragsgilla utg." value={`${fmt(stats.sumExpenses)} kr`} delta={`${stats.recCount} kvitton`} />
        <Stat label="Beräknad skatt"    value={`${fmt(stats.tax.total_tax)} kr`} delta={`Vinst ${fmt(stats.profit)} kr`} />
      </div>

      <div className="grid-2" style={{ marginBottom: 22 }}>
        <div className="card">
          <div className="spread"><div style={{ fontWeight: 600 }}>Moms</div><Link className="muted" href="/invoices" style={{ fontSize: 13 }}>Hantera →</Link></div>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div><div className="muted" style={{ fontSize: 12 }}>Utgående moms</div><div style={{ fontWeight: 700, fontSize: 20 }}>{fmt(stats.vatOut)} kr</div></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Ingående moms</div><div style={{ fontWeight: 700, fontSize: 20 }}>{fmt(stats.vatIn)} kr</div></div>
          </div>
          <div style={{ marginTop: 12, padding: 10, background: "var(--bg-soft)", borderRadius: 9, fontSize: 13 }}>
            <strong>Att redovisa:</strong> {fmt(Math.max(0, stats.vatOut - stats.vatIn))} kr
          </div>
        </div>

        <div className="card">
          <div className="spread"><div style={{ fontWeight: 600 }}>Körjournal</div><Link className="muted" href="/mileage" style={{ fontSize: 13 }}>Visa →</Link></div>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div><div className="muted" style={{ fontSize: 12 }}>Resor</div><div style={{ fontWeight: 700, fontSize: 20 }}>{stats.tripCount} st</div></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Avdrag</div><div style={{ fontWeight: 700, fontSize: 20 }}>{fmt(stats.tripDed)} kr</div></div>
          </div>
          <div style={{ marginTop: 12, padding: 10, background: "var(--bg-soft)", borderRadius: 9, fontSize: 13 }}>
            25 kr/mil för privatbil i tjänsten (2026)
          </div>
        </div>
      </div>

      <QuickActions />

      {stats.pendingReview > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 18 }}>
          {stats.pendingReview} kvitton väntar på granskning. <Link href="/receipts" style={{ textDecoration: "underline" }}>Granska →</Link>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="spread"><div style={{ fontWeight: 600 }}>Senaste fakturor</div><Link className="muted" href="/invoices" style={{ fontSize: 13 }}>Alla →</Link></div>
          {recent.invoices.length === 0 ? (
            <div className="empty">Inga fakturor ännu. <Link href="/invoices/new" style={{ textDecoration: "underline" }}>Skapa din första</Link></div>
          ) : (
            <table className="table" style={{ marginTop: 8 }}>
              <thead><tr><th>Nr</th><th>Datum</th><th>Status</th><th className="num">Belopp</th></tr></thead>
              <tbody>
                {recent.invoices.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/invoices/${i.id}`}>#{i.invoice_number}</Link></td>
                    <td>{i.issue_date}</td>
                    <td><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                    <td className="num">{fmt(i.total)} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="spread"><div style={{ fontWeight: 600 }}>Senaste kvitton</div><Link className="muted" href="/receipts" style={{ fontSize: 13 }}>Alla →</Link></div>
          {recent.receipts.length === 0 ? (
            <div className="empty">Inga kvitton ännu. <Link href="/receipts" style={{ textDecoration: "underline" }}>Scanna ditt första</Link></div>
          ) : (
            <table className="table" style={{ marginTop: 8 }}>
              <thead><tr><th>Leverantör</th><th>Datum</th><th>Kategori</th><th className="num">Belopp</th></tr></thead>
              <tbody>
                {recent.receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.vendor || "—"}</td>
                    <td>{r.receipt_date || "—"}</td>
                    <td className="muted">{r.category || "—"}</td>
                    <td className="num">{fmt(r.total)} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, delta }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-delta">{delta}</div>
    </div>
  );
}
