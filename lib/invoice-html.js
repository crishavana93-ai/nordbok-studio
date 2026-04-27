/* Renders an invoice as a self-contained HTML document. Used for both:
   - browser PDF print (window.print() in /api/invoices/pdf)
   - email body  */

const fmt = (n) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

export function renderInvoiceHTML({ invoice, client, settings, items }) {
  const totalDays = Math.max(0, Math.ceil((new Date(invoice.due_date) - new Date(invoice.issue_date)) / 86400000));
  return `<!doctype html>
<html lang="sv"><head>
<meta charset="utf-8" />
<title>Faktura ${esc(invoice.invoice_number)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;color:#18181b;margin:0;padding:32px;font-size:14px;line-height:1.5;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
  .biz{font-size:20px;font-weight:700}
  h1{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0}
  .meta{text-align:right;font-size:13px;color:#525258;line-height:1.7}
  .blocks{display:flex;justify-content:space-between;gap:32px;margin-bottom:24px;font-size:13px}
  .block-title{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a90;margin-bottom:6px;font-weight:600}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8a8a90;border-bottom:1px solid #e7e7e0;padding:8px 10px}
  td{padding:10px;border-bottom:1px solid #f3f3ee}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .totals{display:flex;justify-content:flex-end;margin-top:20px}
  .totals table{min-width:280px;width:auto}
  .totals td{border:0;padding:4px 10px}
  .totals tr.grand td{font-weight:700;font-size:17px;border-top:2px solid #18181b;padding-top:10px}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e7e7e0;font-size:13px;color:#525258;display:flex;justify-content:space-between;gap:24px}
  .stamp{display:inline-block;border:2px solid #0d3a2a;color:#0d3a2a;padding:6px 12px;border-radius:6px;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase}
  .rotrut{margin-top:14px;padding:12px;background:#f4f4ef;border-radius:8px;font-size:13px}
  .reverse{margin-top:14px;padding:12px;background:#fef3c7;border-radius:8px;font-size:13px}
  @media print{body{padding:18mm}}
</style></head>
<body>
<div class="head">
  <div>
    <div class="biz">${esc(settings?.business_name)}</div>
    <div style="color:#525258;white-space:pre-line;margin-top:6px">${esc((settings?.address_street || "") + "\n" + (settings?.address_zip || "") + " " + (settings?.address_city || ""))}</div>
    <div style="color:#525258;margin-top:8px">Personnr: ${esc(settings?.personnummer || "—")}${settings?.vat_number ? `<br>Moms-nr: ${esc(settings.vat_number)}` : ""}</div>
    ${settings?.f_skatt_approved ? `<div style="margin-top:8px"><span class="stamp">Godkänd för F-skatt</span></div>` : ""}
  </div>
  <div>
    <h1>FAKTURA</h1>
    <div class="meta">
      Nr: <strong>${esc(invoice.invoice_number)}</strong><br>
      Datum: ${esc(invoice.issue_date)}<br>
      Förfaller: <strong>${esc(invoice.due_date)}</strong><br>
      OCR: <span style="font-family:ui-monospace,monospace">${esc(invoice.ocr_number)}</span>
    </div>
  </div>
</div>

<div class="blocks">
  <div>
    <div class="block-title">Faktureras till</div>
    <div style="font-weight:600">${esc(client?.name)}</div>
    <div style="white-space:pre-line;color:#525258">${esc((client?.address_street || "") + "\n" + (client?.address_zip || "") + " " + (client?.address_city || ""))}</div>
    ${client?.country_code && client.country_code !== "SE" ? `<div style="color:#525258">${esc(client.country_code)}</div>` : ""}
    ${client?.org_nr ? `<div style="color:#525258">Org-nr: ${esc(client.org_nr)}</div>` : ""}
    ${client?.vat_number ? `<div style="color:#525258">VAT: ${esc(client.vat_number)}</div>` : ""}
  </div>
  ${invoice.rot_rut_type ? `
    <div>
      <div class="block-title">${esc(invoice.rot_rut_type)}-arbete</div>
      <div style="color:#525258">Fastighetsbeteckning: <strong>${esc(client?.fastighetsbeteckning || "—")}</strong></div>
      <div style="color:#525258">Personnr (kund): ${esc(client?.org_nr || "—")}</div>
      <div style="color:#525258">${esc(invoice.rot_rut_type)}-avdrag: <strong>${fmt(Number(invoice.rot_amount) || Number(invoice.rut_amount))} kr</strong></div>
    </div>` : ""}
</div>

<table>
  <thead><tr><th>Beskrivning</th><th class="num">Antal</th><th class="num">À-pris</th><th class="num">Moms %</th><th class="num">Summa</th></tr></thead>
  <tbody>
    ${(items || []).map((it) => `
      <tr>
        <td>${esc(it.description)}${it.rot_rut_hours ? `<div style="color:#8a8a90;font-size:12px">${esc(it.rot_rut_hours)} arbetstimmar</div>` : ""}</td>
        <td class="num">${esc(it.quantity)} ${esc(it.unit || "st")}</td>
        <td class="num">${fmt(it.unit_price)}</td>
        <td class="num">${esc(it.vat_rate)}%</td>
        <td class="num">${fmt(Number(it.quantity) * Number(it.unit_price))}</td>
      </tr>`).join("")}
  </tbody>
</table>

<div class="totals">
  <table>
    <tbody>
      <tr><td>Delsumma</td><td class="num">${fmt(invoice.subtotal)} kr</td></tr>
      <tr><td>Moms</td><td class="num">${fmt(invoice.vat_amount)} kr</td></tr>
      ${Number(invoice.rot_amount) > 0 ? `<tr><td>ROT-avdrag</td><td class="num">−${fmt(invoice.rot_amount)} kr</td></tr>` : ""}
      ${Number(invoice.rut_amount) > 0 ? `<tr><td>RUT-avdrag</td><td class="num">−${fmt(invoice.rut_amount)} kr</td></tr>` : ""}
      <tr class="grand"><td>Att betala</td><td class="num">${fmt(invoice.total)} kr</td></tr>
    </tbody>
  </table>
</div>

${invoice.reverse_charge ? `<div class="reverse"><strong>Omvänd skattskyldighet.</strong> Köparen redovisar moms enligt artikel 196 i mervärdesskattedirektivet.</div>` : ""}

<div class="footer">
  <div>
    <strong>Betalning</strong><br>
    ${settings?.bankgiro ? `Bankgiro: <strong>${esc(settings.bankgiro)}</strong><br>` : ""}
    ${settings?.iban ? `IBAN: <strong>${esc(settings.iban)}</strong><br>` : ""}
    ${settings?.plusgiro ? `Plusgiro: <strong>${esc(settings.plusgiro)}</strong><br>` : ""}
    Vid betalning ange OCR: <strong>${esc(invoice.ocr_number)}</strong>
  </div>
  <div style="text-align:right">
    Betalningsvillkor: ${totalDays} dagar<br>
    Dröjsmålsränta enligt räntelagen (8% + ref.ränta)<br>
    ${settings?.invoice_footer ? esc(settings.invoice_footer) : ""}
  </div>
</div>

${invoice.notes ? `<div style="margin-top:16px;color:#525258">${esc(invoice.notes)}</div>` : ""}

</body></html>`;
}
