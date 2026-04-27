import Link from "next/link";
import { serverClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import InvoiceActions from "./actions";

export const dynamic = "force-dynamic";
const fmt = (n) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export default async function InvoiceView({ params }) {
  const { id } = await params;
  const sb = await serverClient();
  const { data: inv } = await sb.from("studio_invoices").select("*, studio_clients(*)").eq("id", id).maybeSingle();
  if (!inv) return notFound();
  const { data: items } = await sb.from("studio_invoice_items").select("*").eq("invoice_id", id).order("position");
  const { data: settings } = await sb.from("studio_settings").select("*").maybeSingle();

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="h1">Faktura #{inv.invoice_number}</h1>
          <div className="muted">{inv.studio_clients?.name || "—"} · <span className={`badge badge-${inv.status}`}>{inv.status}</span></div>
        </div>
        <div className="row">
          <Link className="btn btn-ghost" href="/invoices">← Tillbaka</Link>
          <InvoiceActions invoice={inv} />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 28 }}>
          <div className="spread" style={{ alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{settings?.business_name || "—"}</div>
              <div style={{ fontSize: 13, color: "var(--text-soft)", whiteSpace: "pre-line" }}>
                {settings?.address_street}{"\n"}
                {settings?.address_zip} {settings?.address_city}{"\n"}
                Personnr: {settings?.personnummer || "—"}{"\n"}
                {settings?.vat_number && `Moms-nr: ${settings.vat_number}\n`}
                {settings?.f_skatt_approved && "Godkänd för F-skatt"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>FAKTURA</div>
              <div style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 6 }}>
                Nr: <strong>{inv.invoice_number}</strong><br />
                Datum: {inv.issue_date}<br />
                Förfaller: <strong>{inv.due_date}</strong><br />
                OCR: <span className="num" style={{ fontFamily: "ui-monospace, monospace" }}>{inv.ocr_number}</span>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Faktureras till</div>
              <div style={{ fontWeight: 600 }}>{inv.studio_clients?.name}</div>
              <div style={{ fontSize: 13, color: "var(--text-soft)", whiteSpace: "pre-line" }}>
                {inv.studio_clients?.address_street}{"\n"}
                {inv.studio_clients?.address_zip} {inv.studio_clients?.address_city}{"\n"}
                {inv.studio_clients?.country_code !== "SE" && inv.studio_clients?.country_code}
                {inv.studio_clients?.org_nr && `\nOrg-nr: ${inv.studio_clients.org_nr}`}
                {inv.studio_clients?.vat_number && `\nVAT: ${inv.studio_clients.vat_number}`}
              </div>
            </div>
            {inv.rot_rut_type && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{inv.rot_rut_type}-arbete</div>
                <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
                  Fastighetsbeteckning: <strong>{inv.studio_clients?.fastighetsbeteckning || "—"}</strong><br />
                  Personnr (kund): {inv.studio_clients?.org_nr || "—"}<br />
                  {inv.rot_rut_type}-avdrag: <strong>{fmt(Number(inv.rot_amount) || Number(inv.rut_amount))} kr</strong>
                </div>
              </div>
            )}
          </div>

          <table className="table" style={{ marginBottom: 24 }}>
            <thead>
              <tr><th>Beskrivning</th><th className="num">Antal</th><th className="num">À-pris</th><th className="num">Moms %</th><th className="num">Summa</th></tr>
            </thead>
            <tbody>
              {(items || []).map((it) => (
                <tr key={it.id}>
                  <td>{it.description}{it.rot_rut_hours ? <span className="muted"> · {it.rot_rut_hours} arb.tim</span> : null}</td>
                  <td className="num">{it.quantity} {it.unit}</td>
                  <td className="num">{fmt(it.unit_price)}</td>
                  <td className="num">{it.vat_rate}%</td>
                  <td className="num">{fmt(Number(it.quantity) * Number(it.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <table style={{ minWidth: 260 }}>
              <tbody>
                <tr><td style={{ padding: "4px 12px", color: "var(--text-soft)" }}>Delsumma</td><td className="num" style={{ padding: "4px 12px" }}>{fmt(inv.subtotal)} kr</td></tr>
                <tr><td style={{ padding: "4px 12px", color: "var(--text-soft)" }}>Moms</td><td className="num" style={{ padding: "4px 12px" }}>{fmt(inv.vat_amount)} kr</td></tr>
                {Number(inv.rot_amount) > 0 && <tr><td style={{ padding: "4px 12px" }}>ROT-avdrag</td><td className="num" style={{ padding: "4px 12px" }}>−{fmt(inv.rot_amount)} kr</td></tr>}
                {Number(inv.rut_amount) > 0 && <tr><td style={{ padding: "4px 12px" }}>RUT-avdrag</td><td className="num" style={{ padding: "4px 12px" }}>−{fmt(inv.rut_amount)} kr</td></tr>}
                <tr style={{ borderTop: "2px solid var(--text)" }}><td style={{ padding: "8px 12px", fontWeight: 700, fontSize: 16 }}>Att betala</td><td className="num" style={{ padding: "8px 12px", fontWeight: 700, fontSize: 18 }}>{fmt(inv.total)} kr</td></tr>
              </tbody>
            </table>
          </div>

          {inv.reverse_charge && (
            <div style={{ marginTop: 16, padding: 12, background: "var(--bg-soft)", borderRadius: 9, fontSize: 13 }}>
              <strong>Omvänd skattskyldighet.</strong> Köparen redovisar moms enligt artikel 196 i mervärdesskattedirektivet.
            </div>
          )}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--text-soft)" }}>
            <div className="grid-2">
              <div>
                <strong>Betalning:</strong><br />
                {settings?.bankgiro && <>Bankgiro: <strong>{settings.bankgiro}</strong><br /></>}
                {settings?.iban && <>IBAN: <strong>{settings.iban}</strong><br /></>}
                {settings?.plusgiro && <>Plusgiro: <strong>{settings.plusgiro}</strong><br /></>}
                Vid betalning ange OCR: <strong>{inv.ocr_number}</strong>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>Betalningsvillkor:</strong> {Math.ceil((new Date(inv.due_date) - new Date(inv.issue_date)) / 86400000)} dagar<br />
                Dröjsmålsränta enligt räntelagen.<br />
                {settings?.f_skatt_approved && <span>Godkänd för F-skatt.</span>}
              </div>
            </div>
            {inv.notes && <div style={{ marginTop: 12 }}>{inv.notes}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
